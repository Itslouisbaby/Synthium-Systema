/**
 * NeuronWaves v2 Runtime - Always-on, signal-driven cognitive system
 * 
 * This is the main entry point for the v2 runtime, coordinating:
 * - SignalBus (append-only event stream)
 * - WorkingState (bounded short-term consciousness)
 * - Scheduler (deterministic loop coordination)
 * - MicroLoops (specialized cognitive functions)
 */

import { SignalBus, SignalBuilder } from './runtime/signal-bus.js';
import { WorkingStateManager } from './runtime/working-state.js';
import { Scheduler, defaultSchedulerConfig } from './runtime/scheduler.js';
import { SelfModelManager } from './runtime/self-model.js';
import type { 
  SessionKey, 
  Signal, 
  MicroLoop,
  SchedulerConfig,
  TickRecord,
  WorkingState,
  StateDelta
} from './types.js';

// Default loops
import { 
  InputLoop, 
  OutputLoop, 
  ExecutiveLoop, 
  CriticLoop, 
  MonitorLoop,
  consolePublisher 
} from './loops/index.js';

/** Runtime configuration */
export interface RuntimeConfig {
  /** Base directory for artifacts */
  readonly artifactBaseDir: string;
  /** Scheduler configuration */
  readonly schedulerConfig?: Partial<SchedulerConfig>;
  /** Enable specific loops */
  readonly enabledLoops?: {
    readonly input?: boolean;
    readonly output?: boolean;
    readonly executive?: boolean;
    readonly critic?: boolean;
    readonly monitor?: boolean;
  };
  /** Custom output publisher */
  readonly outputPublisher?: (output: {
    content: string;
    chainId: string | null;
    sessionKey: string;
  }) => void | Promise<void>;
}

/** Runtime status */
export interface RuntimeStatus {
  readonly isRunning: boolean;
  readonly activeSessions: SessionKey[];
  readonly registeredLoops: string[];
  readonly tickCount: number;
}

/**
 * NeuronWaves v2 Runtime
 * 
 * Always-on runtime that:
 * - Sleeps when idle (signal-driven)
 * - Supports multi-chain cognition with attention arbitration
 * - Provides meta-reasoning that asks before acting under uncertainty
 * - Maintains deterministic replay capability
 * - Preserves governance through PolicyGate
 */
export class NeuronWavesRuntime {
  private readonly signalBus: SignalBus;
  private readonly workingState: WorkingStateManager;
  private readonly scheduler: Scheduler;
  private readonly selfModel: SelfModelManager;
  private readonly inputLoop: InputLoop;
  private readonly outputLoop: OutputLoop;
  private tickCount = 0;

  constructor(private readonly config: RuntimeConfig) {
    // Initialize core components
    this.signalBus = new SignalBus({
      baseDir: `${config.artifactBaseDir}/signals`,
    });

    this.workingState = new WorkingStateManager({
      baseDir: config.artifactBaseDir,
    });

    this.selfModel = new SelfModelManager({
      baseDir: config.artifactBaseDir,
    });

    // Initialize scheduler
    const schedulerConfig: SchedulerConfig = {
      ...defaultSchedulerConfig,
      ...config.schedulerConfig,
    };

    this.scheduler = new Scheduler(
      schedulerConfig,
      this.signalBus,
      this.workingState,
      {
        onTickStart: (tickId, sessionKey) => {
          this.tickCount++;
        },
        onTickComplete: (record) => {
          // Tick completed
        },
        onLoopError: (loopName, error, recoveryAction) => {
          console.error(`[Runtime] Loop ${loopName} error: ${error.message} (${recoveryAction})`);
        },
        onBudgetExceeded: (sessionKey, budgetType) => {
          console.warn(`[Runtime] Session ${sessionKey} exceeded budget: ${budgetType}`);
        },
      }
    );

    // Initialize default loops
    const enabledLoops = config.enabledLoops ?? {};

    // Input loop
    this.inputLoop = new InputLoop();
    if (enabledLoops.input !== false) {
      this.scheduler.registerLoop(this.inputLoop, 1);
    }

    // Output loop
    this.outputLoop = new OutputLoop({
      publisher: config.outputPublisher ?? consolePublisher,
    });
    if (enabledLoops.output !== false) {
      this.scheduler.registerLoop(this.outputLoop, 2);
    }

    // Executive loop
    if (enabledLoops.executive !== false) {
      this.scheduler.registerLoop(new ExecutiveLoop(), 3);
    }

    // Critic loop
    if (enabledLoops.critic !== false) {
      this.scheduler.registerLoop(new CriticLoop(), 4);
    }

    // Monitor loop
    if (enabledLoops.monitor !== false) {
      this.scheduler.registerLoop(new MonitorLoop(), 5);
    }
  }

  /**
   * Start the runtime
   */
  start(): void {
    this.scheduler.start();
    console.log('[Runtime] NeuronWaves v2 started');
  }

  /**
   * Stop the runtime
   */
  stop(): void {
    this.scheduler.stop();
    console.log('[Runtime] NeuronWaves v2 stopped');
  }

  /**
   * Get runtime status
   */
  getStatus(): RuntimeStatus {
    return {
      isRunning: this.scheduler.getIsRunning(),
      activeSessions: this.workingState.getActiveSessions(),
      registeredLoops: this.scheduler.getRegisteredLoops(),
      tickCount: this.tickCount,
    };
  }

  /**
   * Submit input to the runtime
   * 
   * @param sessionKey - Session identifier
   * @param content - Input content
   * @returns Signal ID of the created input signal
   */
  async submitInput(sessionKey: SessionKey, content: string): Promise<string> {
    // Ensure session exists
    this.workingState.getState(sessionKey);

    // Create input signal
    const signal = SignalBus.createSignal(
      'INPUT_RECEIVED',
      { content, source: 'user' },
      sessionKey,
      'external',
      'palpitation'
    );

    // Append to signal bus
    const sequenced = await this.signalBus.append(signal);

    // Queue in input loop for processing
    this.inputLoop.queueInput(sessionKey, {
      type: 'user_message',
      content,
      timestampMs: Date.now(),
    });

    // Trigger immediate tick for responsiveness
    await this.scheduler.triggerTick(sessionKey);

    return sequenced.signalId;
  }

  /**
   * Submit a system event
   */
  async submitSystemEvent(sessionKey: SessionKey, content: string, metadata?: Record<string, unknown>): Promise<string> {
    const signal = SignalBus.createSignal(
      'INPUT_RECEIVED',
      { content, source: 'system', metadata },
      sessionKey,
      'external',
      'event'
    );

    const sequenced = await this.signalBus.append(signal);
    await this.scheduler.triggerTick(sessionKey);

    return sequenced.signalId;
  }

  /**
   * Get working state for a session
   */
  getWorkingState(sessionKey: SessionKey): WorkingState {
    return this.workingState.getState(sessionKey);
  }

  /**
   * Get tick records for a session
   */
  getTickRecords(sessionKey: SessionKey): TickRecord[] {
    return this.scheduler.getTickRecords(sessionKey);
  }

  /**
   * Get signals for a session
   */
  async getSignals(sessionKey: SessionKey, fromOffset?: number): Promise<Signal[]> {
    return this.signalBus.readTail(sessionKey, fromOffset);
  }

  /**
   * Register a custom micro-loop
   */
  registerLoop(loop: MicroLoop, priority: number = 0): void {
    this.scheduler.registerLoop(loop, priority);
  }

  /**
   * Unregister a micro-loop
   */
  unregisterLoop(loopName: string): void {
    this.scheduler.unregisterLoop(loopName);
  }

  /**
   * Apply state deltas directly (for testing/debugging)
   */
  applyStateDeltas(sessionKey: SessionKey, deltas: StateDelta[]): string {
    return this.workingState.applyDeltas(sessionKey, deltas);
  }

  /**
   * Clear a session
   */
  clearSession(sessionKey: SessionKey): void {
    this.signalBus.clearSession(sessionKey);
    this.workingState.clearSession(sessionKey);
    this.selfModel.clearSession(sessionKey);
    this.scheduler.clearSession(sessionKey);
    this.outputLoop.clearSession(sessionKey);
  }

  /**
   * Create a signal builder for a session
   */
  createSignalBuilder(sessionKey: SessionKey, sourceLoop: string): SignalBuilder {
    return new SignalBuilder(sessionKey, sourceLoop);
  }

  /**
   * Wait for a condition to be met (for testing)
   */
  async waitFor(
    sessionKey: SessionKey,
    condition: (state: WorkingState) => boolean,
    timeoutMs: number = 5000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const state = this.workingState.getState(sessionKey);
      if (condition(state)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }
}

/** Create default runtime */
export function createRuntime(config: RuntimeConfig): NeuronWavesRuntime {
  return new NeuronWavesRuntime(config);
}
