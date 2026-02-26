/**n * Synth TUI - Terminal User Interface
 * 
 * A Matrix-themed terminal interface for the Synth AGI system.
 * Built with Ink (React for terminals).
 */

// Components
export * from './components/index.js';

// Hooks
export * from './hooks/index.js';

// Runtime Bridge
export { RuntimeBridge, type RuntimeBridgeConfig } from './runtime-bridge.js';

// Constants
export { MatrixColors } from './constants/colors.js';

// Main App and entry point
export { default as App } from './app.js';
export { runTUI } from './entry.js';
