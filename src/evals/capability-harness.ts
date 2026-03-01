import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MockLLMProvider } from '../llm/llm-provider.js';
import { createV1PipelineAdapter, type RuntimePlanner } from '../runtime/v1-pipeline-adapter.js';

export interface CapabilityTaskScore {
  taskId: string;
  category: 'long_horizon_planning' | 'memory_usage' | 'tool_chaining' | 'self_correction';
  score: number;
  maxScore: number;
  notes: string[];
}

export interface CapabilityScorecard {
  runId: string;
  timestampMs: number;
  aggregateScore: number;
  maxAggregateScore: number;
  normalizedScore: number;
  tasks: CapabilityTaskScore[];
}

function scoreFromResult(result: 'success' | 'partial' | 'failure'): number {
  if (result === 'success') return 1;
  if (result === 'partial') return 0.5;
  return 0;
}

function plannerFor(actions: ReturnType<RuntimePlanner['plan']>): RuntimePlanner {
  return { plan: () => actions };
}

export async function runCapabilityEval(baseDir = '.synth', floor?: number): Promise<CapabilityScorecard> {
  const runId = `cap-${Date.now()}`;
  const llm = new MockLLMProvider(1024);

  const tasks: CapabilityTaskScore[] = [];

  {
    const adapter = createV1PipelineAdapter(llm, plannerFor([
      { intent: 'collect constraints', actionClass: 'local_only' as any },
      { intent: 'draft plan', actionClass: 'local_only' as any, dependsOn: ['node-1'] },
      { intent: 'validate and finalize', actionClass: 'local_only' as any, dependsOn: ['node-2'] },
    ]));
    const out = await adapter({ content: 'build a complete solution', sessionKey: 'cap-lh' }, {
      artifactBaseDir: join(baseDir, 'eval-artifacts'),
      autonomyLevel: 1,
      policyPath: '',
    });
    tasks.push({
      taskId: 'long-horizon-1',
      category: 'long_horizon_planning',
      score: scoreFromResult(out.evaluation.result) + (out.plan.steps.length >= 3 ? 1 : 0),
      maxScore: 2,
      notes: [`steps=${out.plan.steps.length}`, `result=${out.evaluation.result}`],
    });
  }

  {
    const adapter = createV1PipelineAdapter(llm, plannerFor([
      { intent: 'summarize memory context', actionClass: 'local_only' as any },
    ]));
    const out = await adapter({ content: 'use memory context', sessionKey: 'cap-mem', memoryContext: ['prior: customer prefers concise answers'] }, {
      artifactBaseDir: join(baseDir, 'eval-artifacts'),
      autonomyLevel: 1,
      policyPath: '',
    });
    const memoryHintPresent = out.plan.steps.some(step => JSON.stringify(step.toolInput ?? {}).includes('memory'));
    tasks.push({
      taskId: 'memory-1',
      category: 'memory_usage',
      score: scoreFromResult(out.evaluation.result) + (memoryHintPresent ? 1 : 0),
      maxScore: 2,
      notes: [`result=${out.evaluation.result}`, `memoryHintPresent=${memoryHintPresent}`],
    });
  }

  {
    const adapter = createV1PipelineAdapter(llm, plannerFor([
      { intent: 'collect baseline facts', actionClass: 'local_only' as any },
      { intent: 'derive metric', actionClass: 'local_only' as any, dependsOn: ['node-1'] },
      { intent: 'publish summary', actionClass: 'local_only' as any, dependsOn: ['node-2'] },
    ]));
    const out = await adapter({ content: 'chain tools', sessionKey: 'cap-tool' }, {
      artifactBaseDir: join(baseDir, 'eval-artifacts'),
      autonomyLevel: 1,
      policyPath: '',
    });
    const dagOk = out.artifactPaths.toolDag.executionLevels.length >= 3;
    tasks.push({
      taskId: 'tool-chain-1',
      category: 'tool_chaining',
      score: scoreFromResult(out.evaluation.result) + (dagOk ? 1 : 0),
      maxScore: 2,
      notes: [`result=${out.evaluation.result}`, `dagLevels=${out.artifactPaths.toolDag.executionLevels.length}`],
    });
  }

  {
    const adapter = createV1PipelineAdapter(llm, plannerFor([
      { intent: 'experiment: baseline approach', actionClass: 'experiment' as any },
      { intent: 'experiment: retry with fallback local decomposition', actionClass: 'experiment' as any, dependsOn: ['node-1'] },
    ]));
    const out = await adapter({ content: 'self-correct', sessionKey: 'cap-self' }, {
      artifactBaseDir: join(baseDir, 'eval-artifacts'),
      autonomyLevel: 1,
      policyPath: '',
      runtimeMode: 'full',
      experimentBudget: 2,
    });
    const selfCorrectionObserved = out.artifactPaths.experimentEvents.some(e => e.outcome === 'failed')
      && out.artifactPaths.experimentEvents.some(e => e.outcome === 'success');
    tasks.push({
      taskId: 'self-correct-1',
      category: 'self_correction',
      score: scoreFromResult(out.evaluation.result) + (selfCorrectionObserved ? 1 : 0),
      maxScore: 2,
      notes: [`result=${out.evaluation.result}`, `events=${out.artifactPaths.experimentEvents.length}`],
    });
  }

  const aggregateScore = tasks.reduce((acc, t) => acc + t.score, 0);
  const maxAggregateScore = tasks.reduce((acc, t) => acc + t.maxScore, 0);
  const normalizedScore = maxAggregateScore === 0 ? 0 : aggregateScore / maxAggregateScore;

  const scorecard: CapabilityScorecard = {
    runId,
    timestampMs: Date.now(),
    aggregateScore,
    maxAggregateScore,
    normalizedScore,
    tasks,
  };

  const evalDir = join(baseDir, 'evals', 'capability');
  await mkdir(evalDir, { recursive: true });
  await writeFile(join(evalDir, 'latest.json'), JSON.stringify(scorecard, null, 2), 'utf8');

  const historyPath = join(evalDir, 'history.json');
  let history: CapabilityScorecard[] = [];
  try {
    history = JSON.parse(await readFile(historyPath, 'utf8'));
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
  history.push(scorecard);
  await writeFile(historyPath, JSON.stringify(history, null, 2), 'utf8');

  if (typeof floor === 'number' && normalizedScore < floor) {
    throw new Error(`capability_score_floor_not_met: score=${normalizedScore.toFixed(3)} floor=${floor.toFixed(3)}`);
  }

  return scorecard;
}
