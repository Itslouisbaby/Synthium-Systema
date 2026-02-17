// Synth TUI v1.1 - Cognitive Control Console (Blessed Framework)
// Main entry point for the terminal UI

import { startBlessedTUI, BlessedTUI } from './app.js';
import { theme, ExecutionStatus, getStatusColor, getStatusIcon } from './theme.js';

export interface TUIConfig {
  workspace?: string;
  session?: string;
}

export interface SessionInfo {
  id: string;
  status: ExecutionStatus;
  lastUpdated: string;
}

export interface ActiveRun {
  stepId: string;
  action: string;
  status: ExecutionStatus;
  timestamp: string;
}

export interface MemoryInfo {
  flash: number;
  warm: number;
  semantic: number;
}

export interface AuditEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface CognitiveFieldEntry {
  nodeId: string;
  activation: number;
  signal: string;
  attention: string;
  timestamp: string;
}

export class SynthTUI {
  private config: TUIConfig;
  private safeMode: boolean = false;
  private killSwitch: boolean = false;
  private blessedTUI: BlessedTUI;

  constructor(config: TUIConfig = {}) {
    this.config = {
      workspace: config.workspace || process.cwd(),
      session: config.session,
    };
    this.blessedTUI = new BlessedTUI({
      workspace: this.config.workspace,
      session: this.config.session,
    });
  }

  // Initialize the TUI
  async init(): Promise<void> {
    // Set up terminal, load state
    this.loadState();
  }

  // Start the Blessed TUI
  start(): void {
    this.blessedTUI.start();
  }

  // Safety controls
  setSafeMode(enabled: boolean): void {
    this.safeMode = enabled;
    this.persistState();
  }

  activateKillSwitch(): void {
    this.killSwitch = true;
    this.persistState();
  }

  private persistState(): void {
    // TODO: Persist to state file
  }

  private loadState(): void {
    // TODO: Load state from file
  }
}

// Main entry point
export async function main(args: string[]): Promise<void> {
  const config: TUIConfig = {
    workspace: process.cwd(),
    session: undefined,
  };

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--workspace' && args[i + 1]) {
      config.workspace = args[i + 1];
      i++;
    } else if (args[i] === '--session' && args[i + 1]) {
      config.session = args[i + 1];
      i++;
    }
  }

  const tui = new SynthTUI(config);
  await tui.init();
  tui.start();
}

// Export the Blessed TUI starter function
export { startBlessedTUI };

