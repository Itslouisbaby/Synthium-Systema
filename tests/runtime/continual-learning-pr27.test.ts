import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ContinualLearningSubstrate } from '../../src/learning/continual-learning-substrate';

describe('PR27 continual learning substrate (skills/policies abstraction)', () => {
  it('induces versioned skills/policies from solved tasks and enforces reuse-before-fresh solve when relevant', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr27-'));
    const substrate = new ContinualLearningSubstrate(baseDir);
    await substrate.init();

    const inducedA = await substrate.induceFromSolvedTask({
      taskId: 'solved-001',
      domain: 'software_engineering',
      taskDescription: 'Implement robust retry orchestration for tool execution pipeline',
      solvedAtMs: Date.now(),
      strategySummary: 'Decompose retries; isolate transient errors; validate with bounded retries',
      policySummary: 'Safety audit with bounded autonomy and no silent side effects',
      score: 0.82,
      split: 'train_seen',
    });

    expect(inducedA.skill.version).toBe(1);
    expect(inducedA.policy.version).toBe(1);

    const inducedB = await substrate.induceFromSolvedTask({
      taskId: 'solved-002',
      domain: 'software_engineering',
      taskDescription: 'Retry orchestration for pipeline with rollback safety',
      solvedAtMs: Date.now(),
      strategySummary: 'Decompose retries and validate constraints first',
      policySummary: 'audit safety constraints and bounded behavior',
      score: 0.84,
      split: 'val_seen',
    });

    expect(inducedB.skill.version).toBeGreaterThanOrEqual(2);
    expect(inducedB.policy.version).toBeGreaterThanOrEqual(2);

    const decision = await substrate.decideReuseBeforeFreshSolve(
      'Need retry orchestration in pipeline with safety constraints',
      'software_engineering',
    );

    expect(decision.reuseRelevant).toBe(true);
    expect(decision.reuseAttempted).toBe(true);
    expect(decision.selectedSkillId).toBeTruthy();

    const decisionNoReuse = await substrate.decideReuseBeforeFreshSolve(
      'compose social facilitation plan for team workshop',
      'social_agentic_reasoning',
    );

    expect(decisionNoReuse.reuseRelevant).toBe(false);
    expect(decisionNoReuse.reuseAttempted).toBe(false);
  });

  it('tracks measurable reuse rate and unseen-task benefit', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-pr27-metrics-'));
    const substrate = new ContinualLearningSubstrate(baseDir);
    await substrate.init();

    await substrate.induceFromSolvedTask({
      taskId: 'solved-010',
      domain: 'tool_use_composition',
      taskDescription: 'compose tool chain with fallback and validation',
      solvedAtMs: Date.now(),
      strategySummary: 'chain tools, validate outputs, fallback on partial failures',
      policySummary: 'bounded tool scope and explicit audit trail',
      score: 0.78,
      split: 'train_seen',
    });

    await substrate.decideReuseBeforeFreshSolve('compose tool chain with validation', 'tool_use_composition');
    await substrate.decideReuseBeforeFreshSolve('compose tool chain with fallback', 'tool_use_composition');

    await substrate.recordReuseOutcome({
      taskId: 'eval-unseen-1',
      unseen: true,
      baselineScore: 0.52,
      finalScore: 0.68,
      reuseAttempted: true,
      reuseUsed: true,
      recordedAtMs: Date.now(),
    });

    await substrate.recordReuseOutcome({
      taskId: 'eval-unseen-2',
      unseen: true,
      baselineScore: 0.55,
      finalScore: 0.7,
      reuseAttempted: true,
      reuseUsed: true,
      recordedAtMs: Date.now(),
    });

    const metrics = await substrate.getReuseMetrics();
    expect(metrics.totalDecisions).toBeGreaterThanOrEqual(2);
    expect(metrics.reuseRate).toBeGreaterThan(0);
    expect(metrics.unseenOutcomes).toBe(2);
    expect(metrics.unseenReuseBenefitMean).toBeGreaterThan(0);
  });
});
