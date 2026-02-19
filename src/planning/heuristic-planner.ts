/**
 * Heuristic Planner - Milestone 3
 * Default planner implementation using simple heuristics
 */
import { randomUUID } from 'node:crypto';
import type { PlannerInput, PlanGraph, PlanStep } from '../types.js';
import type { Planner } from './planner.js';

/**
 * HeuristicPlanner - Simple rule-based planner
 * Milestone 3: Deterministic keyword-based planning
 */
export class HeuristicPlanner implements Planner {
  /**
   * Hash a string to a number (FNV-1a inspired)
   */
  private hash(str: string): number {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash);
  }

  /**
   * Generate deterministic ID based on content hash
   */
  private generateId(prefix: string, content: string): string {
    const hashValue = this.hash(content);
    return `${prefix}-${hashValue.toString().padStart(32, '0')}`;
  }

  /**
   * Create a plan using heuristic rules
   */
  createPlan(input: PlannerInput): PlanGraph {
    const { text, sessionKey } = input;
    const now = Date.now();
    const actionClass = this.classifyAction(text);

    // Use hash of content+sessionKey for deterministic IDs
    const planId = this.generateId('plan', `${sessionKey}:${text}`);
    const stepId = this.generateId('step', `${sessionKey}:${text}:0`);

    const step: PlanStep = {
      stepId,
      intent: text,
      actionClass,
      status: 'planned',
    };

    return {
      id: planId,
      sessionKey,
      createdAtMs: now,
      steps: [step],
    };
  }

  /**
   * Legacy test-compatible interface
   */
  plan(text: string, sessionKey: string): PlanGraph {
    return this.createPlan({
      text,
      sessionKey,
      workspaceDir: process.cwd(),
      autonomy: 2,
    });
  }

  /**
   * Classify the action based on text analysis
   */
  private classifyAction(text: string): PlanStep['actionClass'] {
    const lowerText = text.toLowerCase();

    // 1. Delete/irreversible (highest priority - safety)
    if (/\b(delete|remove|destroy|erase)\b/.test(lowerText)) {
      return 'irreversible';
    }

    // 2. Money movement
    if (/\b(transfer|pay|send money|payment|send funds|pay someone|make a payment)\b/.test(lowerText)) {
      return 'money_movement';
    }

    // 3. Search/read
    if (/\b(search|look up|find|fetch|get)\b/.test(lowerText)) {
      return 'external_read';
    }

    // 4. Write note (local)
    if (/\bwrite\s+(a\s+)?note\b/.test(lowerText)) {
      return 'local_only';
    }

    // 5. Create file/save/record
    if (/\b(create\s+(a\s+)?file|save|record)\b/.test(lowerText)) {
      return 'local_only';
    }

    // 6. Generic write
    if (/\b(write)\b/.test(lowerText)) {
      return 'external_write';
    }

    // Default
    return 'local_only';
  }
}
