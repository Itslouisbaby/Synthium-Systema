import { describe, expect, it } from 'vitest';

import { runAdversarialRedTeamHarness } from '../../src/evals/adversarial-red-team-harness';

describe('PR29 adversarial red-team harness', () => {
  it('injects adversarial scenarios and reports resilience metrics', async () => {
    const report = await runAdversarialRedTeamHarness({
      rootDir: process.cwd(),
      gracefulDegradationFloor: 0.75,
      incorrectHighConfidenceCeiling: 0.15,
      stressLevel: 0.05,
    });

    expect(report.runs).toBe(4);
    expect(report.gracefulDegradationSuccessRate).toBeGreaterThanOrEqual(0.75);
    expect(report.incorrectHighConfidenceActionRate).toBeLessThanOrEqual(0.15);
  });

  it('fails gate when stress causes brittle high-confidence errors', async () => {
    await expect(runAdversarialRedTeamHarness({
      rootDir: process.cwd(),
      gracefulDegradationFloor: 0.75,
      incorrectHighConfidenceCeiling: 0.15,
      stressLevel: 0.30,
    })).rejects.toThrow(/red_team_/);
  });
});
