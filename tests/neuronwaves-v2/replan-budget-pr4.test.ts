import { describe, expect, it } from 'vitest';

import { ExecutiveLoop } from '../../src/neuronwaves-v2/loops/executive-loop';
import { createInitialWorkingState } from '../../src/neuronwaves-v2/runtime/working-state';
import { SignalBus } from '../../src/neuronwaves-v2/runtime/signal-bus';

describe('PR4 replan budget and escalation', () => {
  it('requests bounded replans then escalates when budget is exhausted', () => {
    const executive = new ExecutiveLoop({ maxReplanAttempts: 2 });
    const sessionKey = 'pr4-replan-budget';
    const state = createInitialWorkingState(sessionKey);
    state.focus.activeChainId = 'chain-pr4';

    const modelError = () => SignalBus.createSignal(
      'MODEL_ERROR_DETECTED',
      {
        errorType: 'prediction_mismatch',
        description: 'model mismatch during evaluation',
        affectedChains: ['chain-pr4'],
      },
      sessionKey,
      'monitor',
      'event'
    );

    const first = executive.tick({ signals: [modelError()], workingState: state, sessionKey });
    const second = executive.tick({ signals: [modelError()], workingState: state, sessionKey });
    const third = executive.tick({ signals: [modelError()], workingState: state, sessionKey });

    expect(first.signalsOut.map(signal => signal.type)).toContain('EXEC_REQUEST_REPLAN');
    expect(second.signalsOut.map(signal => signal.type)).toContain('EXEC_REQUEST_REPLAN');

    const thirdTypes = third.signalsOut.map(signal => signal.type);
    expect(thirdTypes).toContain('ESCALATE_APPROVAL_SUGGESTED');
    expect(thirdTypes).toContain('CHAIN_PAUSE');
    expect(thirdTypes).not.toContain('EXEC_REQUEST_REPLAN');
  });
});
