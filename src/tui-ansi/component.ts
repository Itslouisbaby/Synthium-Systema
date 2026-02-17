// component.ts - Base interface and class for all TUI components

import { Terminal, KeyPress } from './terminal.js';

export interface Bounds {
  row: number;
  col: number;
  height: number;
  width: number;
}

export interface InputEvent {
  key: KeyPress;
  bubble: boolean;
  handled: boolean;
}

export type InputHandler = (event: InputEvent) => void;

/**
 * Base Component interface - all TUI components implement this
 */
export interface Component {
  /**
   * Render the component to an array of lines
   * @returns Array of strings representing the rendered output
   */
  render(): string[];

  /**
   * Handle keyboard input
   * @param key The key press event
   * @returns true if input was handled, false if it should bubble up
   */
  handleInput(key: KeyPress): boolean;

  /**
   * Mark component as needing re-render
   */
  invalidate(): void;

  /**
   * Get component ID
   */
  getId(): string;

  /**
   * Set component bounds in the terminal
   */
  setBounds(bounds: Bounds): void;

  /**
   * Get component bounds
   */
  getBounds(): Bounds;

  /**
   * Check if component needs re-rendering
   */
  isDirty(): boolean;

  /**
   * Mark component as clean (just rendered)
   */
  markClean(): void;

  /**
   * Get parent component
   */
  getParent(): Component | null;

  /**
   * Set parent component
   */
  setParent(parent: Component | null): void;
}

/**
 * Base implementation of Component interface
 */
export abstract class BaseComponent implements Component {
  protected id: string;
  protected bounds: Bounds;
  protected dirty: boolean = true;
  protected parent: Component | null = null;

  constructor(id: string, bounds?: Bounds) {
    this.id = id;
    this.bounds = bounds ?? { row: 1, col: 1, height: 10, width: 80 };
  }

  // Abstract methods - must be implemented by subclasses
  abstract render(): string[];
  abstract handleInput(key: KeyPress): boolean;

  // Default implementations
  invalidate(): void {
    this.dirty = true;
    // Propagate dirty flag up to parent
    if (this.parent) {
      this.parent.invalidate();
    }
  }

  markClean(): void {
    this.dirty = false;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  getId(): string {
    return this.id;
  }

  setBounds(bounds: Bounds): void {
    this.bounds = { ...bounds };
    this.invalidate();
  }

  getBounds(): Bounds {
    return { ...this.bounds };
  }

  getParent(): Component | null {
    return this.parent;
  }

  setParent(parent: Component | null): void {
    this.parent = parent;
  }

  /**
   * Helper: Get internal dimensions (padding-aware if needed)
   */
  protected getInnerBounds(padding: number = 0): Bounds {
    return {
      row: this.bounds.row + padding,
      col: this.bounds.col + padding,
      height: Math.max(1, this.bounds.height - padding * 2),
      width: Math.max(1, this.bounds.width - padding * 2),
    };
  }

  /**
   * Helper: Truncate string to fit a width
   */
  protected truncate(str: string, maxWidth: number, suffix: string = '…'): string {
    if (str.length <= maxWidth) return str;
    return str.slice(0, maxWidth - suffix.length) + suffix;
  }

  /**
   * Helper: Pad string to fill a width
   */
  protected pad(str: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
    if (str.length >= width) return str;

    const padStr = ' '.repeat(width - str.length);
    switch (align) {
      case 'center':
        const leftPad = Math.floor(padStr.length / 2);
        const rightPad = padStr.length - leftPad;
        return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
      case 'right':
        return padStr + str;
      default:
        return str + padStr;
    }
  }
}
