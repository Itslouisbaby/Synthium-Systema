/**
 * Milestone 8 Track B: Consolidator Tests
 */
import { describe, it, expect } from 'vitest';
import { Consolidator } from '../src/memory/semantic/consolidator.js';
import type { PlanStep } from '../src/types.js';

describe('M8 Track B: Consolidator', () => {
  const consolidator = new Consolidator();

  describe('local_write fact extraction', () => {
    it('creates fact from successful local_write', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Write to file',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_write',
          toolInput: { path: 'test.txt' },
          outputSummary: {
            bytesWritten: 100,
            path: '/workspace/test.txt',
          },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(1);
      expect(facts[0].factId).toBeDefined();
      expect(facts[0].statement).toBe('File "test.txt" was written successfully (100 bytes)');
      expect(facts[0].statementHash).toBeDefined();
      expect(facts[0].toolName).toBe('local_write');
      expect(facts[0].confidence).toBe(1.0);
      expect(facts[0].sessionKey).toBe('test-session');
      expect(facts[0].source).toBe('consolidator');
      expect(facts[0].privacyLevel).toBe('private');
      expect(facts[0].lastReinforcedMs).toBeDefined();
      expect(facts[0].evidence).toHaveLength(1);
      expect(facts[0].evidence[0].type).toBe('tool_result');
      expect(facts[0].evidence[0].refId).toBe('step-1');
    });

    it('creates no fact from failed local_write', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Write to file',
          actionClass: 'local_only',
          status: 'failed',
          toolName: 'local_write',
          toolInput: { path: 'test.txt' },
          outputSummary: { error: 'write failed' },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(0);
    });

    it('creates no fact from timeout', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Write to file',
          actionClass: 'local_only',
          status: 'skipped',
          toolName: 'local_write',
          toolInput: { path: 'test.txt' },
          outputSummary: { skipped: true, reason: 'timeout' },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(0);
    });
  });

  describe('local_read fact extraction', () => {
    it('creates fact from successful local_read', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Read file',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_read',
          toolInput: { path: 'test.txt' },
          outputSummary: {
            content: 'file content',
            bytesRead: 12,
            truncated: false,
          },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(1);
      expect(facts[0].factId).toBeDefined();
      expect(facts[0].statement).toBe('File "test.txt" exists and contains 12 bytes');
      expect(facts[0].toolName).toBe('local_read');
    });

    it('includes "(truncated)" note for truncated reads', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Read file',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_read',
          toolInput: { path: 'test.txt' },
          outputSummary: {
            content: 'file content...',
            bytesRead: 1000,
            truncated: true,
          },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(1);
      expect(facts[0].factId).toBeDefined();
      expect(facts[0].statement).toBe('File "test.txt" exists and contains 1000 bytes (truncated)');
    });
  });

  describe('local_search fact extraction', () => {
    it('creates fact for search with matches', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Search files',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_search',
          toolInput: { query: 'hello', root: './src' },
          outputSummary: {
            matches: [],
            totalMatches: 5,
            truncated: false,
          },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(1);
      expect(facts[0].factId).toBeDefined();
      expect(facts[0].statement).toBe('Search for "hello" in "./src" found 5 matches');
      expect(facts[0].toolName).toBe('local_search');
    });

    it('creates fact for search with no matches', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Search files',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_search',
          toolInput: { query: 'notfound', root: './src' },
          outputSummary: {
            matches: [],
            totalMatches: 0,
            truncated: false,
          },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(1);
      expect(facts[0].factId).toBeDefined();
      expect(facts[0].statement).toBe('Search for "notfound" in "./src" found no matches');
    });
  });

  describe('skipping non-executed or unsupported steps', () => {
    it('skips steps that are not executed', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Write to file',
          actionClass: 'local_only',
          status: 'allowed',
          toolName: 'local_write',
          toolInput: { path: 'test.txt' },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(0);
    });

    it('skips steps that are blocked', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Write to file',
          actionClass: 'local_only',
          status: 'blocked',
          toolName: 'local_write',
          toolInput: { path: 'test.txt' },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(0);
    });

    it('skips steps that are awaiting_approval', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Write to file',
          actionClass: 'local_only',
          status: 'awaiting_approval',
          toolName: 'local_write',
          toolInput: { path: 'test.txt' },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(0);
    });

    it('skips steps without toolName', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Do something',
          actionClass: 'local_only',
          status: 'executed',
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(0);
    });

    it('skips unsupported tool names', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Run custom tool',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'custom_tool',
          toolInput: {},
          outputSummary: { result: 'done' },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(0);
    });
  });

  describe('multiple facts extraction', () => {
    it('extracts multiple facts from multiple steps', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-1',
          intent: 'Write file',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_write',
          toolInput: { path: 'file1.txt' },
          outputSummary: {
            bytesWritten: 50,
            path: '/workspace/file1.txt',
          },
        },
        {
          stepId: 'step-2',
          intent: 'Read file',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_read',
          toolInput: { path: 'file2.txt' },
          outputSummary: {
            content: 'content',
            bytesRead: 7,
            truncated: false,
          },
        },
        {
          stepId: 'step-3',
          intent: 'Search',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_search',
          toolInput: { query: 'test', root: './src' },
          outputSummary: {
            matches: [],
            totalMatches: 3,
            truncated: false,
          },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(3);
      expect(facts[0].toolName).toBe('local_write');
      expect(facts[1].toolName).toBe('local_read');
      expect(facts[2].toolName).toBe('local_search');
    });
  });

  describe('evidence attachment', () => {
    it('attaches evidence with tool_result type and refId', () => {
      const steps: readonly PlanStep[] = [
        {
          stepId: 'step-123',
          intent: 'Write file',
          actionClass: 'local_only',
          status: 'executed',
          toolName: 'local_write',
          toolInput: { path: 'test.txt' },
          outputSummary: {
            bytesWritten: 100,
            path: '/workspace/test.txt',
          },
        },
      ];

      const facts = consolidator.extractFacts(steps, 'test-session');

      expect(facts).toHaveLength(1);
      expect(facts[0].evidence).toHaveLength(1);
      expect(facts[0].evidence[0]).toEqual({
        type: 'tool_result',
        refId: 'step-123',
        timestampMs: expect.any(Number),
      });
    });
  });
});
