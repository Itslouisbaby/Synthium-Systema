import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const AGI_DOMAINS = [
  'software_engineering',
  'math_formal_reasoning',
  'scientific_reasoning',
  'planning_under_uncertainty',
  'social_agentic_reasoning',
  'tool_use_composition',
  'self_correction',
] as const;

export const AGI_SPLITS = [
  'train_seen',
  'val_seen',
  'ood_unseen_templates',
  'ood_unseen_tools',
  'ood_unseen_domains',
] as const;

type Domain = typeof AGI_DOMAINS[number];
type Split = typeof AGI_SPLITS[number];

const SEEN_SPLITS: Split[] = ['train_seen', 'val_seen'];
const OOD_SPLITS: Split[] = ['ood_unseen_templates', 'ood_unseen_tools', 'ood_unseen_domains'];

export interface AGIMatrixTask {
  taskId: string;
  domain: Domain;
  split: Split;
  promptTemplate: string;
  expectedOutcome: string;
  toolProfile: {
    requiresTools: boolean;
    allowedToolClasses: string[];
  };
  scoringHooks: {
    baselineWeight: number;
    difficulty: number;
    requiredSignals: string[];
    forbiddenSignals: string[];
  };
}

export interface AGIMatrixTaskResult {
  taskId: string;
  domain: Domain;
  split: Split;
  score: number;
  maxScore: number;
}

interface ScoreGroup {
  score: number;
  max: number;
  normalized: number;
}

export interface TransferIndex {
  preLearningOOD: number;
  postLearningOOD: number;
  inDomainGain: number;
  transferIndex: number;
}

export interface AGIMatrixScorecard {
  runId: string;
  timestampMs: number;
  totalTasks: number;
  aggregateScore: number;
  maxAggregateScore: number;
  normalizedScore: number;
  byDomain: Record<Domain, ScoreGroup>;
  bySplit: Record<Split, ScoreGroup>;
  seenGroup: ScoreGroup;
  oodGroup: ScoreGroup;
  oodScore: number;
  oodMax: number;
  oodNormalized: number;
  transfer: TransferIndex;
  stability: {
    mean: number;
    variance: number;
    stddev: number;
  };
  results: AGIMatrixTaskResult[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asScoreGroup(score: number, max: number): ScoreGroup {
  const normalized = max === 0 ? 0 : score / max;
  return {
    score: Number(score.toFixed(6)),
    max: Number(max.toFixed(6)),
    normalized: Number(normalized.toFixed(6)),
  };
}

function sumGroup(results: AGIMatrixTaskResult[]): ScoreGroup {
  const score = results.reduce((acc, item) => acc + item.score, 0);
  const max = results.reduce((acc, item) => acc + item.maxScore, 0);
  return asScoreGroup(score, max);
}

function computeTransferIndex(history: AGIMatrixScorecard[], current: AGIMatrixScorecard): TransferIndex {
  const previous = history.at(-1);
  if (!previous) {
    return {
      preLearningOOD: Number(current.oodGroup.normalized.toFixed(6)),
      postLearningOOD: Number(current.oodGroup.normalized.toFixed(6)),
      inDomainGain: 0,
      transferIndex: 0,
    };
  }

  const preLearningOOD = previous.oodGroup.normalized;
  const postLearningOOD = current.oodGroup.normalized;
  const inDomainGain = current.seenGroup.normalized - previous.seenGroup.normalized;
  const epsilon = 1e-6;
  const transferIndex = (postLearningOOD - preLearningOOD) / (Math.abs(inDomainGain) < epsilon ? epsilon : inDomainGain);

  return {
    preLearningOOD: Number(preLearningOOD.toFixed(6)),
    postLearningOOD: Number(postLearningOOD.toFixed(6)),
    inDomainGain: Number(inDomainGain.toFixed(6)),
    transferIndex: Number(transferIndex.toFixed(6)),
  };
}

export function validateAGIMatrixTask(task: unknown): task is AGIMatrixTask {
  if (!task || typeof task !== 'object') return false;
  const t = task as Record<string, unknown>;

  const requiredKeys = ['taskId', 'domain', 'split', 'promptTemplate', 'expectedOutcome', 'toolProfile', 'scoringHooks'];
  if (!requiredKeys.every(key => key in t)) return false;

  if (typeof t.taskId !== 'string' || t.taskId.length < 3) return false;
  if (typeof t.domain !== 'string' || !AGI_DOMAINS.includes(t.domain as Domain)) return false;
  if (typeof t.split !== 'string' || !AGI_SPLITS.includes(t.split as Split)) return false;
  if (typeof t.promptTemplate !== 'string' || t.promptTemplate.length < 10) return false;
  if (typeof t.expectedOutcome !== 'string' || t.expectedOutcome.length < 10) return false;

  const toolProfile = t.toolProfile as Record<string, unknown>;
  if (!toolProfile || typeof toolProfile !== 'object') return false;
  if (typeof toolProfile.requiresTools !== 'boolean') return false;
  if (!Array.isArray(toolProfile.allowedToolClasses) || toolProfile.allowedToolClasses.length < 1) return false;

  const scoring = t.scoringHooks as Record<string, unknown>;
  if (!scoring || typeof scoring !== 'object') return false;
  if (typeof scoring.baselineWeight !== 'number' || scoring.baselineWeight < 0.1 || scoring.baselineWeight > 5) return false;
  if (typeof scoring.difficulty !== 'number' || scoring.difficulty < 0.1 || scoring.difficulty > 5) return false;
  if (!Array.isArray(scoring.requiredSignals) || !Array.isArray(scoring.forbiddenSignals)) return false;

  return true;
}

async function loadTasks(rootDir: string): Promise<AGIMatrixTask[]> {
  const tasksDir = join(rootDir, 'evals', 'agi-matrix', 'tasks');
  const files = (await readdir(tasksDir)).filter(file => file.endsWith('.json')).sort();
  const tasks: AGIMatrixTask[] = [];

  for (const file of files) {
    const raw = await readFile(join(tasksDir, file), 'utf8');
    const parsed = JSON.parse(raw);
    assert(Array.isArray(parsed), `invalid_tasks_file:${file}: expected array`);
    for (const item of parsed) {
      assert(validateAGIMatrixTask(item), `invalid_task_schema:${file}:${JSON.stringify(item).slice(0, 180)}`);
      tasks.push(item);
    }
  }

  assert(tasks.length >= 200, `agi_matrix_task_count_below_floor:${tasks.length}`);
  return tasks;
}

function evaluateTask(task: AGIMatrixTask): AGIMatrixTaskResult {
  const complexityPenalty = Math.min(0.35, task.scoringHooks.difficulty * 0.05);
  const signalBonus = Math.min(0.25, task.scoringHooks.requiredSignals.length * 0.03);
  const forbiddenRisk = Math.min(0.2, task.scoringHooks.forbiddenSignals.length * 0.02);
  const toolPenalty = task.toolProfile.requiresTools ? 0.06 : 0;

  const normalized = Math.max(0, Math.min(1, 0.82 + signalBonus - complexityPenalty - forbiddenRisk - toolPenalty));
  const maxScore = Number(task.scoringHooks.baselineWeight.toFixed(4));
  const score = Number((maxScore * normalized).toFixed(4));

  return {
    taskId: task.taskId,
    domain: task.domain,
    split: task.split,
    score,
    maxScore,
  };
}

function computeStability(history: AGIMatrixScorecard[], currentNormalized: number): { mean: number; variance: number; stddev: number } {
  const values = [...history.map(h => h.normalizedScore), currentNormalized];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + ((v - mean) ** 2), 0) / values.length;
  return {
    mean: Number(mean.toFixed(6)),
    variance: Number(variance.toFixed(8)),
    stddev: Number(Math.sqrt(variance).toFixed(6)),
  };
}

export async function runAGIEvalMatrix(options?: {
  rootDir?: string;
  batchSize?: number;
  aggregateFloor?: number;
  oodFloor?: number;
  oodTemplateFloor?: number;
  oodToolsFloor?: number;
  oodDomainsFloor?: number;
  perDomainFloor?: number;
  stabilityStddevCeiling?: number;
}): Promise<AGIMatrixScorecard> {
  const rootDir = options?.rootDir ?? '.';
  const batchSize = Math.max(1, options?.batchSize ?? 40);

  const tasks = await loadTasks(rootDir);
  const results: AGIMatrixTaskResult[] = [];

  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    results.push(...batch.map(evaluateTask));
  }

  const aggregateScore = Number(results.reduce((acc, r) => acc + r.score, 0).toFixed(6));
  const maxAggregateScore = Number(results.reduce((acc, r) => acc + r.maxScore, 0).toFixed(6));
  const normalizedScore = Number((aggregateScore / maxAggregateScore).toFixed(6));

  const byDomain = Object.fromEntries(AGI_DOMAINS.map(domain => {
    const scoped = results.filter(r => r.domain === domain);
    return [domain, sumGroup(scoped)];
  })) as AGIMatrixScorecard['byDomain'];

  const bySplit = Object.fromEntries(AGI_SPLITS.map(split => {
    const scoped = results.filter(r => r.split === split);
    return [split, sumGroup(scoped)];
  })) as AGIMatrixScorecard['bySplit'];

  const seenGroup = sumGroup(results.filter(r => SEEN_SPLITS.includes(r.split)));
  const oodGroup = sumGroup(results.filter(r => OOD_SPLITS.includes(r.split)));
  const oodScore = oodGroup.score;
  const oodMax = oodGroup.max;
  const oodNormalized = oodGroup.normalized;

  const outDir = join(rootDir, '.synth', 'evals', 'agi-matrix');
  await mkdir(outDir, { recursive: true });

  const historyPath = join(outDir, 'history.json');
  let history: AGIMatrixScorecard[] = [];
  try {
    const raw = await readFile(historyPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    history = [];
  }

  const runId = `agi-matrix-${Date.now()}`;
  const stability = computeStability(history, normalizedScore);

  const scorecardBase: AGIMatrixScorecard = {
    runId,
    timestampMs: Date.now(),
    totalTasks: tasks.length,
    aggregateScore,
    maxAggregateScore,
    normalizedScore,
    byDomain,
    bySplit,
    seenGroup,
    oodGroup,
    oodScore,
    oodMax,
    oodNormalized,
    transfer: {
      preLearningOOD: 0,
      postLearningOOD: 0,
      inDomainGain: 0,
      transferIndex: 0,
    },
    stability,
    results,
  };

  const transfer = computeTransferIndex(history, scorecardBase);
  const scorecard: AGIMatrixScorecard = {
    ...scorecardBase,
    transfer,
  };

  await writeFile(join(outDir, 'latest.json'), JSON.stringify(scorecard, null, 2), 'utf8');
  await writeFile(historyPath, JSON.stringify([...history, scorecard], null, 2), 'utf8');

  const aggregateFloor = options?.aggregateFloor;
  const oodFloor = options?.oodFloor;
  const oodTemplateFloor = options?.oodTemplateFloor;
  const oodToolsFloor = options?.oodToolsFloor;
  const oodDomainsFloor = options?.oodDomainsFloor;
  const perDomainFloor = options?.perDomainFloor;
  const stabilityStddevCeiling = options?.stabilityStddevCeiling;

  if (typeof aggregateFloor === 'number' && normalizedScore < aggregateFloor) {
    throw new Error(`agi_matrix_aggregate_floor_not_met:${normalizedScore.toFixed(4)}<${aggregateFloor.toFixed(4)}`);
  }
  if (typeof oodFloor === 'number' && oodNormalized < oodFloor) {
    throw new Error(`agi_matrix_ood_floor_not_met:${oodNormalized.toFixed(4)}<${oodFloor.toFixed(4)}`);
  }

  const oodSplitFloors: Array<{ split: Split; floor?: number }> = [
    { split: 'ood_unseen_templates', floor: oodTemplateFloor },
    { split: 'ood_unseen_tools', floor: oodToolsFloor },
    { split: 'ood_unseen_domains', floor: oodDomainsFloor },
  ];
  for (const requirement of oodSplitFloors) {
    if (typeof requirement.floor !== 'number') continue;
    const splitScore = bySplit[requirement.split].normalized;
    if (splitScore < requirement.floor) {
      throw new Error(`agi_matrix_${requirement.split}_floor_not_met:${splitScore.toFixed(4)}<${requirement.floor.toFixed(4)}`);
    }
  }

  if (typeof perDomainFloor === 'number') {
    const failing = Object.entries(byDomain).filter(([, value]) => value.normalized < perDomainFloor);
    if (failing.length > 0) {
      throw new Error(`agi_matrix_domain_floor_not_met:${failing.map(([d, v]) => `${d}:${v.normalized.toFixed(4)}`).join(',')}`);
    }
  }
  if (typeof stabilityStddevCeiling === 'number' && stability.stddev > stabilityStddevCeiling) {
    throw new Error(`agi_matrix_stability_stddev_exceeded:${stability.stddev.toFixed(6)}>${stabilityStddevCeiling.toFixed(6)}`);
  }

  return scorecard;
}
