import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NeuronWavesRuntime } from '../../src/neuronwaves-v2/neuronwaves-runtime';
import { BufferedPublisher } from '../../src/neuronwaves-v2/loops/output-loop';

describe('PR16 NeuronWaves v2 runtime E2E (real loop path)', () => {
  it('publishes OUTPUT_SENT via output loop and emits executive replan on model error', async () => {
    const artifactBaseDir = await mkdtemp(join(tmpdir(), 'synth-pr16-v2-'));
    const publisher = new BufferedPublisher();

    const runtime = new NeuronWavesRuntime({
      artifactBaseDir,
      outputPublisher: publisher.getPublisher(),
      enabledLoops: { input: true, output: true, executive: true, critic: true, monitor: true },
    });

    runtime.start();

    const sessionKey = `pr16-${Date.now()}`;

    await runtime.submitInput(sessionKey, 'trigger v2 e2e flow');
    await runtime.submitSignal(
      sessionKey,
      'MODEL_ERROR_DETECTED',
      {
        errorType: 'prediction_mismatch',
        description: 'synthetic model mismatch',
        affectedChains: ['chain-1'],
      },
      'integration-test',
      'event'
    );

    await runtime.submitSignal(
      sessionKey,
      'OUTPUT_READY',
      {
        chainId: 'chain-1',
        content: 'real-v2-output',
        contentType: 'text',
      },
      'integration-test',
      'event'
    );

    const ok = await runtime.waitFor(
      sessionKey,
      state => state.executionLedger.length > 0,
      5000
    );

    const signals = await runtime.getSignals(sessionKey);
    const signalTypes = signals.map(signal => signal.type);
    const outputs = publisher.getOutputs().filter(output => output.sessionKey === sessionKey);

    runtime.stop();

    expect(ok).toBe(true);
    expect(outputs.some(output => output.content === 'real-v2-output')).toBe(true);

    expect(signalTypes).toContain('OUTPUT_READY');
    expect(signalTypes).toContain('OUTPUT_SENT');
    expect(signalTypes).toContain('MODEL_ERROR_DETECTED');
    expect(signalTypes).toContain('EXEC_REQUEST_REPLAN');
  });
});
