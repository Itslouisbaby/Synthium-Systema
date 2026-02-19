// Theme and visual system for Synth TUI
// Semantic colors for consistent styling

export type ThemeColor = string;

export interface Theme {
  colors: {
    success: ThemeColor;    // allowed, executed
    warning: ThemeColor;    // awaiting approval
    danger: ThemeColor;     // blocked, failed
    info: ThemeColor;       // running, selected
    dim: ThemeColor;        // skipped, idle
    background: ThemeColor;
    text: ThemeColor;
    border: ThemeColor;
  };
  icons: {
    executed: string;       // ✅
    awaiting: string;       // ⏳
    blocked: string;        // ⛔
    failed: string;         // ⚠
    skipped: string;        // ⏭
    running: string;        // ▶
    idle: string;           // ●
    sessions: string;
    memory: string;
    run: string;
    audit: string;
    cognitive: string;
    safeMode: string;
    killSwitch: string;
  };
}

export const theme: Theme = {
  colors: {
    success: '#22c55e',     // green-500
    warning: '#eab308',     // yellow-500
    danger: '#ef4444',      // red-500
    info: '#3b82f6',        // blue-500
    dim: '#6b7280',         // gray-500
    background: '#0f172a',  // slate-900
    text: '#e2e8f0',        // slate-200
    border: '#334155',      // slate-700
  },
  icons: {
    executed: '✅',
    awaiting: '⏳',
    blocked: '⛔',
    failed: '⚠',
    skipped: '⏭',
    running: '▶',
    idle: '●',
    sessions: '[SESSIONS]',
    memory: '[MEMORY]',
    run: '[RUN]',
    audit: '[AUDIT]',
    cognitive: '[COGNITIVE FIELD]',
    safeMode: '[SAFE MODE]',
    killSwitch: '[KILL SWITCH]',
  },
};

// Status helpers
export type ExecutionStatus = 'executed' | 'awaiting' | 'blocked' | 'failed' | 'skipped' | 'running' | 'idle';

export function getStatusColor(status: ExecutionStatus): ThemeColor {
  switch (status) {
    case 'executed': return theme.colors.success;
    case 'awaiting': return theme.colors.warning;
    case 'blocked': return theme.colors.danger;
    case 'failed': return theme.colors.danger;
    case 'skipped': return theme.colors.dim;
    case 'running': return theme.colors.info;
    case 'idle': return theme.colors.dim;
    default: return theme.colors.text;
  }
}

export function getStatusIcon(status: ExecutionStatus): string {
  switch (status) {
    case 'executed': return theme.icons.executed;
    case 'awaiting': return theme.icons.awaiting;
    case 'blocked': return theme.icons.blocked;
    case 'failed': return theme.icons.failed;
    case 'skipped': return theme.icons.skipped;
    case 'running': return theme.icons.running;
    case 'idle': return theme.icons.idle;
    default: return theme.icons.idle;
  }
}
