// Synth TUI v1.1 - Cognitive Control Console (Blessed Framework)
// Main TUI application with Blessed screens and layout

import * as blessed from 'blessed';

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

  constructor() {
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
      content: ' [1] Sessions  [2] Memory  [3] Run  [4] Audit  [5] Cognitive  [q] Quit  [↑↓←→] Navigate ',
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
      return process.exit(0);
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
    this.screen.destroy();
    process.exit(0);
  }
}

// Main entry point for the Blessed TUI
export function startBlessedTUI(): void {
  const tui = new BlessedTUI();
  tui.start();
}
