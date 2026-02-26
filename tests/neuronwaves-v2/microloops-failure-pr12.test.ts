import { describe, it, expect } from 'vitest';

import { CriticLoop } from '../../src/neuronwaves-v2/loops/critic-loop';
import { ExecutiveLoop } from '../../src/neuronwaves-v2/loops/executive-loop';
import { MonitorLoop } from '../../src/neuronwaves-v2/loops/monitor-loop';
import { createInitialWorkingState } from '../../src/neuronwaves-v2/runtime/working-state';
import { SignalBus } from '../../src/neuronwaves-v2/runtime/signal-bus';

describe('PR12 neuronwaves micro-loop failure paths', () => {
  it('monitor emits confidence/model-error signals from failed execution', () => {
    const monitor = new MonitorLoop();
    const sessionKey = 'pr12-monitor';
    const failedSignal = SignalBus.createSignal(
      'STEP_FAILED',
      {
        stepId: 'step-1',
        chainId: 'chain-1',
        error: 'prediction mismatch while evaluating model output',
        errorType: 'unknown',
        recoverable: true,
      },
      sessionKey,
      'test',
      'event'
    );

    const result = monitor.tick({
      signals: [failedSignal],
      workingState: createInitialWorkingState(sessionKey),
      sessionKey,
    });

    const emittedTypes = result.signalsOut.map(signal => signal.type);
    expect(emittedTypes).toContain('CONFIDENCE_DROP');
    expect(emittedTypes).toContain('MODEL_ERROR_DETECTED');
  });

  it('executive requests replan when model error signal is observed', () => {
    const executive = new ExecutiveLoop();
    const sessionKey = 'pr12-exec';

    const modelError = SignalBus.createSignal(
      'MODEL_ERROR_DETECTED',
      {
        errorType: 'prediction_mismatch',
        description: 'prediction mismatch while evaluating model output',
        affectedChains: ['chain-1'],
      },
      sessionKey,
      'monitor',
      'event'
    );

    const state = createInitialWorkingState(sessionKey);
    state.focus.activeChainId = 'chain-1';

    const result = executive.tick({
      signals: [modelError],
      workingState: state,
      sessionKey,
    });

    const emittedTypes = result.signalsOut.map(signal => signal.type);
    expect(emittedTypes).toContain('EXEC_REQUEST_REPLAN');
  });

  it('critic emits uncertainty and alternative-plan signal for shallow plans', () => {
    const critic = new CriticLoop({ minPlanDepth: 3 });
    const sessionKey = 'pr12-critic';

    const planCreated = SignalBus.createSignal(
      'PLAN_CREATED',
      {
        planId: 'plan-1',
        steps: [
          {
            stepId: 'step-1',
            intent: 'single step',
            actionClass: 'local_only',
            status: 'planned',
          },
        ],
      },
      sessionKey,
      'planner',
      'heartbeat'
    );

    const state = createInitialWorkingState(sessionKey);
    state.chains.primary = {
      chainId: 'chain-critic',
      objective: 'validate shallow plan handling',
      priority: 1,
      status: 'active',
      createdAtMs: Date.now(),
    };

    const result = critic.tick({
      signals: [planCreated],
      workingState: state,
      sessionKey,
    });

    const emittedTypes = result.signalsOut.map(signal => signal.type);
    expect(emittedTypes).toContain('PLAN_TOO_SHALLOW');
    expect(emittedTypes.length).toBeGreaterThanOrEqual(1);
  });
});
