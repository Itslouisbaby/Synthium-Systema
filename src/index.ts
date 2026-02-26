/**
 * Synth NeuronWaves - Cognitive Planning System V2
 */

// Core Systems
export * from './autonomous-cognitive-system.js';
export * from './enhanced-autonomous-system.js';
export * from './synth-runtime.js';

// Types
export * from './types.js';

// Configuration
export * from './config/system-config.js';

// Runtime Subsystems
export * from './runtime/scheduler.js';
export * from './runtime/signal-bus.js';
export * from './runtime/working-state.js';
export * from './runtime/self-model.js';
export * from './runtime/deterministic-id.js';

// Memory
export * from './memory/types.js';
export * from './memory/core-memories.js';
export * from './memory/local-store.js';

// LLM
export * from './llm/llm-provider.js';

// Learning
export * from './learning/learning-integration.js';
export * from './learning/continuous-pretraining.js';
export * from './learning/versioned-storage.js';

// Autonomy & Cognition
export * from './autonomy/executive-control.js';
export * from './autonomy/goal-autonomy.js';
export * from './cognition/metacognition.js';

// Neural Learning
export * from './neural-learning/embedding-network.js';
export * from './neural-learning/scaled-embedding-network.js';

// TUI
export * from './tui/index.js';

// Legacy V1 Exports for Testing
export { ArtifactStore, type StoreConfig, type SessionPaths } from './artifacts/store.js';
export { runNeuronWavesLoop, type LoopConfig } from './orchestrator/loop.js';
export { SynthRuntime, createSynthRuntime } from './orchestrator/runtime.js';
export type { SynthRuntimeConfig, SynthResult } from './orchestrator/runtime.js';
export { PolicyGate } from './policy/gate.js';
export { Autonomy, DefaultLimits, HARD_BLOCKED_CLASSES, initialStats, ActionClass } from './policy/types.js';
export type { AutonomyLevel, AutonomyLimits, PolicyConfig, PolicyDecision, PolicyGateStats, PolicyStep, PolicyAuditEvent, ActionClassType, StepStatus } from './policy/types.js';
export { HeuristicPlanner } from './planning/heuristic-planner.js';
export { PlannerRegistry, type Planner } from './planning/planner.js';

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
