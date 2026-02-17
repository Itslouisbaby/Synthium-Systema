// ChatLog Component - Scrollable message display for ANSI TUI
// Renders user messages, synth messages, tool executions, approvals, and system events

import {
  BaseComponent,
  KeyPress,
  Bounds,
} from '../component.js';
import {
  Message,
  UserMessage,
  SynthMessage,
  ToolExecutionMessage,
  ApprovalCardMessage,
  SystemEventMessage,
  ANSI,
  SemanticColors,
  TextStyler,
} from '../types.js';

/**
 * ChatLog component - Displays messages in a scrollable format
 */
export class ChatLog extends BaseComponent {
  private messages: Message[];
  private scrollOffset: number; // 0 = at bottom (newest), higher = scrolled up
  private autoScroll: boolean;
  private scrollContext: number;

  constructor(id: string = 'chatlog', bounds?: Bounds) {
    super(id, bounds);
    this.messages = [];
    this.scrollOffset = 0;
    this.autoScroll = true;
    this.scrollContext = 5;
  }

  /**
   * Add a new message to the log
   */
  addMessage(message: Message): void {
    this.messages.push(message);

    // Auto-scroll if enabled and scrolled to bottom
    if (this.autoScroll && this.scrollOffset === 0) {
      this.scrollToEnd();
    }

    this.invalidate();
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.messages = [];
    this.scrollOffset = 0;
    this.invalidate();
  }

  /**
   * Get message count
   */
  getCount(): number {
    return this.messages.length;
  }

  /**
   * Get all messages
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * Set auto-scroll mode
   */
  setAutoScroll(enabled: boolean): void {
    this.autoScroll = enabled;
    if (enabled) {
      this.scrollToEnd();
    }
    this.invalidate();
  }

  /**
   * Scroll up by n lines
   */
  scrollUp(n: number = 1): void {
    if (this.scrollOffset >= 0) {
      this.scrollOffset += n;
      // Disable auto-scroll when manually scrolling
      if (this.scrollOffset > 0) {
        this.autoScroll = false;
      }
      this.invalidate();
    }
  }

  /**
   * Scroll down by n lines
   */
  scrollDown(n: number = 1): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - n);
    if (this.scrollOffset === 0) {
      this.autoScroll = true;
    }
    this.invalidate();
  }

  /**
   * Scroll to the end (newest messages)
   */
  scrollToEnd(): void {
    this.scrollOffset = 0;
    this.autoScroll = true;
    this.invalidate();
  }

  /**
   * Scroll to the beginning (oldest messages)
   */
  scrollToStart(): void {
    const totalLines = this.renderAllMessages().length;
    this.scrollOffset = Math.max(0, totalLines - this.bounds.height);
    this.autoScroll = false;
    this.invalidate();
  }

  /**
   * Page up (scroll by half height)
   */
  pageUp(): void {
    this.scrollUp(Math.floor(this.bounds.height / 2));
  }

  /**
   * Page down (scroll by half height)
   */
  pageDown(): void {
    this.scrollDown(Math.floor(this.bounds.height / 2));
  }

  /**
   * Handle keyboard input
   */
  handleInput(key: KeyPress): boolean {
    // Check key name first, fall back to sequence
    const keyStr = key.name ?? key.sequence;

    switch (keyStr) {
      case 'up':
      case 'k':
        this.scrollUp(1);
        return true;
      case 'down':
      case 'j':
        this.scrollDown(1);
        return true;
      case 'pageup':
      case 'b':
        this.pageUp();
        return true;
      case 'pagedown':
      case 'f':
      case ' ':
        this.pageDown();
        return true;
      case 'home':
      case 'g':
        this.scrollToStart();
        return true;
      case 'end':
      case 'G':
        this.scrollToEnd();
        return true;
      default:
        return false;
    }
  }

  /**
   * Render the component to lines
   * Uses scroll offset to determine visible range
   */
  render(): string[] {
    // Generate all message lines
    const allLines = this.renderAllMessages();
    const totalLines = allLines.length;
    const maxWidth = this.bounds.width;

    // Calculate visible range based on scroll offset
    // scrollOffset = 0 means show last height lines (newest)
    // scrollOffset > 0 means scroll up by that many lines
    let startIndex: number;
    if (totalLines <= this.bounds.height) {
      startIndex = 0;
    } else {
      startIndex = totalLines - this.bounds.height - this.scrollOffset;
      startIndex = Math.max(0, Math.min(startIndex, totalLines - this.bounds.height));
    }

    const endIndex = Math.min(totalLines, startIndex + this.bounds.height);
    const visibleLines = allLines.slice(startIndex, endIndex);

    // Truncate lines to fit width
    const truncatedLines = visibleLines.map(line => {
      if (line.length > maxWidth) {
        return line.substring(0, maxWidth);
      }
      return line;
    });

    // If there are fewer lines than height, pad with empty lines
    while (truncatedLines.length < this.bounds.height) {
      truncatedLines.push(ANSI.dim + ' │' + ANSI.reset.padEnd(maxWidth).substring(0, maxWidth));
    }

    return truncatedLines;
  }

  /**
   * Render all messages to lines
   */
  private renderAllMessages(): string[] {
    const allLines: string[] = [];

    for (const message of this.messages) {
      allLines.push(...this.renderMessage(message));
    }

    return allLines;
  }

  /**
   * Render a single message to lines
   */
  private renderMessage(message: Message): string[] {
    const lines: string[] = [];
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    const maxWidth = this.bounds.width;

    switch (message.type) {
      case 'user': {
        const userMsg = message as UserMessage;
        const contentLines = TextStyler.wrap(userMsg.content, maxWidth - 4);
        lines.push(
          ANSI.dim +
            ` │ ${TextStyler.fg('USER', SemanticColors.primaryBright)} ${timestamp}` +
            ANSI.reset
        );
        contentLines.forEach(line => {
          lines.push(` │ ${TextStyler.bright(line)}`);
        });
        lines.push(ANSI.dim + ' └' + '─'.repeat(Math.max(2, maxWidth - 3)) + ANSI.reset);
        break;
      }

      case 'synth': {
        const synthMsg = message as SynthMessage;
        const contentLines = TextStyler.wrap(synthMsg.content, maxWidth - 4);
        lines.push(
          ANSI.dim +
            ` │ ${TextStyler.fg('SYNTH', SemanticColors.infoBright)} ${timestamp}` +
            ANSI.reset
        );
        contentLines.forEach(line => {
          lines.push(` │ ${line}`);
        });
        lines.push(ANSI.dim + ' └' + '─'.repeat(Math.max(2, maxWidth - 3)) + ANSI.reset);
        break;
      }

      case 'tool_execution': {
        const toolMsg = message as ToolExecutionMessage;
        const statusColor = this.getToolStatusColor(toolMsg.status);
        const statusIcon = this.getToolStatusIcon(toolMsg.status);

        lines.push(
          ANSI.dim +
            ` │ ${TextStyler.fg('TOOL', SemanticColors.warningBright)} ${statusColor}${statusIcon} ${TextStyler.bright(toolMsg.toolName)}${ANSI.reset} ` +
            ANSI.reset
        );

        if (toolMsg.args && Object.keys(toolMsg.args).length > 0) {
          const argsStr = TextStyler.truncate(JSON.stringify(toolMsg.args), maxWidth - 8);
          lines.push(ANSI.dim + ` │   ${TextStyler.dim(argsStr)}` + ANSI.reset);
        }

        if (toolMsg.status === 'error' && toolMsg.error) {
          const errorLines = TextStyler.wrap(toolMsg.error, maxWidth - 6);
          errorLines.forEach(line => {
            lines.push(TextStyler.fg(` │   ${line}`, SemanticColors.error));
          });
        } else if (toolMsg.status === 'success' && toolMsg.output) {
          const outputPreview = TextStyler.truncate(toolMsg.output, maxWidth / 2);
          lines.push(ANSI.dim + ` │   ${TextStyler.dim(outputPreview)}` + ANSI.reset);
        }

        lines.push(ANSI.dim + ' └' + '─'.repeat(Math.max(2, maxWidth - 3)) + ANSI.reset);
        break;
      }

      case 'approval_card': {
        const approvalMsg = message as ApprovalCardMessage;
        const statusColor = this.getApprovalStatusColor(approvalMsg.status);
        const statusIcon = this.getApprovalStatusIcon(approvalMsg.status);

        lines.push(
          statusColor +
            ` │ ${TextStyler.bright('▷ APPROVAL')} ${statusIcon}${ANSI.reset}` +
            ANSI.reset
        );

        const intentLines = TextStyler.wrap(approvalMsg.intent, maxWidth - 6);
        intentLines.forEach(line => {
          lines.push(` │   ${line}`);
        });

        lines.push(
          ANSI.dim +
            ` │   ${TextStyler.dim(`Action: ${approvalMsg.actionClass}`)}` +
            ANSI.reset
        );

        lines.push(ANSI.dim + ' └' + '─'.repeat(Math.max(2, maxWidth - 3)) + ANSI.reset);
        break;
      }

      case 'system_event': {
        const eventMsg = message as SystemEventMessage;
        const levelColor = this.getSystemEventLevelColor(eventMsg.level);
        const levelIcon = this.getSystemEventLevelIcon(eventMsg.level);

        lines.push(
          levelColor +
            ` │ ${levelIcon} ${TextStyler.bright(eventMsg.level.toUpperCase())}${ANSI.reset} ` +
            ANSI.reset
        );

        const contentLines = TextStyler.wrap(eventMsg.content, maxWidth - 4);
        contentLines.forEach(line => {
          lines.push(` │ ${line}`);
        });

        lines.push(ANSI.dim + ' └' + '─'.repeat(Math.max(2, maxWidth - 3)) + ANSI.reset);
        break;
      }
    }

    return lines;
  }

  /**
   * Get color for tool execution status
   */
  private getToolStatusColor(status: ToolExecutionMessage['status']): string {
    switch (status) {
      case 'pending':
      case 'running':
        return SemanticColors.infoBright;
      case 'success':
        return SemanticColors.successBright;
      case 'error':
        return SemanticColors.errorBright;
    }
  }

  /**
   * Get icon for tool execution status
   */
  private getToolStatusIcon(status: ToolExecutionMessage['status']): string {
    switch (status) {
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
   * Get color for approval status
   */
  private getApprovalStatusColor(status: ApprovalCardMessage['status']): string {
    switch (status) {
      case 'pending':
        return ANSI.fgYellow;
      case 'approved':
        return SemanticColors.successBright;
      case 'denied':
        return SemanticColors.errorBright;
    }
  }

  /**
   * Get icon for approval status
   */
  private getApprovalStatusIcon(status: ApprovalCardMessage['status']): string {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'approved':
        return '✓';
      case 'denied':
        return '✗';
    }
  }

  /**
   * Get color for system event level
   */
  private getSystemEventLevelColor(level: SystemEventMessage['level']): string {
    switch (level) {
      case 'info':
        return SemanticColors.infoBright;
      case 'warn':
        return SemanticColors.warningBright;
      case 'error':
        return SemanticColors.errorBright;
    }
  }

  /**
   * Get icon for system event level
   */
  private getSystemEventLevelIcon(level: SystemEventMessage['level']): string {
    switch (level) {
      case 'info':
        return 'ℹ';
      case 'warn':
        return '⚠';
      case 'error':
        return '✗';
    }
  }
}

/**
 * Helper function to create a ChatLog component
 */
export function createChatLog(id?: string, bounds?: Bounds): ChatLog {
  return new ChatLog(id, bounds);
}
