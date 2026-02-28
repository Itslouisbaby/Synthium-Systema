/**
 * Semantic Fact Consolidator - Milestone 8 Track B
 * Extracts semantic facts from tool execution results
 */
import { randomUUID, createHash } from 'node:crypto';
import type { UUID, TimestampMs, SessionKey } from '../../types.js';
import type { PlanStep } from '../../types.js';
import type { SemanticFact } from './types.js';

/**
 * Consolidator - Extracts semantic facts from tool results
 */
export class Consolidator {
  /**
   * Generate SHA-256 hash of a statement
   */
  private hashStatement(statement: string): string {
    return createHash('sha256').update(statement).digest('hex');
  }

  /**
   * Extract facts from tool results
   * @param steps - Plan steps with execution results
   * @param sessionKey - Session identifier
   * @returns Array of semantic facts
   */
  extractFacts(steps: readonly PlanStep[], sessionKey: SessionKey): SemanticFact[] {
    const facts: SemanticFact[] = [];
    const now = Date.now();

    for (const step of steps) {
      // Skip steps that didn't execute successfully or are not the target tools
      if (step.status !== 'executed' || !step.toolName) {
        continue;
      }

      // Skip if output summary is not present
      if (!step.outputSummary) {
        continue;
      }

      // Extract facts based on tool type
      switch (step.toolName) {
        case 'local_read': {
          const fact = this.extractReadFact(step, sessionKey, now);
          if (fact) facts.push(fact);
          break;
        }
        case 'local_write': {
          const fact = this.extractWriteFact(step, sessionKey, now);
          if (fact) facts.push(fact);
          break;
        }
        case 'local_search': {
          const fact = this.extractSearchFact(step, sessionKey, now);
          if (fact) facts.push(fact);
          break;
        }
        case 'local_reason':
        case 'external_read_reasoning': {
          const fact = this.extractReasoningFact(step, sessionKey, now);
          if (fact) facts.push(fact);
          break;
        }
        // Skip other tools
        default:
          break;
      }
    }

    return facts;
  }

  /**
   * Extract fact from local_read result
   */
  private extractReadFact(
    step: PlanStep,
    sessionKey: SessionKey,
    timestampMs: TimestampMs
  ): SemanticFact | null {
    const output = step.outputSummary as any;
    if (!output || typeof output.content !== 'string') {
      return null;
    }

    // Extract fields
    const path = step.toolInput?.path as string;
    const bytesRead = output.bytesRead;
    const truncated = output.truncated;

    // Build statement
    const truncatedNote = truncated ? ' (truncated)' : '';
    const statement = `File "${path}" exists and contains ${bytesRead} bytes${truncatedNote}`;
    const statementHash = this.hashStatement(statement);

    return {
      factId: randomUUID(),
      statement,
      statementHash,
      evidence: [
        {
          type: 'tool_result',
          refId: step.stepId,
          timestampMs,
        },
      ],
      source: 'consolidator',
      privacyLevel: 'private',
      confidence: 1.0,
      lastVerifiedMs: timestampMs,
      lastReinforcedMs: timestampMs,
      createdAtMs: timestampMs,
      toolName: step.toolName,
      sessionKey,
    };
  }

  /**
   * Extract fact from local_write result
   */
  private extractWriteFact(
    step: PlanStep,
    sessionKey: SessionKey,
    timestampMs: TimestampMs
  ): SemanticFact | null {
    const output = step.outputSummary as any;
    if (!output || typeof output.bytesWritten !== 'number') {
      return null;
    }

    // Extract fields
    const path = step.toolInput?.path as string;
    const bytesWritten = output.bytesWritten;

    // Build statement
    const statement = `File "${path}" was written successfully (${bytesWritten} bytes)`;
    const statementHash = this.hashStatement(statement);

    return {
      factId: randomUUID(),
      statement,
      statementHash,
      evidence: [
        {
          type: 'tool_result',
          refId: step.stepId,
          timestampMs,
        },
      ],
      source: 'consolidator',
      privacyLevel: 'private',
      confidence: 1.0,
      lastVerifiedMs: timestampMs,
      lastReinforcedMs: timestampMs,
      createdAtMs: timestampMs,
      toolName: step.toolName,
      sessionKey,
    };
  }



  /**
   * Extract fact from reasoning-style tool outputs
   */
  private extractReasoningFact(
    step: PlanStep,
    sessionKey: SessionKey,
    timestampMs: TimestampMs
  ): SemanticFact | null {
    if (typeof step.outputSummary !== 'string' || step.outputSummary.trim().length === 0) {
      return null;
    }

    const statement = `[${step.toolName}] ${step.outputSummary}`;
    const statementHash = this.hashStatement(statement);

    return {
      factId: randomUUID(),
      statement,
      statementHash,
      evidence: [
        {
          type: 'tool_result',
          refId: step.stepId,
          timestampMs,
        },
      ],
      source: 'consolidator',
      privacyLevel: 'private',
      confidence: 0.8,
      lastVerifiedMs: timestampMs,
      lastReinforcedMs: timestampMs,
      createdAtMs: timestampMs,
      toolName: step.toolName,
      sessionKey,
    };
  }

  /**
   * Extract fact from local_search result
   */
  private extractSearchFact(
    step: PlanStep,
    sessionKey: SessionKey,
    timestampMs: TimestampMs
  ): SemanticFact | null {
    const output = step.outputSummary as any;
    if (!output || typeof output.totalMatches !== 'number') {
      return null;
    }

    // Extract fields
    const query = step.toolInput?.query as string;
    const root = step.toolInput?.root as string;
    const totalMatches = output.totalMatches;

    // Build statement based on whether matches were found
    const statement = totalMatches === 0
      ? `Search for "${query}" in "${root}" found no matches`
      : `Search for "${query}" in "${root}" found ${totalMatches} matches`;
    const statementHash = this.hashStatement(statement);

    return {
      factId: randomUUID(),
      statement,
      statementHash,
      evidence: [
        {
          type: 'tool_result',
          refId: step.stepId,
          timestampMs,
        },
      ],
      source: 'consolidator',
      privacyLevel: 'private',
      confidence: 1.0,
      lastVerifiedMs: timestampMs,
      lastReinforcedMs: timestampMs,
      createdAtMs: timestampMs,
      toolName: step.toolName,
      sessionKey,
    };
  }
}
