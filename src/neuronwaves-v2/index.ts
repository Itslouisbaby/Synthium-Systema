/**
 * NeuronWaves v2 — Runtime Core entrypoint.
 *
 * PUBLIC API SURFACE — only these exports are stable:
 *   createRuntime()
 *   startSession()
 *   pushInput()
 *   runForTicks(n)
 *   stop()
 *
 * Everything else is internal. Do not import from sub-modules directly.
 */

import { join } from 'node:path';
import { SignalBus } from './runtime/signal-bus.js';
import { WorkingStateManager, createInitialWorkingState } from './runtime/working-state.js';
import { Scheduler, defaultSchedulerConfig } from './runtime/scheduler.js';
import { SelfModelManager } from './runtime/self-model.js';
import { InputLoop } from './loops/input-loop.js';
import { OutputLoop } from './loops/output-loop.js';
import { ExecutiveLoop } from './loops/executive-loop.js';
import { MonitorLoop } from './loops/monitor-loop.js';
import { ArtifactsAdapter } from './adapters/artifacts-adapter.js';
import { MemoryAdapter } from './adapters/memory-adapter.js';
import { PolicyAdapter } from './adapters/policy-adapter.js';
import type { SessionKey } from './runtime/index.js';
import type { AutonomyLevel } from '../policy/types.js';

export interface RuntimeConfig {
  /** Base directory for all artifacts and memory (.synth by default) */
  baseDir?: string;
  /** Session key — defaults to a timestamp-based key */
  sessionKey?: SessionKey;
  /** Autonomy level passed to PolicyAdapter (default: Level1) */
  autonomyLevel?: AutonomyLevel;
  /** Called when the runtime emits output */
  onOutput?: (text: string) => void;
}

export interface NeuronWavesRuntime {
  startSession(): Promise<void>;
  pushInput(text: string): Promise<void>;
  runForTicks(n: number): Promise<void>;
  stop(): Promise<void>;
  readonly sessionKey: SessionKey;
}

/**
 * Create a v2 NeuronWaves runtime instance.
 * Wire loops → adapters → v1 stores internally; callers see only this API.
 */
export function createRuntime(config: RuntimeConfig = {}): NeuronWavesRuntime {
  const baseDir = config.baseDir ?? join(process.cwd(), '.synth');
  const sessionKey: SessionKey = (config.sessionKey ?? `session-${Date.now()}`) as SessionKey;

  // Core runtime components
  const signalBus = new SignalBus({ sessionKey, baseDir: join(baseDir, 'signals') });
  const workingState = new WorkingStateManager({ sessionKey, baseDir });
  const selfModel = new SelfModelManager({ sessionKey, baseDir });
  const scheduler = new Scheduler(
    defaultSchedulerConfig,
    signalBus,
    workingState,
    {
      onLoopError: (loopName, error) => {
        console.error(`[v2] loop error in ${loopName}:`, error.message);
      },
    }
  );

  // v1 adapters
  const _artifacts = new ArtifactsAdapter({ baseDir, sessionKey });
  const _memory = new MemoryAdapter({ baseDir, sessionKey });
  const _policy = new PolicyAdapter({ baseDir, autonomyLevel: config.autonomyLevel });

  // Minimal loop set (Layer 2)
  const inputLoop = new InputLoop(signalBus, workingState);
  const outputLoop = new OutputLoop(signalBus, workingState, config.onOutput ?? console.log);
  const executiveLoop = new ExecutiveLoop(signalBus, workingState, selfModel);
  const monitorLoop = new MonitorLoop(signalBus, workingState, selfModel);

  // Register loops (lower priority number = runs first)
  scheduler.registerLoop(inputLoop, 10);
  scheduler.registerLoop(executiveLoop, 20);
  scheduler.registerLoop(monitorLoop, 30);
  scheduler.registerLoop(outputLoop, 40);

  return {
    sessionKey,

    async startSession(): Promise<void> {
      await _artifacts.ensureSession();
      scheduler.startSession(sessionKey);
    },

    async pushInput(text: string): Promise<void> {
      await signalBus.appendInput(sessionKey, text);
    },

    async runForTicks(n: number): Promise<void> {
      for (let i = 0; i < n; i++) {
        await scheduler.tick(sessionKey);
      }
    },

    async stop(): Promise<void> {
      await scheduler.stopSession(sessionKey);
    },
  };
}

// Re-export types that callers legitimately need
export type { SessionKey } from './runtime/index.js';
export type { RuntimeConfig as NeuronWavesRuntimeConfig };
