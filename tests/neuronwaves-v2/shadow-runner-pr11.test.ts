import { describe, it, expect } from 'vitest';

import type { LLMProvider } from '../../src/llm/llm-provider';
import { runV1V2ShadowComparison } from '../../src/neuronwaves-v2/shadow/v1-v2-shadow-runner';

class ShadowStubLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> {
    return `GEN:${prompt}`;
  }

  async generateWithContext(prompt: string, context: string[]): Promise<string> {
    return `V1:${prompt}|ctx=${context.length}`;
  }

  async embed(): Promise<number[]> {
    return new Array(4096).fill(0.41);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(4096).fill(0.41));
  }

  getModelInfo() {
    return {
      name: 'shadow-stub',
      provider: 'stub',
      contextWindow: 4096,
      embeddingDimensions: 4096,
      supportsStreaming: false,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

describe('PR11 v1/v2 shadow comparison harness', () => {
  it('runs v1 and v2 in parallel and returns parity evidence metadata', async () => {
    const result = await runV1V2ShadowComparison({
      input: 'summarize local shadow request and include policy notes',
      llm: new ShadowStubLLM(),
      timeoutMs: 8000,
    });

    expect(result.input).toContain('shadow request');
    expect(result.v1Output).toContain('V1:');
    expect(result.v2Output).toContain('V2:');

    expect(result.evidence.v2SignalTypes).toContain('INPUT_RECEIVED');
    expect(result.evidence.v2SignalTypes).toContain('OUTPUT_READY');
    expect(result.evidence.v2SignalTypes).toContain('OUTPUT_SENT');
    expect(result.evidence.v2TickCount).toBeGreaterThan(0);

    expect(['success', 'partial', 'failure']).toContain(result.evidence.v1EvaluationResult);
    expect(['success', 'partial', 'failure']).toContain(result.evidence.v2EvaluationResult);

    expect(result.policyAuditParity.v1DecisionCounts).toBeTypeOf('object');
    expect(result.policyAuditParity.v2DecisionCounts).toBeTypeOf('object');
    expect(typeof result.policyAuditParity.exactCountMatch).toBe('boolean');
    expect(typeof result.policyAuditParity.exactDecisionMatch).toBe('boolean');
    expect(result.policyAuditParity.mismatchBreakdown).toEqual({
      decisionTypeMismatch: expect.any(Number),
      reasonMismatch: expect.any(Number),
      missingInV2: expect.any(Number),
      extraInV2: expect.any(Number),
    });
    expect(Array.isArray(result.policyAuditParity.reasonMismatches)).toBe(true);

    expect(result.semanticScores.planStepAlignment).toBeGreaterThanOrEqual(0);
    expect(result.semanticScores.policyDecisionAlignment).toBeGreaterThanOrEqual(0);
    expect(result.semanticScores.evaluationResultAlignment).toBeGreaterThanOrEqual(0);
    expect(result.semanticScores.outputQualityHeuristic).toBeGreaterThanOrEqual(0);
    expect(result.semanticScores.total).toBeGreaterThanOrEqual(0);
    expect(result.semanticScores.total).toBeLessThanOrEqual(1);

    expect(result.semanticThresholds.floor).toBeGreaterThan(0);
    expect(result.semanticThresholds.requiredConsecutivePasses).toBeGreaterThan(0);
    expect(result.semanticPromotionGate).toEqual({
      pass: expect.any(Boolean),
      currentWindowPasses: expect.any(Number),
      requiredConsecutivePasses: expect.any(Number),
      failedChecks: expect.any(Array),
      recommendation: expect.stringMatching(/^(hold|promote|rollback)$/),
    });

    expect(result.artifacts.v1BaseDir).toContain('synth-pr11-v1-');
    expect(result.artifacts.v2BaseDir).toContain('synth-pr11-v2-');
  }, 20000);

  it('marks the promotion gate as hold when semantic trend windows are insufficient', async () => {
    const result = await runV1V2ShadowComparison({
      input: 'run a short shadow task',
      llm: new ShadowStubLLM(),
      recentSemanticTotals: [0.92],
      thresholdConfig: {
        floor: 0.1,
        requiredConsecutivePasses: 3,
      },
      timeoutMs: 8000,
    });

    expect(result.semanticPromotionGate.pass).toBe(false);
    expect(result.semanticPromotionGate.recommendation).toBe('hold');
    expect(result.semanticPromotionGate.failedChecks.some(item => item.startsWith('insufficient_consecutive_windows'))).toBe(true);
  }, 20000);

  it('marks the promotion gate as rollback when semantic score drops below the configured floor', async () => {
    const result = await runV1V2ShadowComparison({
      input: 'this will intentionally diverge from v2 output baseline',
      llm: new ShadowStubLLM(),
      thresholdConfig: {
        floor: 0.95,
        requiredConsecutivePasses: 1,
      },
      timeoutMs: 8000,
    });

    expect(result.semanticPromotionGate.pass).toBe(false);
    expect(result.semanticPromotionGate.recommendation).toBe('rollback');
    expect(result.semanticPromotionGate.failedChecks.some(item => item.startsWith('semantic_total_below_floor'))).toBe(true);
  }, 20000);
});
