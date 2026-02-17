// engine.ts - TUI engine with differential rendering

import { Terminal, KeyPress } from './terminal.js';
import { Component } from './component.js';
import { Container } from './container.js';

export interface RenderOptions {
  skipDiff?: boolean; // For testing - force full re-render
}

export interface DiffResult {
  linesChanged: number;
  renderTime: number;
}

/**
 * TUI Engine - manages the render loop and differential rendering
 */
export class TUIEngine {
  private terminal: Terminal;
  private rootContainer: Container | null = null;
  private previousRender: string[] = [];
  private isRunning: boolean = false;
  private renderInterval: NodeJS.Timeout | null = null;
  private inputCleanup: (() => void) | null = null;

  constructor(terminal?: Terminal) {
    this.terminal = terminal ?? new Terminal();
  }

  /**
   * Initialize the engine
   */
  init(rootComponent: Component): void {
    if (!(rootComponent instanceof Container)) {
      throw new Error('Root component must be a Container');
    }

    this.rootContainer = rootComponent;

    // Set root bounds to fill terminal
    const size = this.terminal.getSize();
    this.rootContainer.setBounds({
      row: 1,
      col: 1,
      height: size.rows,
      width: size.cols,
    });
  }

  /**
   * Start the render loop
   */
  start(renderInterval: number = 16): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.terminal.setupRawMode();
    this.terminal.resumeInput();
    this.terminal.hideCursor();
    this.terminal.clearScreen();

    // Initial render
    this.render();

    // Set up render loop (batches updates via process.nextTick)
    this.renderInterval = setInterval(() => {
      if (this.rootContainer?.isDirty()) {
        this.render();
      }
    }, renderInterval);
  }

  /**
   * Stop the engine
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }

    if (this.inputCleanup) {
      this.inputCleanup();
      this.inputCleanup = null;
    }

    this.terminal.pauseInput();
    this.terminal.showCursor();
    this.terminal.cleanup();
  }

  /**
   * Listen for keyboard input
   */
  onKey(callback: (key: KeyPress) => void): void {
    this.terminal.onKey((key: KeyPress) => {
      // Always route to callback first (for engine-level handling)
      callback(key);

      // Then route to root container
      if (this.rootContainer) {
        const handled = this.rootContainer.handleInput(key);
        // If handled, invalidate and re-render
        if (handled) {
          // Re-render will happen on next interval tick
        }
      }
    });
  }

  /**
   * Enable Ctrl+C to exit
   */
  enableExitOnCtrlC(shouldExit: boolean = true): void {
    this.terminal.enableExitOnCtrlC(shouldExit);
  }

  /**
   * Render the current state using differential updating
   */
  render(options?: RenderOptions): DiffResult {
    if (!this.rootContainer) {
      return { linesChanged: 0, renderTime: 0 };
    }

    const startTime = performance.now();

    // Get fresh terminal size and update root bounds
    const size = this.terminal.getSize();
    this.rootContainer.setBounds({
      row: 1,
      col: 1,
      height: size.rows,
      width: size.cols,
    });

    // Render component tree -> array of strings
    const newRender = this.rootContainer.render();

    // Differential update
    const linesChanged = options?.skipDiff
      ? newRender.length
      : this.differentialUpdate(this.previousRender, newRender);

    // Mark root as clean
    this.rootContainer.markClean();

    // Save for next comparison
    this.previousRender = newRender;

    const renderTime = performance.now() - startTime;

    return { linesChanged, renderTime };
  }

  /**
   * Differential rendering algorithm
   * Compares previous and new render outputs, only writes changed lines
   */
  private differentialUpdate(previous: string[], current: string[]): number {
    const maxLines = Math.max(previous.length, current.length);
    let changesWritten = 0;

    // We'll batch updates in a buffer
    const updates: Array<{ row: number; line: string }> = [];

    // Line-by-line comparison
    for (let row = 0; row < maxLines; row++) {
      const prevLine = previous[row] || '';
      const currLine = current[row] || '';

      // Check if line changed
      if (currLine !== prevLine) {
        updates.push({ row: row + 1, line: currLine });
      }
    }

    // Batch update: move cursor to first changed line, then write sequentially
    if (updates.length > 0) {
      // Move to first different line
      this.terminal.moveTo(updates[0].row, 1);

      // Write each changed line, moving down
      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];
        const line = update.line.padEnd(this.terminal.getSize().cols);

        // Clear line and write new content
        this.terminal.write(Terminal.ANSI.clearLine);
        this.terminal.write(line);
        changesWritten++;

        // Move to next line unless it's the last update
        if (i < updates.length - 1) {
          const nextRow = updates[i + 1].row;
          const currentRow = update.row;
          const rowDiff = nextRow - currentRow;

          if (rowDiff === 1) {
            // Adjacent, just move down
            this.terminal.write(Terminal.ANSI.cursorDown(1));
          } else {
            // Non-adjacent, jump directly
            this.terminal.moveTo(nextRow, 1);
          }
        }
      }

      // Move cursor back to desired position (usually bottom or where input happens)
      const size = this.terminal.getSize();
      this.terminal.moveTo(size.rows, 1);
    }

    return changesWritten;
  }

  /**
   * Force a full re-render (skip differential)
   */
  forceFullRender(): DiffResult {
    this.previousRender = []; // Clear previous render to force full update
    return this.render({ skipDiff: true });
  }

  /**
   * Get the terminal instance
   */
  getTerminal(): Terminal {
    return this.terminal;
  }

  /**
   * Check if engine is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current terminal size
   */
  getSize() {
    return this.terminal.getSize();
  }
}

/**
 * Engine status for monitoring
 */
export interface EngineStatus {
  isActive: boolean;
  renderStats: {
    linesChanged: number;
    renderTime: number;
  } | null;
  terminalSize: {
    rows: number;
    cols: number;
  };
}
