import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { LLMProvider } from '../../llm/llm-provider.js';
import { MockLLMProvider } from '../../llm/llm-provider.js';
import { runV1V2ShadowComparison, type ShadowComparisonResult } from '../shadow/v1-v2-shadow-runner.js';
import { DEFAULT_PROMOTION_THRESHOLDS, evaluatePromotionGate, type PromotionGateReport, type PromotionGateThresholds } from './promotion-gate.js';

export type CanaryStage = 'A' | 'B' | 'C';

export interface CanaryControllerOptions {
  stage: CanaryStage;
  windows: number;
  artifactPath: string;
  llm?: LLMProvider;
  thresholds?: Partial<PromotionGateThresholds>;
  inputs?: string[];
}

export interface CanaryStageArtifact {
  generatedAt: string;
  stage: CanaryStage;
  decision: 'promote' | 'hold' | 'rollback';
  reason: string;
  report: PromotionGateReport;
  stageAZeroMismatchPass: boolean;
  inputCount: number;
}

const DEFAULT_INPUTS = [
  'summarize runtime parity posture and list policy outcomes',
  'analyze microloop reliability and suggest one remediation',
  'compare v1 and v2 output behavior for incident response documentation',
];

function parseCliBoolean(raw: string | undefined): boolean {
  return raw === '1' || raw === 'true';
}

function hasZeroMismatchPass(report: PromotionGateReport): boolean {
  return report.windows.some(window =>
    window.pass &&
    window.decisionTypeMismatch === 0 &&
    window.reasonMismatch === 0 &&
    window.missingInV2 === 0 &&
    window.extraInV2 === 0
  );
}

async function readPreviousStageAFlag(artifactPath: string): Promise<boolean> {
  try {
    const raw = await readFile(artifactPath, 'utf8');
    const parsed = JSON.parse(raw) as CanaryStageArtifact;
    return parsed.stage === 'A' && parsed.stageAZeroMismatchPass;
  } catch {
    return false;
  }
}

function chooseDecision(
  stage: CanaryStage,
  report: PromotionGateReport,
  stageAZeroMismatchPass: boolean,
  previousStageAZeroMismatchPass: boolean
): { decision: 'promote' | 'hold' | 'rollback'; reason: string } {
  if (!report.pass) {
    if (report.failedChecks.includes('semantic_below_floor') || report.failedChecks.includes('output_publication_reliability_below_floor')) {
      return { decision: 'rollback', reason: `Hard gate failure: ${report.failedChecks.join(', ')}` };
    }
    return { decision: 'hold', reason: `Gate not met: ${report.failedChecks.join(', ')}` };
  }

  if (stage === 'A' && !stageAZeroMismatchPass) {
    return {
      decision: 'hold',
      reason: 'Stage A requires at least one pass window with zero mismatch categories before Stage B unlock.',
    };
  }

  if (stage !== 'A' && !previousStageAZeroMismatchPass) {
    return {
      decision: 'hold',
      reason: 'Stage B/C blocked: no prior Stage A artifact with zero mismatch pass found.',
    };
  }

  return { decision: 'promote', reason: 'All configured gates satisfied for this stage window.' };
}

export async function runCanaryController(options: CanaryControllerOptions): Promise<CanaryStageArtifact> {
  const llm = options.llm ?? new MockLLMProvider();
  const inputs = options.inputs?.length ? options.inputs : DEFAULT_INPUTS;
  const windows = Math.max(1, options.windows);

  const results: ShadowComparisonResult[] = [];
  for (let index = 0; index < windows; index += 1) {
    const input = inputs[index % inputs.length];
    const recentSemanticTotals = results.map(item => item.semanticScores.total);
    const comparison = await runV1V2ShadowComparison({
      input,
      llm,
      recentSemanticTotals,
      thresholdConfig: {
        floor: options.thresholds?.semanticFloor ?? DEFAULT_PROMOTION_THRESHOLDS.semanticFloor,
        requiredConsecutivePasses: options.thresholds?.requiredConsecutivePasses ?? DEFAULT_PROMOTION_THRESHOLDS.requiredConsecutivePasses,
      },
    });
    results.push(comparison);
  }

  const report = evaluatePromotionGate(results, options.thresholds);
  const stageAZeroMismatchPass = hasZeroMismatchPass(report);
  const previousStageAZeroMismatchPass = await readPreviousStageAFlag(options.artifactPath);
  const { decision, reason } = chooseDecision(options.stage, report, stageAZeroMismatchPass, previousStageAZeroMismatchPass);

  const artifact: CanaryStageArtifact = {
    generatedAt: new Date().toISOString(),
    stage: options.stage,
    decision,
    reason,
    report,
    stageAZeroMismatchPass,
    inputCount: windows,
  };

  await mkdir(dirname(options.artifactPath), { recursive: true });
  await writeFile(options.artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  return artifact;
}

function renderDocEntry(artifact: CanaryStageArtifact): string {
  const lines = artifact.report.windows.map((window, index) =>
    `- Window ${index + 1}: semantic=${window.semanticTotal.toFixed(3)}, mismatches={decision:${window.decisionTypeMismatch}, reason:${window.reasonMismatch}, missing:${window.missingInV2}, extra:${window.extraInV2}}, outputReliability=${window.outputPublicationReliability.toFixed(4)}, pass=${window.pass}`
  );

  return [
    `\n### AUTO-${artifact.generatedAt} (Stage ${artifact.stage})`,
    `- Decision: **${artifact.decision.toUpperCase()}**`,
    `- Reason: ${artifact.reason}`,
    `- Failed checks: ${artifact.report.failedChecks.length ? artifact.report.failedChecks.join(', ') : 'none'}`,
    `- Stage A zero-mismatch pass in run: **${artifact.stageAZeroMismatchPass ? 'yes' : 'no'}**`,
    ...lines,
  ].join('\n');
}

export async function appendCanaryEvidenceDoc(docPath: string, artifact: CanaryStageArtifact): Promise<void> {
  const entry = renderDocEntry(artifact);
  await mkdir(dirname(docPath), { recursive: true });

  let existing = '';
  try {
    existing = await readFile(docPath, 'utf8');
  } catch {
    existing = '# NeuronWaves v2 Canary & Rollback Drill Evidence\n';
  }

  await writeFile(docPath, `${existing.trimEnd()}\n${entry}\n`, 'utf8');
}

export function parseCanaryEnv(): CanaryControllerOptions {
  const stage = (process.env.SYNTH_CANARY_STAGE ?? 'A') as CanaryStage;
  const windows = Number(process.env.SYNTH_CANARY_WINDOWS ?? '3');
  const artifactPath = process.env.SYNTH_CANARY_ARTIFACT_PATH ?? '.synth/canary/latest-stage-report.json';

  return {
    stage,
    windows,
    artifactPath,
    thresholds: {
      semanticFloor: Number(process.env.SYNTH_CANARY_SEMANTIC_FLOOR ?? DEFAULT_PROMOTION_THRESHOLDS.semanticFloor),
      requiredConsecutivePasses: Number(
        process.env.SYNTH_CANARY_REQUIRED_CONSECUTIVE ?? DEFAULT_PROMOTION_THRESHOLDS.requiredConsecutivePasses
      ),
      maxDecisionTypeMismatch: Number(
        process.env.SYNTH_CANARY_MAX_DECISION_MISMATCH ?? DEFAULT_PROMOTION_THRESHOLDS.maxDecisionTypeMismatch
      ),
      maxReasonMismatch: Number(process.env.SYNTH_CANARY_MAX_REASON_MISMATCH ?? DEFAULT_PROMOTION_THRESHOLDS.maxReasonMismatch),
      maxMissingInV2: Number(process.env.SYNTH_CANARY_MAX_MISSING_IN_V2 ?? DEFAULT_PROMOTION_THRESHOLDS.maxMissingInV2),
      maxExtraInV2: Number(process.env.SYNTH_CANARY_MAX_EXTRA_IN_V2 ?? DEFAULT_PROMOTION_THRESHOLDS.maxExtraInV2),
      minOutputPublicationReliability: Number(
        process.env.SYNTH_CANARY_MIN_OUTPUT_RELIABILITY ?? DEFAULT_PROMOTION_THRESHOLDS.minOutputPublicationReliability
      ),
    },
    llm: parseCliBoolean(process.env.SYNTH_CANARY_USE_MOCK_LLM) ? new MockLLMProvider() : undefined,
  };
}
