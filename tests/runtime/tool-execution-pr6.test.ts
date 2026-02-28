import { describe, expect, it } from 'vitest';

import { createV1PipelineAdapter } from '../../src/runtime/v1-pipeline-adapter';
import type { LLMProvider } from '../../src/llm/llm-provider';

class ToolStubLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> { return `GEN:${prompt}`; }
  async generateWithContext(prompt: string): Promise<string> { return `TOOL_OK:${prompt}`; }
  async embed(): Promise<number[]> { return [0.1, 0.2, 0.3]; }
  async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => [0.1, 0.2, 0.3]); }
  getModelInfo() { return { name: 'tool-stub', provider: 'stub', contextWindow: 2048, embeddingDimensions: 3, supportsStreaming: false }; }
  async healthCheck(): Promise<boolean> { return true; }
}

class FailingToolLLM extends ToolStubLLM {
  override async generateWithContext(): Promise<string> {
    throw new Error('forced tool failure');
  }
}

describe('PR6 tool execution envelope + artifacting', () => {
  it('emits normalized success and skipped_policy tool artifacts', async () => {
    const adapter = createV1PipelineAdapter(new ToolStubLLM());

    const allow = await adapter(
      { content: 'summarize this local note', sessionKey: 'pr6-allow' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );

    expect(allow.artifactPaths.toolExecutionEvents.some(event => event.status === 'success')).toBe(true);
    expect(allow.artifactPaths.toolExecutionEvents.every(event => event.eventId.includes(event.stepId))).toBe(true);

    const deny = await adapter(
      { content: 'read https://example.com and summarize', sessionKey: 'pr6-deny' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );

    expect(deny.artifactPaths.toolExecutionEvents.some(event => event.status === 'skipped_policy')).toBe(true);
  });

  it('records failed attempts and requests replan on execution errors', async () => {
    const adapter = createV1PipelineAdapter(new FailingToolLLM());

    const result = await adapter(
      { content: 'summarize this local note', sessionKey: 'pr6-fail' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );

    expect(result.artifactPaths.replanRequested).toBe(true);
    expect(result.plan.steps[0].status).toBe('failed');
    expect(result.artifactPaths.toolExecutionEvents.some(event => event.status === 'failed')).toBe(true);
  });
});
