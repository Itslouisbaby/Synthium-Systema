import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AgenticOpsManager } from '../../src/ops/agentic-ops';

describe('PR20/PR26 agentic operations mode (bounded autonomy + strategic portfolio)', () => {
  it('queues goals, enforces approval scopes/budgets, reprioritizes portfolio, and logs opportunity-cost evidence', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-ops20-'));
    const ops = new AgenticOpsManager(baseDir);
    await ops.init(1);

    const goalA = await ops.enqueueGoal('urgent incident remediation in prod', 'required', 1);
    const goalB = await ops.enqueueGoal('refresh local cache summary', 'preapproved', 1);

    await ops.setAutopause(true);
    let run = await ops.runScheduledGoals({
      executeGoal: async () => ({ success: true, output: 'done' }),
    });
    expect(run.executed).toBe(0);

    await ops.setAutopause(false);
    run = await ops.runScheduledGoals({
      approvedGoalIds: [goalA.goalId],
      dailyBudget: 1,
      executeGoal: async (goal) => ({ success: !goal.description.includes('cache'), output: 'ok' }),
    });

    expect(run.executed).toBe(1);

    const view = await ops.inspectQueue();
    const executedA = view.queue.find(g => g.goalId === goalA.goalId);
    const pendingB = view.queue.find(g => g.goalId === goalB.goalId);
    expect(executedA?.status).toBe('completed');
    expect(executedA?.portfolioScore?.totalScore).toBeTypeOf('number');
    expect(pendingB?.status === 'autopaused' || pendingB?.status === 'queued' || pendingB?.status === 'failed').toBe(true);

    await ops.stop();
    const stopped = await ops.runScheduledGoals({
      executeGoal: async () => ({ success: true, output: 'done' }),
    });
    expect(stopped.executed).toBe(0);

    const auditRaw = await readFile(join(baseDir, 'ops', 'audit.jsonl'), 'utf8');
    expect(auditRaw).toContain('goal_portfolio_ranking');
    expect(auditRaw).toContain('goal_selected');
    expect(auditRaw).toContain('opportunityCost');
  });

  it('includes opportunity-cost evidence when escalation occurs due to missing approval', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-ops26-'));
    const ops = new AgenticOpsManager(baseDir);
    await ops.init(3);

    await ops.enqueueGoal('urgent security prod fix', 'required', 0);
    await ops.enqueueGoal('non-urgent docs cleanup', 'preapproved', 0);

    const run = await ops.runScheduledGoals({
      approvedGoalIds: [],
      dailyBudget: 3,
      executeGoal: async () => ({ success: true, output: 'done' }),
    });

    expect(run.escalated).toBeGreaterThanOrEqual(1);

    const auditRaw = await readFile(join(baseDir, 'ops', 'audit.jsonl'), 'utf8');
    const escalationLine = auditRaw.split('\n').find(line => line.includes('goal_escalated') && line.includes('approval_required'));
    expect(escalationLine).toBeTruthy();
    expect(escalationLine).toContain('opportunityCost');
  });
});
