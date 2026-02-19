// NeuronWaves types for TUI integration
// Importing actual types from the orchestrator

export type { 
  LoopInput,
  PlanStep,
  Plan,
  Evaluation,
  LoopOutput,
  LoopConfig,
  ContextBundle
} from '../types.js';

// Import the actual NeuronWaves loop implementation
export { runNeuronWavesLoop } from '../orchestrator/loop.js';