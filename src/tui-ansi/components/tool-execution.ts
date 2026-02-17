// ToolExecution Component - Visual display of tool execution status for ANSI TUI
// Shows tool name, arguments, status, and collapsible output preview

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
 * Tool execution status states
 */
export type ToolStatus = 'pending' | 'running' | 'success' | 'error';

/**
 * Tool execution data
 */
export interface ToolExecutionData {
  /**
   * Tool name (e.g., 'read', 'write', 'exec')
   */
  toolName: string;
  /**
   * Current status
   */
  status: ToolStatus;
  /**
   * Arguments passed to the tool
   */
  args?: Record<string, unknown>;
  /**
   * Tool output (when success)
   */
  output?: string;
  /**
   * Error message (when error)
   */
  error?: string;
  /**
   * When execution started
   */
  startTime: number;
  /**
   * When execution completed (null if still running)
   */
  endTime?: number;
  /**
   * Duration in milliseconds (calculated from start/end)
   */
  duration?: number;
}

/**
 * ToolExecution component - Displays tool execution with status visualization
 */
export class ToolExecution extends BaseComponent {
  private data: ToolExecutionData;
  private expanded: boolean;
  private previewLines: number;

  constructor(id: string, data: ToolExecutionData, bounds?: Bounds) {
    super(id, bounds);
    this.data = data;
    this.expanded = false;
    this.previewLines = 3;

    // Calculate duration if end time exists
    if (this.data.endTime && this.data.startTime) {
      this.data.duration = this.data.endTime - this.data.startTime;
    }
  }

  /**
   * Update tool execution data
   */
  updateData(data: Partial<ToolExecutionData>): void {
    this.data = { ...this.data, ...data };

    // Recalculate duration if provided
    if (data.endTime !== undefined || data.startTime !== undefined) {
      if (this.data.endTime && this.data.startTime) {
        this.data.duration = this.data.endTime - this.data.startTime;
      }
    }
    this.invalidate();
  }

  /**
   * Get current tool execution data
   */
  getData(): ToolExecutionData {
    return { ...this.data };
  }

  /**
   * Toggle expanded/collapsed state
   */
  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.invalidate();
  }

  /**
   * Set expanded state
   */
  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    this.invalidate();
  }

  /**
   * Check if expanded
   */
  isExpanded(): boolean {
    return this.expanded;
  }

  /**
   * Get status background color for visualization
   */
  private getStatusBgColor(): string {
    switch (this.data.status) {
      case 'pending':
      case 'running':
        // Teal background for pending/running
        return ANSI.bgCyan + ANSI.fgBlack;
      case 'success':
        // Green background for success
        return ANSI.bgGreen + ANSI.fgBlack;
      case 'error':
        // Red background for error
        return ANSI.bgRed + ANSI.fgWhite;
    }
  }

  /**
   * Get status icon
   */
  private getStatusIcon(): string {
    switch (this.data.status) {
      case 'pending':
        return '⏳';
      case 'running':
        return '▶';
      case 'success':
        return '✓';
      case 'error':
        return '✗';
    }
  }

  /**
   * Get status label
   */
  private getStatusLabel(): string {
    switch (this.data.status) {
      case 'pending':
        return 'PENDING';
      case 'running':
        return 'RUNNING';
      case 'success':
        return 'SUCCESS';
      case 'error':
        return 'ERROR';
    }
  }

  /**
   * Render timestamp
   */
  private renderTimestamp(): string {
    if (this.data.duration !== undefined) {
      return `${this.data.duration}ms`;
    }
    const elapsed = Date.now() - this.data.startTime;
    return `${elapsed}ms`;
  }

  /**
   * Render tool name with styling
   */
  private renderToolName(): string {
    return TextStyler.dim(this.data.toolName);
  }

  /**
   * Render arguments (if any)
   */
  private renderArgs(maxWidth: number): string[] {
    if (!this.data.args || Object.keys(this.data.args).length === 0) {
      return [];
    }

    const lines: string[] = [];
    const argsStr = JSON.stringify(this.data.args, null, 2);

    // Wrap and format args
    const prompt = '  args: ';
    const availableWidth = Math.max(10, maxWidth - prompt.length);
    const argsLines = TextStyler.wrap(argsStr, availableWidth);
    lines.push(prompt + argsLines[0]);

    for (let i = 1; i < argsLines.length; i++) {
      lines.push('  ' + ' '.repeat(prompt.length - 2) + argsLines[i]);
    }

    return lines;
  }

  /**
   * Render output (when success)
   */
  private renderOutput(maxWidth: number, linesToRender: number): string[] {
    if (!this.data.output) {
      return [];
    }

    const lines: string[] = [];
    const outputLines = this.data.output.split('\n');

    // Determine how many lines to show
    const numLines = Math.min(linesToRender, outputLines.length);

    for (let i = 0; i < numLines; i++) {
      const line = outputLines[i];
      const availableWidth = Math.max(10, maxWidth - 6);
      const truncated = TextStyler.truncate(line, availableWidth);
      lines.push(TextStyler.fg('  │ ' + truncated, SemanticColors.successBright));
    }

    if (outputLines.length > linesToRender) {
      const remaining = outputLines.length - linesToRender;
      lines.push(
        TextStyler.fg(`  │ ... (${remaining} more lines)`, ANSI.dim)
      );
    }

    return lines;
  }

  /**
   * Render error (when error)
   */
  private renderError(maxWidth: number, linesToRender: number): string[] {
    if (!this.data.error) {
      return [];
    }

    const lines: string[] = [];
    const errorLines = this.data.error.split('\n');

    const numLines = Math.min(linesToRender, errorLines.length);

    for (let i = 0; i < numLines; i++) {
      const line = errorLines[i];
      const availableWidth = Math.max(10, maxWidth - 6);
      const truncated = TextStyler.truncate(line, availableWidth);
      lines.push(TextStyler.fg('  │ ' + truncated, SemanticColors.errorBright));
    }

    return lines;
  }

  /**
   * Render the component to lines
   */
  render(): string[] {
    const outputLines: string[] = [];
    const maxWidth = this.bounds.width;
    const statusBg = this.getStatusBgColor();
    const statusFg = this.data.status === 'error' ? ANSI.fgWhite : ANSI.fgBlack;
    const statusIcon = this.getStatusIcon();
    const statusLabel = this.getStatusLabel();

    // Header line with status indicator
    const headerText = ` [${statusIcon} ${this.data.toolName}] ${statusLabel}`;
    const timeInfo = ANSI.dim + ' ' + this.renderTimestamp() + ANSI.reset;

    // Combine header and time info, truncate if needed
    const headerWithTime = statusBg + statusFg + ANSI.bold + headerText + ANSI.reset + timeInfo;
    const header = TextStyler.truncate(headerWithTime, maxWidth);
    outputLines.push(header.padEnd(maxWidth));

    // Tool name (dimmed)
    const toolNameLine = ANSI.dim + '  Tool: ' + this.renderToolName() + ANSI.reset;
    outputLines.push(toolNameLine.padEnd(maxWidth));

    // Arguments
    if (this.data.args && Object.keys(this.data.args).length > 0) {
      const argsLines = this.renderArgs(maxWidth);
      argsLines.forEach(line => {
        outputLines.push((ANSI.dim + line + ANSI.reset).padEnd(maxWidth));
      });
    }

    // Output or Error (based on status)
    if (this.data.status === 'success' && this.data.output) {
      const numLines = this.expanded
        ? this.bounds.height - outputLines.length - 2
        : this.previewLines;

      if (numLines > 0) {
        const output = this.renderOutput(maxWidth, numLines);
        outputLines.push(...output);
      }
    } else if (this.data.status === 'error' && this.data.error) {
      const numLines = this.expanded
        ? this.bounds.height - outputLines.length - 2
        : this.previewLines;
      const error = this.renderError(maxWidth, numLines);
      const displayed = error.slice(0, numLines);
      outputLines.push(...displayed);
    }

    // Footer line
    const hasMoreContent =
      (this.data.status === 'success' && this.data.output) ||
      (this.data.status === 'error' && this.data.error);

    if (hasMoreContent && outputLines.length < this.bounds.height - 1) {
      const expandHint = this.expanded ? '[-] Collapse' : '[+] Expand';
      const footerLine = '  ' + expandHint;
      outputLines.push(footerLine.padEnd(maxWidth));
    }

    // Padding to fill max height
    while (outputLines.length < this.bounds.height) {
      outputLines.push(' '.repeat(maxWidth));
    }

    return outputLines;
  }

  /**
   * Handle keyboard input
   */
  handleInput(key: KeyPress): boolean {
    const keyStr = key.name ?? key.sequence;

    // Toggle expanded state on Enter or Space when focused
    if (keyStr === 'return' || keyStr === 'enter' || keyStr === ' ') {
      this.toggleExpanded();
      return true;
    }

    return false;
  }
}

/**
 * Helper function to create a ToolExecution component
 */
export function createToolExecution(id: string, data: ToolExecutionData, bounds?: Bounds): ToolExecution {
  return new ToolExecution(id, data, bounds);
}
