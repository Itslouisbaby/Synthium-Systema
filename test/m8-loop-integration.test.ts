/**
 * Milestone 8 Track B: Loop Integration Tests
 * Tests end-to-end integration of semantic fact consolidation and recall
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNeuronWavesLoop } from '../src/orchestrator/loop.js';
import { ArtifactStore } from '../src/artifacts/store.js';

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
      // Create a subdirectory to work in
      mkdirSync(tempWorkspace, { recursive: true });

      const result = await runNeuronWavesLoop(
        {
          content: 'Write to test.txt with some content',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      // Check that execution succeeded or at least completed
      expect(result.evaluation.result).toBeDefined();

      // Check that facts.json was created
      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      // Should have extracted at least one fact (from local_write)
      expect(facts.length).toBeGreaterThan(0);

      // Check fact structure
      const writeFact = facts.find(f => f.toolName === 'local_write');
      expect(writeFact).toBeDefined();
      expect(writeFact?.statement).toContain('was written successfully');
    });

    it('extracts facts from local_read and stores in facts.json', async () => {
      // Create a test file first
      mkdirSync(tempWorkspace, { recursive: true });
      writeFileSync(join(tempWorkspace, 'existing.txt'), 'some content');

      const result = await runNeuronWavesLoop(
        {
          content: 'Read file existing.txt',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      expect(result.evaluation.result).toBeDefined();

      // Check facts.json
      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      const readFact = facts.find(f => f.toolName === 'local_read');
      expect(readFact).toBeDefined();
      expect(readFact?.statement).toContain('exists and contains');
    });

    it('extracts facts from local_search and stores in facts.json', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const result = await runNeuronWavesLoop(
        {
          content: 'Search for "content" in current directory',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      expect(result.evaluation.result).toBeDefined();

      // Check facts.json
      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      const searchFact = facts.find(f => f.toolName === 'local_search');
      expect(searchFact).toBeDefined();
      expect(searchFact?.statement).toContain('Search for');
    });

    it('creates facts.json file in session directory', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      await runNeuronWavesLoop(
        {
          content: 'Write test file',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      // Check that facts.json exists in session directory
      const factsPath = join(tempWorkspace, sessionKey, 'facts.json');
      expect(existsSync(factsPath)).toBe(true);

      // Check file is valid JSON
      const content = readFileSync(factsPath, 'utf-8');
      const facts = JSON.parse(content);
      expect(Array.isArray(facts)).toBe(true);
    });
  });

  describe('fact recall in subsequent loop runs', () => {
    it('recalls semantic facts when running again', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      // First run: Create facts
      const result1 = await runNeuronWavesLoop(
        {
          content: 'Write to first.txt with some content',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      expect(result1.evaluation.result).toBeDefined();

      // Verify facts were created
      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts1 = await store.readFacts(sessionKey);
      expect(facts1.length).toBeGreaterThan(0);

      // Second run: Facts should be recalled into context
      const result2 = await runNeuronWavesLoop(
        {
          content: 'Write to second.txt with more content',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      expect(result2.evaluation.result).toBeDefined();

      // Plan should have been created with context
      expect(result2.plan).toBeDefined();
    });

    it('persists facts across multiple runs', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      // Run multiple times
      for (let i = 0; i < 3; i++) {
        await runNeuronWavesLoop(
          {
            content: `Write to file${i}.txt`,
            sessionKey,
          },
          {
            artifactBaseDir: tempWorkspace,
            autonomyLevel: 1,
            enableMemory: true,
          }
        );
      }

      // Check final facts - should have facts from latest run
      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      expect(facts.length).toBeGreaterThan(0);
    });
  });

  describe('facts.json file structure', () => {
    it('stores facts as JSON array with correct structure', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      await runNeuronWavesLoop(
        {
          content: 'Create test file',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      // Each fact should have all required fields
      for (const fact of facts) {
        expect(fact.id).toBeDefined();
        expect(fact.sessionKey).toBe(sessionKey);
        expect(fact.statement).toBeDefined();
        expect(fact.toolName).toBeDefined();
        expect(fact.evidence).toBeDefined();
        expect(fact.evidence.type).toBe('tool_result');
        expect(fact.evidence.refId).toBeDefined();
        expect(fact.evidence.timestampMs).toBeDefined();
        expect(fact.confidence).toBeDefined();
        expect(fact.lastVerifiedMs).toBeDefined();
        expect(fact.createdAtMs).toBeDefined();
      }
    });
  });

  describe('integration with existing loop features', () => {
    it('works with memory enabled', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const result = await runNeuronWavesLoop(
        {
          content: 'Write and then read',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      expect(result.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      // With memory enabled, facts should be created
      expect(facts.length).toBeGreaterThan(0);
    });

    it('works with memory disabled (facts still created)', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      const result = await runNeuronWavesLoop(
        {
          content: 'Write to file',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: false,
        }
      );

      expect(result.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      // Facts are created from tool results regardless of memory setting
      expect(facts.length).toBeGreaterThan(0);
    });
  });

  describe('fact extraction edge cases', () => {
    it('creates no facts when no tools executed', async () => {
      mkdirSync(tempWorkspace, { recursive: true });

      // Use input that doesn't trigger any tool execution
      const result = await runNeuronWavesLoop(
        {
          content: 'This is just a comment with no actions',
          sessionKey,
        },
        {
          artifactBaseDir: tempWorkspace,
          autonomyLevel: 1,
          enableMemory: true,
        }
      );

      expect(result.evaluation.result).toBeDefined();

      const store = new ArtifactStore({ baseDir: tempWorkspace });
      const facts = await store.readFacts(sessionKey);

      // No tools executed = no facts
      expect(facts).toHaveLength(0);
    });
  });
});
