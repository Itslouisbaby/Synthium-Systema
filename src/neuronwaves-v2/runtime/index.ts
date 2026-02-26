/**
 * NeuronWaves v2 Runtime - Main exports
 */

// Deterministic ID generation
export { deterministicId, DeterministicID } from './deterministic-id.js';

// Core runtime components
export { SignalBus, SignalBuilder } from './signal-bus.js';
export type { SignalBusConfig } from './signal-bus.js';

export {
  WorkingStateManager,
  createInitialWorkingState,
  computeStateHash
} from './working-state.js';
export type { WorkingStateConfig, StateSnapshot } from './working-state.js';

export { Scheduler, defaultSchedulerConfig } from './scheduler.js';
export type { SchedulerConfig } from '../types.js';
export type { SchedulerCallbacks } from './scheduler.js';

export { SelfModelManager } from './self-model.js';
export type { SelfModelConfig, SelfModelSnapshot, UpdateRule } from './self-model.js';

// Re-export types
export type {
  // Primitive types
  TimestampMs,
  UUID,
  SessionKey,
  SignalId,
  LoopName,
  ChainId,
  Hash,

  // Signal system
  SignalPriority,
  SignalType,
  Signal,
  SequencedSignal,

  // WorkingState
  PlanChain,
  PendingApproval,
  Uncertainty,
  ConfidenceState,
  ToolReliability,
  SelfModel,
  ActiveSchema,
  ExecutionLedgerEntry,
  SessionBudgets,
  WorkingState,
  StateDelta,

  // MicroLoop
  LoopRhythm,
  TickResult,
  MicroLoop,

  // Scheduler
  TickRecord,
  SchedulerConfig as SchedulerConfigType,

  // World model
  BeliefEntity,
  BeliefRelation,
  Belief,
  BeliefGraph,
  Prediction,

  // Transfer learning
  TaskTrace,
  Skill,

  // Abstractions
  Concept,
  Schema,
  Invariant,

  // v1 compatibility
  ActionClassType,
  PlanStep,
  Plan,
  Observation,
  Evaluation,
} from '../types.js';

export type { RuntimeConfig, RuntimeStatus } from '../neuronwaves-runtime.js';
