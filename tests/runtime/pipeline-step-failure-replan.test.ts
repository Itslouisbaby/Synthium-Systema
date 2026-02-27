import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createV1PipelineAdapter } from '../../src/runtime/v1-pipeline-adapter';
import { SynthRuntime } from '../../src/synth-runtime';
import type { LLMProvider } from '../../src/llm/llm-provider';

class FailingLLM implements LLMProvider {
  async generate(): Promise<string> {
    throw new Error('provider offline');
  }

  async generateWithContext(): Promise<string> {
    throw new Error('provider offline');
  }

  async embed(): Promise<number[]> {
    return new Array(4096).fill(0.42);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(4096).fill(0.42));
  }

  getModelInfo() {
    return {
      name: 'failing',
      provider: 'stub',
      contextWindow: 2048,
      embeddingDimensions: 4096,
      supportsStreaming: false,
    };
  }

  async healthCheck(): Promise<boolean> {
    return false;
  }
}

describe('PR2 failure semantics + replan trace', () => {
  it('adapter marks failures and emits replan metadata when execution fails', async () => {
    const adapter = createV1PipelineAdapter(new FailingLLM());

    const result = await adapter(
      { content: 'summarize this local note', sessionKey: 'replan-s1' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );

    expect(result.plan.steps[0].status).toBe('failed');
    expect(result.evaluation.result).toBe('failure');
    expect(result.evaluation.summary).toContain('Replan suggested');
    expect(result.artifactPaths.replanRequested).toBe(true);
    expect(result.artifactPaths.replanReason).toContain('provider offline');
  });

  it('runtime surfaces non-success output when model execution fails', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr2-fail-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new FailingLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();

    const response = await runtime.processInput('summarize this local note');

    runtime.stop();

    expect(response).toContain('Execution failed');
    expect(response).toContain('Replan suggested');
  });
});
