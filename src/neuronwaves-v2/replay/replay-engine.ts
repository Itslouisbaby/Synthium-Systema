/**
 * Replay Engine - Deterministic replay and debug
 * Section 12: End-to-end deterministic replay
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { 
  TickRecord, 
  Signal, 
  SessionKey,
  WorkingState,
  Hash
} from '../types.js';

/** Replay engine configuration */
export interface ReplayEngineConfig {
  /** Base directory for tick records */
  readonly baseDir: string;
  /** Whether to verify hashes during replay */
  readonly verifyHashes?: boolean;
  /** Stop on divergence */
  readonly stopOnDivergence?: boolean;
}

/** Replay result */
export interface ReplayResult {
  readonly success: boolean;
  readonly ticksReplayed: number;
  readonly divergences: Array<{
    readonly tickIndex: number;
    readonly expectedHash: Hash;
    readonly actualHash: Hash;
    readonly reason: string;
  }>;
  readonly finalState?: WorkingState;
  readonly durationMs: number;
}

/** Replay session data */
interface ReplaySession {
  readonly sessionKey: SessionKey;
  readonly tickRecords: TickRecord[];
  readonly signals: Map<string, Signal>;
  readonly initialState: WorkingState;
}

/**
 * ReplayEngine - Enables deterministic replay for debugging
 * 
 * Design principles:
 * - Load snapshot and replay signals in recorded order
 * - Run loops in recorded order
 * - Verify resulting hashes match stored records
 * - Detect and report any divergence
 */
export class ReplayEngine {
  private readonly config: Required<ReplayEngineConfig>;

  constructor(config: ReplayEngineConfig) {
    this.config = {
      baseDir: config.baseDir,
      verifyHashes: config.verifyHashes ?? true,
      stopOnDivergence: config.stopOnDivergence ?? true,
    };
  }

  /**
   * Get session directory
   */
  private getSessionDir(sessionKey: SessionKey): string {
    return join(this.config.baseDir, 'ticks', sessionKey);
  }

  /**
   * Load replay session data
   */
  async loadSession(sessionKey: SessionKey): Promise<ReplaySession | null> {
    try {
      const sessionDir = this.getSessionDir(sessionKey);
      
      // Load tick records
      const tickFiles = await readdir(sessionDir);
      const tickRecords: TickRecord[] = [];
      
      for (const file of tickFiles.filter(f => f.startsWith('tick-') && f.endsWith('.json'))) {
        const content = await readFile(join(sessionDir, file), 'utf-8');
        tickRecords.push(JSON.parse(content));
      }

      tickRecords.sort((a, b) => a.tickIndex - b.tickIndex);

      // Load signals
      const signals = new Map<string, Signal>();
      const signalsDir = join(this.config.baseDir, 'signals', sessionKey);
      
      try {
        const signalFiles = await readdir(signalsDir);
        for (const file of signalFiles.filter(f => f.endsWith('.jsonl'))) {
          const content = await readFile(join(signalsDir, file), 'utf-8');
          const lines = content.trim().split('\n');
          
          for (const line of lines) {
            if (line) {
              const signal: Signal = JSON.parse(line);
              signals.set(signal.signalId, signal);
            }
          }
        }
      } catch {
        // Signals may not be stored separately
      }

      // Create initial state (empty)
      const initialState: WorkingState = {
        focus: {
          activeChainId: null,
          currentObjective: null,
          salienceStack: [],
        },
        chains: {
          primary: null,
          secondary: [],
          background: [],
        },
        pendingApprovals: [],
        uncertainties: [],
        selfModel: {
          capabilities: {
            tools: [],
            actionClasses: ['local_only'],
            autonomyLevel: 1,
          },
          reliability: [],
          knownFailureModes: [],
          costModel: [],
          confidenceState: {
            overall: 1.0,
            topUncertaintyDrivers: [],
          },
        },
        beliefGraphRef: null,
        activeConcepts: [],
        activeSchemas: [],
        executionLedger: [],
        budgets: {
          toolCallsRemaining: 100,
          memoryWritesRemaining: 1000,
          reflectionPassesRemaining: 10,
        },
        coldStart: false,
      };

      return {
        sessionKey,
        tickRecords,
        signals,
        initialState,
      };
    } catch {
      return null;
    }
  }

  /**
   * Replay a session
   */
  async replay(sessionKey: SessionKey): Promise<ReplayResult> {
    const startTime = Date.now();
    
    const session = await this.loadSession(sessionKey);
    if (!session) {
      return {
        success: false,
        ticksReplayed: 0,
        divergences: [{
          tickIndex: 0,
          expectedHash: '',
          actualHash: '',
          reason: 'Failed to load session data',
        }],
        durationMs: Date.now() - startTime,
      };
    }

    const divergences: ReplayResult['divergences'] = [];
    let currentState = session.initialState;
    let ticksReplayed = 0;

    for (const tickRecord of session.tickRecords) {
      // Get signals consumed in this tick
      const consumedSignals = tickRecord.signalsConsumed
        .map(id => session.signals.get(id))
        .filter((s): s is Signal => s !== undefined);

      // Replay the tick
      const replayResult = await this.replayTick(
        tickRecord,
        consumedSignals,
        currentState
      );

      // Verify state hash if enabled
      if (this.config.verifyHashes) {
        const actualAfterHash = replayResult.stateHash;
        
        if (actualAfterHash !== tickRecord.workingStateAfterHash) {
          const divergence = {
            tickIndex: tickRecord.tickIndex,
            expectedHash: tickRecord.workingStateAfterHash,
            actualHash: actualAfterHash,
            reason: `State hash mismatch after tick ${tickRecord.tickIndex}`,
          };
          
          divergences.push(divergence);

          if (this.config.stopOnDivergence) {
            break;
          }
        }
      }

      currentState = replayResult.newState;
      ticksReplayed++;
    }

    return {
      success: divergences.length === 0,
      ticksReplayed,
      divergences,
      finalState: currentState,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Replay a single tick
   */
  private async replayTick(
    tickRecord: TickRecord,
    signals: Signal[],
    stateBefore: WorkingState
  ): Promise<{ newState: WorkingState; stateHash: Hash }> {
    // In a full implementation, this would:
    // 1. Set up the same loop configuration
    // 2. Run the loops in the recorded order
    // 3. Apply the recorded state deltas
    // 4. Return the new state

    // For now, simulate by returning the expected state
    // (In practice, you'd need to actually run the loops)
    
    // Simulate state changes based on the tick record
    const newState = { ...stateBefore };
    
    // Compute hash
    const stateHash = this.computeStateHash(newState);

    return { newState, stateHash };
  }

  /**
   * Compute state hash
   */
  private computeStateHash(state: WorkingState): Hash {
    // Simple hash computation
    const data = JSON.stringify(state, Object.keys(state).sort());
    let hash = 0;
    
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return hash.toString(16);
  }

  /**
   * Verify a specific tick
   */
  async verifyTick(sessionKey: SessionKey, tickIndex: number): Promise<{
    verified: boolean;
    expected: TickRecord | null;
    reason?: string;
  }> {
    const session = await this.loadSession(sessionKey);
    if (!session) {
      return { verified: false, expected: null, reason: 'Session not found' };
    }

    const tickRecord = session.tickRecords.find(t => t.tickIndex === tickIndex);
    if (!tickRecord) {
      return { verified: false, expected: null, reason: 'Tick not found' };
    }

    // Verify hash chain
    const prevTick = session.tickRecords.find(t => t.tickIndex === tickIndex - 1);
    if (prevTick) {
      if (tickRecord.workingStateBeforeHash !== prevTick.workingStateAfterHash) {
        return {
          verified: false,
          expected: tickRecord,
          reason: 'Hash chain broken: beforeHash does not match previous afterHash',
        };
      }
    }

    // Verify signal existence
    for (const signalId of tickRecord.signalsConsumed) {
      if (!session.signals.has(signalId)) {
        return {
          verified: false,
          expected: tickRecord,
          reason: `Missing consumed signal: ${signalId}`,
        };
      }
    }

    return { verified: true, expected: tickRecord };
  }

  /**
   * Get replay statistics
   */
  async getStats(sessionKey: SessionKey): Promise<{
    totalTicks: number;
    totalSignals: number;
    timeSpanMs: number;
    averageTickDurationMs: number;
  } | null> {
    const session = await this.loadSession(sessionKey);
    if (!session || session.tickRecords.length === 0) return null;

    const totalTicks = session.tickRecords.length;
    const totalSignals = session.signals.size;
    
    const firstTick = session.tickRecords[0];
    const lastTick = session.tickRecords[session.tickRecords.length - 1];
    const timeSpanMs = lastTick.timingMetrics.completedAtMs - firstTick.timingMetrics.startedAtMs;
    
    const totalDuration = session.tickRecords.reduce(
      (sum, t) => sum + t.timingMetrics.totalDurationMs, 
      0
    );
    const averageTickDurationMs = totalDuration / totalTicks;

    return {
      totalTicks,
      totalSignals,
      timeSpanMs,
      averageTickDurationMs,
    };
  }

  /**
   * Export replay data for analysis
   */
  async exportReplayData(sessionKey: string, outputPath: string): Promise<void> {
    const session = await this.loadSession(sessionKey);
    if (!session) throw new Error('Session not found');

    const exportData = {
      sessionKey: session.sessionKey,
      tickRecords: session.tickRecords,
      signals: Array.from(session.signals.values()),
      exportedAt: Date.now(),
    };

    await writeFile(outputPath, JSON.stringify(exportData, null, 2));
  }

  /**
   * Compare two sessions for divergence analysis
   */
  async compareSessions(
    sessionKey1: SessionKey,
    sessionKey2: SessionKey
  ): Promise<{
    identical: boolean;
    differences: Array<{
      tickIndex: number;
      field: string;
      value1: unknown;
      value2: unknown;
    }>;
  }> {
    const session1 = await this.loadSession(sessionKey1);
    const session2 = await this.loadSession(sessionKey2);

    if (!session1 || !session2) {
      return { identical: false, differences: [] };
    }

    const differences: Array<{
      tickIndex: number;
      field: string;
      value1: unknown;
      value2: unknown;
    }> = [];

    const maxTicks = Math.max(session1.tickRecords.length, session2.tickRecords.length);

    for (let i = 0; i < maxTicks; i++) {
      const tick1 = session1.tickRecords[i];
      const tick2 = session2.tickRecords[i];

      if (!tick1 || !tick2) {
        differences.push({
          tickIndex: i,
          field: 'existence',
          value1: tick1 ? 'exists' : 'missing',
          value2: tick2 ? 'exists' : 'missing',
        });
        continue;
      }

      // Compare key fields
      if (tick1.workingStateAfterHash !== tick2.workingStateAfterHash) {
        differences.push({
          tickIndex: i,
          field: 'workingStateAfterHash',
          value1: tick1.workingStateAfterHash,
          value2: tick2.workingStateAfterHash,
        });
      }

      if (tick1.signalsEmitted.length !== tick2.signalsEmitted.length) {
        differences.push({
          tickIndex: i,
          field: 'signalsEmittedCount',
          value1: tick1.signalsEmitted.length,
          value2: tick2.signalsEmitted.length,
        });
      }

      if (tick1.loopsRun.length !== tick2.loopsRun.length) {
        differences.push({
          tickIndex: i,
          field: 'loopsRunCount',
          value1: tick1.loopsRun.length,
          value2: tick2.loopsRun.length,
        });
      }
    }

    return {
      identical: differences.length === 0,
      differences,
    };
  }
}

/**
 * CI Gate - Fails build on replay divergence
 */
export class CIGate {
  private readonly replayEngine: ReplayEngine;

  constructor(replayEngine: ReplayEngine) {
    this.replayEngine = replayEngine;
  }

  /**
   * Run CI check on a session
   */
  async runCheck(sessionKey: SessionKey): Promise<{
    passed: boolean;
    message: string;
    details: ReplayResult;
  }> {
    const result = await this.replayEngine.replay(sessionKey);

    if (result.success) {
      return {
        passed: true,
        message: `✓ Replay successful: ${result.ticksReplayed} ticks verified`,
        details: result,
      };
    } else {
      const divergenceInfo = result.divergences
        .map(d => `Tick ${d.tickIndex}: ${d.reason}`)
        .join('; ');

      return {
        passed: false,
        message: `✗ Replay failed: ${divergenceInfo}`,
        details: result,
      };
    }
  }

  /**
   * Run CI check on multiple sessions
   */
  async runBatchCheck(sessionKeys: SessionKey[]): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: Array<{ sessionKey: SessionKey; passed: boolean; message: string }>;
  }> {
    const results: Array<{ sessionKey: SessionKey; passed: boolean; message: string }> = [];
    let passed = 0;
    let failed = 0;

    for (const sessionKey of sessionKeys) {
      const result = await this.runCheck(sessionKey);
      results.push({ sessionKey, passed: result.passed, message: result.message });
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
    }

    return {
      total: sessionKeys.length,
      passed,
      failed,
      results,
    };
  }
}
