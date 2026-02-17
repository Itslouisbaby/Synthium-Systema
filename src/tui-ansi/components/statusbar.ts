// StatusBar.ts - Status bar showing TUI state

import { BaseComponent, Component, Bounds, KeyPress } from '../component.js';

export type TUIStatus = 'idle' | 'thinking' | 'awaiting' | 'safe' | 'error';

export interface StatusBarConfig {
  position?: 'top' | 'bottom';
  showShortcuts?: boolean;
}

export interface StatusInfo {
  status: TUIStatus;
  message?: string;
  timestamp?: string;
}

/**
 * StatusBar component - displays current status and helpful hints
 */
export class StatusBar extends BaseComponent {
  private currentStatus: StatusInfo = {
    status: 'idle',
    message: '',
  };
  private readonly config: Required<StatusBarConfig>;

  constructor(id: string = 'statusbar', config: StatusBarConfig = {}) {
    super(id);
    this.config = {
      position: config.position || 'bottom',
      showShortcuts: config.showShortcuts !== undefined ? config.showShortcuts : true,
    };
    this.bounds = { row: 1, col: 1, height: 1, width: 80 };
  }

  /**
   * Set the current status
   */
  setStatus(status: TUIStatus, message?: string): void {
    this.currentStatus = {
      status,
      message: message || this.getDefaultMessage(status),
      timestamp: new Date().toLocaleTimeString(),
    };
    this.invalidate();
  }

  /**
   * Update status message
   */
  updateMessage(message: string): void {
    this.currentStatus.message = message;
    this.invalidate();
  }

  /**
   * Get default message for status
   */
  private getDefaultMessage(status: TUIStatus): string {
    const messages: Record<TUIStatus, string> = {
      idle: 'Ready',
      thinking: 'Processing...',
      awaiting: 'Waiting for input',
      safe: 'Safe mode enabled',
      error: 'Error occurred',
    };
    return messages[status] || '';
  }

  render(): string[] {
    const width = this.bounds.width;

    // Status-specific styling
    const statusStyles: Record<TUIStatus, { prefix: string; label: string }> = {
      idle: { prefix: '\x1b[32m', label: 'IDLE' }, // green
      thinking: { prefix: '\x1b[33m', label: 'THINKING' }, // yellow
      awaiting: { prefix: '\x1b[34m', label: 'AWAITING' }, // blue
      safe: { prefix: '\x1b[36m', label: 'SAFE' }, // cyan
      error: { prefix: '\x1b[31m', label: 'ERROR' }, // red
    };

    const style = statusStyles[this.currentStatus.status];
    const reset = '\x1b[0m';

    // Build left side: [STATUS] message
    const leftPart = `${style.prefix}[${style.label}]${this.currentStatus.message}${reset}`;

    // Build right side: shortcuts
    let rightPart = '';
    if (this.config.showShortcuts) {
      const shortcuts = this.getShortcuts();
      rightPart = `\x1b[90m${shortcuts}${reset}`;
    }

    // Calculate padding
    const totalPadding = width - leftPart.length - rightPart.length;
    const padding = Math.max(1, totalPadding);

    // Compose status bar
    const statusLine = `\x1b[30;47m${leftPart}${' '.repeat(padding)}${rightPart}\x1b[0m`;

    return [statusLine];
  }

  /**
   * Get keyboard shortcuts display
   */
  private getShortcuts(): string {
    const shortcuts: string[] = [];

    if (this.currentStatus.status === 'thinking' || this.currentStatus.status === 'awaiting') {
      shortcuts.push('^C=Cancel');
    } else {
      shortcuts.push('^C=Exit');
      shortcuts.push('PgUp/Dn=Scroll');
    }

    return shortcuts.join(' │ ');
  }

  handleInput(key: KeyPress): boolean {
    // StatusBar doesn't handle input directly
    return false;
  }

  /**
   * Get current status
   */
  getCurrentStatus(): StatusInfo {
    return { ...this.currentStatus };
  }

  /**
   * Set position (top or bottom)
   */
  setPosition(position: 'top' | 'bottom'): void {
    this.config.position = position;
    this.invalidate();
  }
}
