/**
 * Deterministic ID Generation
 * 
 * Replaces randomUUID() with deterministic, replay-safe IDs.
 * IDs are based on: sessionKey + sequence + timestamp + counter
 */

import { createHash } from 'node:crypto';

/** ID generation context */
interface IDContext {
  sessionKey: string;
  sequence: number;
  timestamp: number;
  counter: number;
}

/** Deterministic ID generator */
export class DeterministicID {
  private sessionCounters: Map<string, number> = new Map();

  /**
   * Generate a deterministic signal ID
   * Format: sig-{sessionKey}-{sequence}-{timestamp}-{hash}
   */
  generateSignalId(sessionKey: string, sequence: number, timestamp: number): string {
    const counter = this.getCounter(sessionKey);
    const context: IDContext = { sessionKey, sequence, timestamp, counter };
    const hash = this.hashContext(context);
    return `sig-${this.sanitize(sessionKey)}-${sequence}-${timestamp}-${hash}`;
  }

  /**
   * Generate a deterministic tick ID
   * Format: tick-{sessionKey}-{tickIndex}-{timestamp}-{hash}
   */
  generateTickId(sessionKey: string, tickIndex: number, timestamp: number): string {
    const counter = this.getCounter(sessionKey);
    const context = { sessionKey, sequence: tickIndex, timestamp, counter };
    const hash = this.hashContext(context);
    return `tick-${this.sanitize(sessionKey)}-${tickIndex}-${timestamp}-${hash}`;
  }

  /**
   * Generate a deterministic trace ID
   * Format: trace-{sessionKey}-{timestamp}-{hash}
   */
  generateTraceId(sessionKey: string, timestamp: number): string {
    const counter = this.getCounter(sessionKey);
    const context = { sessionKey, sequence: 0, timestamp, counter };
    const hash = this.hashContext(context);
    return `trace-${this.sanitize(sessionKey)}-${timestamp}-${hash}`;
  }

  /**
   * Generate a deterministic chain ID
   * Format: chain-{sessionKey}-{index}-{timestamp}-{hash}
   */
  generateChainId(sessionKey: string, index: number, timestamp: number): string {
    const counter = this.getCounter(sessionKey);
    const context = { sessionKey, sequence: index, timestamp, counter };
    const hash = this.hashContext(context);
    return `chain-${this.sanitize(sessionKey)}-${index}-${timestamp}-${hash}`;
  }

  /**
   * Generate a deterministic step ID
   * Format: step-{chainId}-{index}-{hash}
   */
  generateStepId(chainId: string, index: number): string {
    const hash = createHash('sha256')
      .update(`${chainId}-${index}`)
      .digest('hex')
      .slice(0, 8);
    return `step-${this.sanitize(chainId)}-${index}-${hash}`;
  }

  /**
   * Generate a deterministic experience ID
   * Format: exp-{sessionKey}-{timestamp}-{hash}
   */
  generateExperienceId(sessionKey: string, timestamp: number): string {
    const counter = this.getCounter(sessionKey);
    const hash = createHash('sha256')
      .update(`${sessionKey}-${timestamp}-${counter}`)
      .digest('hex')
      .slice(0, 8);
    return `exp-${this.sanitize(sessionKey)}-${timestamp}-${hash}`;
  }

  /**
   * Generate a deterministic concept ID
   * Format: concept-{timestamp}-{hash}
   */
  generateConceptId(timestamp: number, seed: string): string {
    const hash = createHash('sha256')
      .update(`${timestamp}-${seed}`)
      .digest('hex')
      .slice(0, 8);
    return `concept-${timestamp}-${hash}`;
  }

  /**
   * Generate a deterministic memory ID
   * Format: mem-{type}-{timestamp}-{hash}
   */
  generateMemoryId(type: string, timestamp: number, seed: string): string {
    const hash = createHash('sha256')
      .update(`${type}-${timestamp}-${seed}`)
      .digest('hex')
      .slice(0, 8);
    return `mem-${type}-${timestamp}-${hash}`;
  }

  /**
   * Reset counter for a session (used in replay)
   */
  resetSession(sessionKey: string): void {
    this.sessionCounters.set(sessionKey, 0);
  }

  /**
   * Reset all counters
   */
  resetAll(): void {
    this.sessionCounters.clear();
  }

  private getCounter(sessionKey: string): number {
    const current = this.sessionCounters.get(sessionKey) || 0;
    this.sessionCounters.set(sessionKey, current + 1);
    return current;
  }

  private hashContext(context: IDContext): string {
    const data = `${context.sessionKey}-${context.sequence}-${context.timestamp}-${context.counter}`;
    return createHash('sha256').update(data).digest('hex').slice(0, 8);
  }

  private sanitize(str: string): string {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}

/** Singleton instance */
export const deterministicId = new DeterministicID();
