// engine.ts - TUI engine with differential rendering

import { Terminal, KeyPress } from './terminal.js';
import { performance } from 'node:perf_hooks';
import UpdateManager from 'stdout-update';
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
  private keyUnsub: (() => void) | null = null;
  private keyCallbacks: Set<(key: KeyPress) => void> = new Set();
  private exitOnCtrlC: boolean = true;

  // Single frame sink (prevents double writers)
  private updateManager: UpdateManager | null = null;
  private resizeUnsub: (() => void) | null = null;

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

    // Single output manager hooks stdout/stderr so we own the frame sink
    this.updateManager = new UpdateManager(process.stdout, process.stderr);
    this.updateManager.hook();

    // Resize invalidation (force full rerender on dimension changes)
    const onResize = () => {
      if (!this.isRunning) return;
      this.forceFullRender();
    };
    process.stdout.on('resize', onResize);
    this.resizeUnsub = () => process.stdout.off('resize', onResize);

    this.inputCleanup = this.terminal.setupRawMode();
    this.terminal.resumeInput();
    this.terminal.hideCursor();
    this.terminal.clearScreen();

    // Subscribe to keys once per start
    if (!this.keyUnsub) {
      this.keyUnsub = this.terminal.onKey((key: KeyPress) => {
        // Engine-owned Ctrl+C (ensures teardown symmetry)
        const isCtrlC =
          key.sequence === '\x03' ||
          (key.ctrl && key.name === 'c') ||
          key.name === 'CTRL_C';

        if (this.exitOnCtrlC && isCtrlC) {
          this.stop();
          process.exit(0);
        }

        // Engine-level callbacks
        for (const cb of this.keyCallbacks) cb(key);

        // Route to root container
        if (this.rootContainer) this.rootContainer.handleInput(key);
      });
    }

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

    if (this.resizeUnsub) {
      this.resizeUnsub();
      this.resizeUnsub = null;
    }

    if (this.keyUnsub) {
      this.keyUnsub();
      this.keyUnsub = null;
    }

    if (this.inputCleanup) {
      this.inputCleanup();
      this.inputCleanup = null;
    }

    this.terminal.pauseInput();
    this.terminal.showCursor();

    if (this.updateManager) {
      this.updateManager.clear();
      this.updateManager.unhook();
      this.updateManager = null;
    }

    this.terminal.cleanup();
  }

  /**
   * Listen for keyboard input
   */
  onKey(callback: (key: KeyPress) => void): () => void {
    this.keyCallbacks.add(callback);
    return () => this.keyCallbacks.delete(callback);
  }

  /**
   * Enable Ctrl+C to exit
   */
  enableExitOnCtrlC(shouldExit: boolean = true): void {
    this.exitOnCtrlC = shouldExit;
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

    // Flush the current frame through the single frame sink
    this.updateManager?.update(newRender.join('\n'));

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

    // Count changes only; actual screen update is handled by UpdateManager
    if (updates.length > 0) {
      changesWritten = updates.length;
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
