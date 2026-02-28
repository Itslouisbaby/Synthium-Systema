import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runAGIEvalMatrix, validateAGIMatrixTask } from '../../src/evals/agi-eval-matrix';

describe('PR21 AGI Eval Matrix v1', () => {
  it('loads and validates 200+ multi-domain tasks and emits domain/split scorecards', async () => {
    const taskRaw = JSON.parse(await readFile(join(process.cwd(), 'evals', 'agi-matrix', 'tasks', 'core-v1.json'), 'utf8'));
    expect(Array.isArray(taskRaw)).toBe(true);
    expect(taskRaw.length).toBeGreaterThanOrEqual(200);
    expect(taskRaw.every(validateAGIMatrixTask)).toBe(true);

    const scorecard = await runAGIEvalMatrix({
      rootDir: process.cwd(),
      batchSize: 50,
      aggregateFloor: 0.6,
      oodFloor: 0.5,
      perDomainFloor: 0.5,
      stabilityStddevCeiling: 0.2,
    });

    expect(scorecard.totalTasks).toBeGreaterThanOrEqual(200);
    expect(Object.keys(scorecard.byDomain).length).toBe(7);
    expect(scorecard.oodNormalized).toBeGreaterThan(0);
  });

  it('fails when strict matrix floors are not met', async () => {
    await expect(runAGIEvalMatrix({
      rootDir: process.cwd(),
      batchSize: 100,
      aggregateFloor: 0.99,
    })).rejects.toThrow('agi_matrix_aggregate_floor_not_met');
  });
});
