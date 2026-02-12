/**
 * Tool Execution Types - Milestone 6
 * Security-first local tool execution
 */

import type { Observation, PlanStep, PlanGraph } from '../types.js';

/** Local read tool input */
export interface LocalReadInput {
  path: string; // relative to workspace
  maxBytes?: number; // default: 1MB, hard cap: 10MB
}

/** Local read tool output */
export interface LocalReadOutput {
  content: string;
  bytesRead: number;
  truncated: boolean;
}

/** Local write tool input */
export interface LocalWriteInput {
  path: string; // relative to workspace
  content: string;
  mode: 'overwrite' | 'append';
}

/** Local write tool output */
export interface LocalWriteOutput {
  bytesWritten: number;
  path: string; // resolved absolute path (for audit)
}

/** Local search tool input */
export interface LocalSearchInput {
  root: string; // relative to workspace
  query: string; // literal string, NOT regex
  maxResults?: number; // default: 50
}

/** Single search result */
export interface SearchResult {
  file: string;
  line: number;
  content: string; // truncated line
}

/** Local search tool output */
export interface LocalSearchOutput {
  matches: SearchResult[];
  totalMatches: number;
  truncated: boolean;
}

/** Tool call audit record */
export interface ToolCallAudit {
  toolCallId: string;
  stepId: string;
  toolName: string;
  input: unknown;
  outputSummary: unknown;
  startedAtMs: number;
  endedAtMs: number;
  success: boolean;
  error?: string;
}

/** Tool limits configuration */
export interface ToolLimits {
  maxToolCallsPerRun: number; // default: 10
  maxReadBytes: number; // default: 1MB, hard cap: 10MB
  maxWriteBytes: number; // default: 1MB
  maxSearchResults: number; // default: 100
  toolTimeoutMs: number; // default: 30s
}

/** Default tool limits */
export const DEFAULT_TOOL_LIMITS: ToolLimits = {
  maxToolCallsPerRun: 10,
  maxReadBytes: 1_000_000, // 1MB
  maxWriteBytes: 1_000_000, // 1MB
  maxSearchResults: 100,
  toolTimeoutMs: 30_000,
};

/** Generic tool function type */
export type ToolFunction<TInput, TOutput> = (
  input: TInput,
  workspace: string,
  limits: ToolLimits
) => Promise<TOutput>;

/** Tool registration */
export interface Tool {
  name: string;
  execute: ToolFunction<unknown, unknown>;
}

/** Executor result */
export interface ExecutorResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  audit?: ToolCallAudit;
}

/** Tool execution context */
export interface ExecutionContext {
  workspace: string;
  limits: ToolLimits;
  callCount: number;
  maxCalls: number;
}
