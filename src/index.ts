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
export {
  MemoryEntry, FlashMemoryFile, WarmMemoryFile,
  MemoryIndex, DefaultMemoryConfig, STOPWORDS,
  ContextBundle
} from './memory/types.js';
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

// Selected Policy & Memory Exports
export { Autonomy, DefaultLimits, HARD_BLOCKED_CLASSES, initialStats, ActionClass } from './policy/types.js';
export type { AutonomyLevel, AutonomyLimits, PolicyConfig, PolicyDecision, PolicyGateStats, PolicyStep, PolicyAuditEvent, ActionClassType, StepStatus } from './policy/types.js';

import { SynthRuntime } from './synth-runtime.js';
export interface WaveOptions {
  content: string;
  sessionKey: string;
  artifactDir?: string;
}
export async function synthesize(options: WaveOptions) {
  const runtime = new SynthRuntime({
    baseDir: options.artifactDir || '.synth/neuronwaves',
  });
  await runtime.initialize();
  await runtime.start();
  await runtime.processInput(options.content);
  return runtime;
}
