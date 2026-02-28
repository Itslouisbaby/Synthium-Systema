import { describe, expect, it } from 'vitest';

import { MockLLMProvider } from '../../src/llm/llm-provider';
import { createV1PipelineAdapter } from '../../src/runtime/v1-pipeline-adapter';
import type { RuntimePlanner } from '../../src/runtime/v1-pipeline-adapter';

describe('PR15 multi-tool planning with DAG execution', () => {
  it('executes dependency-aware tool DAG and records reproducible toolDag artifact', async () => {
    const llm = new MockLLMProvider(1024);
    const planner: RuntimePlanner = {
      plan: () => [
        { intent: 'collect local context', actionClass: 'local_only' },
        { intent: 'summarize findings', actionClass: 'local_only', dependsOn: ['node-1'] },
        { intent: 'draft final answer', actionClass: 'local_only', dependsOn: ['node-2'] },
      ],
    };

    const runPipeline = createV1PipelineAdapter(llm, planner);
    const result = await runPipeline(
      { content: 'run the full pipeline', sessionKey: 'pr15-session', memoryContext: ['prior memory'] },
      { artifactBaseDir: '.synth/test-pr15', autonomyLevel: 1, enableMemory: true, policyPath: '' },
    );

    expect(result.artifactPaths.toolDag.executionLevels).toEqual([['node-1'], ['node-2'], ['node-3']]);
    expect(result.artifactPaths.toolDag.executionOrder).toEqual(['node-1', 'node-2', 'node-3']);
    expect(result.artifactPaths.toolDag.aggregated.totalNodes).toBe(3);
    expect(result.artifactPaths.executionTrace.map(t => t.nodeId)).toEqual(['node-1', 'node-2', 'node-3']);
    expect(result.artifactPaths.executionTrace.every(t => t.status === 'executed')).toBe(true);
  });
});
