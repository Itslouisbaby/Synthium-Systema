import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SynthRuntime } from '../../src/synth-runtime';
import type { LLMProvider } from '../../src/llm/llm-provider';

class RuntimeStubLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> {
    return `GEN:${prompt}`;
  }

  async generateWithContext(prompt: string, context: string[]): Promise<string> {
    return `OK:${prompt}|ctx=${context.length}`;
  }

  async embed(): Promise<number[]> {
    return new Array(4096).fill(0.11);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(4096).fill(0.11));
  }

  getModelInfo() {
    return {
      name: 'runtime-stub',
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

describe('SynthRuntime PR1 E2E', () => {
  it('happy path: local input executes through pipeline and returns non-stub output', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr1-happy-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new RuntimeStubLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();

    const response = await runtime.processInput('summarize this local note');

    runtime.stop();

    expect(response).toContain('OK:');
    expect(response).not.toContain('Blocked by policy');

    const knowledge = await runtime.queryKnowledge('local note');
    expect(knowledge.length).toBeGreaterThan(0);

    const signalDirs = await readdir(join(baseDir, 'signals'));
    expect(signalDirs.length).toBeGreaterThan(0);

    const signalFile = join(baseDir, 'signals', signalDirs[0], 'signals.jsonl');
    const signalRaw = await readFile(signalFile, 'utf8');
    expect(signalRaw).toContain('"type":"OUTPUT_READY"');

    const runRaw = await readFile(join(baseDir, 'artifacts', signalDirs[0], 'runs', 'latest.json'), 'utf8');
    const manifest = JSON.parse(runRaw) as { response: string; planId: string; policyDecisions: unknown[] };
    expect(typeof manifest.response).toBe('string');
    expect(typeof manifest.planId).toBe('string');
    expect(Array.isArray(manifest.policyDecisions)).toBe(true);
  });

  it('policy-block path: external read request is blocked at level 1 and surfaced in output', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr1-policy-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new RuntimeStubLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();

    const response = await runtime.processInput('read https://example.com and summarize');

    runtime.stop();

    expect(response).toContain('Blocked by policy');
    expect(response).toContain('external_read');
  });
});
