import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runExpectancyBoard } from '../../src/evals/agi-expectancy-board';

describe('PR30 AGI expectancy board + release policy', () => {
  it('passes with complete multi-axis metrics and no-axis-collapse', async () => {
    const root = await mkdtemp(join(tmpdir(), 'synth-pr30-pass-'));
    await mkdir(join(root, '.synth', 'evals', 'agi-matrix'), { recursive: true });
    await mkdir(join(root, '.synth', 'evals', 'adversarial-red-team'), { recursive: true });

    await writeFile(join(root, '.synth', 'evals', 'agi-matrix', 'latest.json'), JSON.stringify({
      byDomain: {
        software_engineering: { normalized: 0.7 },
        math_formal_reasoning: { normalized: 0.71 },
        scientific_reasoning: { normalized: 0.69 },
        planning_under_uncertainty: { normalized: 0.73 },
        social_agentic_reasoning: { normalized: 0.68 },
        tool_use_composition: { normalized: 0.72 },
        self_correction: { normalized: 0.74 },
      },
      oodGroup: { normalized: 0.66 },
      transfer: { transferIndex: 0.2 },
      revisionStats: { acceptedUpliftRate: 0.41 },
      rollingWindow: { stddev: 0.08 },
    }), 'utf8');

    await writeFile(join(root, '.synth', 'evals', 'adversarial-red-team', 'latest.json'), JSON.stringify({
      gracefulDegradationSuccessRate: 0.85,
      incorrectHighConfidenceActionRate: 0.05,
    }), 'utf8');

    const report = await runExpectancyBoard({
      rootDir: root,
      expectancyTarget: 0.6,
      noSingleAxisCollapseFloor: 0.4,
    });

    expect(report.pass).toBe(true);
    expect(report.expectancyIndex).toBeGreaterThanOrEqual(0.6);
    expect(report.failingAxes).toHaveLength(0);
  });

  it('fails when any axis collapses below policy floor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'synth-pr30-fail-'));
    await mkdir(join(root, '.synth', 'evals', 'agi-matrix'), { recursive: true });

    await writeFile(join(root, '.synth', 'evals', 'agi-matrix', 'latest.json'), JSON.stringify({
      byDomain: {
        software_engineering: { normalized: 0.7 },
        math_formal_reasoning: { normalized: 0.71 },
        scientific_reasoning: { normalized: 0.69 },
        planning_under_uncertainty: { normalized: 0.73 },
        social_agentic_reasoning: { normalized: 0.68 },
        tool_use_composition: { normalized: 0.72 },
        self_correction: { normalized: 0.2 },
      },
      oodGroup: { normalized: 0.2 },
      transfer: { transferIndex: -1 },
      revisionStats: { acceptedUpliftRate: 0.1 },
      rollingWindow: { stddev: 0.5 },
    }), 'utf8');

    await expect(runExpectancyBoard({
      rootDir: root,
      expectancyTarget: 0.6,
      noSingleAxisCollapseFloor: 0.4,
    })).rejects.toThrow('expectancy_board_gate_failed');
  });
});
