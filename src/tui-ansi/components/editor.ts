// Editor Component - Multi-line text input for ANSI TUI
// Handles typing, line editing, cursor position, and submission

import {
  BaseComponent,
  KeyPress,
  Bounds,
} from '../component.js';
import {
  ANSI,
  SemanticColors,
  TextStyler,
} from '../types.js';

/**
 * Editor events that can be triggered
 */
export type EditorEvent =
  | { type: 'submit'; content: string }
  | { type: 'abort' }
  | { type: 'clear' }
  | { type: 'autocomplete'; content: string };

/**
 * Editor event handler callback
 */
export type EditorEventHandler = (event: EditorEvent) => void;

/**
 * Cursor position tracking
 */
interface CursorPosition {
  line: number; // Line index (0-based)
  column: number; // Column within line (0-based)
}

/**
 * Editor component - Multi-line text input
 */
export class Editor extends BaseComponent {
  private lines: string[]; // Lines of text
  private cursor: CursorPosition; // Current cursor position
  private placeholder: string;
  private prompt: string;
  private modified: boolean; // Track if content was modified
  private onEvent?: EditorEventHandler;

  constructor(id: string = 'editor', bounds?: Bounds, config?: { placeholder?: string; prompt?: string; onEvent?: EditorEventHandler }) {
    super(id, bounds);
    this.lines = [''];
    this.cursor = { line: 0, column: 0 };
    this.placeholder = config?.placeholder ?? 'Type your message...';
    this.prompt = config?.prompt ?? '>';
    this.modified = false;
    this.onEvent = config?.onEvent;
  }

  /**
   * Set event handler for editor actions
   */
  setEventHandler(handler: EditorEventHandler | undefined): void {
    this.onEvent = handler;
  }

  /**
   * Get the current content as a single string
   */
  getContent(): string {
    return this.lines.join('\n');
  }

  /**
   * Set the content (replaces existing content)
   */
  setContent(content: string): void {
    this.lines = content.split('\n');
    if (this.lines.length === 0) {
      this.lines = [''];
    }
    this.cursor = {
      line: this.lines.length - 1,
      column: this.lines[this.lines.length - 1].length,
    };
    this.modified = false;
    this.invalidate();
  }

  /**
   * Clear the editor
   */
  clear(): void {
    this.lines = [''];
    this.cursor = { line: 0, column: 0 };
    this.modified = false;
    this.invalidate();
  }

  /**
   * Check if content was modified
   */
  isModified(): boolean {
    return this.modified;
  }

  /**
   * Set placeholder text
   */
  setPlaceholder(placeholder: string): void {
    this.placeholder = placeholder;
    this.invalidate();
  }

  /**
   * Get cursor position
   */
  getCursor(): CursorPosition {
    return { ...this.cursor };
  }

  /**
   * Set cursor position
   */
  setCursor(line: number, column: number): void {
    this.cursor.line = Math.max(0, Math.min(this.lines.length - 1, line));
    this.cursor.column = Math.max(
      0,
      Math.min(this.lines[this.cursor.line].length, column)
    );
    this.invalidate();
  }

  /**
   * Insert a character at cursor position
   */
  private insertChar(char: string): void {
    const currentLine = this.lines[this.cursor.line];
    const before = currentLine.substring(0, this.cursor.column);
    const after = currentLine.substring(this.cursor.column);
    this.lines[this.cursor.line] = before + char + after;
    this.cursor.column++;
    this.modified = true;
    this.invalidate();
  }

  /**
   * Delete character before cursor (backspace)
   */
  private deleteBackward(): void {
    if (this.cursor.column > 0) {
      const currentLine = this.lines[this.cursor.line];
      const before = currentLine.substring(0, this.cursor.column - 1);
      const after = currentLine.substring(this.cursor.column);
      this.lines[this.cursor.line] = before + after;
      this.cursor.column--;
      this.modified = true;
    } else if (this.cursor.line > 0) {
      // Join with previous line
      const prevLine = this.lines[this.cursor.line - 1];
      const currentLine = this.lines[this.cursor.line];
      this.lines[this.cursor.line - 1] = prevLine + currentLine;
      this.cursor.column = prevLine.length;
      this.lines.splice(this.cursor.line, 1);
      this.cursor.line--;
      this.modified = true;
    }
    this.invalidate();
  }

  /**
   * Delete character at cursor
   */
  private deleteForward(): void {
    const currentLine = this.lines[this.cursor.line];
    if (this.cursor.column < currentLine.length) {
      const before = currentLine.substring(0, this.cursor.column);
      const after = currentLine.substring(this.cursor.column + 1);
      this.lines[this.cursor.line] = before + after;
      this.modified = true;
    } else if (this.cursor.line < this.lines.length - 1) {
      // Join with next line
      const nextLine = this.lines[this.cursor.line + 1];
      this.lines[this.cursor.line] = currentLine + nextLine;
      this.lines.splice(this.cursor.line + 1, 1);
      this.modified = true;
    }
    this.invalidate();
  }

  /**
   * Move cursor left
   */
  private moveLeft(): void {
    if (this.cursor.column > 0) {
      this.cursor.column--;
    } else if (this.cursor.line > 0) {
      this.cursor.line--;
      this.cursor.column = this.lines[this.cursor.line].length;
    }
    this.invalidate();
  }

  /**
   * Move cursor right
   */
  private moveRight(): void {
    const currentLine = this.lines[this.cursor.line];
    if (this.cursor.column < currentLine.length) {
      this.cursor.column++;
    } else if (this.cursor.line < this.lines.length - 1) {
      this.cursor.line++;
      this.cursor.column = 0;
    }
    this.invalidate();
  }

  /**
   * Move cursor up
   */
  private moveUp(): void {
    if (this.cursor.line > 0) {
      this.cursor.line--;
      const targetLine = this.lines[this.cursor.line];
      this.cursor.column = Math.min(this.cursor.column, targetLine.length);
    }
    this.invalidate();
  }

  /**
   * Move cursor down
   */
  private moveDown(): void {
    if (this.cursor.line < this.lines.length - 1) {
      this.cursor.line++;
      const targetLine = this.lines[this.cursor.line];
      this.cursor.column = Math.min(this.cursor.column, targetLine.length);
    }
    this.invalidate();
  }

  /**
   * Start a new line at cursor position
   */
  private newline(): void {
    const currentLine = this.lines[this.cursor.line];
    const before = currentLine.substring(0, this.cursor.column);
    const after = currentLine.substring(this.cursor.column);
    this.lines[this.cursor.line] = before;
    this.lines.splice(this.cursor.line + 1, 0, after);
    this.cursor.line++;
    this.cursor.column = 0;
    this.modified = true;
    this.invalidate();
  }

  /**
   * Handle keyboard input
   */
  handleInput(key: KeyPress): boolean {
    const keyStr = key.name ?? key.sequence;

    // Handle Enter/Return to submit
    if (keyStr === 'return' || keyStr === 'enter') {
      if (this.lines.length === 1 && this.lines[0] === '') {
        // Empty single line, ignore
        return false;
      }
      // Submit content
      const content = this.getContent();
      this.clear();
      if (this.onEvent) {
        this.onEvent({ type: 'submit', content });
      }
      return true;
    }

    // Escape to abort/cancel current input
    if (keyStr === 'escape') {
      this.clear();
      if (this.onEvent) {
        this.onEvent({ type: 'abort' });
      }
      return true;
    }

    // Ctrl+C to clear editor
    if (key.ctrl && keyStr === 'c') {
      this.clear();
      if (this.onEvent) {
        this.onEvent({ type: 'clear' });
      }
      return true;
    }

    // Tab autocomplete (stub)
    if (keyStr === 'tab') {
      const content = this.getContent();
      if (this.onEvent) {
        this.onEvent({ type: 'autocomplete', content });
      }
      return true;
    }

    // Cursor movement keys
    if (keyStr === 'left' || (key.ctrl && keyStr === 'b')) {
      this.moveLeft();
      return true;
    }

    if (keyStr === 'right' || (key.ctrl && keyStr === 'f')) {
      this.moveRight();
      return true;
    }

    if (keyStr === 'up' || (key.ctrl && keyStr === 'p')) {
      this.moveUp();
      return true;
    }

    if (keyStr === 'down' || (key.ctrl && keyStr === 'n')) {
      this.moveDown();
      return true;
    }

    if (keyStr === 'home' || (key.ctrl && keyStr === 'a')) {
      this.cursor.column = 0;
      this.invalidate();
      return true;
    }

    if (keyStr === 'end' || (key.ctrl && keyStr === 'e')) {
      this.cursor.column = this.lines[this.cursor.line].length;
      this.invalidate();
      return true;
    }

    // Delete keys
    if (keyStr === 'backspace' || (key.ctrl && keyStr === 'h')) {
      this.deleteBackward();
      return true;
    }

    if (keyStr === 'delete') {
      this.deleteForward();
      return true;
    }

    // Line break (Ctrl+M, Ctrl+J)
    if ((key.ctrl && keyStr === 'm') || (key.ctrl && keyStr === 'j')) {
      this.newline();
      return true;
    }

    // Handle regular characters (printable ASCII)
    if (key.sequence.length === 1 && key.sequence.charCodeAt(0) >= 32 && key.sequence.charCodeAt(0) < 127) {
      this.insertChar(key.sequence);
      return true;
    }

    return false;
  }

  /**
   * Render the editor to lines
   */
  render(): string[] {
    const outputLines: string[] = [];
    const maxWidth = this.bounds.width;
    const isEmpty = this.lines.length === 1 && this.lines[0] === '';

    // Render lines
    for (let i = 0; i < Math.min(this.lines.length, this.bounds.height); i++) {
      const line = this.lines[i];
      const isCursorLine = i === this.cursor.line;

      // Build prompt
      const prompt = i === 0 ? this.prompt : '  ';
      const promptStyle = isCursorLine
        ? SemanticColors.info
        : ANSI.dim;

      // Build content line
      let content: string;
      if (isEmpty && i === 0) {
        // Show placeholder
        content = TextStyler.dim(this.placeholder);
      } else {
        // Truncate line if too long
        const availableWidth = Math.max(1, maxWidth - prompt.length - 1);
        const displayLine = TextStyler.truncate(line, availableWidth);
        content = TextStyler.bright(displayLine);
      }

      // Render line with prompt prefix
      const promptPrefix = TextStyler.fg(prompt, promptStyle);
      const fullLine = promptPrefix + ' ' + content;

      // Pad to full width
      outputLines.push(fullLine.padEnd(maxWidth));
    }

    // Pad to fill maxLines
    while (outputLines.length < this.bounds.height) {
      const promptPrefix = TextStyler.fg(this.prompt, SemanticColors.info);
      const line = promptPrefix + ' '.repeat(maxWidth - promptPrefix.length);
      outputLines.push(line);
    }

    return outputLines;
  }
}

/**
 * Helper function to create an Editor component
 */
export function createEditor(id?: string, bounds?: Bounds, config?: { placeholder?: string; prompt?: string; onEvent?: EditorEventHandler }): Editor {
  return new Editor(id, bounds, config);
}
