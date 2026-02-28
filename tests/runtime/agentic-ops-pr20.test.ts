import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AgenticOpsManager } from '../../src/ops/agentic-ops';

describe('PR20 agentic operations mode (bounded autonomy)', () => {
  it('queues goals, enforces approval scopes and budgets, and supports autopause/stop', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'synth-ops20-'));
    const ops = new AgenticOpsManager(baseDir);
    await ops.init(1);

    const goalA = await ops.enqueueGoal('run nightly summary', 'required', 1);
    const goalB = await ops.enqueueGoal('refresh local cache', 'preapproved', 1);

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
    expect(pendingB?.status === 'autopaused' || pendingB?.status === 'queued' || pendingB?.status === 'failed').toBe(true);

    await ops.stop();
    const stopped = await ops.runScheduledGoals({
      executeGoal: async () => ({ success: true, output: 'done' }),
    });
    expect(stopped.executed).toBe(0);
  });
});
