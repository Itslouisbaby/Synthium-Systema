import { describe, expect, it } from 'vitest';

import { createV1PipelineAdapter, type RuntimePlanner } from '../../src/runtime/v1-pipeline-adapter';
import { MockLLMProvider } from '../../src/llm/llm-provider';

describe('PR11 action graph planner/executor contract', () => {
  it('rejects malformed graphs with unresolved dependencies', async () => {
    const planner: RuntimePlanner = {
      plan: () => [
        {
          intent: 'summarize locally',
          actionClass: 'local_only',
          dependsOn: ['node-404'],
        },
      ],
    };

    const adapter = createV1PipelineAdapter(new MockLLMProvider(32), planner);

    await expect(adapter(
      { content: 'summarize locally', sessionKey: 'pr11-s1' },
      { artifactBaseDir: '.synth/test-pr11', autonomyLevel: 1 },
    )).rejects.toThrow('invalid_action_graph');
  });

  it('serializes action graph and execution trace for deterministic replay', async () => {
    const adapter = createV1PipelineAdapter(new MockLLMProvider(32));

    const result = await adapter(
      { content: 'summarize locally and then fetch https://example.com', sessionKey: 'pr11-s2' },
      { artifactBaseDir: '.synth/test-pr11', autonomyLevel: 2 },
    );

    expect(result.artifactPaths.actionGraph.version).toBe('v2');
    expect(result.artifactPaths.actionGraph.nodes.length).toBeGreaterThanOrEqual(1);
    expect(result.artifactPaths.executionTrace.length).toBe(result.plan.steps.length);
    expect(result.artifactPaths.executionTrace.every(item => typeof item.nodeId === 'string')).toBe(true);
  });
});
