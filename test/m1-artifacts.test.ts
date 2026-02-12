import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { rm, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runNeuronWavesLoop, type LoopConfig, type LoopInput } from '../src/index.js';

const TEST_DIR = join(process.cwd(), '.test-artifacts');
const TEST_SESSION = 'test-session-m1';

async function cleanup() {
  try {
    await rm(TEST_DIR, { recursive: true, force: true });
  } catch { /* ignore */ }
}

async function countLines(path: string): Promise<number> {
  try {
    const content = await readFile(path, 'utf-8');
    return content.trim().split('\n').length;
  } catch {
    return 0;
  }
}

describe('Milestone 1: Loop Artifacts', () => {
  beforeAll(cleanup);
  afterAll(cleanup);
  beforeEach(() => cleanup());

  it('should run loop and return plan and evaluation', async () => {
    const config: LoopConfig = { artifactBaseDir: TEST_DIR };
    const input: LoopInput = {
      content: 'hello world',
      sessionKey: TEST_SESSION,
    };

    const result = await runNeuronWavesLoop(input, config);

    expect(result.plan).toBeDefined();
    expect(result.evaluation).toBeDefined();
    expect(result.plan.sessionKey).toBe(TEST_SESSION);
    expect(result.evaluation.sessionKey).toBe(TEST_SESSION);
    expect(result.evaluation.result).toBe('success');
  });

  it('should create all artifact files on first run', async () => {
    const config: LoopConfig = { artifactBaseDir: TEST_DIR };
    const input: LoopInput = {
      content: 'test input',
      sessionKey: TEST_SESSION,
    };

    await runNeuronWavesLoop(input, config);

    const sessionDir = join(TEST_DIR, TEST_SESSION);
    const files = await readdir(sessionDir, { recursive: true });
    const fileSet = new Set(files);
    
    expect(fileSet.has('observations.jsonl')).toBe(true);
    expect(fileSet.has('plans.jsonl')).toBe(true);
    expect(fileSet.has('evaluations.jsonl')).toBe(true);
    
    // Check for nested files (Windows uses \, Unix uses /)
    const nestedFiles = files.filter((f: string) => f.includes('/') || f.includes('\\'));
    const hasAudit = nestedFiles.some((f: string) => f.includes('actions.jsonl'));
    const hasState = nestedFiles.some((f: string) => f.includes('active.json'));
    expect(hasAudit).toBe(true);
    expect(hasState).toBe(true);
  });

  it('should append to JSONL files on multiple runs', async () => {
    const config: LoopConfig = { artifactBaseDir: TEST_DIR };

    // Run twice
    await runNeuronWavesLoop({ content: 'first', sessionKey: TEST_SESSION }, config);
    await runNeuronWavesLoop({ content: 'second', sessionKey: TEST_SESSION }, config);

    const sessionDir = join(TEST_DIR, TEST_SESSION);
    
    const obsLines = await countLines(join(sessionDir, 'observations.jsonl'));
    const planLines = await countLines(join(sessionDir, 'plans.jsonl'));
    const evalLines = await countLines(join(sessionDir, 'evaluations.jsonl'));

    expect(obsLines).toBe(2);
    expect(planLines).toBe(2);
    expect(evalLines).toBe(2);
  });

  it('should write last-write-wins state file', async () => {
    const config: LoopConfig = { artifactBaseDir: TEST_DIR };

    const result1 = await runNeuronWavesLoop({ 
      content: 'first', 
      sessionKey: TEST_SESSION 
    }, config);

    const result2 = await runNeuronWavesLoop({ 
      content: 'second', 
      sessionKey: TEST_SESSION 
    }, config);

    const statePath = join(TEST_DIR, TEST_SESSION, 'state', 'active.json');
    const stateContent = await readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);

    // State should reflect latest run
    expect(state.latestPlanId).toBe(result2.plan.id);
    expect(state.latestEvaluationId).toBe(result2.evaluation.id);
    expect(state.sessionKey).toBe(TEST_SESSION);
    expect(typeof state.updatedAtMs).toBe('number');
  });

  it('should write audit events', async () => {
    const config: LoopConfig = { artifactBaseDir: TEST_DIR };

    await runNeuronWavesLoop({ content: 'test', sessionKey: TEST_SESSION }, config);

    const auditPath = join(TEST_DIR, TEST_SESSION, 'audit', 'actions.jsonl');
    const lines = await countLines(auditPath);
    
    // Should have: loop_start, plan_created, evaluation_complete, loop_complete
    expect(lines).toBeGreaterThanOrEqual(4);
  });

  it('should handle different sessions independently', async () => {
    const config: LoopConfig = { artifactBaseDir: TEST_DIR };

    await runNeuronWavesLoop({ content: 'session-a', sessionKey: 'session-a' }, config);
    await runNeuronWavesLoop({ content: 'session-b', sessionKey: 'session-b' }, config);

    const sessions = await readdir(TEST_DIR);
    expect(sessions).toContain('session-a');
    expect(sessions).toContain('session-b');
  });
});