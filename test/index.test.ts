import { describe, it, expect } from 'vitest';
import { synthesize, type LoopConfig, type LoopInput } from '../src/index.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('NeuronWaves Skeleton', () => {
  it('should run and return success', async () => {
    // Use unique temp directory to avoid race condition with m1-artifacts.test.ts
    const tempDir = await mkdtemp(join(tmpdir(), 'neuronwaves-test-'));
    
    try {
      const result = await synthesize({
        sessionKey: 'test-001',
        content: 'hello world',
        artifactDir: tempDir
      });

      expect(result.plan).toBeDefined();
      expect(result.evaluation).toBeDefined();
      expect(result.plan.sessionKey).toBe('test-001');
    } finally {
      // Cleanup temp directory
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});