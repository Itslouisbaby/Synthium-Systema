import { describe, expect, it } from 'vitest';

import { ExecutiveLoop } from '../../src/loops/executive-loop';
import { createInitialWorkingState } from '../../src/runtime/working-state';
import { SignalBus } from '../../src/runtime/signal-bus';
import type { PlanStep } from '../../src/types';

describe('PR13 goal stack + decomposition engine', () => {
  it('decomposes plan into parent/child goals and resumes incomplete branches across calls', () => {
    const executive = new ExecutiveLoop();
    const sessionKey = 'pr13-session';
    const state = createInitialWorkingState();

    const stepsA: PlanStep[] = [
      { stepId: 's1', intent: 'collect data', actionClass: 'local_only', status: 'planned' },
      { stepId: 's2', intent: 'summarize', actionClass: 'local_only', status: 'planned' },
    ];

    const planSignalA = SignalBus.createSignal('PLAN_CREATED', {
      planId: 'plan-a',
      steps: stepsA,
    }, sessionKey, 'cortex', 'event');

    const first = executive.tick({ signals: [planSignalA], workingState: state, sessionKey });
    const firstGoalSignal = first.signalsOut.find(signal => signal.type === 'MEMORY_WRITE_SUGGESTED');
    expect(firstGoalSignal).toBeTruthy();

    const firstGoal = (firstGoalSignal?.payload as { value: { openGoals: string[]; progress: number } }).value;
    expect(firstGoal.openGoals.length).toBe(2);
    expect(firstGoal.progress).toBe(0);

    const failedStep = SignalBus.createSignal('STEP_FAILED', { stepId: 's1', error: 'network fail' }, sessionKey, 'cortex', 'event');
    const second = executive.tick({ signals: [failedStep], workingState: state, sessionKey });
    const secondGoalSignal = second.signalsOut.find(signal => signal.type === 'MEMORY_WRITE_SUGGESTED');
    const secondGoal = (secondGoalSignal?.payload as { value: { openGoals: string[] } }).value;
    expect(secondGoal.openGoals.length).toBeGreaterThan(0);

    const stepsB: PlanStep[] = [
      { stepId: 's3', intent: 'retry data collection', actionClass: 'local_only', status: 'planned' },
    ];
    const planSignalB = SignalBus.createSignal('PLAN_CREATED', {
      planId: 'plan-b',
      steps: stepsB,
    }, sessionKey, 'cortex', 'event');

    const third = executive.tick({ signals: [planSignalB], workingState: state, sessionKey });
    const thirdGoalSignal = third.signalsOut.find(signal => signal.type === 'MEMORY_WRITE_SUGGESTED');
    const thirdGoal = (thirdGoalSignal?.payload as { value: { openGoals: string[] } }).value;

    // Incomplete branch from plan-a is retained while new plan-b goal is added.
    expect(thirdGoal.openGoals.length).toBeGreaterThan(1);
  });
});
