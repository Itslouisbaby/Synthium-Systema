/**
 * OutputLoop - Publish outputs safely and deterministically
 * Section 4.2: Output gating
 */

import type {
  MicroLoop,
  TickResult,
  Signal,
  SignalType,
  WorkingState,
  SessionKey,
  ChainId,
  StateDelta
} from '../types.js';
import { SignalBus } from '../runtime/signal-bus.js';

/** Output publisher function type */
export type OutputPublisher = (output: {
  content: string;
  chainId: ChainId | null;
  sessionKey: SessionKey;
  metadata?: Record<string, unknown>;
}) => Promise<void> | void;

/** OutputLoop configuration */
export interface OutputLoopConfig {
  /** Output publisher function */
  readonly publisher: OutputPublisher;
  /** Whether to enable streaming */
  readonly enableStreaming?: boolean;
  /** Interruption handler */
  readonly onInterrupt?: (chainId: ChainId) => void;
}

/** Pending output */
interface PendingOutput {
  readonly content: string;
  readonly chainId: ChainId | null;
  readonly signalId: string;
  readonly timestampMs: number;
}

/**
 * OutputLoop - Palpitation loop for output publishing
 * 
 * Responsibility: Publish outputs safely and deterministically (streaming, interruptions).
 * 
 * Consumes: OUTPUT_READY
 * Emits: OUTPUT_SENT, OUTPUT_INTERRUPTED
 * 
 * WorkingState updates: executionLedger (output status), chain attribution
 */
export class OutputLoop implements MicroLoop {
  readonly name = 'OutputLoop';
  readonly rhythm = 'palpitation' as const;
  readonly tickBudgetMs = 100;
  readonly maxSignalsOut = 10;
  readonly reads = ['focus', 'chains'] as const;
  readonly writes = ['executionLedger'] as const;
  readonly subscriptions: SignalType[] = ['OUTPUT_READY', 'CHAIN_PAUSE'];

  private readonly config: OutputLoopConfig;
  private pendingOutputs: Map<SessionKey, PendingOutput[]> = new Map();
  private interruptedChains: Set<ChainId> = new Set();
  private publishedOutputs: Map<SessionKey, Set<string>> = new Map(); // For deduplication

  constructor(config: OutputLoopConfig) {
    this.config = config;
  }

  async tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): Promise<TickResult> {
    const { signals, workingState, sessionKey } = input;
    const signalsOut: Array<Omit<Signal, 'signalId'> & { signalId?: string }> = [];
    const stateDeltas: StateDelta[] = [];

    // Process OUTPUT_READY signals
    for (const signal of signals) {
      if (signal.type === 'OUTPUT_READY') {
        const payload = signal.payload as {
          content: string;
          chainId: ChainId | null;
          metadata?: Record<string, unknown>;
        };

        // Check if chain was interrupted
        if (payload.chainId && this.interruptedChains.has(payload.chainId)) {
          signalsOut.push(SignalBus.createSignal(
            'OUTPUT_INTERRUPTED',
            {
              chainId: payload.chainId,
              reason: 'Chain was interrupted before output',
              originalContent: payload.content,
            },
            sessionKey,
            this.name,
            'palpitation',
            { causedBy: [signal.signalId] }
          ));
          continue;
        }

        // Deduplication check
        const publishedSet = this.publishedOutputs.get(sessionKey) ?? new Set();
        const outputKey = `${payload.chainId}-${payload.content}`;
        if (publishedSet.has(outputKey)) {
          continue; // Skip duplicate
        }
        publishedSet.add(outputKey);
        this.publishedOutputs.set(sessionKey, publishedSet);

        // Queue output for publishing
        let queue = this.pendingOutputs.get(sessionKey);
        if (!queue) {
          queue = [];
          this.pendingOutputs.set(sessionKey, queue);
        }
        queue.push({
          content: payload.content,
          chainId: payload.chainId,
          signalId: signal.signalId,
          timestampMs: Date.now(),
        });

        try {
          // Publish the output
          await this.publishOutput(payload.content, payload.chainId, sessionKey, payload.metadata);

          // Emit OUTPUT_SENT
          signalsOut.push(SignalBus.createSignal(
            'OUTPUT_SENT',
            {
              chainId: payload.chainId,
              contentLength: payload.content.length,
              publishedAtMs: Date.now(),
            },
            sessionKey,
            this.name,
            'palpitation',
            { causedBy: [signal.signalId] }
          ));

          // Add execution ledger entry
          stateDeltas.push({
            section: 'executionLedger',
            path: '',
            value: {
              entryId: `output-${Date.now()}`,
              timestampMs: Date.now(),
              type: 'output',
              description: `Output published: ${payload.content.slice(0, 50)}...`,
              chainId: payload.chainId ?? undefined,
            },
            operation: 'push',
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          signalsOut.push(SignalBus.createSignal(
            'OUTPUT_INTERRUPTED',
            {
              chainId: payload.chainId,
              reason: `Publish failed: ${errorMessage}`,
              originalContent: payload.content,
            },
            sessionKey,
            this.name,
            'palpitation',
            { causedBy: [signal.signalId] }
          ));
        }
      }

      // Handle CHAIN_PAUSE for interruption
      if (signal.type === 'CHAIN_PAUSE') {
        const payload = signal.payload as { chainId: ChainId; reason?: string };
        this.interruptedChains.add(payload.chainId);

        signalsOut.push(SignalBus.createSignal(
          'OUTPUT_INTERRUPTED',
          {
            chainId: payload.chainId,
            reason: payload.reason ?? 'Chain paused',
          },
          sessionKey,
          this.name,
          'palpitation',
          { causedBy: [signal.signalId] }
        ));

        // Call interruption handler if configured
        this.config.onInterrupt?.(payload.chainId);
      }
    }

    return {
      signalsOut,
      stateDelta: stateDeltas,
      metrics: {
        durationMs: 0,
        signalsProcessed: signals.length,
        signalsEmitted: signalsOut.length,
      },
    };
  }

  /**
   * Publish an output
   */
  private async publishOutput(
    content: string,
    chainId: ChainId | null,
    sessionKey: SessionKey,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.config.publisher({
      content,
      chainId,
      sessionKey,
      metadata,
    });
  }

  /**
   * Get pending outputs for a session
   */
  getPendingOutputs(sessionKey: SessionKey): PendingOutput[] {
    return [...(this.pendingOutputs.get(sessionKey) ?? [])];
  }

  /**
   * Clear interrupted chain status
   */
  resumeChain(chainId: ChainId): void {
    this.interruptedChains.delete(chainId);
  }

  /**
   * Check if a chain is interrupted
   */
  isChainInterrupted(chainId: ChainId): boolean {
    return this.interruptedChains.has(chainId);
  }

  /**
   * Get all interrupted chains
   */
  getInterruptedChains(): ChainId[] {
    return Array.from(this.interruptedChains);
  }

  /**
   * Clear session state
   */
  clearSession(sessionKey: SessionKey): void {
    this.pendingOutputs.delete(sessionKey);
    this.publishedOutputs.delete(sessionKey);
  }
}

/** Console output publisher for testing */
export const consolePublisher: OutputPublisher = (output) => {
  console.log(`[${output.sessionKey}]${output.chainId ? ` [${output.chainId}]` : ''} ${output.content}`);
};

/** Buffered output publisher for capturing outputs */
export class BufferedPublisher {
  private outputs: Array<{
    content: string;
    chainId: string | null;
    sessionKey: string;
    timestampMs: number;
  }> = [];

  publish: OutputPublisher = (output) => {
    this.outputs.push({
      content: output.content,
      chainId: output.chainId,
      sessionKey: output.sessionKey,
      timestampMs: Date.now(),
    });
  };

  getOutputs(): Array<{
    content: string;
    chainId: string | null;
    sessionKey: string;
    timestampMs: number;
  }> {
    return [...this.outputs];
  }

  clear(): void {
    this.outputs = [];
  }

  getPublisher(): OutputPublisher {
    return this.publish.bind(this);
  }
}
