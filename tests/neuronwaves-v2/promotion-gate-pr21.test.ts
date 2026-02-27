import { describe, expect, it } from 'vitest';

import type { ShadowComparisonResult } from '../../src/neuronwaves-v2/shadow/v1-v2-shadow-runner';
import { evaluatePromotionGate } from '../../src/neuronwaves-v2/canary/promotion-gate';

function makeResult(overrides: Partial<ShadowComparisonResult> = {}): ShadowComparisonResult {
  return {
    input: 'sample input',
    v1Output: 'v1 output',
    v2Output: 'v2 output',
    parity: { exact: false, normalized: false },
    policyAuditParity: {
      v1DecisionCounts: { allow: 1 },
      v2DecisionCounts: { allow: 1 },
      exactCountMatch: true,
      exactDecisionMatch: true,
      mismatchBreakdown: {
        decisionTypeMismatch: 0,
        reasonMismatch: 0,
        missingInV2: 0,
        extraInV2: 0,
      },
      reasonMismatches: [],
    },
    semanticScores: {
      planStepAlignment: 1,
      policyDecisionAlignment: 1,
      evaluationResultAlignment: 1,
      outputQualityHeuristic: 1,
      total: 0.9,
    },
    semanticThresholds: {
      floor: 0.65,
      requiredConsecutivePasses: 2,
      reasonSimilarityFloor: 0.6,
    },
    semanticPromotionGate: {
      pass: true,
      currentWindowPasses: 2,
      requiredConsecutivePasses: 2,
      failedChecks: [],
      recommendation: 'promote',
    },
    evidence: {
      v2SignalTypes: ['INPUT_RECEIVED', 'OUTPUT_READY', 'OUTPUT_SENT'],
      v2TickCount: 3,
      v1EvaluationResult: 'success',
      v2EvaluationResult: 'success',
      outputReadyCount: 1,
      outputSentCount: 1,
      outputPublicationReliability: 1,
    },
    artifacts: {
      v1BaseDir: '/tmp/v1',
      v2BaseDir: '/tmp/v2',
    },
    ...overrides,
  };
}

describe('PR21 promotion gate evaluation', () => {
  it('passes with two compliant windows and no mismatches', () => {
    const report = evaluatePromotionGate([makeResult(), makeResult()]);
    expect(report.pass).toBe(true);
    expect(report.failedChecks).toHaveLength(0);
    expect(report.trailingSemanticPasses).toBe(2);
  });

  it('fails when output publication reliability or mismatch thresholds are breached', () => {
    const bad = makeResult({
      policyAuditParity: {
        ...makeResult().policyAuditParity,
        mismatchBreakdown: {
          decisionTypeMismatch: 1,
          reasonMismatch: 0,
          missingInV2: 0,
          extraInV2: 0,
        },
      },
      evidence: {
        ...makeResult().evidence,
        outputPublicationReliability: 0.6,
      },
    });

    const report = evaluatePromotionGate([bad], {
      maxDecisionTypeMismatch: 0,
      minOutputPublicationReliability: 0.95,
    });

    expect(report.pass).toBe(false);
    expect(report.failedChecks).toContain('decision_type_mismatch_exceeded');
    expect(report.failedChecks).toContain('output_publication_reliability_below_floor');
  });
});
