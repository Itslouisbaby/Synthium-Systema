import { createHash } from 'node:crypto';
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
  recentSemanticTotals?: number[];
  thresholdConfig?: {
    floor?: number;
    requiredConsecutivePasses?: number;
    reasonSimilarityFloor?: number;
  };
}

interface V1RunManifest {
  runId?: string;
  sessionKey?: string;
  timestampMs?: number;
  input?: string;
  response?: string;
  planId?: string;
  evaluation?: { result?: string; summary?: string };
  policyDecisions?: Array<{ stepId: string; decision: string; reason: string }>;
  integrity?: string;
}

interface PolicyMismatchBreakdown {
  decisionTypeMismatch: number;
  reasonMismatch: number;
  missingInV2: number;
  extraInV2: number;
}

interface PolicyMismatchBreakdown {
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
  mismatchBreakdown: PolicyMismatchBreakdown;
  reasonMismatches: string[];
}

interface SemanticParityScores {
  planStepAlignment: number;
  policyDecisionAlignment: number;
  evaluationResultAlignment: number;
  outputQualityHeuristic: number;
  total: number;
}

interface SemanticThresholds {
  floor: number;
  requiredConsecutivePasses: number;
  reasonSimilarityFloor: number;
}

interface SemanticPromotionGate {
  pass: boolean;
  currentWindowPasses: number;
  requiredConsecutivePasses: number;
  failedChecks: string[];
  recommendation: 'promote' | 'hold';
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
  semanticThresholds: SemanticThresholds;
  semanticPromotionGate: SemanticPromotionGate;
  evidence: {
    v2SignalTypes: string[];
    v2TickCount: number;
    v1EvaluationResult: string;
    v2EvaluationResult: string;
    outputReadyCount: number;
    outputSentCount: number;
    outputPublicationReliability: number;
  };
  artifacts: {
    v1BaseDir: string;
    v2BaseDir: string;
  };
}

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

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(' ').filter(Boolean));
  const setB = new Set(normalizeText(b).split(' ').filter(Boolean));
  const intersection = new Set([...setA].filter(token => setB.has(token)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 1;
  return intersection.size / union.size;
}

async function loadLatestV1Manifest(v1BaseDir: string): Promise<V1RunManifest | null> {
  const artifactsRoot = join(v1BaseDir, 'artifacts');
  try {
    const sessions = await readdir(artifactsRoot);
    for (const session of sessions) {
      const runPath = join(artifactsRoot, session, 'runs', 'latest.json');
      try {
        const raw = await readFile(runPath, 'utf8');
        const parsed = JSON.parse(raw) as V1RunManifest;
        if (parsed.integrity && parsed.runId && parsed.sessionKey) {
          const { integrity, ...core } = parsed;
          const expected = createHash('sha256').update(JSON.stringify(core)).digest('hex');
          if (expected !== integrity) {
            continue;
          }
        }
        return parsed;
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

function buildPolicyAuditParity(v1DecisionCounts: Record<string, number>, v2DecisionCounts: Record<string, number>): PolicyAuditParity {
  const decisionKeys = new Set([...Object.keys(v1DecisionCounts), ...Object.keys(v2DecisionCounts)]);
  let missingInV2 = 0;
  let extraInV2 = 0;
  let decisionTypeMismatch = 0;

  for (const key of decisionKeys) {
    const v1Count = v1DecisionCounts[key] ?? 0;
    const v2Count = v2DecisionCounts[key] ?? 0;
    if (v1Count > v2Count) {
      missingInV2 += v1Count - v2Count;
    } else if (v2Count > v1Count) {
      extraInV2 += v2Count - v1Count;
    }
    if (v1Count !== v2Count) {
      decisionTypeMismatch += Math.abs(v1Count - v2Count);
    }
  }

  const mismatchBreakdown: PolicyMismatchBreakdown = {
    decisionTypeMismatch,
    reasonMismatch: 0,
    missingInV2,
    extraInV2,
  };

  const exactCountMatch = JSON.stringify(v1DecisionCounts) === JSON.stringify(v2DecisionCounts);

  return {
    v1DecisionCounts,
    v2DecisionCounts,
    exactCountMatch,
    exactDecisionMatch: exactCountMatch,
    mismatchBreakdown,
    reasonMismatches: [],
  };
}

function buildSemanticPromotionGate(
  semanticTotal: number,
  thresholds: SemanticThresholds,
  recentTotals: number[] = []
): SemanticPromotionGate {
  const combined = [...recentTotals, semanticTotal];
  let trailingPasses = 0;
  for (let index = combined.length - 1; index >= 0; index -= 1) {
    if (combined[index] >= thresholds.floor) {
      trailingPasses += 1;
    } else {
      break;
    }
  }

  const failedChecks: string[] = [];
  if (semanticTotal < thresholds.floor) {
    failedChecks.push('semantic_below_floor');
  }
  if (trailingPasses < thresholds.requiredConsecutivePasses) {
    failedChecks.push('insufficient_consecutive_semantic_passes');
  }

  return {
    pass: failedChecks.length === 0,
    currentWindowPasses: trailingPasses,
    requiredConsecutivePasses: thresholds.requiredConsecutivePasses,
    failedChecks,
    recommendation: failedChecks.length === 0 ? 'promote' : 'hold',
  };
}

export async function runV1V2ShadowComparison(options: ShadowRunnerOptions): Promise<ShadowComparisonResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
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

    const v1Decisions = (v1Manifest?.policyDecisions ?? []).map(decision => decision.decision);
    const v2Decisions = v2Signals
      .filter(signal => signal.type === 'POLICY_DECISION_EMITTED')
      .map(signal => {
        const payload = signal.payload as { decision?: string };
        return payload.decision ?? 'unknown';
      });

    const v1DecisionCounts = toDecisionCounts(v1Decisions);
    const v2DecisionCounts = toDecisionCounts(v2Decisions);
    const policyAuditParity = buildPolicyAuditParity(v1DecisionCounts, v2DecisionCounts);
    const v1EvaluationResult = v1Manifest?.evaluation?.result ?? classifyEvaluationResult(v1Output);
    const v2EvaluationResult = classifyEvaluationResult(v2Output);

    const semanticScores = buildSemanticScores({
      input: options.input,
      v1Output,
      v2Output,
      v1DecisionCounts,
      v2DecisionCounts,
      v1EvaluationResult,
      v2EvaluationResult,
    });

    const semanticThresholds: SemanticThresholds = {
      floor: options.thresholdConfig?.floor ?? 0.65,
      requiredConsecutivePasses: options.thresholdConfig?.requiredConsecutivePasses ?? 2,
      reasonSimilarityFloor: options.thresholdConfig?.reasonSimilarityFloor ?? 0.6,
    };

    const outputReadyCount = v2Signals.filter(signal => signal.type === 'OUTPUT_READY').length;
    const outputSentCount = v2Signals.filter(signal => signal.type === 'OUTPUT_SENT').length;
    const outputPublicationReliability = outputReadyCount === 0 ? 1 : outputSentCount / outputReadyCount;

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
      semanticThresholds,
      semanticPromotionGate: buildSemanticPromotionGate(
        semanticScores.total,
        semanticThresholds,
        options.recentSemanticTotals
      ),
      evidence: {
        v2SignalTypes,
        v2TickCount,
        v1EvaluationResult,
        v2EvaluationResult,
        outputReadyCount,
        outputSentCount,
        outputPublicationReliability,
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
