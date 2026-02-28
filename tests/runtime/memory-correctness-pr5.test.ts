import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { LLMProvider } from '../../src/llm/llm-provider';
import { SynthRuntime } from '../../src/synth-runtime';

class MemoryStubLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> { return `GEN:${prompt}`; }
  async generateWithContext(prompt: string, context: string[]): Promise<string> { return `MEM:${prompt}|ctx=${context.length}`; }
  async embed(): Promise<number[]> { return new Array(4096).fill(0.17); }
  async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => new Array(4096).fill(0.17)); }
  getModelInfo() { return { name: 'memory-stub', provider: 'stub', contextWindow: 4096, embeddingDimensions: 4096, supportsStreaming: false }; }
  async healthCheck(): Promise<boolean> { return true; }
}

describe('PR5 production memory correctness', () => {
  it('persists run manifest integrity, policy decisions, step/tool outcomes, and semantic facts from successful outcomes only', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr5-memory-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new MemoryStubLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
      autonomyLevel: 1,
    });

    await runtime.initialize();
    await runtime.start();
    await runtime.processInput('read https://example.com and summarize');
    runtime.stop();

    const artifactsRoot = join(baseDir, 'artifacts');
    const sessions = await readdir(artifactsRoot);
    const latestPath = join(artifactsRoot, sessions[0], 'runs', 'latest.json');
    const raw = await readFile(latestPath, 'utf8');
    const manifest = JSON.parse(raw) as {
      runId: string;
      sessionKey: string;
      timestampMs: number;
      input: string;
      response: string;
      policyDecisions: Array<{ stepId: string; decision: string; reason: string }>;
      stepOutcomes: Array<{ stepId: string; status: string }>;
      toolOutcomes: Array<{ toolName: string; success: boolean; durationMs: number }>;
      integrity: string;
    };

    expect(manifest.input.length).toBeGreaterThan(0);
    expect(manifest.response.length).toBeGreaterThan(0);
    expect(manifest.policyDecisions.length).toBeGreaterThan(0);
    expect(manifest.stepOutcomes.length).toBeGreaterThan(0);
    expect(manifest.toolOutcomes.length).toBeGreaterThan(0);

    const { integrity, ...core } = manifest;
    const expected = createHash('sha256').update(JSON.stringify(core)).digest('hex');
    expect(integrity).toBe(expected);

    const semanticFactsRaw = await readFile(join(baseDir, 'semantic-store', 'facts.json'), 'utf8');
    const facts = semanticFactsRaw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as { statement: string });

    expect(facts.length).toBeGreaterThan(0);
    expect(facts.some(fact => fact.statement.includes('Blocked by policy'))).toBe(false);
  });
});
