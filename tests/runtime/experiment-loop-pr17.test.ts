import { describe, expect, it } from 'vitest';

import { MockLLMProvider } from '../../src/llm/llm-provider';
import { createV1PipelineAdapter } from '../../src/runtime/v1-pipeline-adapter';
import type { RuntimePlanner } from '../../src/runtime/v1-pipeline-adapter';

describe('PR17 autonomous experiment loop (safe sandbox actions)', () => {
  it('runs hypothesis -> experiment -> strategy update cycle with auditable artifacts', async () => {
    const llm = new MockLLMProvider(1024);
    const planner: RuntimePlanner = {
      plan: () => [
        { intent: 'experiment: baseline approach', actionClass: 'experiment' as any },
        { intent: 'experiment: retry with fallback local decomposition', actionClass: 'experiment' as any, dependsOn: ['node-1'] },
      ],
    };

    const runPipeline = createV1PipelineAdapter(llm, planner);
    const result = await runPipeline(
      { content: 'run sandbox experiment cycle', sessionKey: 'pr17-session' },
      {
        artifactBaseDir: '.synth/test-pr17',
        autonomyLevel: 1,
        policyPath: '',
        runtimeMode: 'full',
        experimentBudget: 2,
      },
    );

    expect(result.artifactPaths.experimentEvents.length).toBe(2);
    expect(result.artifactPaths.experimentEvents.every(e => e.strategyUpdate.length > 0)).toBe(true);
    expect(result.plan.steps.some(step => step.outputSummary?.toString().includes('Experiment failed hypothesis'))).toBe(true);
    expect(result.plan.steps.some(step => step.outputSummary?.toString().includes('Experiment validated hypothesis'))).toBe(true);
    expect(result.artifactPaths.policyAuditEvents.every(event => event.reason.includes('experiment'))).toBe(true);
  });
});
