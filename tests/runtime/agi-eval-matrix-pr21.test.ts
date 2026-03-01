import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { runAGIEvalMatrix, validateAGIMatrixTask } from '../../src/evals/agi-eval-matrix';

describe('PR21/PR22/PR23/PR24 AGI Eval Matrix', () => {
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
      rollingWindowSize: 20,
      rollingStddevCeiling: 0.2,
      rollingWorstDecileFloor: 0.5,
    });

    expect(scorecard.totalTasks).toBeGreaterThanOrEqual(200);
    expect(Object.keys(scorecard.byDomain).length).toBe(7);
    expect(scorecard.bySplit.ood_unseen_domains.normalized).toBeGreaterThan(0);
    expect(scorecard.seenGroup.normalized).toBeGreaterThan(0);
    expect(scorecard.oodGroup.normalized).toBeGreaterThan(0);
    expect(scorecard.rollingWindow.windowSize).toBeGreaterThan(0);
    expect(scorecard.rollingWindow.worstDecileScore).toBeGreaterThan(0);
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

  it('fails rolling variance gate for spiky run history and enforces worst-decile floor', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'agi-matrix-pr23-'));
    try {
      await cp(join(process.cwd(), 'evals'), join(rootDir, 'evals'), { recursive: true });
      const outputDir = join(rootDir, '.synth', 'evals', 'agi-matrix');
      await cp(join(process.cwd(), '.synth', 'evals', 'agi-matrix'), outputDir, { recursive: true, force: true }).catch(async () => {
        await runAGIEvalMatrix({ rootDir, batchSize: 40 });
      });

      const historyPath = join(outputDir, 'history.json');
      const raw = JSON.parse(await readFile(historyPath, 'utf8'));
      const source = raw[0];
      const syntheticHistory = Array.from({ length: 20 }).map((_, index) => ({
        ...source,
        runId: `synthetic-${index}`,
        normalizedScore: index % 2 === 0 ? 0.95 : 0.35,
        seenGroup: { ...source.seenGroup, normalized: index % 2 === 0 ? 0.96 : 0.36 },
        oodGroup: { ...source.oodGroup, normalized: index % 2 === 0 ? 0.94 : 0.34 },
      }));
      await writeFile(historyPath, JSON.stringify(syntheticHistory, null, 2), 'utf8');

      await expect(runAGIEvalMatrix({
        rootDir,
        batchSize: 40,
        rollingWindowSize: 20,
        rollingStddevCeiling: 0.05,
      })).rejects.toThrow('agi_matrix_rolling_stddev_exceeded');

      await expect(runAGIEvalMatrix({
        rootDir,
        batchSize: 40,
        rollingWindowSize: 20,
        rollingStddevCeiling: 1,
        rollingWorstDecileFloor: 0.70,
      })).rejects.toThrow('agi_matrix_rolling_worst_decile_floor_not_met');
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it('enforces revise-loop uplift contract and fails when revision uplift floor regresses', async () => {
    const scorecard = await runAGIEvalMatrix({
      rootDir: process.cwd(),
      batchSize: 60,
      reviseMinUplift: 0.015,
      revisionUpliftFloor: 0.1,
    });

    expect(scorecard.revisionStats.total).toBeGreaterThan(0);
    expect(scorecard.revisionContracts.length).toBe(scorecard.revisionStats.total);
    expect(scorecard.revisionContracts.every(item => typeof item.objectiveDelta === 'number')).toBe(true);
    expect(scorecard.revisionStats.upliftCount + scorecard.revisionStats.regressionCount + scorecard.revisionStats.noChangeCount)
      .toBe(scorecard.revisionStats.total);

    await expect(runAGIEvalMatrix({
      rootDir: process.cwd(),
      batchSize: 60,
      reviseMinUplift: 0.2,
      revisionUpliftFloor: 0.1,
    })).rejects.toThrow('agi_matrix_revision_uplift_floor_not_met');
  });

});
