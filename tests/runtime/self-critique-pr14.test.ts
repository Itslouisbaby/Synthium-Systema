import { describe, expect, it } from 'vitest';

import { CriticLoop } from '../../src/loops/critic-loop';
import { ExecutiveLoop } from '../../src/loops/executive-loop';
import { createInitialWorkingState } from '../../src/runtime/working-state';
import { SignalBus } from '../../src/runtime/signal-bus';

describe('PR14 self-critique with bounded auto revise', () => {
  it('emits structured patch proposals and runs one bounded revise cycle', () => {
    const critic = new CriticLoop();
    const executive = new ExecutiveLoop({ maxAutoReviseCycles: 1 });
    const sessionKey = 'pr14-session';
    const state = createInitialWorkingState();
    (state.focus as any).activeChainId = 'chain-pr14';

    const evalSignal = SignalBus.createSignal('EVALUATION_COMPLETE', {
      evaluationId: 'eval-pr14',
      result: 'failure',
      summary: 'Execution failed: tool timeout',
    }, sessionKey, 'cortex', 'event');

    const criticTick = critic.tick({ signals: [evalSignal], workingState: state, sessionKey });
    const patchSignal = criticTick.signalsOut.find(signal => signal.type === 'SUGGEST_ALTERNATIVE_PLAN');
    expect(patchSignal).toBeTruthy();

    const patchPayload = patchSignal?.payload as { issue?: string; proposedFix?: string; confidence?: number };
    expect(typeof patchPayload.issue).toBe('string');
    expect(typeof patchPayload.proposedFix).toBe('string');
    expect((patchPayload.confidence ?? 0)).toBeGreaterThanOrEqual(0.6);

    const firstExec = executive.tick({ signals: [patchSignal!], workingState: state, sessionKey });
    const firstReplan = firstExec.signalsOut.find(signal => signal.type === 'EXEC_REQUEST_REPLAN');
    expect(firstReplan).toBeTruthy();
    expect((firstReplan?.payload as { reviseCycle?: boolean }).reviseCycle).toBe(true);

    const secondExec = executive.tick({ signals: [patchSignal!], workingState: state, sessionKey });
    const secondReplan = secondExec.signalsOut.find(signal => signal.type === 'EXEC_REQUEST_REPLAN');
    expect(secondReplan).toBeTruthy();
    expect((secondReplan?.payload as { reviseCycle?: boolean }).reviseCycle).not.toBe(true);
  });
});
