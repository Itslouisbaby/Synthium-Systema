// ANSI TUI Types - Message types and utilities for TUI components
// (Note: Component interface is in component.ts, extended from BaseComponent)

import { Terminal } from './terminal.js';

/**
 * Message types for the ChatLog component
 */
export type MessageType =
  | 'user'
  | 'synth'
  | 'memory_recall'
  | 'tool_execution'
  | 'approval_card'
  | 'system_event';

/**
 * Base message interface
 */
export interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: number;
}

/**
 * User message - user's input to the system
 */
export interface UserMessage extends BaseMessage {
  type: 'user';
  content: string;
}

/**
 * Synth message - system/ai response
 */
export interface SynthMessage extends BaseMessage {
  type: 'synth';
  content: string;
}

/**
 * Memory recall (context surfaced to the assistant)
 * Phase 5: render as a distinct block so the conversational loop is legible.
 */
export interface MemoryRecallMessage extends BaseMessage {
  type: 'memory_recall';
  /** Human-readable summary / list of recalled items */
  content: string;
}

/**
 * Tool execution status
 */
export type ToolExecutionStatus = 'pending' | 'running' | 'success' | 'error';

/**
 * Tool execution message
 */
export interface ToolExecutionMessage extends BaseMessage {
  type: 'tool_execution';
  toolName: string;
  status: ToolExecutionStatus;
  args?: Record<string, unknown>;
  output?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

/**
 * Approval request status
 */
export type ApprovalStatus = 'pending' | 'approved' | 'denied';

/**
 * Approval card message
 */
export interface ApprovalCardMessage extends BaseMessage {
  type: 'approval_card';
  stepId: string;
  intent: string;
  actionClass: string;
  status: ApprovalStatus;
}

/**
 * System event message
 */
export interface SystemEventMessage extends BaseMessage {
  type: 'system_event';
  level: 'info' | 'warn' | 'error';
  content: string;
}

/**
 * Union type for all messages
 */
export type Message =
  | UserMessage
  | SynthMessage
  | MemoryRecallMessage
  | ToolExecutionMessage
  | ApprovalCardMessage
  | SystemEventMessage;

/**
 * ANSI color codes (shared with Terminal.ANSI)
 * Re-exported here for convenience
 */
export const ANSI = Terminal.ANSI;

/**
 * Semantic colors for TUI styling
 */
export const SemanticColors = {
  primary: ANSI.fgBlue,
  primaryBright: ANSI.fgBrightBlue,
  success: ANSI.fgGreen,
  successBright: ANSI.fgBrightGreen,
  warning: ANSI.fgYellow,
  warningBright: ANSI.fgBrightYellow,
  error: ANSI.fgRed,
  errorBright: ANSI.fgBrightRed,
  info: ANSI.fgCyan,
  infoBright: ANSI.fgBrightCyan,
  dim: ANSI.fgBrightBlack, // gray
  text: ANSI.fgWhite,
  textBright: ANSI.fgBrightWhite,

  bgPrimary: ANSI.bgBlue,
  bgSuccess: ANSI.bgGreen,
  bgWarning: ANSI.bgYellow,
  bgError: ANSI.bgRed,
  bgInfo: ANSI.bgCyan,
} as const;

/**
 * ANSI text styling helpers
 */
export class TextStyler {
  /**
   * Apply foreground color to text
   */
  static fg(text: string, color: string): string {
    return `${color}${text}${ANSI.reset}`;
  }

  /**
   * Apply background color to text
   */
  static bg(text: string, color: string): string {
    return `${color}${text}${ANSI.reset}`;
  }

  /**
   * Apply bright modifier
   */
  static bright(text: string): string {
    return `${ANSI.bold}${text}${ANSI.reset}`;
  }

  /**
   * Apply dim modifier
   */
  static dim(text: string): string {
    return `${ANSI.dim}${text}${ANSI.reset}`;
  }

  /**
   * Combine multiple styles
   */
  static apply(text: string, ...styles: string[]): string {
    if (styles.length === 0) return text;
    return `${styles.join('')}${text}${ANSI.reset}`;
  }

  /**
   * Truncate text to fit width with ellipsis
   */
  static truncate(text: string, maxWidth: number): string {
    if (text.length <= maxWidth) return text;
    return text.substring(0, maxWidth - 1) + '…';
  }

  /**
   * Pad text to a specific width
   */
  static pad(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
    if (text.length >= width) return text;
    const padding = width - text.length;
    switch (align) {
      case 'right':
        return ' '.repeat(padding) + text;
      case 'center':
        const left = Math.floor(padding / 2);
        const right = padding - left;
        return ' '.repeat(left) + text + ' '.repeat(right);
      case 'left':
      default:
        return text + ' '.repeat(padding);
    }
  }

  /**
   * Word wrap text to fit width
   */
  static wrap(text: string, maxWidth: number): string[] {
    if (text.length <= maxWidth) return [text];

    const lines: string[] = [];
    let currentLine = '';

    for (const part of text.split(' ')) {
      if (currentLine.length + part.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + part;
      } else {
        if (currentLine) lines.push(currentLine);
        if (part.length <= maxWidth) {
          currentLine = part;
        } else {
          // Word is too long, split it
          let remainingPart = part;
          while (remainingPart.length > maxWidth) {
            lines.push(remainingPart.substring(0, maxWidth));
            remainingPart = remainingPart.substring(maxWidth);
            if (remainingPart.length <= maxWidth) {
              currentLine = remainingPart;
            } else {
              currentLine = '';
            }
          }
          if (remainingPart.length <= maxWidth && remainingPart.length > 0) {
            currentLine = remainingPart;
          }
        }
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }
}

/**
 * Calculate rendered width of text (accounting for ANSI codes)
 */
export function calculateRenderedWidth(text: string): number {
  // Remove ANSI escape sequences
  const cleanText = text.replace(/\x1b\[[0-9;]*m/g, '');
  return cleanText.length;
}

/**
 * Strip ANSI codes from text
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}
