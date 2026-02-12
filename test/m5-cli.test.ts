/**
 * Milestone 5: CLI Tests
 * Tests for CLI commands: run, status, show, tail, approve, deny, sessions
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// Import CLI commands
import runCommand from '../src/cli/commands/run.js';
import approveCommand from '../src/cli/commands/approve.js';
import denyCommand from '../src/cli/commands/deny.js';
import statusCommand from '../src/cli/commands/status.js';
import showCommand from '../src/cli/commands/show.js';
import tailCommand from '../src/cli/commands/tail.js';
import sessionsCommand from '../src/cli/commands/sessions.js';
import { validateSessionId } from '../src/cli/types.js';

describe('Milestone 5: CLI', () => {
  let testDir: string;
  let workspace: string;

  beforeEach(() => {
    // Create temp directory for each test
    testDir = join(tmpdir(), `synth-test-${randomUUID()}`);
    workspace = testDir;
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Cleanup temp directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Session ID validation', () => {
    it('accepts valid session IDs', () => {
      expect(validateSessionId('test-session-1')).toBe(true);
      expect(validateSessionId('my_session')).toBe(true);
      expect(validateSessionId('ABC123')).toBe(true);
    });

    it('rejects invalid session IDs', () => {
      expect(validateSessionId('test session')).toBe(false);
      expect(validateSessionId('test@session')).toBe(false);
      expect(validateSessionId('test.session')).toBe(false);
      expect(validateSessionId('')).toBe(false);
    });
  });

  describe('synth run', () => {
    it('creates artifacts under expected paths', async () => {
      const sessionId = 'test-run-1';
      const result = await runCommand({
        workspace,
        sessionId,
        text: 'search for something',
        level: 1,
      });

      expect(result.exitCode).toBe(0);
      expect(existsSync(join(workspace, '.synth', 'neuronwaves', sessionId))).toBe(true);
    });

    it('validates sessionId format', async () => {
      const result = await runCommand({
        workspace,
        sessionId: 'invalid session id',
        text: 'search',
        level: 1,
      });

      expect(result.exitCode).toBe(1);
    });

    it('rejects missing session', async () => {
      const result = await runCommand({
        workspace,
        text: 'search',
        level: 1,
      });

      expect(result.exitCode).toBe(1);
    });
  });

  describe('Exit codes', () => {
    it('returns 0 for success', async () => {
      const result = await runCommand({
        workspace,
        sessionId: 'test-exit-0',
        text: 'search',
        level: 1,
      });

      expect(result.exitCode).toBe(0);
    });

    it('returns 1 for user error', async () => {
      const result = await runCommand({
        workspace,
        sessionId: 'invalid session',
        text: 'search',
        level: 1,
      });

      expect(result.exitCode).toBe(1);
    });
  });

  describe('synth sessions', () => {
    it('lists session IDs', async () => {
      // Create some session directories
      mkdirSync(join(workspace, '.synth', 'neuronwaves', 'session-1'), { recursive: true });
      mkdirSync(join(workspace, '.synth', 'neuronwaves', 'session-2'), { recursive: true });

      const result = await sessionsCommand({ workspace });

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('session-1');
      expect(result.output).toContain('session-2');
    });

    it('returns empty when no sessions', async () => {
      const result = await sessionsCommand({ workspace });

      expect(result.exitCode).toBe(0);
      expect(result.output).toBe('No sessions found.');
    });
  });
});
