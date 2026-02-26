import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createV1PipelineAdapter } from '../../src/runtime/v1-pipeline-adapter';
import { SynthRuntime } from '../../src/synth-runtime';
import type { LLMProvider } from '../../src/llm/llm-provider';

class AuditStubLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> {
    return `GEN:${prompt}`;
  }

  async generateWithContext(prompt: string, context: string[]): Promise<string> {
    return `AUDIT:${prompt}|ctx=${context.length}`;
  }

  async embed(): Promise<number[]> {
    return new Array(4096).fill(0.21);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(4096).fill(0.21));
  }

  getModelInfo() {
    return {
      name: 'audit-stub',
      provider: 'stub',
      contextWindow: 2048,
      embeddingDimensions: 4096,
      supportsStreaming: false,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

describe('PR3 memory + audit observability', () => {
  it('adapter returns policy audit artifacts for blocked decision', async () => {
    const adapter = createV1PipelineAdapter(new AuditStubLLM());

    const result = await adapter(
      { content: 'read https://example.com and summarize', sessionKey: 'audit-s1' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );

    expect(result.artifactPaths.policyAuditEvents.length).toBeGreaterThanOrEqual(1);
    const blocked = result.artifactPaths.policyAuditEvents.find(e => e.decision === 'block');
    expect(blocked).toBeDefined();
    expect(result.evaluation.result).toBe('failure');
  });

  it('runtime persists memory entries with pipeline metadata (plan/evaluation)', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr3-memory-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new AuditStubLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();

    const response = await runtime.processInput('summarize this local note for audit');

    runtime.stop();

    expect(response).toContain('AUDIT:');

    const flashPath = join(baseDir, 'core-memories', 'hot', 'flash', 'current.json');
    const flashRaw = await readFile(flashPath, 'utf8');
    const flash = JSON.parse(flashRaw) as {
      entries: Array<{
        speaker: string;
        content: string;
        metadata: Record<string, unknown>;
      }>;
    };

    expect(flash.entries.length).toBeGreaterThanOrEqual(2);

    const userEntry = flash.entries.find(e => e.speaker === 'user');
    const assistantEntry = flash.entries.find(e => e.speaker === 'assistant');

    expect(userEntry).toBeDefined();
    expect(assistantEntry).toBeDefined();

    expect(assistantEntry?.metadata.response).toBe(true);
    expect(typeof assistantEntry?.metadata.planId).toBe('string');
    expect(['success', 'partial', 'failure']).toContain(String(assistantEntry?.metadata.evaluationResult));
  });
});
