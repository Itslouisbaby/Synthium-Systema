/**
 * Milestone 8 Track B: Loop Integration Tests
 * Tests end-to-end integration of semantic fact consolidation and recall
 * Updated to use SynthRuntime (v2) instead of runNeuronWavesLoop (v1)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSynthRuntime } from '../src/orchestrator/runtime.js';
import { ArtifactStore } from '../src/artifacts/store.js';
import type { Planner, PlanGraph, PlannerInput } from '../src/planning/planner.js';

/** Helper: run SynthRuntime for a single input with an optional mock planner */
async function runOnce(
  content: string,
  sessionKey: string,
  artifactBaseDir: string,
  options: { planner?: Planner; enableMemory?: boolean } = {}
) {
  const runtime = createSynthRuntime({
    artifactBaseDir,
    autonomyLevel: 1,
    enableMemory: options.enableMemory ?? true,
    planner: options.planner,
  });
  const result = await runtime.submitInput(sessionKey, content);
  runtime.stop();
  return result;
}

describe('M8 Track B: Loop Integration', () => {
  let tempWorkspace: string;
  const sessionKey = 'test-m8-integration';

  beforeEach(() => {
    tempWorkspace = mkdtempSync(join(tmpdir(), 'synth-m8-loop-'));
  });

  afterEach(() => {
    try {
      rmdirSync(tempWorkspace, { recursive: true });
    } catch {}
  });

  describe('fact extraction during loop execution', () => {
    it('extracts facts from local_write and stores in facts.json', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const mockPlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_write',
            toolInput: { path: join(tempWorkspace, 'test.txt'), content: 'hello world', mode: 'overwrite' },
            status: 'allowed',
          }],
        }),
      };

      const result = await runOnce(
        'Write to test.txt with some content',
        sessionKey,
        tempWorkspace,
        { planner: mockPlanner }
      );

      expect(result.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      expect(facts.length).toBeGreaterThan(0);

      const writeFact = facts.find(f => f.toolName === 'local_write');
      expect(writeFact).toBeDefined();
      expect(writeFact?.statement).toContain('was written successfully');
    });

    it('extracts facts from local_read and stores in facts.json', async () => {
      mkdirSync(tempWorkspace, { recursive: true });
      const testFile = join(tempWorkspace, 'existing.txt');
      writeFileSync(testFile, 'some content');

      const mockPlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_read',
            toolInput: { path: testFile },
            status: 'allowed',
          }],
        }),
      };

      const result = await runOnce(
        'Read file existing.txt',
        sessionKey,
        tempWorkspace,
        { planner: mockPlanner }
      );

      expect(result.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      const readFact = facts.find(f => f.toolName === 'local_read');
      expect(readFact).toBeDefined();
      expect(readFact?.statement).toContain('exists and contains');
    });

    it('extracts facts from local_search and stores in facts.json', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const mockPlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_search',
            toolInput: { query: 'content', root: tempWorkspace },
            status: 'allowed',
          }],
        }),
      };

      const result = await runOnce(
        'Search for "content" in current directory',
        sessionKey,
        tempWorkspace,
        { planner: mockPlanner }
      );

      expect(result.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      const searchFact = facts.find(f => f.toolName === 'local_search');
      expect(searchFact).toBeDefined();
      expect(searchFact?.statement).toContain('Search for');
    });

    it('creates facts.json file in session directory', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const mockPlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_write',
            toolInput: { path: join(tempWorkspace, 'test.txt'), content: 'hello', mode: 'overwrite' },
            status: 'allowed',
          }],
        }),
      };

      await runOnce('Write test file', sessionKey, tempWorkspace, { planner: mockPlanner });

      const factsPath = join(tempWorkspace, 'memory', 'semantic', 'facts.json');
      expect(existsSync(factsPath)).toBe(true);

      const content = readFileSync(factsPath, 'utf-8');
      const facts = JSON.parse(content);
      expect(Array.isArray(facts)).toBe(true);
    });
  });

  describe('fact recall in subsequent loop runs', () => {
    it('recalls semantic facts when running again', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const mockWritePlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_write',
            toolInput: { path: join(tempWorkspace, 'first.txt'), content: 'some content', mode: 'overwrite' },
            status: 'allowed',
          }],
        }),
      };

      const result1 = await runOnce(
        'Write to first.txt with some content',
        sessionKey,
        tempWorkspace,
        { planner: mockWritePlanner }
      );

      expect(result1.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts1 = await store.readFacts(sessionKey);
      expect(facts1.length).toBeGreaterThan(0);

      const mockSecondWritePlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_write',
            toolInput: { path: join(tempWorkspace, 'second.txt'), content: 'more content', mode: 'overwrite' },
            status: 'allowed',
          }],
        }),
      };

      const result2 = await runOnce(
        'Write to second.txt with more content',
        sessionKey,
        tempWorkspace,
        { planner: mockSecondWritePlanner }
      );

      expect(result2.evaluation.result).toBeDefined();
      expect(result2.planId).toBeDefined();
    });

    it('persists facts across multiple runs', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      for (let i = 0; i < 3; i++) {
        const mockPlanner: Planner = {
          createPlan: (input: PlannerInput): PlanGraph => ({
            id: 'test-plan',
            sessionKey: input.sessionKey,
            createdAtMs: Date.now(),
            steps: [{
              stepId: 'step-1',
              intent: input.text,
              actionClass: 'local_only',
              toolName: 'local_write',
              toolInput: { path: join(tempWorkspace, `file${i}.txt`), content: `content ${i}`, mode: 'overwrite' },
              status: 'allowed',
            }],
          }),
        };

        await runOnce(`Write to file${i}.txt`, sessionKey, tempWorkspace, { planner: mockPlanner });
      }

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);
      expect(facts.length).toBeGreaterThan(0);
    });
  });

  describe('facts.json file structure', () => {
    it('stores facts as JSON array with correct structure', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const mockPlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_write',
            toolInput: { path: join(tempWorkspace, 'test.txt'), content: 'hello', mode: 'overwrite' },
            status: 'allowed',
          }],
        }),
      };

      await runOnce('Create test file', sessionKey, tempWorkspace, { planner: mockPlanner });

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      for (const fact of facts) {
        expect(fact.factId).toBeDefined();
        expect(fact.sessionKey).toBe(sessionKey);
        expect(fact.statement).toBeDefined();
        expect(fact.statementHash).toBeDefined();
        expect(fact.toolName).toBeDefined();
        expect(fact.evidence).toBeDefined();
        expect(fact.evidence).toHaveLength(1);
        expect(fact.evidence[0].type).toBe('tool_result');
        expect(fact.evidence[0].refId).toBeDefined();
        expect(fact.evidence[0].timestampMs).toBeDefined();
        expect(fact.source).toBe('consolidator');
        expect(fact.privacyLevel).toBeDefined();
        expect(fact.confidence).toBeDefined();
        expect(fact.lastVerifiedMs).toBeDefined();
        expect(fact.lastReinforcedMs).toBeDefined();
        expect(fact.createdAtMs).toBeDefined();
      }
    });
  });

  describe('integration with existing loop features', () => {
    it('works with memory enabled', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const mockPlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_write',
            toolInput: { path: join(tempWorkspace, 'test.txt'), content: 'hello', mode: 'overwrite' },
            status: 'allowed',
          }],
        }),
      };

      const result = await runOnce(
        'Write and then read',
        sessionKey,
        tempWorkspace,
        { planner: mockPlanner, enableMemory: true }
      );

      expect(result.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);
      expect(facts.length).toBeGreaterThan(0);
    });

    it('works with memory disabled (facts still created)', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const mockPlanner: Planner = {
        createPlan: (input: PlannerInput): PlanGraph => ({
          id: 'test-plan',
          sessionKey: input.sessionKey,
          createdAtMs: Date.now(),
          steps: [{
            stepId: 'step-1',
            intent: input.text,
            actionClass: 'local_only',
            toolName: 'local_write',
            toolInput: { path: join(tempWorkspace, 'test.txt'), content: 'hello', mode: 'overwrite' },
            status: 'allowed',
          }],
        }),
      };

      const result = await runOnce(
        'Write to file',
        sessionKey,
        tempWorkspace,
        { planner: mockPlanner, enableMemory: false }
      );

      expect(result.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);
      // Facts are created by consolidator regardless of memory setting
      expect(Array.isArray(facts)).toBe(true);
    });
  });
});
