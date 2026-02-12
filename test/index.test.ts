import { describe, it, expect } from 'vitest';
import { synthesize, type LoopConfig, type LoopInput } from '../src/index.js';

describe('NeuronWaves Skeleton', () => {
  it('should run and return success', async () => {
    const result = await synthesize({
      sessionKey: 'test-001',
      content: 'hello world',
      artifactDir: '.test-artifacts'
    });

    expect(result.plan).toBeDefined();
    expect(result.evaluation).toBeDefined();
    expect(result.plan.sessionKey).toBe('test-001');
  });
});