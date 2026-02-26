import { describe, it, expect } from 'vitest';
import { createV1PipelineAdapter } from '../../src/runtime/v1-pipeline-adapter';
import type { LLMProvider } from '../../src/llm/llm-provider';

class StubLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> {
    return `GEN:${prompt}`;
  }
  async generateWithContext(prompt: string, context: string[]): Promise<string> {
    return `CTX:${context.length}:${prompt}`;
  }
  async embed(): Promise<number[]> {
    return [0.1, 0.2, 0.3];
  }
  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2, 0.3]);
  }
  getModelInfo() {
    return {
      name: 'stub',
      provider: 'stub',
      contextWindow: 1024,
      embeddingDimensions: 3,
      supportsStreaming: false,
    };
  }
  async healthCheck(): Promise<boolean> {
    return true;
  }
}

describe('v1 pipeline adapter', () => {
  it('executes local-only inputs and returns success', async () => {
    const adapter = createV1PipelineAdapter(new StubLLM());

    const result = await adapter(
      { content: 'summarize this local text', sessionKey: 's1' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );

    expect(result.plan.steps).toHaveLength(1);
    expect(result.plan.steps[0].actionClass).toBe('local_only');
    expect(result.plan.steps[0].status).toBe('executed');
    expect(result.evaluation.result).toBe('success');
  });

  it('blocks external-read inputs at autonomy level 1', async () => {
    const adapter = createV1PipelineAdapter(new StubLLM());

    const result = await adapter(
      { content: 'read https://example.com and summarize', sessionKey: 's2' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );

    expect(result.plan.steps[0].actionClass).toBe('external_read');
    expect(result.plan.steps[0].status).toBe('blocked');
    expect(result.evaluation.result).toBe('failure');
    expect(result.evaluation.summary).toContain('Blocked by policy');
  });

  it('marks irreversible actions as awaiting approval at autonomy level 2', async () => {
    const adapter = createV1PipelineAdapter(new StubLLM());

    const result = await adapter(
      { content: 'delete stale cache files', sessionKey: 's3' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 2 }
    );

    expect(result.plan.steps[0].actionClass).toBe('irreversible');
    expect(result.plan.steps[0].status).toBe('awaiting_approval');
    expect(result.evaluation.result).toBe('partial');
    expect(result.artifactPaths.policyAuditEvents[0].decision).toBe('awaiting_approval');
  });
});
