// Synth TUI v1.1 - Cognitive Control Console (Blessed Framework)
// Main TUI application with Blessed screens and layout

import * as blessed from 'blessed';
import * as fs from 'fs';
import * as path from 'path';
import { getStateStore, TUIState } from './state.js';

// ANSI color constants
const COLORS = {
  green: '#22c55e',
  yellow: '#eab308',
  red: '#ef4444',
  cyan: '#3b82f6',
  gray: '#6b7280',
  bg: '#0f172a',
  text: '#e2e8f0',
  border: '#334155',
};

// Panel icons
const ICONS = {
  sessions: '[SESSIONS]',
  memory: '[MEMORY]',
  run: '[RUN]',
  audit: '[AUDIT]',
  cognitive: '[COGNITIVE FIELD]',
  safeMode: '[SAFE MODE]',
  killSwitch: '[KILL SWITCH]',
};

export class BlessedTUI {
  private screen: blessed.Widgets.Screen;
  private boxes: { [key: string]: blessed.Widgets.BoxElement };
  private stateStore: ReturnType<typeof getStateStore>;
  private unsubscribe: (() => void) | null;

  constructor() {
    // Get state store singleton
    this.stateStore = getStateStore();
    this.unsubscribe = null;

    // Create Blessed screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Synth TUI v1.1',
      fullUnicode: true,
      dockBorders: true,
      autopad: true,
    });

    // Track box elements
    this.boxes = {};

    // Build the UI
    this.buildLayout();
    this.setupKeybindings();

    // Subscribe to state changes
    this.subscribeToState();

    // Prompt for workspace/session selection
    this.promptWorkspaceSelection();
  }

  /**
   * Prompt user to select workspace
   */
  private promptWorkspaceSelection(): void {
    const currentWorkspace = this.stateStore.getState().workspacePath;

    // Create a simple form for input
    const form = blessed.form({
      top: 'center',
      left: 'center',
      width: '60%',
      height: 8,
      border: {
        type: 'line',
      },
      label: ' Workspace Selection ',
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.cyan,
        },
      },
      tags: true,
    });

    const currentLabel = blessed.box({
      parent: form,
      top: 1,
      left: 1,
      width: '100%-2',
      content: `{gray-fg}Current: ${currentWorkspace}{/gray-fg}`,
    });

    const inputLabel = blessed.box({
      parent: form,
      top: 2,
      left: 1,
      width: '100%-2',
      content: 'Enter new workspace path (or press Enter to keep current):',
    });

    const input = blessed.textbox({
      parent: form,
      top: 3,
      left: 1,
      width: '100%-2',
      height: 1,
      inputOnFocus: true,
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        focus: {
          bg: COLORS.border,
        },
      },
    });

    const submitButton = blessed.button({
      parent: form,
      top: 5,
      left: 1,
      width: 10,
      height: 1,
      content: '  OK  ',
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        focus: {
          bg: COLORS.cyan,
        },
      },
    });

    const cancelButton = blessed.button({
      parent: form,
      top: 5,
      left: 13,
      width: 12,
      height: 1,
      content: '  Cancel  ',
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        focus: {
          bg: COLORS.red,
        },
      },
    });

    this.screen.append(form);
    input.focus();

    submitButton.on('press', () => {
      const value = input.getValue().trim();
      if (value && value !== currentWorkspace) {
        this.stateStore.setWorkspacePath(value);
      }
      form.destroy();
      this.startStateRefresh();
    });

    cancelButton.on('press', () => {
      form.destroy();
      this.startStateRefresh();
    });

    input.key('enter', () => {
      const value = input.getValue().trim();
      if (value && value !== currentWorkspace) {
        this.stateStore.setWorkspacePath(value);
      }
      form.destroy();
      this.startStateRefresh();
    });

    input.key('escape', () => {
      form.destroy();
      this.startStateRefresh();
    });

    this.screen.render();
  }

  /**
   * Subscribe to state store changes
   */
  private subscribeToState(): void {
    this.unsubscribe = this.stateStore.subscribe((state) => {
      this.updateUI(state);
    });
  }

  /**
   * Start state refresh tick
   */
  private startStateRefresh(): void {
    this.stateStore.startTick();
  }

  /**
   * Update UI based on state changes
   */
  private updateUI(state: TUIState): void {
    // Update safe mode indicator
    if (this.boxes.safeMode) {
      const safeModeText = state.safeMode
        ? ` {green-fg}${ICONS.safeMode} 🔒 ENABLED{/green-fg} `
        : ` {gray-fg}${ICONS.safeMode} 🔒 DISABLED{/gray-fg} `;
      this.boxes.safeMode.setContent(safeModeText);
    }

    // Update kill switch indicator
    if (this.boxes.killSwitch) {
      const killSwitchText = state.killSwitch
        ? ` {red-fg}${ICONS.killSwitch} ⚠ ACTIVE{/red-fg} `
        : ` {gray-fg}${ICONS.killSwitch} ✓ INACTIVE{/gray-fg} `;
      this.boxes.killSwitch.setContent(killSwitchText);
    }

    // Update sessions panel
    if (this.boxes.sessions) {
      const artifactData = state.artifactData;
      let content = `\n Artifact Data Status:\n\n`;
      content += `  Workspace: {cyan-fg}${state.workspacePath}{/cyan-fg}\n`;
      content += `  Active Session: ${state.selectedSession || '{gray-fg}None{/gray-fg}'}\n\n`;
      content += `  {green-fg}✓{/green-fg} active.json: ${artifactData.active ? 'Loaded' : '{red-fg}Not found{/red-fg}'}\n`;
      content += `  {green-fg}✓{/green-fg} plans.jsonl: {cyan-fg}${artifactData.plans.length} plans{/cyan-fg}\n`;
      content += `  {green-fg}✓{/green-fg} approvals.json: {cyan-fg}${artifactData.approvals.length} entries{/cyan-fg}\n\n`;
      content += `  Last Update: ${new Date(state.lastUpdate).toLocaleTimeString()}\n`;
      this.boxes.sessions.setContent(content);
    }

    // Update memory panel
    if (this.boxes.memory) {
      const artifactData = state.artifactData;
      let content = `\n Memory Inspector:\n\n`;

      if (artifactData.active) {
        content += `  {yellow-fg}Active Session Data{/yellow-fg}:\n`;
        content += `  Status: ${JSON.stringify(artifactData.active).substring(0, 100)}...\n\n`;
      } else {
        content += `  {gray-fg}No active session data{/gray-fg}\n\n`;
      }

      if (artifactData.plans.length > 0) {
        content += `  {cyan-fg}Recent Plans{/cyan-fg}:\n`;
        artifactData.plans.slice(0, 3).forEach((plan, idx) => {
          content += `  ${idx + 1}. ${JSON.stringify(plan).substring(0, 60)}...\n`;
        });
        if (artifactData.plans.length > 3) {
          content += `  ... and ${artifactData.plans.length - 3} more\n`;
        }
      } else {
        content += `  {gray-fg}No plans found{/gray-fg}\n`;
      }

      this.boxes.memory.setContent(content);
    }

    // Update run panel
    if (this.boxes.run) {
      const artifactData = state.artifactData;
      let content = `\n Active Run:\n\n`;

      if (artifactData.active) {
        content += `  {green-fg}Session Active{/green-fg}\n`;
        content += `  Last update: ${new Date(state.lastUpdate).toLocaleTimeString()}\n\n`;
        content += `  {gray-fg}Execution steps available in audit log{/gray-fg}\n`;
      } else {
        content += `  {gray-fg}No active run{/gray-fg}\n`;
        content += `  Waiting for session to start...\n`;
      }

      this.boxes.run.setContent(content);
    }

    // Update audit panel
    if (this.boxes.audit) {
      const artifactData = state.artifactData;
      let content = `\n Audit Log:\n\n`;

      if (artifactData.approvals.length > 0) {
        content += `  {green-fg}Recent Events{/green-fg}:\n`;
        artifactData.approvals.slice(0, 5).forEach((entry, idx) => {
          const timestamp = new Date().toLocaleTimeString();
          content += `  [${timestamp}] ${JSON.stringify(entry).substring(0, 50)}...\n`;
        });
      } else {
        content += `  {gray-fg}No audit events{/gray-fg}\n`;
        content += `  System ready...\n`;
      }

      this.boxes.audit.setContent(content);
    }

    // Update cognitive field panel
    if (this.boxes.cognitive) {
      const artifactData = state.artifactData;
      let content = `\n Cognitive Field Preview:\n\n`;

      if (artifactData.plans.length > 0) {
        content += `  {cyan-fg}Active Planning Nodes{/cyan-fg}:\n`;
        artifactData.plans.slice(0, 3).forEach((plan, idx) => {
          content += `  Node[${idx + 1}]: Planning in progress...\n`;
        });
      } else {
        content += `  {gray-fg}No active nodes{/gray-fg}\n`;
        content += `  Cognitive field idle...\n`;
      }

      content += `\n  {gray-fg}Read-only view{/gray-fg}\n`;
      this.boxes.cognitive.setContent(content);
    }

    // Re-render the screen
    this.screen.render();
  }

  /**
   * Build the main TUI layout with 2-column design
   */
  private buildLayout(): void {
    // Main header
    const header = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: ' Synth TUI v1.1 - Cognitive Control Console '.padEnd(80),
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.border,
        },
      },
      tags: true,
    });
    this.boxes.header = header;
    this.screen.append(header);

    // Safe mode indicator
    const safeMode = blessed.box({
      top: 3,
      left: 0,
      width: '50%',
      height: 1,
      content: ` ${ICONS.safeMode} 🔒 DISABLED `,
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        bold: true,
      },
      tags: true,
    });
    this.boxes.safeMode = safeMode;
    this.screen.append(safeMode);

    // Kill switch indicator
    const killSwitch = blessed.box({
      top: 3,
      left: '50%',
      width: '50%',
      height: 1,
      content: ` ${ICONS.killSwitch} ✓ INACTIVE `,
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        bold: true,
      },
      tags: true,
    });
    this.boxes.killSwitch = killSwitch;
    this.screen.append(killSwitch);

    // Left column (Sessions, Memory)
    const leftColumn = blessed.box({
      top: 4,
      left: 0,
      width: '50%',
      height: '100%-6',
      border: {
        type: 'line',
      },
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.border,
        },
      },
      tags: true,
    });
    this.boxes.leftColumn = leftColumn;
    this.screen.append(leftColumn);

    // Sessions panel
    const sessions = blessed.box({
      parent: leftColumn,
      top: 0,
      left: 0,
      width: '100%-1',
      height: '50%',
      border: {
        type: 'line',
      },
      label: ` ${ICONS.sessions} `,
      content: '\n Placeholder panel for active sessions\n View/switch sessions, see status',
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.green,
        },
      },
      tags: true,
    });
    this.boxes.sessions = sessions;

    // Memory panel
    const memory = blessed.box({
      parent: leftColumn,
      top: 1,
      left: 0,
      width: '100%-1',
      height: '50%',
      border: {
        type: 'line',
      },
      label: ` ${ICONS.memory} `,
      content: '\n Placeholder panel for memory inspector\n Flash • Warm • Semantic',
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.yellow,
        },
      },
      tags: true,
    });
    this.boxes.memory = memory;

    // Right column (Run, Audit, Cognitive Field)
    const rightColumn = blessed.box({
      top: 4,
      left: '50%',
      width: '50%',
      height: '100%-6',
      border: {
        type: 'line',
      },
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.border,
        },
      },
      tags: true,
    });
    this.boxes.rightColumn = rightColumn;
    this.screen.append(rightColumn);

    // Run panel
    const run = blessed.box({
      parent: rightColumn,
      top: 0,
      left: 0,
      width: '100%-1',
      height: '40%',
      border: {
        type: 'line',
      },
      label: ` ${ICONS.run} `,
      content: '\n Placeholder panel for active run\n View execution steps & status',
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.cyan,
        },
      },
      tags: true,
    });
    this.boxes.run = run;

    // Audit panel
    const audit = blessed.box({
      parent: rightColumn,
      top: 1,
      left: 0,
      width: '100%-1',
      height: '30%',
      border: {
        type: 'line',
      },
      label: ` ${ICONS.audit} `,
      content: '\n Placeholder panel for audit tail\n Recent system events',
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.red,
        },
      },
      tags: true,
    });
    this.boxes.audit = audit;

    // Cognitive Field panel
    const cognitive = blessed.box({
      parent: rightColumn,
      top: 2,
      left: 0,
      width: '100%-1',
      height: '30%',
      border: {
        type: 'line',
      },
      label: ` ${ICONS.cognitive} `,
      content: '\n Placeholder panel for cognitive field preview\n Read-only view of active nodes',
      scrollable: true,
      alwaysScroll: true,
      style: {
        fg: COLORS.text,
        bg: COLORS.bg,
        border: {
          fg: COLORS.gray,
        },
      },
      tags: true,
    });
    this.boxes.cognitive = cognitive;

    // Footer with key hints
    const footer = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 2,
      content: ' [1] Sessions  [2] Memory  [3] Run  [4] Audit  [5] Cognitive  [s] Safe Mode  [k] Kill Switch  [q] Quit ',
      style: {
        fg: COLORS.gray,
        bg: COLORS.bg,
      },
      tags: true,
    });
    this.boxes.footer = footer;
    this.screen.append(footer);

    // Render the screen
    this.screen.render();
  }

  /**
   * Setup global keybindings
   */
  private setupKeybindings(): void {
    // Quit with 'q'
    this.screen.key(['q', 'C-c'], () => {
      this.stop();
    });

    // Toggle safe mode with 's'
    this.screen.key(['s'], () => {
      this.stateStore.toggleSafeMode();
    });

    // Toggle kill switch with 'k'
    this.screen.key(['k'], () => {
      this.stateStore.toggleKillSwitch();
    });

    // Arrow key navigation (placeholder for future implementation)
    this.screen.key(['up'], () => {
      // Placeholder: navigate up
    });

    this.screen.key(['down'], () => {
      // Placeholder: navigate down
    });

    this.screen.key(['left'], () => {
      // Placeholder: navigate left
    });

    this.screen.key(['right'], () => {
      // Placeholder: navigate right
    });

    // Number keys to focus panels (placeholder for future implementation)
    this.screen.key(['1'], () => {
      this.boxes.sessions.focus();
    });

    this.screen.key(['2'], () => {
      this.boxes.memory.focus();
    });

    this.screen.key(['3'], () => {
      this.boxes.run.focus();
    });

    this.screen.key(['4'], () => {
      this.boxes.audit.focus();
    });

    this.screen.key(['5'], () => {
      this.boxes.cognitive.focus();
    });
  }

  /**
   * Start the TUI and enter the event loop
   */
  public start(): void {
    this.screen.render();
    // The screen automatically handles the event loop
  }

  /**
   * Stop the TUI and exit
   */
  public stop(): void {
    // Stop state refresh
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    this.stateStore.stopTick();
    this.stateStore.dispose();

    // Destroy screen
    this.screen.destroy();
    process.exit(0);
  }
}

// Main entry point for the Blessed TUI
export function startBlessedTUI(): void {
  const tui = new BlessedTUI();
  tui.start();
}
