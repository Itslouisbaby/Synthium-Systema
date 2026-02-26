import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SynthRuntime } from '../../synth-runtime.js';
import { NeuronWavesRuntime } from '../neuronwaves-runtime.js';
import { SignalBus } from '../runtime/signal-bus.js';
import type { LLMProvider } from '../../llm/llm-provider.js';
import type { MicroLoop, SessionKey, Signal, SignalType, TickResult, WorkingState } from '../types.js';
import { BufferedPublisher } from '../loops/output-loop.js';

interface ShadowRunnerOptions {
  input: string;
  llm: LLMProvider;
  timeoutMs?: number;
}

export interface ShadowComparisonResult {
  input: string;
  v1Output: string;
  v2Output: string;
  parity: {
    exact: boolean;
    normalized: boolean;
  };
  evidence: {
    v2SignalTypes: string[];
    v2TickCount: number;
  };
  artifacts: {
    v1BaseDir: string;
    v2BaseDir: string;
  };
}

class ShadowBridgeLoop implements MicroLoop {
  readonly name = 'ShadowBridgeLoop';
  readonly rhythm = 'palpitation' as const;
  readonly tickBudgetMs = 20;
  readonly maxSignalsOut = 5;
  readonly reads = ['focus'] as const;
  readonly writes = [] as const;
  readonly subscriptions: SignalType[] = ['INPUT_RECEIVED'];

  tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): TickResult {
    const source = input.signals.find(signal => signal.type === 'INPUT_RECEIVED');
    if (!source) {
      return {
        signalsOut: [],
        stateDelta: [],
        metrics: { durationMs: 0, signalsProcessed: input.signals.length, signalsEmitted: 0 },
      };
    }

    const payload = source.payload as { content?: string };
    const content = typeof payload.content === 'string' ? payload.content : '';

    return {
      signalsOut: [
        SignalBus.createSignal(
          'OUTPUT_READY',
          {
            chainId: `shadow-${Date.now()}`,
            content: `V2:${content}`,
            contentType: 'text',
          },
          input.sessionKey,
          this.name,
          'event',
          { causedBy: [source.signalId] }
        ),
      ],
      stateDelta: [],
      metrics: {
        durationMs: 0,
        signalsProcessed: input.signals.length,
        signalsEmitted: 1,
      },
    };
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function runV1V2ShadowComparison(options: ShadowRunnerOptions): Promise<ShadowComparisonResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const v1BaseDir = await mkdtemp(join(tmpdir(), 'synth-pr11-v1-'));
  const v2BaseDir = await mkdtemp(join(tmpdir(), 'synth-pr11-v2-'));

  const v1Runtime = new SynthRuntime({
    baseDir: v1BaseDir,
    llm: options.llm,
    enableAutonomy: false,
    enableLearning: false,
    enableMemory: true,
  });

  const publisher = new BufferedPublisher();
  const v2Runtime = new NeuronWavesRuntime({
    artifactBaseDir: v2BaseDir,
    enabledLoops: { input: true, output: true, executive: false, critic: false, monitor: false },
    outputPublisher: publisher.getPublisher(),
  });

  await v1Runtime.initialize();
  await v1Runtime.start();
  v2Runtime.registerLoop(new ShadowBridgeLoop(), 1);
  v2Runtime.start();

  try {
    const v1Output = await v1Runtime.processInput(options.input);

    const sessionKey = `shadow-${Date.now()}`;
    await v2Runtime.submitInput(sessionKey, options.input);

    const started = Date.now();
    let v2Output = '';

    while (Date.now() - started < timeoutMs) {
      const output = publisher.getOutputs().find(entry => entry.sessionKey === sessionKey);
      if (output?.content) {
        v2Output = output.content;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    if (!v2Output) {
      throw new Error(`Timed out waiting for v2 output after ${timeoutMs}ms`);
    }

    const v2Signals = await v2Runtime.getSignals(sessionKey);
    const v2SignalTypes = [...new Set(v2Signals.map(signal => signal.type))];
    const v2TickCount = v2Runtime.getStatus().tickCount;

    return {
      input: options.input,
      v1Output,
      v2Output,
      parity: {
        exact: v1Output === v2Output,
        normalized: normalizeText(v1Output) === normalizeText(v2Output),
      },
      evidence: {
        v2SignalTypes,
        v2TickCount,
      },
      artifacts: {
        v1BaseDir,
        v2BaseDir,
      },
    };
  } finally {
    v1Runtime.stop();
    v2Runtime.stop();
  }
}
