import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

class FailingLLM extends StubLLM {
  override async generateWithContext(): Promise<string> {
    throw new Error('forced failure');
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

  it('creates multi-step plans from compound intent', async () => {
    const adapter = createV1PipelineAdapter(new StubLLM());

    const result = await adapter(
      { content: 'summarize local note and read https://example.com', sessionKey: 's-multi' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 2 }
    );

    expect(result.plan.steps.length).toBe(2);
    expect(result.plan.steps[0].status).toBe('executed');
    expect(result.plan.steps[1].actionClass).toBe('external_read');
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

  it('respects policy artifact deny rules for external read', async () => {
    const adapter = createV1PipelineAdapter(new StubLLM());
    const policyDir = await mkdtemp(join(tmpdir(), 'synth-pr45-policy-'));
    const policyPath = join(policyDir, 'policy.yaml');

    await writeFile(
      policyPath,
      `apiVersion: synth.policy/v1
policyId: test-policy
version: "1.0.0"
effectiveAt: "2026-01-01T00:00:00Z"
changelog:
  - version: "1.0.0"
    at: 2026-01-01T00:00:00Z
    summary: initial
rules:
  externalRead:
    global:
      enabled: true
    domains:
      - pattern: example.com
        allow: false
`
    );

    const result = await adapter(
      { content: 'read https://example.com now', sessionKey: 's-policy' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 2, policyPath }
    );

    expect(result.plan.steps[0].status).toBe('blocked');
    expect(String(result.plan.steps[0].outputSummary)).toContain('Policy artifact denied domain');
    expect(result.artifactPaths.policySource).toBe('canonical');
    expect(result.artifactPaths.policyVersion).toBe('1.0.0');
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

  it('returns failure and replan trace when execution errors', async () => {
    const adapter = createV1PipelineAdapter(new FailingLLM());

    const result = await adapter(
      { content: 'summarize this local text', sessionKey: 's4' },
      { artifactBaseDir: '.synth/test', autonomyLevel: 1 }
    );

    expect(result.plan.steps[0].status).toBe('failed');
    expect(result.evaluation.result).toBe('failure');
    expect(result.evaluation.summary).toContain('Replan suggested');
    expect(result.artifactPaths.replanRequested).toBe(true);
  });
});
