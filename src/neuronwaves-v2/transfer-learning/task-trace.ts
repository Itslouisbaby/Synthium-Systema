/**
 * TaskTrace - Case-based reasoning for transfer learning
 * Section 7.1: Package each run into a TaskTrace artifact
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { 
  TaskTrace, 
  SessionKey, 
  TimestampMs,
  PlanStep,
  Signal
} from '../types.js';
import { deterministicId } from '../runtime/deterministic-id.js';

/** TaskTrace configuration */
export interface TaskTraceConfig {
  /** Base directory for trace storage */
  readonly baseDir: string;
  /** Maximum traces per session */
  readonly maxTracesPerSession?: number;
}

/** Input for creating a TaskTrace */
export interface TaskTraceInput {
  readonly sessionKey: SessionKey;
  readonly taskSignature: string;
  readonly detectedConcepts: string[];
  readonly filledSlots: Record<string, unknown>;
  readonly missingSlots: string[];
  readonly planSteps: PlanStep[];
  readonly policyDecisions: {
    readonly stepId: string;
    readonly decision: string;
    readonly reason: string;
  }[];
  readonly toolCalls: {
    readonly toolName: string;
    readonly success: boolean;
    readonly timestampMs: TimestampMs;
  }[];
  readonly evaluation: {
    readonly result: 'success' | 'partial' | 'failure';
    readonly summary: string;
  };
  readonly parentTraceId?: string;
  readonly signals: Signal[];
}

/** Trace index entry */
interface TraceIndexEntry {
  readonly traceId: string;
  readonly sessionKey: SessionKey;
  readonly taskSignature: string;
  readonly detectedConcepts: string[];
  readonly toolNames: string[];
  readonly result: 'success' | 'partial' | 'failure';
  readonly createdAtMs: TimestampMs;
  readonly filePath: string;
}

/**
 * TaskTraceManager - Manages case-based reasoning artifacts
 * 
 * Design principles:
 * - Each run packaged into a TaskTrace
 * - Stored per-session with global index
 * - Supports similarity retrieval
 * - Immutable once created
 */
export class TaskTraceManager {
  private readonly config: TaskTraceConfig;
  private readonly index: Map<string, TraceIndexEntry> = new Map();
  private indexLoaded = false;

  constructor(config: TaskTraceConfig) {
    this.config = config;
  }

  /**
   * Get traces directory for a session
   */
  private getTracesDir(sessionKey: SessionKey): string {
    return join(this.config.baseDir, 'traces', sessionKey);
  }

  /**
   * Get index file path
   */
  private getIndexPath(): string {
    return join(this.config.baseDir, 'trace-index.json');
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  /**
   * Load index from disk
   */
  private async loadIndex(): Promise<void> {
    if (this.indexLoaded) return;

    try {
      const indexPath = this.getIndexPath();
      const content = await readFile(indexPath, 'utf-8');
      const entries: TraceIndexEntry[] = JSON.parse(content);
      
      for (const entry of entries) {
        this.index.set(entry.traceId, entry);
      }
    } catch {
      // Index doesn't exist yet
    }

    this.indexLoaded = true;
  }

  /**
   * Save index to disk
   */
  private async saveIndex(): Promise<void> {
    const indexPath = this.getIndexPath();
    await this.ensureDir(join(this.config.baseDir, 'traces'));
    
    const entries = Array.from(this.index.values());
    await writeFile(indexPath, JSON.stringify(entries, null, 2));
  }

  /**
   * Create and store a TaskTrace
   */
  async createTrace(input: TaskTraceInput): Promise<TaskTrace> {
    await this.loadIndex();

    const now = Date.now();
    const traceId = deterministicId.generateTraceId(input.sessionKey, now);

    const trace: TaskTrace = {
      traceId,
      sessionKey: input.sessionKey,
      taskSignature: input.taskSignature,
      detectedConcepts: input.detectedConcepts,
      filledSlots: input.filledSlots,
      missingSlots: input.missingSlots,
      planSteps: input.planSteps.map(step => ({
        stepId: step.stepId,
        intent: step.intent,
        actionClass: step.actionClass,
        status: step.status,
      })),
      policyDecisions: input.policyDecisions,
      toolCalls: input.toolCalls,
      evaluation: input.evaluation,
      chainLinkage: {
        parentTraceId: input.parentTraceId,
        childTraceIds: [],
      },
      createdAtMs: now,
      completedAtMs: now,
    };

    // Store trace
    const tracesDir = this.getTracesDir(input.sessionKey);
    await this.ensureDir(tracesDir);

    const filePath = join(tracesDir, `${traceId}.json`);
    await writeFile(filePath, JSON.stringify(trace, null, 2));

    // Update index
    const indexEntry: TraceIndexEntry = {
      traceId,
      sessionKey: input.sessionKey,
      taskSignature: input.taskSignature,
      detectedConcepts: input.detectedConcepts,
      toolNames: [...new Set(input.toolCalls.map(c => c.toolName))],
      result: input.evaluation.result,
      createdAtMs: now,
      filePath,
    };

    this.index.set(traceId, indexEntry);
    await this.saveIndex();

    // Update parent trace if exists
    if (input.parentTraceId) {
      await this.addChildTrace(input.parentTraceId, traceId);
    }

    // Enforce max traces per session
    await this.enforceMaxTraces(input.sessionKey);

    return trace;
  }

  /**
   * Get a trace by ID
   */
  async getTrace(traceId: string): Promise<TaskTrace | null> {
    await this.loadIndex();

    const entry = this.index.get(traceId);
    if (!entry) return null;

    try {
      const content = await readFile(entry.filePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Get all traces for a session
   */
  async getSessionTraces(sessionKey: SessionKey): Promise<TaskTrace[]> {
    await this.loadIndex();

    const entries = Array.from(this.index.values())
      .filter(e => e.sessionKey === sessionKey);

    const traces: TaskTrace[] = [];
    for (const entry of entries) {
      const trace = await this.getTrace(entry.traceId);
      if (trace) traces.push(trace);
    }

    return traces.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  /**
   * Add child trace to parent
   */
  private async addChildTrace(parentTraceId: string, childTraceId: string): Promise<void> {
    const parent = await this.getTrace(parentTraceId);
    if (!parent) return;

    const updated: TaskTrace = {
      ...parent,
      chainLinkage: {
        ...parent.chainLinkage,
        childTraceIds: [...parent.chainLinkage.childTraceIds, childTraceId],
      },
    };

    const entry = this.index.get(parentTraceId);
    if (entry) {
      await writeFile(entry.filePath, JSON.stringify(updated, null, 2));
    }
  }

  /**
   * Enforce maximum traces per session
   */
  private async enforceMaxTraces(sessionKey: SessionKey): Promise<void> {
    const maxTraces = this.config.maxTracesPerSession ?? 1000;
    
    const sessionEntries = Array.from(this.index.values())
      .filter(e => e.sessionKey === sessionKey)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);

    if (sessionEntries.length > maxTraces) {
      const toRemove = sessionEntries.slice(0, sessionEntries.length - maxTraces);
      
      for (const entry of toRemove) {
        this.index.delete(entry.traceId);
        // Note: File remains on disk for audit
      }

      await this.saveIndex();
    }
  }

  /**
   * Get trace statistics
   */
  async getStats(): Promise<{
    totalTraces: number;
    tracesBySession: Record<string, number>;
    tracesByResult: Record<string, number>;
  }> {
    await this.loadIndex();

    const entries = Array.from(this.index.values());
    
    const tracesBySession: Record<string, number> = {};
    const tracesByResult: Record<string, number> = {};

    for (const entry of entries) {
      tracesBySession[entry.sessionKey] = (tracesBySession[entry.sessionKey] ?? 0) + 1;
      tracesByResult[entry.result] = (tracesByResult[entry.result] ?? 0) + 1;
    }

    return {
      totalTraces: entries.length,
      tracesBySession,
      tracesByResult,
    };
  }

  /**
   * Clear all traces for a session
   */
  async clearSession(sessionKey: SessionKey): Promise<void> {
    await this.loadIndex();

    for (const [traceId, entry] of this.index) {
      if (entry.sessionKey === sessionKey) {
        this.index.delete(traceId);
      }
    }

    await this.saveIndex();
  }

  /**
   * Generate task signature from content
   */
  static generateTaskSignature(content: string): string {
    // Normalize content: lowercase, remove extra spaces
    const normalized = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Extract key terms (first 5 significant words)
    const words = normalized.split(' ').filter(w => w.length > 2);
    const keyTerms = words.slice(0, 5);

    return keyTerms.join('_');
  }
}
