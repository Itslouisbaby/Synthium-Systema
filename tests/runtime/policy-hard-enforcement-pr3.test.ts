import { describe, expect, it } from 'vitest';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createV1PipelineAdapter } from '../../src/runtime/v1-pipeline-adapter';
import { SynthRuntime } from '../../src/synth-runtime';
import type { LLMProvider } from '../../src/llm/llm-provider';

class PolicyStubLLM implements LLMProvider {
  async generate(prompt: string): Promise<string> { return `GEN:${prompt}`; }
  async generateWithContext(prompt: string, context: string[]): Promise<string> { return `OK:${prompt}|ctx=${context.length}`; }
  async embed(): Promise<number[]> { return new Array(4096).fill(0.11); }
  async embedBatch(texts: string[]): Promise<number[][]> { return texts.map(() => new Array(4096).fill(0.11)); }
  getModelInfo() { return { name: 'policy-stub', provider: 'stub', contextWindow: 4096, embeddingDimensions: 4096, supportsStreaming: false }; }
  async healthCheck(): Promise<boolean> { return true; }
}

describe('PR3 policy hard-enforcement', () => {
  it('enforces denied/awaiting-approval without silent execution in adapter', async () => {
    const adapter = createV1PipelineAdapter(new PolicyStubLLM());

    const blocked = await adapter(
      { content: 'read https://example.com and summarize', sessionKey: 'pr3-block' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );
    expect(blocked.plan.steps[0].status).toBe('blocked');
    expect(blocked.plan.steps[0].outputSummary).toContain('Blocked by policy');
    expect(blocked.artifactPaths.policyAuditEvents[0].reason.length).toBeGreaterThan(0);

    const awaiting = await adapter(
      { content: 'delete stale cache files', sessionKey: 'pr3-await' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 2 }
    );
    expect(awaiting.plan.steps[0].status).toBe('awaiting_approval');
    expect(String(awaiting.plan.steps[0].outputSummary)).toContain('Awaiting approval');
    expect(awaiting.artifactPaths.policyAuditEvents[0].decision).toBe('awaiting_approval');
  });

  it('persists step-level policy decisions with reasons in runtime run artifact', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr3-policy-'));
    const runtime = new SynthRuntime({
      baseDir,
      llm: new PolicyStubLLM(),
      enableAutonomy: false,
      enableLearning: false,
      enableMemory: true,
    });

    await runtime.initialize();
    await runtime.start();
    await runtime.processInput('read https://example.com and summarize');
    runtime.stop();

    const artifactsDir = join(baseDir, 'artifacts');
    const sessions = await readdir(artifactsDir);
    expect(sessions.length).toBeGreaterThan(0);

    const runManifestPath = join(artifactsDir, sessions[0], 'runs', 'latest.json');
    const raw = await readFile(runManifestPath, 'utf8');
    const manifest = JSON.parse(raw) as {
      policyDecisions: Array<{ stepId: string; decision: string; reason: string }>;
    };

    expect(manifest.policyDecisions.length).toBeGreaterThan(0);
    for (const decision of manifest.policyDecisions) {
      expect(decision.stepId.length).toBeGreaterThan(0);
      expect(decision.reason.length).toBeGreaterThan(0);
    }
  });
});
