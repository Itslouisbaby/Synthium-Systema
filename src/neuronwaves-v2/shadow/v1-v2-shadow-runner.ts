import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SynthRuntime } from '../../synth-runtime.js';
import { NeuronWavesRuntime } from '../neuronwaves-runtime.js';
import { SignalBus } from '../runtime/signal-bus.js';
import type { LLMProvider } from '../../llm/llm-provider.js';
import type { MicroLoop, SessionKey, Signal, SignalType, TickResult, WorkingState } from '../types.js';
import { BufferedPublisher } from '../loops/output-loop.js';

interface ShadowRunnerOptions {
  input: string;
  llm: LLMProvider;
  timeoutMs?: number;
  thresholdConfig?: Partial<SemanticThresholdConfig>;
  recentSemanticTotals?: number[];
}

interface V1RunManifest {
  evaluation?: { result?: string; summary?: string };
  policyDecisions?: Array<{ stepId: string; decision: string; reason: string }>;
}

interface PolicyDecision {
  stepId: string;
  decision: string;
  reason: string;
}

interface PolicyReasonMismatch {
  stepId: string;
  v1Reason: string;
  v2Reason: string;
  similarity: number;
}

interface PolicyAuditMismatchBreakdown {
  decisionTypeMismatch: number;
  reasonMismatch: number;
  missingInV2: number;
  extraInV2: number;
}

interface PolicyAuditParity {
  v1DecisionCounts: Record<string, number>;
  v2DecisionCounts: Record<string, number>;
  exactCountMatch: boolean;
  exactDecisionMatch: boolean;
  mismatchBreakdown: PolicyAuditMismatchBreakdown;
  reasonMismatches: PolicyReasonMismatch[];
}

interface SemanticParityScores {
  planStepAlignment: number;
  policyDecisionAlignment: number;
  evaluationResultAlignment: number;
  outputQualityHeuristic: number;
  total: number;
}

interface SemanticThresholdConfig {
  floor: number;
  requiredConsecutivePasses: number;
  reasonSimilarityFloor: number;
}

interface SemanticPromotionGate {
  pass: boolean;
  currentWindowPasses: number;
  requiredConsecutivePasses: number;
  failedChecks: string[];
  recommendation: 'hold' | 'promote' | 'rollback';
}

export interface ShadowComparisonResult {
  input: string;
  v1Output: string;
  v2Output: string;
  parity: {
    exact: boolean;
    normalized: boolean;
  };
  policyAuditParity: PolicyAuditParity;
  semanticScores: SemanticParityScores;
  semanticThresholds: SemanticThresholdConfig;
  semanticPromotionGate: SemanticPromotionGate;
  evidence: {
    v2SignalTypes: string[];
    v2TickCount: number;
    v1EvaluationResult: string;
    v2EvaluationResult: string;
  };
  artifacts: {
    v1BaseDir: string;
    v2BaseDir: string;
  };
}

const DEFAULT_THRESHOLD_CONFIG: SemanticThresholdConfig = {
  floor: 0.65,
  requiredConsecutivePasses: 2,
  reasonSimilarityFloor: 0.6,
};

class ShadowBridgeLoop implements MicroLoop {
  readonly name = 'ShadowBridgeLoop';
  readonly rhythm = 'palpitation' as const;
  readonly tickBudgetMs = 20;
  readonly maxSignalsOut = 5;
  readonly reads = ['focus'] as const;
  readonly writes = [] as const;
  readonly subscriptions: SignalType[] = ['INPUT_RECEIVED'];

  tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): TickResult {
    const source = input.signals.find(signal => signal.type === 'INPUT_RECEIVED');
    if (!source) {
      return {
        signalsOut: [],
        stateDelta: [],
        metrics: { durationMs: 0, signalsProcessed: input.signals.length, signalsEmitted: 0 },
      };
    }

    const payload = source.payload as { content?: string };
    const content = typeof payload.content === 'string' ? payload.content : '';

    return {
      signalsOut: [
        SignalBus.createSignal(
          'OUTPUT_READY',
          {
            chainId: `shadow-${Date.now()}`,
            content: `V2:${content}`,
            contentType: 'text',
          },
          input.sessionKey,
          this.name,
          'event',
          { causedBy: [source.signalId] }
        ),
      ],
      stateDelta: [],
      metrics: {
        durationMs: 0,
        signalsProcessed: input.signals.length,
        signalsEmitted: 1,
      },
    };
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyEvaluationResult(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes('blocked by policy') || normalized.includes('execution failed')) {
    return 'failure';
  }
  if (normalized.includes('awaiting approval')) {
    return 'partial';
  }
  return 'success';
}

function countEstimatedSteps(text: string): number {
  const chunks = text
    .split(/\b(?:and then|then|and|also|next)\b|\|/i)
    .map(chunk => chunk.trim())
    .filter(Boolean);
  return Math.max(1, chunks.length);
}

function toDecisionCounts(decisions: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const decision of decisions) {
    counts[decision] = (counts[decision] ?? 0) + 1;
  }
  return counts;
}

function normalizeDecision(decision: string): string {
  return decision.trim().toLowerCase() || 'unknown';
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeText(b).split(' ').filter(Boolean));
  const intersection = new Set([...setA].filter(token => setB.has(token)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

function buildPolicyAuditParity(params: {
  v1Decisions: PolicyDecision[];
  v2Decisions: PolicyDecision[];
  reasonSimilarityFloor: number;
}): PolicyAuditParity {
  const v1DecisionCounts = toDecisionCounts(params.v1Decisions.map(item => normalizeDecision(item.decision)));
  const v2DecisionCounts = toDecisionCounts(params.v2Decisions.map(item => normalizeDecision(item.decision)));

  const v1ByStep = new Map(params.v1Decisions.map(item => [item.stepId, item]));
  const v2ByStep = new Map(params.v2Decisions.map(item => [item.stepId, item]));

  let decisionTypeMismatch = 0;
  let reasonMismatch = 0;
  const reasonMismatches: PolicyReasonMismatch[] = [];

  for (const [stepId, v1] of v1ByStep.entries()) {
    const v2 = v2ByStep.get(stepId);
    if (!v2) {
      continue;
    }

    if (normalizeDecision(v1.decision) !== normalizeDecision(v2.decision)) {
      decisionTypeMismatch += 1;
    }

    const similarity = jaccardSimilarity(v1.reason, v2.reason);
    if (similarity < params.reasonSimilarityFloor) {
      reasonMismatch += 1;
      reasonMismatches.push({
        stepId,
        v1Reason: v1.reason,
        v2Reason: v2.reason,
        similarity,
      });
    }
  }

  const missingInV2 = params.v1Decisions.filter(item => !v2ByStep.has(item.stepId)).length;
  const extraInV2 = params.v2Decisions.filter(item => !v1ByStep.has(item.stepId)).length;

  return {
    v1DecisionCounts,
    v2DecisionCounts,
    exactCountMatch: JSON.stringify(v1DecisionCounts) === JSON.stringify(v2DecisionCounts),
    exactDecisionMatch: decisionTypeMismatch === 0 && reasonMismatch === 0 && missingInV2 === 0 && extraInV2 === 0,
    mismatchBreakdown: {
      decisionTypeMismatch,
      reasonMismatch,
      missingInV2,
      extraInV2,
    },
    reasonMismatches,
  };
}

function buildSemanticPromotionGate(params: {
  score: number;
  recentSemanticTotals: number[];
  policyAuditParity: PolicyAuditParity;
  thresholds: SemanticThresholdConfig;
}): SemanticPromotionGate {
  const history = [...params.recentSemanticTotals, params.score];
  let trailingPasses = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index] >= params.thresholds.floor) {
      trailingPasses += 1;
      continue;
    }
    break;
  }

  const failedChecks: string[] = [];
  if (params.score < params.thresholds.floor) {
    failedChecks.push(`semantic_total_below_floor:${params.score.toFixed(3)}<${params.thresholds.floor.toFixed(3)}`);
  }
  if (trailingPasses < params.thresholds.requiredConsecutivePasses) {
    failedChecks.push(`insufficient_consecutive_windows:${trailingPasses}/${params.thresholds.requiredConsecutivePasses}`);
  }
  if (!params.policyAuditParity.exactDecisionMatch) {
    failedChecks.push('policy_audit_mismatch_detected');
  }

  return {
    pass: failedChecks.length === 0,
    currentWindowPasses: trailingPasses,
    requiredConsecutivePasses: params.thresholds.requiredConsecutivePasses,
    failedChecks,
    recommendation: failedChecks.length === 0 ? 'promote' : params.score < params.thresholds.floor ? 'rollback' : 'hold',
  };
}

async function loadLatestV1Manifest(v1BaseDir: string): Promise<V1RunManifest | null> {
  const artifactsRoot = join(v1BaseDir, 'artifacts');
  try {
    const sessions = await readdir(artifactsRoot);
    for (const session of sessions) {
      const runPath = join(artifactsRoot, session, 'runs', 'latest.json');
      try {
        const raw = await readFile(runPath, 'utf8');
        return JSON.parse(raw) as V1RunManifest;
      } catch {
        // keep scanning
      }
    }
  } catch {
    return null;
  }
  return null;
}

function buildSemanticScores(params: {
  input: string;
  v1Output: string;
  v2Output: string;
  v1DecisionCounts: Record<string, number>;
  v2DecisionCounts: Record<string, number>;
  v1EvaluationResult: string;
  v2EvaluationResult: string;
}): SemanticParityScores {
  const expectedSteps = countEstimatedSteps(params.input);
  const v1Steps = countEstimatedSteps(params.v1Output);
  const v2Steps = countEstimatedSteps(params.v2Output);
  const stepSpread = Math.abs(v1Steps - v2Steps) + Math.abs(expectedSteps - Math.max(v1Steps, v2Steps));
  const planStepAlignment = Math.max(0, 1 - stepSpread / Math.max(1, expectedSteps * 2));

  const v1PolicyTotal = Object.values(params.v1DecisionCounts).reduce((acc, value) => acc + value, 0);
  const v2PolicyTotal = Object.values(params.v2DecisionCounts).reduce((acc, value) => acc + value, 0);
  const policyDecisionAlignment =
    v1PolicyTotal === 0 && v2PolicyTotal === 0
      ? 1
      : 1 - Math.min(1, Math.abs(v1PolicyTotal - v2PolicyTotal) / Math.max(1, v1PolicyTotal));

  const evaluationResultAlignment = params.v1EvaluationResult === params.v2EvaluationResult ? 1 : 0;
  const outputQualityHeuristic = jaccardSimilarity(params.v1Output, params.v2Output);

  const total =
    planStepAlignment * 0.3 +
    policyDecisionAlignment * 0.3 +
    evaluationResultAlignment * 0.25 +
    outputQualityHeuristic * 0.15;

  return {
    planStepAlignment,
    policyDecisionAlignment,
    evaluationResultAlignment,
    outputQualityHeuristic,
    total,
  };
}

export async function runV1V2ShadowComparison(options: ShadowRunnerOptions): Promise<ShadowComparisonResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const thresholds: SemanticThresholdConfig = {
    ...DEFAULT_THRESHOLD_CONFIG,
    ...options.thresholdConfig,
  };
  const v1BaseDir = await mkdtemp(join(tmpdir(), 'synth-pr11-v1-'));
  const v2BaseDir = await mkdtemp(join(tmpdir(), 'synth-pr11-v2-'));

  const v1Runtime = new SynthRuntime({
    baseDir: v1BaseDir,
    llm: options.llm,
    enableAutonomy: false,
    enableLearning: false,
    enableMemory: true,
  });

  const publisher = new BufferedPublisher();
  const v2Runtime = new NeuronWavesRuntime({
    artifactBaseDir: v2BaseDir,
    enabledLoops: { input: true, output: true, executive: false, critic: false, monitor: false },
    outputPublisher: publisher.getPublisher(),
  });

  await v1Runtime.initialize();
  await v1Runtime.start();
  v2Runtime.registerLoop(new ShadowBridgeLoop(), 1);
  v2Runtime.start();

  try {
    const v1Output = await v1Runtime.processInput(options.input);

    const sessionKey = `shadow-${Date.now()}`;
    await v2Runtime.submitInput(sessionKey, options.input);

    const started = Date.now();
    let v2Output = '';

    while (Date.now() - started < timeoutMs) {
      const output = publisher.getOutputs().find(entry => entry.sessionKey === sessionKey);
      if (output?.content) {
        v2Output = output.content;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    if (!v2Output) {
      throw new Error(`Timed out waiting for v2 output after ${timeoutMs}ms`);
    }

    const v2Signals = await v2Runtime.getSignals(sessionKey);
    const v2SignalTypes = [...new Set(v2Signals.map(signal => signal.type))];
    const v2TickCount = v2Runtime.getStatus().tickCount;
    const v1Manifest = await loadLatestV1Manifest(v1BaseDir);

    const v1Decisions = (v1Manifest?.policyDecisions ?? []).map(decision => ({
      stepId: decision.stepId,
      decision: decision.decision,
      reason: decision.reason,
    }));
    const v2Decisions: PolicyDecision[] = v2Signals
      .filter(signal => signal.type === 'POLICY_DECISION_EMITTED')
      .map(signal => {
        const payload = signal.payload as { stepId?: string; decision?: string; reason?: string };
        return {
          stepId: payload.stepId ?? `v2-${signal.signalId}`,
          decision: payload.decision ?? 'unknown',
          reason: payload.reason ?? '',
        };
      });

    const policyAuditParity = buildPolicyAuditParity({
      v1Decisions,
      v2Decisions,
      reasonSimilarityFloor: thresholds.reasonSimilarityFloor,
    });

    const v1EvaluationResult = v1Manifest?.evaluation?.result ?? classifyEvaluationResult(v1Output);
    const v2EvaluationResult = classifyEvaluationResult(v2Output);

    const semanticScores = buildSemanticScores({
      input: options.input,
      v1Output,
      v2Output,
      v1DecisionCounts: policyAuditParity.v1DecisionCounts,
      v2DecisionCounts: policyAuditParity.v2DecisionCounts,
      v1EvaluationResult,
      v2EvaluationResult,
    });

    const semanticPromotionGate = buildSemanticPromotionGate({
      score: semanticScores.total,
      recentSemanticTotals: options.recentSemanticTotals ?? [],
      policyAuditParity,
      thresholds,
    });

    return {
      input: options.input,
      v1Output,
      v2Output,
      parity: {
        exact: v1Output === v2Output,
        normalized: normalizeText(v1Output) === normalizeText(v2Output),
      },
      policyAuditParity,
      semanticScores,
      semanticThresholds: thresholds,
      semanticPromotionGate,
      evidence: {
        v2SignalTypes,
        v2TickCount,
        v1EvaluationResult,
        v2EvaluationResult,
      },
      artifacts: {
        v1BaseDir,
        v2BaseDir,
      },
    };
  } finally {
    v1Runtime.stop();
    v2Runtime.stop();
  }
}
