/**
 * Synth NeuronWaves - Cognitive Planning System
 * Milestone 4: Local memory
 */

// Core types
export type {
  TimestampMs,
  UUID,
  SessionKey,
  Observation,
  PlanStep,
  Plan,
  PlanGraph,
  PlannerInput,
  PlannerConfig,
  ContextBundle,
  Evaluation,
  AuditEvent,
  LoopState,
  LoopInput,
  LoopOutput,
} from './types.js';

// Artifact store
export { ArtifactStore, type StoreConfig, type SessionPaths } from './artifacts/store.js';

// Orchestrator
export { runNeuronWavesLoop, type LoopConfig } from './orchestrator/loop.js';
export { SynthRuntime, createSynthRuntime } from './orchestrator/runtime.js';
export type { SynthRuntimeConfig, SynthResult } from './orchestrator/runtime.js';

// Policy (Milestone 2)
export { PolicyGate } from './policy/gate.js';
export {
  Autonomy,
  DefaultLimits,
  HARD_BLOCKED_CLASSES,
  initialStats,
  ActionClass,
} from './policy/types.js';
export type {
  AutonomyLevel,
  AutonomyLimits,
  PolicyConfig,
  PolicyDecision,
  PolicyGateStats,
  PolicyStep,
  PolicyAuditEvent,
  ActionClassType,
  StepStatus,
} from './policy/types.js';

// Planning (Milestone 3)
export { HeuristicPlanner } from './planning/heuristic-planner.js';
export { PlannerRegistry, type Planner } from './planning/planner.js';

// Memory (Milestone 4)
export { LocalMemoryStore } from './memory/local-store.js';
export { LocalMemoryAdapter } from './memory/adapter-local.js';
export type {
  MemoryConfig,
  MemoryEntry,
  FlashMemoryFile,
  WarmMemoryFile,
  MemoryIndex,
  ContextBundle,
} from './memory/types.js';

// Convenience wrapper
import { runNeuronWavesLoop, type LoopInput } from './orchestrator/loop.js';

export interface WaveOptions {
  content: string;
  sessionKey: string;
  artifactDir?: string;
}

export async function synthesize(options: WaveOptions) {
  const config = { artifactBaseDir: options.artifactDir || '.synth/neuronwaves' };
  const input: LoopInput = { content: options.content, sessionKey: options.sessionKey };
  return runNeuronWavesLoop(input, config);
}

// TUI exports
export { SynthTUI, type TUIConfig } from './tui/index.js';
export { theme } from './tui/theme.js';
export { panels, TUIpanels, type SessionData, type MemoryData, type RunStep, type AuditData, type CognitiveNode } from './tui/panels.js';

// M14 Policy artifact system (authoring/versioning)
export * as PolicyArtifacts from './policy-artifacts/index.js';
