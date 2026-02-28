import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { runAGIEvalMatrix, validateAGIMatrixTask } from '../../src/evals/agi-eval-matrix';

describe('PR21/PR22 AGI Eval Matrix', () => {
  it('loads and validates 200+ multi-domain tasks and emits domain/split plus seen vs OOD score groups', async () => {
    const taskRaw = JSON.parse(await readFile(join(process.cwd(), 'evals', 'agi-matrix', 'tasks', 'core-v1.json'), 'utf8'));
    expect(Array.isArray(taskRaw)).toBe(true);
    expect(taskRaw.length).toBeGreaterThanOrEqual(200);
    expect(taskRaw.every(validateAGIMatrixTask)).toBe(true);

    const scorecard = await runAGIEvalMatrix({
      rootDir: process.cwd(),
      batchSize: 50,
      aggregateFloor: 0.6,
      oodFloor: 0.5,
      oodTemplateFloor: 0.5,
      oodToolsFloor: 0.5,
      oodDomainsFloor: 0.5,
      perDomainFloor: 0.5,
      stabilityStddevCeiling: 0.2,
    });

    expect(scorecard.totalTasks).toBeGreaterThanOrEqual(200);
    expect(Object.keys(scorecard.byDomain).length).toBe(7);
    expect(scorecard.bySplit.ood_unseen_domains.normalized).toBeGreaterThan(0);
    expect(scorecard.seenGroup.normalized).toBeGreaterThan(0);
    expect(scorecard.oodGroup.normalized).toBeGreaterThan(0);
  });

  it('fails when strict matrix floors are not met', async () => {
    await expect(runAGIEvalMatrix({
      rootDir: process.cwd(),
      batchSize: 100,
      aggregateFloor: 0.99,
    })).rejects.toThrow('agi_matrix_aggregate_floor_not_met');
  });

  it('emits a transfer index and enforces independent OOD split floors', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'agi-matrix-pr22-'));
    try {
      await cp(join(process.cwd(), 'evals'), join(rootDir, 'evals'), { recursive: true });

      const scorecardFirst = await runAGIEvalMatrix({
        rootDir,
        batchSize: 60,
      });
      expect(scorecardFirst.transfer.transferIndex).toBe(0);

      const scorecardSecond = await runAGIEvalMatrix({
        rootDir,
        batchSize: 60,
      });
      expect(Number.isFinite(scorecardSecond.transfer.transferIndex)).toBe(true);

      await expect(runAGIEvalMatrix({
        rootDir,
        batchSize: 60,
        oodTemplateFloor: 0.99,
      })).rejects.toThrow('agi_matrix_ood_unseen_templates_floor_not_met');
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
