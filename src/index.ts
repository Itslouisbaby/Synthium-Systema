/**
 * Synth NeuronWaves - Cognitive Planning System
 * Milestone 1: Loop skeleton with artifacts
 */

// Core types
export type {
  TimestampMs,
  UUID,
  SessionKey,
  Observation,
  PlanStep,
  Plan,
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

// Convenience wrapper
import { runNeuronWavesLoop, type LoopConfig, type LoopInput } from './orchestrator/loop.js';

export interface WaveOptions {
  content: string;
  sessionKey: string;
  artifactDir?: string;
}

export async function synthesize(options: WaveOptions) {
  const config: LoopConfig = {
    artifactBaseDir: options.artifactDir || '.synth/neuronwaves',
  };
  const input: LoopInput = {
    content: options.content,
    sessionKey: options.sessionKey,
  };
  return runNeuronWavesLoop(input, config);
}