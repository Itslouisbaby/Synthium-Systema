import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SynthRuntime } from '../../src/synth-runtime';
import type { LLMProvider } from '../../src/llm/llm-provider';

class EchoLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> {
    return prompt;
  }

  async generateWithContext(prompt: string): Promise<string> {
    return prompt;
  }

  async embed(): Promise<number[]> {
    return new Array(4096).fill(0.11);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(4096).fill(0.11));
  }

  getModelInfo() {
    return {
      name: 'echo',
      provider: 'test',
      contextWindow: 4096,
      embeddingDimensions: 4096,
      supportsStreaming: false,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

describe('PR12 world-state and state-diff loop', () => {
  it('writes world-state snapshots/diffs and emits contradiction signals', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr12-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new EchoLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();
    await runtime.processInput('not sky blue and sky blue');
    runtime.stop();

    const artifactSessions = await readdir(join(baseDir, 'artifacts'));
    const sessionDir = artifactSessions[0];

    const runRaw = await readFile(join(baseDir, 'artifacts', sessionDir, 'runs', 'latest.json'), 'utf8');
    const run = JSON.parse(runRaw) as {
      worldStateBefore: { facts: string[] };
      worldStateAfter: { facts: string[] };
      worldStateDiffs: Array<{ type: string }>;
    };

    expect(Array.isArray(run.worldStateBefore.facts)).toBe(true);
    expect(run.worldStateAfter.facts).toContain('not sky blue');
    expect(run.worldStateAfter.facts).toContain('sky blue');
    expect(run.worldStateDiffs.some(diff => diff.type === 'fact_add')).toBe(true);

    const signalFile = join(baseDir, 'signals', sessionDir, 'signals.jsonl');
    const signalsRaw = await readFile(signalFile, 'utf8');
    expect(signalsRaw).toContain('PREDICTION_MISMATCH');
  });
});
