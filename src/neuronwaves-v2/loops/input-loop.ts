/**
 * InputLoop - Normalize inbound events into deterministic signals
 * Section 4.1: Input normalization
 */

import type {
  MicroLoop,
  TickResult,
  Signal,
  SignalType,
  WorkingState,
  SessionKey,
  TimestampMs,
  StateDelta
} from '../types.js';
import { SignalBus } from '../runtime/signal-bus.js';

/** External input types */
export type ExternalInputType = 'user_message' | 'system_event' | 'webhook' | 'stream_chunk';

/** External input event */
export interface ExternalInput {
  readonly type: ExternalInputType;
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestampMs?: TimestampMs;
}

/** InputLoop configuration */
export interface InputLoopConfig {
  /** Custom normalizers for specific input types */
  readonly normalizers?: Map<ExternalInputType, (input: ExternalInput) => Signal>;
}

/**
 * InputLoop - Palpitation loop for input normalization
 * 
 * Responsibility: Normalize inbound events into deterministic signals.
 * 
 * Consumes: External input (user message, stream chunk, system event, webhook)
 * Emits: INPUT_RECEIVED (normalized), STREAM_CHUNK_RECEIVED (optional)
 * 
 * WorkingState updates: executionLedger (record arrival), focus activation if session idle
 */
export class InputLoop implements MicroLoop {
  readonly name = 'InputLoop';
  // heartbeat so the scheduler always runs it — necessary because InputLoop
  // is the *source* of INPUT_RECEIVED and cannot be triggered by its own output.
  readonly rhythm = 'heartbeat' as const;
  readonly tickBudgetMs = 50;
  readonly maxSignalsOut = 5;
  readonly reads = ['focus'] as const;
  readonly writes = ['executionLedger', 'focus'] as const;
  readonly subscriptions: SignalType[] = ['INPUT_RECEIVED'];

  private readonly config: InputLoopConfig;
  private externalInputQueue: Map<SessionKey, ExternalInput[]> = new Map();

  constructor(config: InputLoopConfig = {}) {
    this.config = config;
  }

  /**
   * Queue an external input for processing
   */
  queueInput(sessionKey: SessionKey, input: ExternalInput): void {
    let queue = this.externalInputQueue.get(sessionKey);
    if (!queue) {
      queue = [];
      this.externalInputQueue.set(sessionKey, queue);
    }
    queue.push(input);
  }

  tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): TickResult {
    const { workingState, sessionKey } = input;
    const signalsOut: any[] = [];
    const stateDeltas: StateDelta[] = [];

    // Process external inputs from queue
    const externalInputs = this.externalInputQueue.get(sessionKey) ?? [];
    this.externalInputQueue.set(sessionKey, []);

    for (const externalInput of externalInputs) {
      const normalized = this.normalizeInput(externalInput, sessionKey);
      signalsOut.push(...normalized);

      // Add execution ledger entry for input arrival
      stateDeltas.push({
        section: 'executionLedger',
        path: '',
        value: {
          entryId: `input-${Date.now()}`,
          timestampMs: Date.now(),
          type: 'tool_call',
          description: `Input received: ${externalInput.type}`,
          chainId: workingState.focus.activeChainId ?? undefined,
        },
        operation: 'push',
      });

      // Activate focus if session was idle
      if (!workingState.focus.activeChainId) {
        stateDeltas.push({
          section: 'focus',
          path: 'activeChainId',
          value: `chain-${Date.now()}`,
          operation: 'set',
        });
        stateDeltas.push({
          section: 'focus',
          path: 'currentObjective',
          value: externalInput.content.slice(0, 100),
          operation: 'set',
        });
      }
    }

    // Also process any INPUT_RECEIVED signals (for chaining)
    for (const signal of input.signals) {
      if (signal.type === 'INPUT_RECEIVED') {
        // Already normalized, just pass through
        signalsOut.push(signal);
      }
    }

    return {
      signalsOut,
      stateDelta: stateDeltas,
      metrics: {
        durationMs: 0,
        signalsProcessed: externalInputs.length + input.signals.length,
        signalsEmitted: signalsOut.length,
      },
    };
  }

  /**
   * Normalize external input into signals
   */
  private normalizeInput(input: ExternalInput, sessionKey: SessionKey): any[] {
    const signals: any[] = [];
    const timestampMs = input.timestampMs ?? Date.now();

    // Check for custom normalizer
    const customNormalizer = this.config.normalizers?.get(input.type);
    if (customNormalizer) {
      signals.push(customNormalizer(input));
      return signals;
    }

    // Default normalization
    switch (input.type) {
      case 'user_message':
        signals.push(SignalBus.createSignal(
          'INPUT_RECEIVED',
          {
            content: input.content,
            metadata: input.metadata,
            source: 'user',
          },
          sessionKey,
          this.name,
          'palpitation',
          { emittedAtMs: timestampMs }
        ));
        break;

      case 'stream_chunk':
        signals.push(SignalBus.createSignal(
          'STREAM_CHUNK_RECEIVED',
          {
            chunk: input.content,
            metadata: input.metadata,
          },
          sessionKey,
          this.name,
          'palpitation',
          { emittedAtMs: timestampMs }
        ));
        break;

      case 'system_event':
        signals.push(SignalBus.createSignal(
          'INPUT_RECEIVED',
          {
            content: input.content,
            metadata: input.metadata,
            source: 'system',
          },
          sessionKey,
          this.name,
          'event',
          { emittedAtMs: timestampMs }
        ));
        break;

      case 'webhook':
        signals.push(SignalBus.createSignal(
          'INPUT_RECEIVED',
          {
            content: input.content,
            metadata: input.metadata,
            source: 'external',
          },
          sessionKey,
          this.name,
          'event',
          { emittedAtMs: timestampMs }
        ));
        break;

      default:
        // Unknown type - still create INPUT_RECEIVED
        signals.push(SignalBus.createSignal(
          'INPUT_RECEIVED',
          {
            content: input.content,
            metadata: input.metadata,
            source: 'external',
            type: input.type,
          },
          sessionKey,
          this.name,
          'event',
          { emittedAtMs: timestampMs }
        ));
    }

    return signals;
  }

  /**
   * Get pending input count for a session
   */
  getPendingInputCount(sessionKey: SessionKey): number {
    return this.externalInputQueue.get(sessionKey)?.length ?? 0;
  }

  /**
   * Clear pending inputs for a session
   */
  clearPendingInputs(sessionKey: SessionKey): void {
    this.externalInputQueue.delete(sessionKey);
  }
}
