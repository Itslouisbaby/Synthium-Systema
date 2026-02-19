// TUI Panels - Sessions, Memory, Run View, Audit Tail, Cognitive Field

import { theme, ExecutionStatus } from './theme.js';

export interface SessionData {
  id: string;
  status: ExecutionStatus;
  lastUpdated: string;
  messageCount: number;
  totalCost: number;
}

export interface MemoryData {
  flash: number;
  warm: number;
  semantic: number;
}

export interface RunStep {
  stepId: string;
  action: string;
  status: ExecutionStatus;
  timestamp: string;
  toolResult?: string;
}

export interface AuditData {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface CognitiveNode {
  nodeId: string;
  activation: number;  // 0-100
  signal: string;
  attention: string;
}

export class TUIpanels {
  private theme = theme;

  // Sessions Panel
  renderSessions(sessions: SessionData[]): void {
    console.log('');
    console.log(`${this.theme.icons.sessions} SESSIONS`);
    console.log('─'.repeat(40));
    
    if (sessions.length === 0) {
      console.log('  No active sessions');
      return;
    }

    sessions.forEach(session => {
      const icon = this.getStatusIcon(session.status);
      const line = `  ${icon} ${session.id.padEnd(12)} ${session.status.padEnd(8)} ${session.messageCount}msgs`;
      console.log(line);
    });
  }

  // Memory Panel
  renderMemory(memory: MemoryData): void {
    console.log('');
    console.log(`${this.theme.icons.memory} MEMORY`);
    console.log('─'.repeat(40));
    console.log(`  Flash:    ${memory.flash} entries`);
    console.log(`  Warm:     ${memory.warm} entries`);
    console.log(`  Semantic: ${memory.semantic} facts`);
  }

  // Active Run Panel
  renderRunView(steps: RunStep[]): void {
    console.log('');
    console.log(`${this.theme.icons.run} ACTIVE RUN`);
    console.log('─'.repeat(40));

    if (steps.length === 0) {
      console.log('  No active run');
      return;
    }

    steps.forEach(step => {
      const icon = this.getStatusIcon(step.status);
      const line = `  ${icon} ${step.action} (${step.stepId})`;
      console.log(line);
    });
  }

  // Audit Tail Panel
  renderAuditTail(entries: AuditData[], limit: number = 10): void {
    console.log('');
    console.log(`${this.theme.icons.audit} AUDIT TAIL`);
    console.log('─'.repeat(40));

    const recent = entries.slice(-limit);
    recent.forEach(entry => {
      const color = entry.level === 'error' ? this.theme.colors.danger 
                  : entry.level === 'warn' ? this.theme.colors.warning
                  : this.theme.colors.info;
      const line = `  [${entry.timestamp}] ${entry.message}`;
      console.log(line);
    });
  }

  // Cognitive Field Preview Panel
  renderCognitiveField(nodes: CognitiveNode[], hasRuntime: boolean): void {
    console.log('');
    console.log(`${this.theme.icons.cognitive} COGNITIVE FIELD PREVIEW`);
    console.log('─'.repeat(40));

    if (!hasRuntime) {
      console.log('  Runtime disabled or not present');
      return;
    }

    if (nodes.length === 0) {
      console.log('  No active nodes');
      return;
    }

    // Top active nodes with activation bars
    console.log('  Top Active Nodes:');
    nodes.slice(0, 5).forEach(node => {
      const bar = this.renderActivationBar(node.activation);
      console.log(`    ${node.nodeId} ${bar} ${node.activation.toFixed(1)}%`);
    });

    // Recent signals
    console.log('');
    console.log('  Recent Signals:');
    nodes.slice(0, 3).forEach(node => {
      if (node.signal) {
        console.log(`    → ${node.signal}`);
      }
    });

    // Current attention focus
    const focused = nodes.find(n => n.attention && n.attention !== '');
    if (focused) {
      console.log('');
      console.log(`  Attention: ${focused.attention}`);
    }
  }

  private getStatusIcon(status: ExecutionStatus): string {
    return theme.icons[status] || theme.icons.idle;
  }

  private renderActivationBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }
}

export const panels = new TUIpanels();
