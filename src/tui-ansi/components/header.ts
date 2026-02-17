// Header.ts - Header component showing session and mode

import { BaseComponent, Component, Bounds, KeyPress } from '../component.js';

export interface HeaderConfig {
  session?: string;
  mode?: 'normal' | 'insert' | 'command';
  title?: string;
}

/**
 * Header component - displays session info, mode, and title
 */
export class Header extends BaseComponent {
  private config: HeaderConfig;

  constructor(id: string = 'header', config: HeaderConfig = {}) {
    super(id);
    this.config = {
      session: config.session || 'synth',
      mode: config.mode || 'normal',
      title: config.title || 'Synthium Systema',
    };
    this.bounds = { row: 1, col: 1, height: 1, width: 80 };
  }

  /**
   * Update header configuration
   */
  updateConfig(config: Partial<HeaderConfig>): void {
    this.config = { ...this.config, ...config };
    this.invalidate();
  }

  render(): string[] {
    const width = this.bounds.width;

    // Left side: session info
    const leftPart = ` ${this.config.session} `;

    // Center: title
    const remainingWidth = width - leftPart.length - 2; // -2 for mode indicator
    const centeredTitle = this.pad(this.config.title, remainingWidth, 'center');

    // Right side: mode indicator with colors
    const modeStyles: Record<string, { prefix: string; suffix: string }> = {
      normal: { prefix: '\x1b[34;47m', suffix: '\x1b[0m' }, // blue fg, white bg
      insert: { prefix: '\x1b[32;47m', suffix: '\x1b[0m' }, // green fg, white bg
      command: { prefix: '\x1b[33;47m', suffix: '\x1b[0m' }, // yellow fg, white bg
    };

    const modeStyle = modeStyles[this.config.mode] || modeStyles.normal;
    const modePart = `${modeStyle.prefix} ${this.config.mode.toUpperCase()} ${modeStyle.suffix}`;

    // Compose the header line
    const headerLine = `\x1b[30;47m${leftPart}${centeredTitle}${modePart}\x1b[0m`;

    return [headerLine];
  }

  handleInput(key: KeyPress): boolean {
    // Header doesn't handle input directly
    return false;
  }

  /**
   * Set the current mode
   */
  setMode(mode: 'normal' | 'insert' | 'command'): void {
    this.config.mode = mode;
    this.invalidate();
  }

  /**
   * Get current mode
   */
  getMode(): 'normal' | 'insert' | 'command' {
    return this.config.mode;
  }
}
