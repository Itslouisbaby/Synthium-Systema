import type { ShadowComparisonResult } from '../shadow/v1-v2-shadow-runner.js';

export interface PromotionGateThresholds {
  semanticFloor: number;
  requiredConsecutivePasses: number;
  maxDecisionTypeMismatch: number;
  maxReasonMismatch: number;
  maxMissingInV2: number;
  maxExtraInV2: number;
  minOutputPublicationReliability: number;
}

export interface PromotionWindowSummary {
  input: string;
  semanticTotal: number;
  semanticGatePass: boolean;
  decisionTypeMismatch: number;
  reasonMismatch: number;
  missingInV2: number;
  extraInV2: number;
  outputPublicationReliability: number;
  pass: boolean;
  failedChecks: string[];
}

export interface PromotionGateReport {
  generatedAt: string;
  thresholds: PromotionGateThresholds;
  pass: boolean;
  failedChecks: string[];
  windows: PromotionWindowSummary[];
  trailingSemanticPasses: number;
}

export const DEFAULT_PROMOTION_THRESHOLDS: PromotionGateThresholds = {
  semanticFloor: 0.2,
  requiredConsecutivePasses: 1,
  maxDecisionTypeMismatch: 2,
  maxReasonMismatch: 3,
  maxMissingInV2: 5,
  maxExtraInV2: 5,
  minOutputPublicationReliability: 0.5,
};

export function evaluatePromotionGate(
  windows: ShadowComparisonResult[],
  thresholds: Partial<PromotionGateThresholds> = {}
): PromotionGateReport {
  const merged: PromotionGateThresholds = { ...DEFAULT_PROMOTION_THRESHOLDS, ...thresholds };

  const windowSummaries: PromotionWindowSummary[] = windows.map(window => {
    const mismatch = window.policyAuditParity.mismatchBreakdown;
    const reliability = window.evidence.outputPublicationReliability;
    const checks: string[] = [];

    if (window.semanticScores.total < merged.semanticFloor) checks.push('semantic_below_floor');
    if (mismatch.decisionTypeMismatch > merged.maxDecisionTypeMismatch) checks.push('decision_type_mismatch_exceeded');
    if (mismatch.reasonMismatch > merged.maxReasonMismatch) checks.push('reason_mismatch_exceeded');
    if (mismatch.missingInV2 > merged.maxMissingInV2) checks.push('missing_in_v2_exceeded');
    if (mismatch.extraInV2 > merged.maxExtraInV2) checks.push('extra_in_v2_exceeded');
    if (reliability < merged.minOutputPublicationReliability) checks.push('output_publication_reliability_below_floor');

    return {
      input: window.input,
      semanticTotal: window.semanticScores.total,
      semanticGatePass: window.semanticPromotionGate.pass,
      decisionTypeMismatch: mismatch.decisionTypeMismatch,
      reasonMismatch: mismatch.reasonMismatch,
      missingInV2: mismatch.missingInV2,
      extraInV2: mismatch.extraInV2,
      outputPublicationReliability: reliability,
      pass: checks.length === 0,
      failedChecks: checks,
    };
  });

  let trailingSemanticPasses = 0;
  for (let i = windowSummaries.length - 1; i >= 0; i -= 1) {
    if (windowSummaries[i].semanticTotal >= merged.semanticFloor) {
      trailingSemanticPasses += 1;
    } else {
      break;
    }
  }

  const failedChecks = new Set<string>();
  for (const window of windowSummaries) {
    for (const check of window.failedChecks) failedChecks.add(check);
  }
  if (trailingSemanticPasses < merged.requiredConsecutivePasses) {
    failedChecks.add('insufficient_consecutive_semantic_passes');
  }

  return {
    generatedAt: new Date().toISOString(),
    thresholds: merged,
    pass: failedChecks.size === 0,
    failedChecks: [...failedChecks],
    windows: windowSummaries,
    trailingSemanticPasses,
  };
}
