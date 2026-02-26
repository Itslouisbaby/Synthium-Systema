/**
 * NeuronWaves v2 - MicroLoop implementations
 */

// Core loops
export { InputLoop } from './input-loop.js';
export type { InputLoopConfig, ExternalInput, ExternalInputType } from './input-loop.js';

export { OutputLoop, consolePublisher, BufferedPublisher } from './output-loop.js';
export type { OutputLoopConfig, OutputPublisher } from './output-loop.js';

export { ExecutiveLoop } from './executive-loop.js';
export type { ExecutiveLoopConfig, ExecutiveDecision } from './executive-loop.js';

export { CriticLoop, defaultUncertaintyDetector } from './critic-loop.js';
export type { CriticLoopConfig } from './critic-loop.js';

export { MonitorLoop } from './monitor-loop.js';
export type { MonitorLoopConfig } from './monitor-loop.js';

export { CortexLoop } from './cortex-loop.js';
export type { CortexLoopConfig, V1LoopFunction } from './cortex-loop.js';
