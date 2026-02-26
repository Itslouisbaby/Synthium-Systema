// NeuronWaves types for TUI integration

export type {
  LoopInput,
  PlanStep,
  Plan,
  Evaluation,
  LoopOutput,
  ContextBundle,
} from '../types.js';

// v2 runtime — replaces runNeuronWavesLoop
export { createSynthRuntime } from '../orchestrator/runtime.js';
export type { SynthRuntimeConfig, SynthResult } from '../orchestrator/runtime.js';