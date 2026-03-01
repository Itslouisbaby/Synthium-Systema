import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runLearningRegressionGuard } from '../../src/evals/learning-regression-guard';

describe('PR28 anti-regression learning guardrails', () => {
  it('runs shadow replay against frozen benchmark and passes within regression budget', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr28-pass-'));
    const report = await runLearningRegressionGuard({
      rootDir: process.cwd(),
      tolerance: 0.02,
      regressionBudget: 0.08,
      forcedDriftDelta: 0,
    });

    expect(report.benchmarkSize).toBeGreaterThan(0);
    expect(report.totalRegressionDelta).toBeLessThanOrEqual(0.08);
    expect(report.pass).toBe(true);
  });

  it('blocks when learning drift exceeds regression budget', async () => {
    await expect(runLearningRegressionGuard({
      rootDir: process.cwd(),
      tolerance: 0.01,
      regressionBudget: 0.05,
      forcedDriftDelta: -0.2,
    })).rejects.toThrow('learning_guard_regression_budget_exceeded');
  });
});
