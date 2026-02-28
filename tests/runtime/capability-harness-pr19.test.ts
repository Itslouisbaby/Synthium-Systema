import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCapabilityEval } from '../../src/evals/capability-harness';

describe('PR19 capability eval harness + score gate', () => {
  it('produces per-run scorecards, persists trend history, and enforces score floor', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-cap19-'));

    const score = await runCapabilityEval(baseDir);
    expect(score.tasks.length).toBe(4);
    expect(score.normalizedScore).toBeGreaterThan(0);

    const latest = JSON.parse(await readFile(join(baseDir, 'evals', 'capability', 'latest.json'), 'utf8'));
    expect(latest.runId).toBe(score.runId);

    const history = JSON.parse(await readFile(join(baseDir, 'evals', 'capability', 'history.json'), 'utf8'));
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(1);

    await expect(runCapabilityEval(baseDir, 1.1)).rejects.toThrow('capability_score_floor_not_met');
  });
});
