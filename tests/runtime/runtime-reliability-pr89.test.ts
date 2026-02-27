import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SynthRuntime } from '../../src/synth-runtime';
import type { LLMProvider } from '../../src/llm/llm-provider';

class ReliabilityStubLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> {
    return `GEN:${prompt}`;
  }

  async generateWithContext(prompt: string, context: string[]): Promise<string> {
    return `REL:${prompt}|ctx=${context.length}`;
  }

  async embed(): Promise<number[]> {
    return new Array(4096).fill(0.31);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(4096).fill(0.31));
  }

  getModelInfo() {
    return {
      name: 'reliability-stub',
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

describe('PR8/PR9 runtime reliability and promotion evidence gates', () => {
  it('meets a basic latency budget and emits run artifacts in a single request', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr89-latency-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new ReliabilityStubLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();

    const startedAt = Date.now();
    const response = await runtime.processInput('summarize local reliability note');
    const elapsedMs = Date.now() - startedAt;

    runtime.stop();

    expect(response).toContain('REL:');
    expect(elapsedMs).toBeLessThan(2000);

    const signalDirs = await readdir(join(baseDir, 'signals'));
    expect(signalDirs.length).toBe(1);

    const runRaw = await readFile(join(baseDir, 'artifacts', signalDirs[0], 'runs', 'latest.json'), 'utf8');
    const manifest = JSON.parse(runRaw) as { response: string; evaluation: { result: string } };

    expect(manifest.response).toContain('REL:');
    expect(['success', 'partial', 'failure']).toContain(manifest.evaluation.result);
  });

  it('supports repeated sequential inputs on one runtime instance without drift', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr89-repeat-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new ReliabilityStubLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();

    const responses: string[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await runtime.processInput(`local request ${i}`);
      responses.push(response);
    }

    runtime.stop();

    expect(responses).toHaveLength(6);
    for (const response of responses) {
      expect(response).toContain('REL:');
      expect(response).not.toContain('Blocked by policy');
    }

    const signalDirs = await readdir(join(baseDir, 'signals'));
    expect(signalDirs.length).toBe(6);

    for (const sessionDir of signalDirs) {
      const runRaw = await readFile(join(baseDir, 'artifacts', sessionDir, 'runs', 'latest.json'), 'utf8');
      const manifest = JSON.parse(runRaw) as { policyDecisions: Array<{ decision: string }> };
      expect(Array.isArray(manifest.policyDecisions)).toBe(true);
      expect(manifest.policyDecisions.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('enforces flash-memory retention boundary under sustained request volume', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr89-memory-cap-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new ReliabilityStubLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();

    for (let i = 0; i < 130; i++) {
      await runtime.processInput(`boundary local input ${i}`);
    }

    runtime.stop();

    const flashRaw = await readFile(join(baseDir, 'core-memories', 'hot', 'flash', 'current.json'), 'utf8');
    const flash = JSON.parse(flashRaw) as { entries: Array<{ speaker: string; content: string }> };

    expect(flash.entries.length).toBeLessThanOrEqual(250);
    expect(flash.entries.some(entry => entry.content.includes('boundary local input 129'))).toBe(true);

    const knowledge = await runtime.queryKnowledge('boundary local input');
    expect(knowledge.length).toBeGreaterThan(0);
    expect(knowledge.length).toBeLessThanOrEqual(5);
  }, 45000);
});
