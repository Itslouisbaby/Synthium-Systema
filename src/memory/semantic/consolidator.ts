/**
 * Semantic Fact Consolidator - Milestone 8 Track B
 * Extracts semantic facts from tool execution results
 */
import { randomUUID } from 'node:crypto';
import type { UUID, TimestampMs, SessionKey, SemanticFact } from '../../types.js';
import type { PlanStep } from '../../types.js';
import type { LocalReadOutput, LocalWriteOutput, LocalSearchOutput } from '../../tools/types.js';

/**
 * Consolidator - Extracts semantic facts from tool results
 */
export class Consolidator {
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
    const output = step.outputSummary as LocalReadOutput;
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

    return {
      id: randomUUID(),
      sessionKey,
      statement,
      toolName: 'local_read',
      evidence: {
        type: 'tool_result',
        refId: step.stepId,
        timestampMs: step.stepId ? undefined : timestampMs, // Use step timestamp if available
      },
      confidence: 1.0, // Direct tool result = high confidence
      lastVerifiedMs: timestampMs,
      createdAtMs: timestampMs,
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
    const output = step.outputSummary as LocalWriteOutput;
    if (!output || typeof output.bytesWritten !== 'number') {
      return null;
    }

    // Extract fields
    const path = step.toolInput?.path as string;
    const bytesWritten = output.bytesWritten;

    // Build statement
    const statement = `File "${path}" was written successfully (${bytesWritten} bytes)`;

    return {
      id: randomUUID(),
      sessionKey,
      statement,
      toolName: 'local_write',
      evidence: {
        type: 'tool_result',
        refId: step.stepId,
        timestampMs: timestampMs,
      },
      confidence: 1.0, // Direct tool result = high confidence
      lastVerifiedMs: timestampMs,
      createdAtMs: timestampMs,
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
    const output = step.outputSummary as LocalSearchOutput;
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

    return {
      id: randomUUID(),
      sessionKey,
      statement,
      toolName: 'local_search',
      evidence: {
        type: 'tool_result',
        refId: step.stepId,
        timestampMs: timestampMs,
      },
      confidence: 1.0, // Direct tool result = high confidence
      lastVerifiedMs: timestampMs,
      createdAtMs: timestampMs,
    };
  }
}
