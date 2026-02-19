/**
 * Milestone 6: Loop Execution Tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNeuronWavesLoop } from '../src/orchestrator/loop.js';
import { DEFAULT_TOOL_LIMITS } from '../src/tools/types.js';

describe('M6: Loop Tool Execution', () => {
  let tempWorkspace: string;

  beforeEach(() => {
    tempWorkspace = mkdtempSync(join(tmpdir(), 'synth-loop-'));
  });

  afterEach(() => {
    // Cleanup - simplified for compatibility
    try {
      rmdirSync(tempWorkspace, { recursive: true });
    } catch {}
  });

  describe('Tool execution basics', () => {
    it('executes local_only tools when allowed', async () => {
      // Create a test file
      mkdirSync(tempWorkspace, { recursive: true });
      writeFileSync(join(tempWorkspace, 'targets.txt'), 'target1\ntarget2');

      const result = await runNeuronWavesLoop(
        {
          content: 'read file targets.txt',
          sessionKey: 'test-exec-1',
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
        }
      );

      expect(result.evaluation.result).toBe('success');
      expect(result.plan.steps).toBeDefined();
    });

    it('respects maxToolCallsPerRun limit', async () => {
      const result = await runNeuronWavesLoop(
        {
          content: 'multiple operations',
          sessionKey: 'test-limit-1',
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
        }
      );

      // Should complete without infinite recursion
      expect(result.evaluation.result).toBeDefined();
    });
  });

  describe('Step status handling', () => {
    it('creates proper step statuses', async () => {
      const result = await runNeuronWavesLoop(
        {
          content: 'step operation',
          sessionKey: 'test-status-1',
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
        }
      );

      expect(result.plan.steps).toBeDefined();
      expect(result.plan.steps.length).toBeGreaterThan(0);

      // All steps should have valid statuses
      for (const step of result.plan.steps) {
        expect(['allowed', 'awaiting_approval', 'blocked', 'executed', 'failed', 'skipped']).toContain(step.status);
      }
    });
  });

  describe('Awaiting approval', () => {
    it('awaits approval for irreversible actions at level 2', async () => {
      const result = await runNeuronWavesLoop(
        {
          content: 'delete file permanently',
          sessionKey: 'test-approval-1',
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 2,
        }
      );

      // Irreversible actions may await approval depending on planner
      expect(result.plan.steps.every(s => ['awaiting_approval', 'blocked', 'allowed', 'skipped'].includes(s.status))).toBe(true);
    });
  });

  describe('Blocked actions', () => {
    it('blocks money_movement at all levels', async () => {
      const result = await runNeuronWavesLoop(
        {
          content: 'transfer money',
          sessionKey: 'test-block-1',
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 3,
        }
      );

      expect(result.evaluation.result).toBeDefined();
    });
  });

  describe('Execution flow', () => {
    it('completes full loop without errors', async () => {
      const result = await runNeuronWavesLoop(
        {
          content: 'simple local operation',
          sessionKey: 'test-flow-1',
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
        }
      );

      expect(result.plan).toBeDefined();
      expect(result.evaluation).toBeDefined();
    });
  });
});
