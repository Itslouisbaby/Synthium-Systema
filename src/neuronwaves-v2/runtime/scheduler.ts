/**
 * Scheduler - Heartbeat + Palpitation coordination
 * Section 2: Deterministic scheduler mechanics
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { 
  Signal, 
  SignalType, 
  SignalPriority,
  SequencedSignal,
  MicroLoop, 
  TickResult, 
  TickRecord,
  SchedulerConfig,
  SessionKey,
  Hash,
  TimestampMs,
  StateDelta
} from '../types.js';
import { SignalBus } from './signal-bus.js';
import { WorkingStateManager, computeStateHash } from './working-state.js';
import { deterministicId } from './deterministic-id.js';

/** Loop registration with priority for deterministic ordering */
interface RegisteredLoop extends MicroLoop {
  readonly priority: number;
  readonly lastTickAtMs: TimestampMs;
  readonly tickCount: number;
}

/** Scheduler event callbacks */
export interface SchedulerCallbacks {
  onTickStart?: (tickId: string, sessionKey: SessionKey) => void;
  onTickComplete?: (record: TickRecord) => void;
  onLoopError?: (loopName: string, error: Error, recoveryAction: string) => void;
  onBudgetExceeded?: (sessionKey: SessionKey, budgetType: string) => void;
}

/** Session state for scheduler */
interface SessionState {
  readonly sessionKey: SessionKey;
  signalCursor: number;
  readyLoops: Set<string>;
  heartbeatTimers: Map<string, number>;
  budgetUsage: {
    toolCallsThisRun: number;
    toolCallsThisMinute: number;
    memoryWritesThisMinute: number;
    reflectionPassesThisHour: number;
  };
  lastMinuteReset: TimestampMs;
  lastHourReset: TimestampMs;
}

/**
 * Scheduler - Coordinates micro-loops with deterministic execution
 * 
 * Design principles:
 * - Two rhythms: Palpitation (fast/reactive) and Heartbeat (slow/reflective)
 * - Deterministic loop execution order each tick
 * - Strict tick budgets per loop
 * - Global budgets per session
 * - Mandatory TickRecords for replay
 */
export class Scheduler {
  private readonly config: SchedulerConfig;
  private readonly signalBus: SignalBus;
  private readonly workingState: WorkingStateManager;
  private readonly loops: Map<string, RegisteredLoop> = new Map();
  private readonly sessionStates: Map<SessionKey, SessionState> = new Map();
  private readonly callbacks: SchedulerCallbacks;
  private readonly tickRecords: Map<SessionKey, TickRecord[]> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private tickCounter = 0;

  constructor(
    config: SchedulerConfig,
    signalBus: SignalBus,
    workingState: WorkingStateManager,
    callbacks: SchedulerCallbacks = {}
  ) {
    this.config = config;
    this.signalBus = signalBus;
    this.workingState = workingState;
    this.callbacks = callbacks;
  }

  /**
   * Register a micro-loop
   */
  registerLoop(loop: MicroLoop, priority: number = 0): void {
    const registeredLoop: RegisteredLoop = {
      name: loop.name,
      rhythm: loop.rhythm,
      tickBudgetMs: loop.tickBudgetMs,
      maxSignalsOut: loop.maxSignalsOut,
      reads: loop.reads,
      writes: loop.writes,
      subscriptions: loop.subscriptions,
      tick: loop.tick.bind(loop),
      priority,
      lastTickAtMs: 0,
      tickCount: 0,
    };
    this.loops.set(loop.name, registeredLoop);
  }

  /**
   * Unregister a micro-loop
   */
  unregisterLoop(loopName: string): void {
    this.loops.delete(loopName);
  }

  /**
   * Get or create session state
   */
  private getSessionState(sessionKey: SessionKey): SessionState {
    let state = this.sessionStates.get(sessionKey);
    if (!state) {
      const now = Date.now();
      state = {
        sessionKey,
        signalCursor: 0,
        readyLoops: new Set(),
        heartbeatTimers: new Map(),
        budgetUsage: {
          toolCallsThisRun: 0,
          toolCallsThisMinute: 0,
          memoryWritesThisMinute: 0,
          reflectionPassesThisHour: 0,
        },
        lastMinuteReset: now,
        lastHourReset: now,
      };
      this.sessionStates.set(sessionKey, state);
      this.tickRecords.set(sessionKey, []);
    }
    return state;
  }

  /**
   * Reset budget windows if needed
   */
  private resetBudgetWindows(sessionState: SessionState): void {
    const now = Date.now();
    
    // Reset per-minute budgets
    if (now - sessionState.lastMinuteReset >= 60000) {
      sessionState.budgetUsage.toolCallsThisMinute = 0;
      sessionState.budgetUsage.memoryWritesThisMinute = 0;
      sessionState.lastMinuteReset = now;
    }
    
    // Reset per-hour budgets
    if (now - sessionState.lastHourReset >= 3600000) {
      sessionState.budgetUsage.reflectionPassesThisHour = 0;
      sessionState.lastHourReset = now;
    }
  }

  /**
   * Check if budgets allow an operation
   */
  private checkBudgets(
    sessionState: SessionState, 
    operation: 'tool_call' | 'memory_write' | 'reflection'
  ): boolean {
    this.resetBudgetWindows(sessionState);
    
    const quotas = this.config.sessionQuotas;
    
    switch (operation) {
      case 'tool_call':
        if (sessionState.budgetUsage.toolCallsThisRun >= quotas.maxToolCallsPerRun) {
          this.callbacks.onBudgetExceeded?.(sessionState.sessionKey, 'toolCallsPerRun');
          return false;
        }
        if (sessionState.budgetUsage.toolCallsThisMinute >= quotas.maxToolCallsPerMinute) {
          this.callbacks.onBudgetExceeded?.(sessionState.sessionKey, 'toolCallsPerMinute');
          return false;
        }
        return true;
        
      case 'memory_write':
        if (sessionState.budgetUsage.memoryWritesThisMinute >= quotas.maxMemoryWritesPerMinute) {
          this.callbacks.onBudgetExceeded?.(sessionState.sessionKey, 'memoryWritesPerMinute');
          return false;
        }
        return true;
        
      case 'reflection':
        if (sessionState.budgetUsage.reflectionPassesThisHour >= quotas.maxReflectionPassesPerHour) {
          this.callbacks.onBudgetExceeded?.(sessionState.sessionKey, 'reflectionPassesPerHour');
          return false;
        }
        return true;
    }
  }

  /**
   * Track budget usage
   */
  private trackBudgetUsage(
    sessionState: SessionState,
    operation: 'tool_call' | 'memory_write' | 'reflection'
  ): void {
    switch (operation) {
      case 'tool_call':
        sessionState.budgetUsage.toolCallsThisRun++;
        sessionState.budgetUsage.toolCallsThisMinute++;
        break;
      case 'memory_write':
        sessionState.budgetUsage.memoryWritesThisMinute++;
        break;
      case 'reflection':
        sessionState.budgetUsage.reflectionPassesThisHour++;
        break;
    }
  }

  /**
   * Get loops triggered by a signal type
   */
  private getTriggeredLoops(signalType: SignalType): RegisteredLoop[] {
    const triggered: RegisteredLoop[] = [];
    
    for (const loop of this.loops.values()) {
      if (loop.subscriptions.includes(signalType)) {
        triggered.push(loop);
      }
    }
    
    // Sort by priority for deterministic ordering
    return triggered.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get heartbeat loops (those with heartbeat rhythm)
   */
  private getHeartbeatLoops(): RegisteredLoop[] {
    const heartbeatLoops: RegisteredLoop[] = [];
    
    for (const loop of this.loops.values()) {
      if (loop.rhythm === 'heartbeat') {
        heartbeatLoops.push(loop);
      }
    }
    
    return heartbeatLoops.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Execute a single tick for a session
   */
  async executeTick(sessionKey: SessionKey): Promise<TickRecord | null> {
    const sessionState = this.getSessionState(sessionKey);
    const tickIndex = ++this.tickCounter;
    const startedAtMs = Date.now();
    const tickId = deterministicId.generateTickId(sessionKey, tickIndex, startedAtMs);
    
    this.callbacks.onTickStart?.(tickId, sessionKey);

    // Get current working state
    const workingStateBefore = this.workingState.getState(sessionKey);
    const workingStateBeforeHash = computeStateHash(workingStateBefore);

    // Read new signals from bus
    const newSignals = await this.signalBus.readTail(sessionKey, sessionState.signalCursor);
    const signalsConsumed: SequencedSignal[] = [];
    const signalsEmitted: Signal[] = [];
    const loopsRun: string[] = [];
    const errors: TickRecord['errors'] = [];
    const stateDeltas: StateDelta[] = [];

    // Track budget usage for this tick
    let toolCallsUsed = 0;
    let memoryWritesUsed = 0;

    // Determine which loops to run
    const loopsToRun = new Set<string>();

    // 1. Palpitation loops triggered by new signals
    for (const signal of newSignals) {
      signalsConsumed.push(signal);
      const triggeredLoops = this.getTriggeredLoops(signal.type);
      for (const loop of triggeredLoops) {
        if (loop.rhythm === 'palpitation' || loop.rhythm === 'event') {
          loopsToRun.add(loop.name);
        }
      }
    }

    // 2. Heartbeat loops (always run on heartbeat)
    for (const loop of this.getHeartbeatLoops()) {
      loopsToRun.add(loop.name);
    }

    // 3. Event-triggered loops in ready set
    for (const loopName of sessionState.readyLoops) {
      loopsToRun.add(loopName);
    }
    sessionState.readyLoops.clear();

    // Sort loops by priority for deterministic execution
    const sortedLoops = Array.from(loopsToRun)
      .map(name => this.loops.get(name))
      .filter((loop): loop is RegisteredLoop => loop !== undefined)
      .sort((a, b) => a.priority - b.priority);

    // Execute each loop
    for (const loop of sortedLoops) {
      const loopStartTime = Date.now();
      
      try {
        // Check tick budget
        const tickBudget = loop.tickBudgetMs ?? this.config.defaultTickBudgetMs;
        
        // Filter signals relevant to this loop
        const loopSignals = signalsConsumed.filter(s => 
          loop.subscriptions.includes(s.type)
        );

        // Execute tick
        const result = await Promise.race([
          loop.tick({
            signals: loopSignals,
            workingState: this.workingState.getState(sessionKey),
            sessionKey,
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Tick budget exceeded')), tickBudget)
          ),
        ]);

        // Validate max signals out
        const maxSignals = Math.min(loop.maxSignalsOut, this.config.maxSignalsPerTick);
        const signalsOut = result.signalsOut.slice(0, maxSignals);

        // Emit signals to bus
        for (const signal of signalsOut) {
          const sequenced = await this.signalBus.append(signal);
          signalsEmitted.push(sequenced);
          
          // Check if this triggers other loops
          const triggered = this.getTriggeredLoops(signal.type);
          for (const triggeredLoop of triggered) {
            if (triggeredLoop.rhythm === 'palpitation') {
              sessionState.readyLoops.add(triggeredLoop.name);
            }
          }
        }

        // Apply state deltas
        for (const delta of result.stateDelta) {
          // Validate loop can write to this section
          if (loop.writes.includes(delta.section)) {
            stateDeltas.push(delta);
          }
        }

        // Track budget usage from metrics
        if (result.metrics.signalsEmitted > 0) {
          // Estimate budget usage based on signal types
          for (const signal of signalsOut) {
            if (signal.type === 'STEP_EXECUTED' || signal.type === 'TOOL_RESULT_RECEIVED') {
              if (this.checkBudgets(sessionState, 'tool_call')) {
                this.trackBudgetUsage(sessionState, 'tool_call');
                toolCallsUsed++;
              }
            }
            if (signal.type === 'MEMORY_WRITE_SUGGESTED') {
              if (this.checkBudgets(sessionState, 'memory_write')) {
                this.trackBudgetUsage(sessionState, 'memory_write');
                memoryWritesUsed++;
              }
            }
          }
        }

        loopsRun.push(loop.name);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const recoveryAction = errorMessage.includes('budget') 
          ? 'skip_loop_degrade_mode' 
          : 'continue_next_loop';
        
        errors.push({
          loopName: loop.name,
          error: errorMessage,
          recoveryAction,
        });
        
        this.callbacks.onLoopError?.(loop.name, error as Error, recoveryAction);
      }
    }

    // Apply all state deltas
    const stateDeltaHash = stateDeltas.length > 0 
      ? createHash('sha256').update(JSON.stringify(stateDeltas)).digest('hex')
      : undefined;
    
    if (stateDeltas.length > 0) {
      this.workingState.applyDeltas(sessionKey, stateDeltas);
    }

    // Get final state hash
    const workingStateAfter = this.workingState.getState(sessionKey);
    const workingStateAfterHash = computeStateHash(workingStateAfter);

    // Update signal cursor
    if (newSignals.length > 0) {
      sessionState.signalCursor = Math.max(...newSignals.map(s => s.sequence)) + 1;
    }

    const completedAtMs = Date.now();

    // Create tick record
    const tickRecord: TickRecord = {
      tickId,
      tickIndex,
      sessionKey,
      signalsConsumed: signalsConsumed.map(s => s.signalId),
      loopsRun,
      signalsEmitted: signalsEmitted.map(s => s.signalId),
      workingStateBeforeHash,
      workingStateAfterHash,
      stateDeltaHash,
      timingMetrics: {
        startedAtMs,
        completedAtMs,
        totalDurationMs: completedAtMs - startedAtMs,
      },
      budgetUsage: {
        toolCallsUsed,
        memoryWritesUsed,
      },
      errors,
    };

    // Store tick record
    const sessionRecords = this.tickRecords.get(sessionKey) ?? [];
    sessionRecords.push(tickRecord);
    this.tickRecords.set(sessionKey, sessionRecords);

    // Persist tick record
    await this.persistTickRecord(tickRecord);

    this.callbacks.onTickComplete?.(tickRecord);

    return tickRecord;
  }

  /**
   * Persist tick record to disk
   */
  private async persistTickRecord(record: TickRecord): Promise<void> {
    const sessionDir = join('.synth/v2', record.sessionKey, 'ticks');
    await mkdir(sessionDir, { recursive: true });
    
    const filePath = join(sessionDir, `tick-${record.tickIndex}.json`);
    await writeFile(filePath, JSON.stringify(record, null, 2));
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Start heartbeat timer
    this.heartbeatInterval = setInterval(() => {
      // Trigger heartbeat for all active sessions
      for (const sessionKey of this.sessionStates.keys()) {
        this.executeTick(sessionKey).catch(console.error);
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Check if scheduler is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get tick records for a session
   */
  getTickRecords(sessionKey: SessionKey): TickRecord[] {
    return [...(this.tickRecords.get(sessionKey) ?? [])];
  }

  /**
   * Get registered loops
   */
  getRegisteredLoops(): string[] {
    return Array.from(this.loops.keys());
  }

  /**
   * Clear session state
   */
  clearSession(sessionKey: SessionKey): void {
    this.sessionStates.delete(sessionKey);
    this.tickRecords.delete(sessionKey);
  }

  /**
   * Trigger immediate tick for a session (for testing/palpitation)
   */
  async triggerTick(sessionKey: SessionKey): Promise<TickRecord | null> {
    return this.executeTick(sessionKey);
  }
}

/** Default scheduler configuration */
export const defaultSchedulerConfig: SchedulerConfig = {
  heartbeatIntervalMs: 5000,
  defaultTickBudgetMs: 100,
  maxSignalsPerTick: 10,
  sessionQuotas: {
    maxToolCallsPerRun: 100,
    maxToolCallsPerMinute: 1000,
    maxMemoryWritesPerMinute: 10000,
    maxReflectionPassesPerHour: 100,
  },
};
