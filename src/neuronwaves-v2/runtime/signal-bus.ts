/**
 * SignalBus - Append-only deterministic event stream
 * Section 1.1: Neural impulse pathway between loops
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Signal, SignalId, SignalType, SignalPriority, SessionKey, SequencedSignal, TimestampMs } from '../types.js';
import { deterministicId } from './deterministic-id.js';

/** SignalBus configuration */
export interface SignalBusConfig {
  /** Base directory for signal persistence */
  readonly baseDir: string;
  /** Maximum signals per session before rotation */
  readonly maxSignalsPerSession?: number;
}

/** SignalBus persistence record */
interface SignalRecord extends SequencedSignal {
  /** Hash for integrity verification */
  readonly integrityHash: string;
}

/** In-memory signal queue for a session */
interface SessionQueue {
  signals: SequencedSignal[];
  nextSequence: number;
  tailOffset: number;
}

/**
 * SignalBus - Append-only deterministic event stream
 * 
 * Design principles:
 * - Append-only: Signals are never modified or deleted
 * - Deterministically ordered: By (emittedAtMs, sequence)
 * - Auditable: Every signal is persisted with integrity hash
 * - Per-session: Each session has its own signal stream
 */
export class SignalBus {
  private readonly config: SignalBusConfig;
  private readonly sessionQueues: Map<SessionKey, SessionQueue> = new Map();
  private readonly dedupeWindow: Map<SessionKey, Set<string>> = new Map();
  private readonly maxSignals: number;

  constructor(config: SignalBusConfig) {
    this.config = config;
    this.maxSignals = config.maxSignalsPerSession ?? 10000;
  }

  /**
   * Get the signal file path for a session
   */
  private getSignalFilePath(sessionKey: SessionKey): string {
    return join(this.config.baseDir, sessionKey, 'signals.jsonl');
  }

  /**
   * Compute integrity hash for a signal
   */
  private computeIntegrityHash(signal: SequencedSignal): string {
    const data = JSON.stringify({
      signalId: signal.signalId,
      sessionKey: signal.sessionKey,
      type: signal.type,
      payload: signal.payload,
      emittedAtMs: signal.emittedAtMs,
      sequence: signal.sequence,
      causedBy: signal.causedBy,
      sourceLoop: signal.sourceLoop,
      priority: signal.priority,
      dedupeKey: signal.dedupeKey,
    });
    return createHash('sha256').update(data).digest('hex').slice(0, 16);
  }

  /**
   * Ensure session directory exists
   */
  private async ensureSessionDir(sessionKey: SessionKey): Promise<void> {
    const sessionDir = join(this.config.baseDir, sessionKey);
    await mkdir(sessionDir, { recursive: true });
  }

  /**
   * Initialize or get session queue
   */
  private getSessionQueue(sessionKey: SessionKey): SessionQueue {
    let queue = this.sessionQueues.get(sessionKey);
    if (!queue) {
      queue = {
        signals: [],
        nextSequence: 0,
        tailOffset: 0,
      };
      this.sessionQueues.set(sessionKey, queue);
      this.dedupeWindow.set(sessionKey, new Set());
    }
    return queue;
  }

  /**
   * Append a signal to the bus
   * 
   * @param signal - Signal to append (without sequence)
   * @returns The sequenced signal
   */
  async append(signal: Omit<Signal, 'signalId'> & { signalId?: string }): Promise<SequencedSignal> {
    const sessionKey = signal.sessionKey;
    const queue = this.getSessionQueue(sessionKey);

    // Check deduplication if dedupeKey is provided
    if (signal.dedupeKey) {
      const dedupeSet = this.dedupeWindow.get(sessionKey)!;
      if (dedupeSet.has(signal.dedupeKey)) {
        // Find and return existing signal with same dedupeKey
        const existing = queue.signals.find(s => s.dedupeKey === signal.dedupeKey);
        if (existing) {
          return existing;
        }
      }
      dedupeSet.add(signal.dedupeKey);
      
      // Trim dedupe window if too large
      if (dedupeSet.size > 1000) {
        const entries = Array.from(dedupeSet).slice(-500);
        this.dedupeWindow.set(sessionKey, new Set(entries));
      }
    }

    // Create sequenced signal with deterministic ID
    const sequence = queue.nextSequence++;
    const timestamp = signal.emittedAtMs;
    const signalId = signal.signalId ?? deterministicId.generateSignalId(sessionKey, sequence, timestamp);
    
    const sequencedSignal: SequencedSignal = {
      ...signal,
      signalId,
      sequence,
    };

    // Add to in-memory queue
    queue.signals.push(sequencedSignal);

    // Trim queue if exceeds max
    if (queue.signals.length > this.maxSignals) {
      queue.signals = queue.signals.slice(-this.maxSignals);
      queue.tailOffset = queue.signals[0]?.sequence ?? 0;
    }

    // Persist to disk
    await this.persistSignal(sequencedSignal);

    return sequencedSignal;
  }

  /**
   * Persist a signal to disk
   */
  private async persistSignal(signal: SequencedSignal): Promise<void> {
    await this.ensureSessionDir(signal.sessionKey);

    const record: SignalRecord = {
      ...signal,
      integrityHash: this.computeIntegrityHash(signal),
    };

    const filePath = this.getSignalFilePath(signal.sessionKey);
    const line = JSON.stringify(record) + '\n';
    await appendFile(filePath, line);
  }

  /**
   * Read signals from tail with offset
   * 
   * @param sessionKey - Session to read from
   * @param fromOffset - Starting offset (sequence number)
   * @param limit - Maximum signals to read
   * @returns Array of sequenced signals
   */
  async readTail(
    sessionKey: SessionKey,
    fromOffset: number = 0,
    limit: number = 100
  ): Promise<SequencedSignal[]> {
    const queue = this.getSessionQueue(sessionKey);

    // Filter signals from offset
    const signals = queue.signals.filter(s => s.sequence >= fromOffset);
    
    // Return limited set
    return signals.slice(0, limit);
  }

  /**
   * Read all signals for a session from disk
   * 
   * @param sessionKey - Session to read from
   * @returns Array of all signals
   */
  async readAllFromDisk(sessionKey: SessionKey): Promise<SequencedSignal[]> {
    const filePath = this.getSignalFilePath(sessionKey);

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      const records: SignalRecord[] = lines.map(line => JSON.parse(line));
      
      // Verify integrity and convert to sequenced signals
      return records.map(record => {
        const { integrityHash, ...signal } = record;
        // Note: In production, we'd verify the hash here
        return signal;
      });
    } catch (error) {
      // File doesn't exist or is malformed
      return [];
    }
  }

  /**
   * Get current tail offset for a session
   */
  getTailOffset(sessionKey: SessionKey): number {
    const queue = this.getSessionQueue(sessionKey);
    return queue.nextSequence;
  }

  /**
   * Get signals by type
   */
  getSignalsByType(sessionKey: SessionKey, type: SignalType): SequencedSignal[] {
    const queue = this.getSessionQueue(sessionKey);
    return queue.signals.filter(s => s.type === type);
  }

  /**
   * Get signals by source loop
   */
  getSignalsBySource(sessionKey: SessionKey, sourceLoop: string): SequencedSignal[] {
    const queue = this.getSessionQueue(sessionKey);
    return queue.signals.filter(s => s.sourceLoop === sourceLoop);
  }

  /**
   * Get signals in priority order
   */
  getSignalsByPriority(sessionKey: SessionKey, priority: SignalPriority): SequencedSignal[] {
    const queue = this.getSessionQueue(sessionKey);
    return queue.signals.filter(s => s.priority === priority);
  }

  /**
   * Get causal chain for a signal
   */
  getCausalChain(sessionKey: SessionKey, signalId: SignalId): SequencedSignal[] {
    const queue = this.getSessionQueue(sessionKey);
    const signalMap = new Map(queue.signals.map(s => [s.signalId, s]));
    
    const chain: SequencedSignal[] = [];
    const visited = new Set<string>();
    
    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      const signal = signalMap.get(id);
      if (signal) {
        chain.push(signal);
        signal.causedBy?.forEach(traverse);
      }
    };
    
    traverse(signalId);
    return chain.reverse();
  }

  /**
   * Clear session queue (for testing)
   */
  clearSession(sessionKey: SessionKey): void {
    this.sessionQueues.delete(sessionKey);
    this.dedupeWindow.delete(sessionKey);
  }

  /**
   * Get all active session keys
   */
  getActiveSessions(): SessionKey[] {
    return Array.from(this.sessionQueues.keys());
  }

  /**
   * Get signal count for a session
   */
  getSignalCount(sessionKey: SessionKey): number {
    const queue = this.getSessionQueue(sessionKey);
    return queue.signals.length;
  }

  /**
   * Create a signal builder for convenient signal creation
   */
  static createSignal(
    type: SignalType,
    payload: unknown,
    sessionKey: SessionKey,
    sourceLoop: string,
    priority: SignalPriority,
    options?: {
      causedBy?: SignalId[];
      dedupeKey?: string;
      emittedAtMs?: TimestampMs;
    }
  ): Omit<Signal, 'signalId'> & { signalId?: string } {
    const timestamp = options?.emittedAtMs ?? Date.now();
    // Note: sequence is not known at this point, will be assigned by SignalBus.append()
    // Using 0 as placeholder sequence, actual ID generated in append()
    return {
      signalId: '', // Will be set by SignalBus.append()
      sessionKey,
      type,
      payload,
      emittedAtMs: timestamp,
      causedBy: options?.causedBy,
      sourceLoop,
      priority,
      dedupeKey: options?.dedupeKey,
    };
  }
}

/** Signal builder helper */
export class SignalBuilder {
  private sessionKey: SessionKey;
  private sourceLoop: string;

  constructor(sessionKey: SessionKey, sourceLoop: string) {
    this.sessionKey = sessionKey;
    this.sourceLoop = sourceLoop;
  }

  inputReceived(content: string, options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'INPUT_RECEIVED',
      { content },
      this.sessionKey,
      this.sourceLoop,
      'palpitation',
      options
    );
  }

  planCreated(planId: string, steps: unknown[], options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'PLAN_CREATED',
      { planId, steps },
      this.sessionKey,
      this.sourceLoop,
      'event',
      options
    );
  }

  policyDecision(stepId: string, decision: string, reason: string, options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'POLICY_DECISION_EMITTED',
      { stepId, decision, reason },
      this.sessionKey,
      this.sourceLoop,
      'event',
      options
    );
  }

  stepExecuted(stepId: string, result: unknown, options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'STEP_EXECUTED',
      { stepId, result },
      this.sessionKey,
      this.sourceLoop,
      'event',
      options
    );
  }

  stepFailed(stepId: string, error: string, options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'STEP_FAILED',
      { stepId, error },
      this.sessionKey,
      this.sourceLoop,
      'event',
      options
    );
  }

  outputReady(content: string, chainId: string, options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'OUTPUT_READY',
      { content, chainId },
      this.sessionKey,
      this.sourceLoop,
      'palpitation',
      options
    );
  }

  uncertaintyHigh(question: string, severity: 'low' | 'medium' | 'high' | 'critical', options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'UNCERTAINTY_HIGH',
      { question, severity },
      this.sessionKey,
      this.sourceLoop,
      'heartbeat',
      options
    );
  }

  modelErrorDetected(error: string, context: unknown, options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'MODEL_ERROR_DETECTED',
      { error, context },
      this.sessionKey,
      this.sourceLoop,
      'event',
      options
    );
  }

  focusSet(chainId: string, objective: string, options?: { causedBy?: SignalId[] }): Omit<Signal, 'signalId'> {
    return SignalBus.createSignal(
      'FOCUS_SET',
      { chainId, objective },
      this.sessionKey,
      this.sourceLoop,
      'event',
      options
    );
  }
}
