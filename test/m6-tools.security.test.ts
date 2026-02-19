/**
 * Milestone 6: Security Tests for Tool System
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmdirSync, writeFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localRead } from '../src/tools/local_read.js';
import { localWrite } from '../src/tools/local_write.js';
import { localSearch } from '../src/tools/local_search.js';
import { DEFAULT_TOOL_LIMITS } from '../src/tools/types.js';

describe('M6: Tool Security', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'synth-security-'));
  });

  afterEach(() => {
    try {
      rmdirSync(tempDir, { recursive: true });
    } catch {}
  });

  describe('Path traversal protection', () => {
    it('rejects parent directory traversal', async () => {
      const result = await localRead(
        { path: '../secret.txt' },
        tempDir,
        DEFAULT_TOOL_LIMITS
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('path escapes');
    });

    it('rejects nested traversal', async () => {
      const result = await localRead(
        { path: 'foo/../../bar' },
        tempDir,
        DEFAULT_TOOL_LIMITS
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('path escapes');
    });

    it('rejects absolute path outside workspace', async () => {
      const result = await localRead(
        { path: '/etc/passwd' },
        tempDir,
        DEFAULT_TOOL_LIMITS
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('path escapes');
    });

    it('rejects encoded traversal', async () => {
      const result = await localRead(
        { path: '..%2fsecret.txt' },
        tempDir,
        DEFAULT_TOOL_LIMITS
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Security');
    });
  });

  describe('Null byte injection', () => {
    it('rejects null bytes in path', async () => {
      const result = await localRead(
        { path: 'file\x00.txt' },
        tempDir,
        DEFAULT_TOOL_LIMITS
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('null');
    });
  });

  describe('Valid paths are allowed', () => {
    it('allows reading file in workspace', async () => {
      writeFileSync(join(tempDir, 'test.txt'), 'hello');
      
      const result = await localRead(
        { path: 'test.txt' },
        tempDir,
        DEFAULT_TOOL_LIMITS
      );
      
      expect(result.success).toBe(true);
      expect(result.output?.content).toBe('hello');
    });
  });

  describe('Write tool security', () => {
    it('rejects write traversal attempt', async () => {
      const result = await localWrite(
        { path: '../evil.txt', content: 'malicious', mode: 'overwrite' },
        tempDir,
        DEFAULT_TOOL_LIMITS
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Security');
    });
  });
});
