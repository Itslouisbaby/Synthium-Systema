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
   * Safely extract a value from an object with a fallback
   */
  private safeGet<T>(obj: any, path: string, fallback: T): T {
    try {
      const keys = path.split('.');
      let current = obj;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return fallback;
        }
      }
      return current !== undefined && current !== null ? current : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Safely parse a date and return formatted string
   */
  private safeFormatDate(date: any, format: 'time' | 'datetime' = 'time'): string {
    try {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      return format === 'time' ? d.toLocaleTimeString() : d.toLocaleString();
    } catch {
      return '';
    }
  }

  /**
   * Render an activation bar (ASCII visualization)
   */
  private renderActivationBar(percentage: number): string {
    const clamped = Math.min(100, Math.max(0, percentage));
    const filled = Math.round(clamped / 10);
    const empty = 10 - filled;
    
    // Color based on activation level
    let barColor = 'gray-fg';
    if (clamped >= 75) {
      barColor = 'green-fg';
    } else if (clamped >= 50) {
      barColor = 'cyan-fg';
    } else if (clamped >= 25) {
      barColor = 'yellow-fg';
    }
    
    const bar = `{${barColor}}[${'█'.repeat(filled)}${'░'.repeat(empty)}]{/${barColor}}`;
    return bar;
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
      let content = `\n {bold}Active Sessions{/bold}:\n\n`;

      // Extract session IDs from active.json
      const sessionIds: string[] = [];
      if (artifactData.active) {
        // Try to extract session ID from active data
        if (artifactData.active.sessionId) {
          sessionIds.push(artifactData.active.sessionId);
        }
        if (artifactData.active.id) {
          sessionIds.push(artifactData.active.id);
        }
        // Also check for nested data
        if (artifactData.active.data && artifactData.active.data.sessionId) {
          sessionIds.push(artifactData.active.data.sessionId);
        }
      }

      // Show session IDs or no session message
      if (sessionIds.length > 0) {
        sessionIds.forEach((sessionId, idx) => {
          const isSelected = state.selectedSession === sessionId;
          const status = artifactData.active?.status || 'running';
          const statusColor = status === 'running' ? 'green' : status === 'error' ? 'red' : 'yellow';
          const marker = isSelected ? '{cyan-fg}→{/cyan-fg}' : '  ';
          content += `  ${marker} {${statusColor}-fg}${status}{/${statusColor}-fg} {cyan-fg}${sessionId.substring(0, 16)}${sessionId.length > 16 ? '...' : ''}{/cyan-fg}\n`;
        });
      } else {
        content += `  {gray-fg}No active sessions{/gray-fg}\n`;
        content += `  {gray-fg}Waiting for session to start...{/gray-fg}\n`;
      }

      content += `\n {bold}Data Sources{/bold}:\n`;
      content += `  {green-fg}●{/green-fg} active.json: ${artifactData.active ? 'Loaded' : '{gray-fg}Not found{/gray-fg}'}\n`;
      content += `  {green-fg}●{/green-fg} plans.jsonl: {cyan-fg}${artifactData.plans.length} plans{/cyan-fg}\n`;
      content += `  {green-fg}●{/green-fg} approvals.json: {cyan-fg}${artifactData.approvals.length} entries{/cyan-fg}\n`;
      content += `\n  Last: {gray-fg}${new Date(state.lastUpdate).toLocaleTimeString()}{/gray-fg}\n`;
      this.boxes.sessions.setContent(content);
    }

    // Update memory panel
    if (this.boxes.memory) {
      const artifactData = state.artifactData;
      let content = `\n {bold}Memory Inspector{/bold}:\n\n`;

      if (artifactData.active) {
        content += `  {yellow-fg}Active Session{/yellow-fg}:\n`;
        content += `  Session ID: {cyan-fg}${artifactData.active.sessionId || artifactData.active.id || 'unknown'}{/cyan-fg}\n`;
        content += `  Created: {gray-fg}${artifactData.active.createdAt || new Date().toISOString()}{/gray-fg}\n`;
        content += `  Status: {green-fg}${artifactData.active.status || 'active'}{/green-fg}\n\n`;

        // Show snippet of active data
        if (artifactData.active.data) {
          const dataStr = JSON.stringify(artifactData.active.data);
          content += `  {gray-fg}Data: ${dataStr.substring(0, 60)}${dataStr.length > 60 ? '...' : ''}{/gray-fg}\n\n`;
        } else if (artifactData.active.metadata) {
          const metaStr = JSON.stringify(artifactData.active.metadata);
          content += `  {gray-fg}Metadata: ${metaStr.substring(0, 60)}${metaStr.length > 60 ? '...' : ''}{/gray-fg}\n\n`;
        }
      } else {
        content += `  {gray-fg}No active session data{/gray-fg}\n\n`;
      }

      // Show plans as memory entries
      if (artifactData.plans.length > 0) {
        content += `  {cyan-fg}Stored Plans{/cyan-fg} ({cyan-fg}${artifactData.plans.length}{/cyan-fg}):\n`;
        artifactData.plans.slice(0, 3).forEach((plan, idx) => {
          const planId = plan.id || plan.sessionId || idx.toString();
          content += `  {green-fg}●{/green-fg} {cyan-fg}${planId.substring(0, 15)}${planId.length > 15 ? '...' : ''}{/cyan-fg}\n`;
        });
        if (artifactData.plans.length > 3) {
          content += `  {gray-fg}... and ${artifactData.plans.length - 3} more{/gray-fg}\n`;
        }
      } else {
        content += `  {gray-fg}No plans stored{/gray-fg}\n`;
      }

      content += `\n  {gray-fg}Flash • Warm • Semantic{/gray-fg}\n`;
      this.boxes.memory.setContent(content);
    }

    // Update run panel
    if (this.boxes.run) {
      const artifactData = state.artifactData;
      let content = `\n {bold}Active Run Status{/bold}:\n\n`;

      if (artifactData.active) {
        // Extract session info
        const sessionId = artifactData.active.sessionId || artifactData.active.id || 'unknown';
        const status = artifactData.active.status || 'unknown';
        const statusColor = status === 'running' ? 'green' : status === 'completed' ? 'cyan' : status === 'error' ? 'red' : 'yellow';

        content += `  Session: {cyan-fg}${sessionId.substring(0, 20)}${sessionId.length > 20 ? '...' : ''}{/cyan-fg}\n`;
        content += `  Status: {${statusColor}-fg}${status.toUpperCase()}{/${statusColor}-fg}\n\n`;

        // Extract run steps from various sources
        let runSteps: any[] = [];

        // Try to get steps from active data
        if (Array.isArray(artifactData.active.steps)) {
          runSteps = artifactData.active.steps;
        } else if (artifactData.active.data && Array.isArray(artifactData.active.data.steps)) {
          runSteps = artifactData.active.data.steps;
        }

        // Show execution steps
        content += `  {bold}Execution Steps{/bold}:\n`;
        if (runSteps.length > 0) {
          runSteps.slice(0, 8).forEach((step, idx) => {
            const stepStatus = step.status || 'pending';
            const stepColor = stepStatus === 'completed' ? 'green' : stepStatus === 'running' ? 'yellow' : stepStatus === 'error' ? 'red' : 'gray';
            const stepName = step.name || step.description || `Step ${idx + 1}`;
            const marker = stepStatus === 'completed' ? '✓' : stepStatus === 'running' ? '◐' : stepStatus === 'error' ? '✗' : '○';
            content += `  {${stepColor}-fg}${marker}{/${stepColor}-fg} {gray-fg}${stepName.substring(0, 40)}${stepName.length > 40 ? '...' : ''}{/gray-fg}\n`;
          });
          if (runSteps.length > 8) {
            content += `  {gray-fg}... and ${runSteps.length - 8} more steps{/gray-fg}\n`;
          }
        } else {
          // Show plans as alternative if no steps
          if (artifactData.plans.length > 0) {
            content += `  {cyan-fg}Available Plans{/cyan-fg} (${artifactData.plans.length}):\n`;
            artifactData.plans.slice(0, 4).forEach((plan, idx) => {
              const planStatus = plan.status || 'pending';
              const planColor = planStatus === 'completed' ? 'green' : planStatus === 'in-progress' ? 'yellow' : 'gray';
              content += `  {${planColor}-fg}${idx + 1}.{/${planColor}-fg} {gray-fg}${JSON.stringify(plan).substring(0, 35)}...{/gray-fg}\n`;
            });
          } else {
            content += `  {gray-fg}No execution steps yet{/gray-fg}\n`;
            content += `  {gray-fg}Waiting for planning...{/gray-fg}\n`;
          }
        }

        content += `\n  Last: {gray-fg}${new Date(state.lastUpdate).toLocaleTimeString()}{/gray-fg}\n`;
      } else {
        content += `  {gray-fg}No active run{/gray-fg}\n`;
        content += `  {gray-fg}Waiting for session to start...{/gray-fg}\n`;
        content += `  {gray-fg}Check sessions panel for details{/gray-fg}\n`;
      }

      this.boxes.run.setContent(content);
    }

    // Update audit panel
    if (this.boxes.audit) {
      const artifactData = state.artifactData;
      let content = `\n {bold}Audit Log{/bold}:\n\n`;

      if (artifactData.approvals.length > 0) {
        content += `  Recent Events ({cyan-fg}${artifactData.approvals.length}{/cyan-fg}):\n\n`;

        artifactData.approvals.slice(0, 6).forEach((entry, idx) => {
          // Extract timestamp and level
          let timestamp = '';
          let level = 'INFO';
          let message = '';

          if (entry.timestamp) {
            const ts = new Date(entry.timestamp);
            if (!isNaN(ts.getTime())) {
              timestamp = ts.toLocaleTimeString();
            } else {
              timestamp = entry.timestamp;
            }
          } else if (entry.createdAt) {
            const ts = new Date(entry.createdAt);
            if (!isNaN(ts.getTime())) {
              timestamp = ts.toLocaleTimeString();
            } else {
              timestamp = entry.createdAt;
            }
          } else {
            timestamp = new Date().toLocaleTimeString();
          }

          // Extract log level
          if (entry.level) {
            level = entry.level.toUpperCase();
          } else if (entry.type) {
            level = entry.type.toUpperCase();
          } else if (entry.status) {
            level = entry.status.toUpperCase();
          }

          // Determine color based on level
          let levelColor = 'gray';
          if (level === 'ERROR' || level === 'FAIL') {
            levelColor = 'red';
          } else if (level === 'WARN' || level === 'WARNING') {
            levelColor = 'yellow';
          } else if (level === 'INFO') {
            levelColor = 'cyan';
          } else if (level === 'SUCCESS' || level === 'OK') {
            levelColor = 'green';
          } else if (level === 'DEBUG') {
            levelColor = 'gray';
          }

          // Extract message
          if (entry.message) {
            message = entry.message;
          } else if (entry.description) {
            message = entry.description;
          } else if (entry.action) {
            message = entry.action;
          } else {
            message = JSON.stringify(entry).substring(0, 50);
          }

          content += `  {${levelColor}-fg}[${level}]{/${levelColor}-fg} {gray-fg}${timestamp}{/gray-fg}\n`;
          content += `    {gray-fg}${message.substring(0, 55)}${message.length > 55 ? '...' : ''}{/gray-fg}\n\n`;
        });
      } else if (artifactData.plans.length > 0) {
        // Use plans as audit fallback
        content += `  {cyan-fg}Planning Activity{/cyan-fg} ({cyan-fg}${artifactData.plans.length}{/cyan-fg}):\n\n`;
        artifactData.plans.slice(0, 4).forEach((plan, idx) => {
          const timestamp = plan.timestamp || plan.createdAt || '';
          const ts = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
          const status = plan.status || 'pending';
          const statusColor = status === 'completed' ? 'green' : status === 'error' ? 'red' : 'cyan';
          content += `  {${statusColor}-fg}[${status.toUpperCase()}]{/${statusColor}-fg} {gray-fg}${ts}{/gray-fg}\n`;
          content += `    {gray-fg}${JSON.stringify(plan).substring(0, 50)}...{/gray-fg}\n\n`;
        });
      } else {
        content += `  {gray-fg}No audit events{/gray-fg}\n`;
        content += `  {gray-fg}System ready...{/gray-fg}\n`;
      }

      this.boxes.audit.setContent(content);
    }

    // Update cognitive field panel
    if (this.boxes.cognitive) {
      const runtimeData = this.stateStore.getRuntimeData();
      let content = `\n {bold}Cognitive Field Preview{/bold}:\n\n`;

      if (!runtimeData.hasRuntime) {
        content += `  {gray-fg}Runtime disabled or not present{/gray-fg}\n`;
        content += `  {gray-fg}.synth/runtime/ directory not found{/gray-fg}\n\n`;
      } else if (runtimeData.fieldError || runtimeData.signalsError) {
        // Show parse errors
        if (runtimeData.fieldError) {
          content += `  {red-fg}Error reading field.jsonl:{/red-fg}\n`;
          content += `  {gray-fg}${runtimeData.fieldError.substring(0, 50)}${runtimeData.fieldError.length > 50 ? '...' : ''}{/gray-fg}\n\n`;
        }
        if (runtimeData.signalsError) {
          content += `  {red-fg}Error reading signals.jsonl:{/red-fg}\n`;
          content += `  {gray-fg}${runtimeData.signalsError.substring(0, 50)}${runtimeData.signalsError.length > 50 ? '...' : ''}{/gray-fg}\n\n`;
        }
      } else {
        // Display top active nodes with activation bars
        if (runtimeData.field.length > 0) {
          content += `  {bold}Top Active Nodes{/bold} ({cyan-fg}${runtimeData.field.length}{/cyan-fg}):\n\n`;
          
          // Extract nodes and sort by activation
          const nodes = runtimeData.field
            .filter(item => item && (item.activation !== undefined || item.activationLevel !== undefined))
            .map(item => ({
              nodeId: item.nodeId || item.id || item.name || 'unknown',
              activation: item.activation !== undefined ? item.activation : (item.activationLevel || 0),
              signal: item.signal || '',
              attention: item.attention || '',
              timestamp: item.timestamp || ''
            }))
            .sort((a, b) => b.activation - a.activation);

          if (nodes.length > 0) {
            nodes.slice(0, 6).forEach(node => {
              const bar = this.renderActivationBar(node.activation);
              const activationPercent = Math.min(100, Math.max(0, node.activation)).toFixed(1);
              const nodeIdDisplay = node.nodeId.length > 18 ? node.nodeId.substring(0, 18) + '..' : node.nodeId;
              content += `  {cyan-fg}${nodeIdDisplay.padEnd(20)}{/cyan-fg} ${bar} {white-fg}${activationPercent}%{/white-fg}\n`;
            });

            // Show attention focus if available
            const focused = nodes.find(n => n.attention && n.attention.trim() !== '');
            if (focused) {
              content += `\n  {yellow-fg}Attention{/yellow-fg}: {cyan-fg}${focused.attention.substring(0, 40)}${focused.attention.length > 40 ? '...' : ''}{/cyan-fg}\n`;
            }

            // Display recent signals
            const signalsWithText = runtimeData.signals
              .filter(item => item && item.signal !== undefined && item.signal !== '')
              .slice(-3);

            if (signalsWithText.length > 0) {
              content += `\n  {bold}Recent Signals{/bold}:\n`;
              signalsWithText.forEach(sig => {
                const signalText = typeof sig.signal === 'string' ? sig.signal : JSON.stringify(sig.signal);
                content += `  {gray-fg}→ ${signalText.substring(0, 45)}${signalText.length > 45 ? '...' : ''}{/gray-fg}\n`;
              });
            }
          } else {
            content += `  {gray-fg}No active nodes found{/gray-fg}\n`;
          }
        } else {
          content += `  {gray-fg}No field data present{/gray-fg}\n`;
          content += `  {gray-fg}field.jsonl: {red-fg}empty{/red-fg}{/gray-fg}\n\n`;
          
          if (runtimeData.signals.length > 0) {
            content += `  {bold}Recent Signals{/bold} ({cyan-fg}${runtimeData.signals.length}{/cyan-fg}):\n`;
            const recentSignals = runtimeData.signals.slice(-5);
            recentSignals.forEach(sig => {
              const signalText = sig.signal || JSON.stringify(sig);
              content += `  {gray-fg}→ ${signalText.substring(0, 45)}${signalText.length > 45 ? '...' : ''}{/gray-fg}\n`;
            });
          }
        }

        // Last update timestamp
        const lastUpdateTime = new Date(runtimeData.lastUpdate);
        content += `\n  {gray-fg}Updated: ${lastUpdateTime.toLocaleTimeString()}{/gray-fg}\n`;
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
