import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { MockLLMProvider } from '../../src/llm/llm-provider';
import { SynthRuntime } from '../../src/synth-runtime';

describe('PR16 memory retrieval ranking + provenance scoring', () => {
  it('ranks memories with provenance and records retrieval trace in run artifacts', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr16-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new MockLLMProvider(4096),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
      tickRate: 10,
    });

    const now = Date.now();
    const seedVector = await (runtime as any).config.llm.embed('seed memory vector');

    await (runtime as any).vectorStore.add('m-old-low', seedVector, {
      text: 'Never use local evidence for this request',
      source: 'runtime_memory',
      sourceTrust: 0.2,
      addedAtMs: now - 1000 * 60 * 60 * 24 * 14,
    });

    await (runtime as any).vectorStore.add('m-fresh-high', seedVector, {
      text: 'Use local evidence and summarize cleanly',
      source: 'user_note',
      sourceTrust: 0.95,
      addedAtMs: now,
    });

    const ranked = await (runtime as any).retrieveRankedMemories('Use local evidence and produce summary', 5);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].content).toContain('Use local evidence');
    expect(ranked[0].provenanceScore).toBeGreaterThan(0);

    await (runtime as any).writeRunManifest('session-pr16', {
      input: 'Use local evidence and produce summary',
      response: 'done',
      planId: 'plan-pr16',
      evaluation: { result: 'success', summary: 'ok' },
      policyDecisions: [],
      stepOutcomes: [],
      toolOutcomes: [],
      executionTrace: [],
      worldStateBefore: { facts: [], assumptions: [], openGoals: [], constraints: [], updatedAtMs: now },
      worldStateAfter: { facts: [], assumptions: [], openGoals: [], constraints: [], updatedAtMs: now },
      worldStateDiffs: [],
      retrievalTrace: ranked,
    });

    const latest = JSON.parse(await readFile(join(baseDir, 'artifacts', 'session-pr16', 'runs', 'latest.json'), 'utf8'));
    expect(Array.isArray(latest.retrievalTrace)).toBe(true);
    expect(typeof latest.retrievalTrace[0].provenanceScore).toBe('number');

    const results = await runtime.queryKnowledge('Use local evidence and produce summary');
    expect(results[0].content).toContain('Use local evidence');
  });
});
