import { describe, expect, it } from 'vitest';

import { MockLLMProvider } from '../../src/llm/llm-provider';
import { createV1PipelineAdapter } from '../../src/runtime/v1-pipeline-adapter';
import type { RuntimePlanner } from '../../src/runtime/v1-pipeline-adapter';

describe('PR18 reliability governor adaptive degrade modes', () => {
  it('enforces conservative/safe-minimal behavior via reduced scope and shorter plans', async () => {
    const llm = new MockLLMProvider(1024);
    const planner: RuntimePlanner = {
      plan: () => [
        { intent: 'read https://example.com', actionClass: 'external_read' as any, target: 'example.com' },
        { intent: 'local summarize', actionClass: 'local_only' as any },
        { intent: 'extra local detail', actionClass: 'local_only' as any },
      ],
    };

    const runPipeline = createV1PipelineAdapter(llm, planner);

    const conservative = await runPipeline(
      { content: 'run with governor conservative', sessionKey: 'pr18-cons' },
      {
        artifactBaseDir: '.synth/test-pr18-cons',
        autonomyLevel: 2,
        policyPath: '',
        runtimeMode: 'conservative',
      },
    );

    expect(conservative.plan.steps.length).toBeLessThanOrEqual(3);
    expect(conservative.plan.steps[0].status).toBe('awaiting_approval');

    const safeMinimal = await runPipeline(
      { content: 'run with governor safe-minimal', sessionKey: 'pr18-safe' },
      {
        artifactBaseDir: '.synth/test-pr18-safe',
        autonomyLevel: 2,
        policyPath: '',
        runtimeMode: 'safe_minimal',
      },
    );

    expect(safeMinimal.plan.steps.length).toBeLessThanOrEqual(2);
    expect(safeMinimal.plan.steps[0].status).toBe('blocked');
    expect(safeMinimal.plan.steps[0].outputSummary).toContain('safe_minimal');
  });
});
