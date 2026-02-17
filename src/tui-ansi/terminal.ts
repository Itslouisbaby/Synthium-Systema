// terminal.ts - Low-level stdout writer, cursor management
// Pure ANSI escape sequences for terminal control

export interface TerminalSize {
  rows: number;
  cols: number;
}

export class Terminal {
  private process: NodeJS.Process;
  private stdout: NodeJS.WriteStream;
  private stdin: NodeJS.ReadStream;

  // ANSI escape sequences
  static readonly ANSI = {
    // Cursor movement
    cursorUp: (n: number) => `\x1b[${n}A`,
    cursorDown: (n: number) => `\x1b[${n}B`,
    cursorRight: (n: number) => `\x1b[${n}C`,
    cursorLeft: (n: number) => `\x1b[${n}D`,
    cursorTo: (row: number, col: number) => `\x1b[${row};${col}H`,
    cursorToCol: (col: number) => `\x1b[${col}G`,
    cursorSave: '\x1b[s',
    cursorRestore: '\x1b[u',
    cursorHide: '\x1b[?25l',
    cursorShow: '\x1b[?25h',

    // Screen clearing
    clearScreen: '\x1b[2J',
    clearLine: '\x1b[2K',
    clearToEnd: '\x1b[0K',
    clearToStart: '\x1b[1K',
    clearScreenDown: '\x1b[0J',
    clearScreenUp: '\x1b[1J',

    // Screen scrolling
    scrollUp: (n: number) => `\x1b[${n}S`,
    scrollDown: (n: number) => `\x1b[${n}T`,

    // Text styles
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',
    blink: '\x1b[5m',
    inverse: '\x1b[7m',
    hidden: '\x1b[8m',
    strikethrough: '\x1b[9m',

    // Colors (foreground)
    fgBlack: '\x1b[30m',
    fgRed: '\x1b[31m',
    fgGreen: '\x1b[32m',
    fgYellow: '\x1b[33m',
    fgBlue: '\x1b[34m',
    fgMagenta: '\x1b[35m',
    fgCyan: '\x1b[36m',
    fgWhite: '\x1b[37m',
    fgDefault: '\x1b[39m',

    // Colors (background)
    bgBlack: '\x1b[40m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m',
    bgWhite: '\x1b[47m',
    bgDefault: '\x1b[49m',

    // Bright foreground
    fgBrightBlack: '\x1b[90m',
    fgBrightRed: '\x1b[91m',
    fgBrightGreen: '\x1b[92m',
    fgBrightYellow: '\x1b[93m',
    fgBrightBlue: '\x1b[94m',
    fgBrightMagenta: '\x1b[95m',
    fgBrightCyan: '\x1b[96m',
    fgBrightWhite: '\x1b[97m',

    // Bright background
    bgBrightBlack: '\x1b[100m',
    bgBrightRed: '\x1b[101m',
    bgBrightGreen: '\x1b[102m',
    bgBrightYellow: '\x1b[103m',
    bgBrightBlue: '\x1b[104m',
    bgBrightMagenta: '\x1b[105m',
    bgBrightCyan: '\x1b[106m',
    bgBrightWhite: '\x1b[107m',
  };

  constructor() {
    this.process = process;
    this.stdout = process.stdout;
    this.stdin = process.stdin;
  }

  // Get terminal size
  getSize(): TerminalSize {
    return {
      rows: this.stdout.rows || 24,
      cols: this.stdout.columns || 80,
    };
  }

  // Write raw data to stdout
  write(data: string): void {
    this.stdout.write(data);
  }

  // Clear entire screen
  clearScreen(): void {
    this.write(Terminal.ANSI.clearScreen);
    this.write(Terminal.ANSI.cursorTo(1, 1));
  }

  // Clear current line
  clearLine(): void {
    this.write(Terminal.ANSI.clearLine);
  }

  // Move cursor to position (1-indexed)
  moveTo(row: number, col: number): void {
    this.write(Terminal.ANSI.cursorTo(row, col));
  }

  // Move cursor to beginning of line
  moveToStart(): void {
    this.write(Terminal.ANSI.cursorToCol(1));
  }

  // Hide cursor
  hideCursor(): void {
    this.write(Terminal.ANSI.cursorHide);
  }

  // Show cursor
  showCursor(): void {
    this.write(Terminal.ANSI.cursorShow);
  }

  // Save cursor position
  saveCursor(): void {
    this.write(Terminal.ANSI.cursorSave);
  }

  // Restore cursor position
  restoreCursor(): void {
    this.write(Terminal.ANSI.cursorRestore);
  }

  // Write a line at specific position
  writeLine(row: number, col: number, text: string): void {
    this.moveTo(row, col);
    this.write(text);
  }

  // Write multiple lines efficiently
  writeLines(startRow: number, col: number, lines: string[]): void {
    for (let i = 0; i < lines.length; i++) {
      this.writeLine(startRow + i, col, lines[i]);
    }
  }

  // Setup raw mode for input
  setupRawMode(): () => void {
    // Windows vs Unix raw mode setup
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows raw mode
      this.stdin.setRawMode?.(true);
    } else {
      // Unix raw mode using readline
      const readline = require('readline');
      readline.emitKeypressEvents(this.stdin);
      this.stdin.setRawMode(true);
    }

    // Return cleanup function
    return () => {
      if (isWindows) {
        this.stdin.setRawMode?.(false);
      } else {
        this.stdin.setRawMode(false);
      }
    };
  }

  // Listen for keypress events
  onKey(callback: (key: KeyPress) => void): void {
    this.stdin.on('keypress', (str: string, key: KeyPress) => {
      callback(key);
    });
  }

  // Resume stdin
  resumeInput(): void {
    this.stdin.resume();
  }

  // Pause stdin
  pauseInput(): void {
    this.stdin.pause();
  }

  // Enable exit on Ctrl+C
  enableExitOnCtrlC(shouldExit: boolean = true): void {
    if (shouldExit) {
      this.stdin.on('keypress', (str: string, key: KeyPress) => {
        if (key.ctrl && key.name === 'c') {
          this.cleanup();
          this.process.exit(0);
        }
      });
    }
  }

  // Cleanup and restore terminal state
  cleanup(): void {
    this.write(Terminal.ANSI.reset);
    this.write(Terminal.ANSI.cursorShow);
    this.showCursor();
    this.write('\n');
  }

  // Check if terminal supports color
  supportsColor(): boolean {
    return this.stdout.hasColors?.() ?? true;
  }

  // Check if terminal is a TTY
  isTTY(): boolean {
    return this.stdout.isTTY;
  }
}

export interface KeyPress {
  name?: string;
  sequence: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
}
