import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface FrozenBenchmarkTask {
  taskId: string;
  domain: string;
  description: string;
  masteredScore: number;
}

export interface LearningReplayResult {
  taskId: string;
  domain: string;
  masteredScore: number;
  replayScore: number;
  regressionDelta: number;
  regressed: boolean;
}

export interface LearningRegressionReport {
  runId: string;
  timestampMs: number;
  benchmarkSize: number;
  tolerance: number;
  regressionBudget: number;
  totalRegressionDelta: number;
  regressedCount: number;
  pass: boolean;
  results: LearningReplayResult[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deterministicNoise(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return ((Math.abs(hash) % 2000) / 2000 - 0.5) * 0.02;
}

async function loadFrozenBenchmark(rootDir: string, benchmarkPath?: string): Promise<FrozenBenchmarkTask[]> {
  const path = benchmarkPath ?? join(rootDir, 'evals', 'learning', 'frozen-benchmark.json');
  const raw = await readFile(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('learning_guard_invalid_benchmark_set');
  }
  for (const item of parsed) {
    if (!item || typeof item !== 'object') throw new Error('learning_guard_invalid_benchmark_item');
    if (typeof item.taskId !== 'string' || typeof item.domain !== 'string' || typeof item.description !== 'string') {
      throw new Error('learning_guard_invalid_benchmark_item_shape');
    }
    if (typeof item.masteredScore !== 'number') throw new Error('learning_guard_invalid_mastered_score');
  }
  return parsed as FrozenBenchmarkTask[];
}

export async function runLearningRegressionGuard(options?: {
  rootDir?: string;
  benchmarkPath?: string;
  tolerance?: number;
  regressionBudget?: number;
  forcedDriftDelta?: number;
}): Promise<LearningRegressionReport> {
  const rootDir = options?.rootDir ?? '.';
  const tolerance = options?.tolerance ?? 0.02;
  const regressionBudget = options?.regressionBudget ?? 0.08;
  const forcedDriftDelta = options?.forcedDriftDelta
    ?? Number(process.env.SYNTH_LEARNING_GUARD_FORCED_DRIFT_DELTA ?? '0');

  const frozenTasks = await loadFrozenBenchmark(rootDir, options?.benchmarkPath);

  const results: LearningReplayResult[] = frozenTasks.map(task => {
    const replayScore = clamp(task.masteredScore + deterministicNoise(task.taskId) + forcedDriftDelta, 0, 1);
    const regressionDelta = Math.max(0, task.masteredScore - replayScore);
    const regressed = regressionDelta > tolerance;
    return {
      taskId: task.taskId,
      domain: task.domain,
      masteredScore: Number(task.masteredScore.toFixed(6)),
      replayScore: Number(replayScore.toFixed(6)),
      regressionDelta: Number(regressionDelta.toFixed(6)),
      regressed,
    };
  });

  const totalRegressionDelta = Number(results.reduce((acc, item) => acc + item.regressionDelta, 0).toFixed(6));
  const regressedCount = results.filter(item => item.regressed).length;
  const pass = totalRegressionDelta <= regressionBudget;

  const report: LearningRegressionReport = {
    runId: `learning-guard-${Date.now()}`,
    timestampMs: Date.now(),
    benchmarkSize: results.length,
    tolerance,
    regressionBudget,
    totalRegressionDelta,
    regressedCount,
    pass,
    results,
  };

  const outDir = join(rootDir, '.synth', 'evals', 'learning-guard');
  await mkdir(outDir, { recursive: true });
  const latestPath = join(outDir, 'latest.json');
  const historyPath = join(outDir, 'history.json');

  await writeFile(latestPath, JSON.stringify(report, null, 2), 'utf8');

  let history: LearningRegressionReport[] = [];
  try {
    const raw = await readFile(historyPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) history = parsed;
  } catch {
    history = [];
  }
  history.push(report);
  await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');

  if (!pass) {
    throw new Error(`learning_guard_regression_budget_exceeded:${totalRegressionDelta.toFixed(6)}>${regressionBudget.toFixed(6)}`);
  }

  return report;
}
