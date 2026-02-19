/**
 * M11 Task 3 Tests: Audit Logging
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AuditLogger,
  generateRequestId,
  verifyLogIntegrity,
  createAuditLogger,
} from '../src/external-read/audit/index.js';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Audit Logging', () => {
  let tempDir: string;
  let logger: AuditLogger;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'audit-test-'));
    logger = new AuditLogger({
      logPath: join(tempDir, 'audit.jsonl'),
      maxFileSize: 1024 * 1024, // 1MB for testing
      maxFiles: 3,
      enableIntegrity: true,
      consoleOutput: false,
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Log Entry Creation', () => {
    it('should create log entry with timestamp', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should include operation type', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.operation).toBe('fetch');
    });

    it('should include request ID', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'req-123',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.requestId).toBe('req-123');
    });

    it('should include success status', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: false,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.success).toBe(false);
    });

    it('should include URL when provided', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        url: 'https://example.com',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.url).toBe('https://example.com');
    });

    it('should extract domain from URL', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        url: 'https://api.example.com/path',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.domain).toBe('api.example.com');
    });

    it('should include status code', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
        statusCode: 200,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.statusCode).toBe(200);
    });

    it('should include response size', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
        responseSize: 1024,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.responseSize).toBe(1024);
    });

    it('should include duration', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
        durationMs: 150,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.durationMs).toBe(150);
    });

    it('should include policy result', async () => {
      await logger.log({
        operation: 'policy_check',
        requestId: 'test-1',
        success: false,
        policyResult: {
          allowed: false,
          reason: 'Domain not in allowlist',
        },
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.policyResult.allowed).toBe(false);
      expect(entry.policyResult.reason).toBe('Domain not in allowlist');
    });

    it('should include error details', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Request timed out',
        },
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.error.code).toBe('TIMEOUT');
      expect(entry.error.message).toBe('Request timed out');
    });

    it('should include metadata', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
        metadata: { source: 'test', version: '1.0' },
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.metadata.source).toBe('test');
    });
  });

  describe('SHA-256 Integrity Hash', () => {
    it('should include integrity hash by default', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.integrityHash).toBeDefined();
      expect(entry.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should generate different hash for different timestamps', async () => {
      // Log same data twice - timestamps will differ
      const data = {
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
      };

      await logger.log(data);
      // Small delay to ensure different timestamp
      await new Promise(r => setTimeout(r, 10));
      await logger.log(data);

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);

      // Hashes should be different due to different timestamps
      expect(entry1.integrityHash).not.toBe(entry2.integrityHash);
    });

    it('should generate different hash for different data', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
      });

      await logger.log({
        operation: 'fetch',
        requestId: 'test-2',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);

      expect(entry1.integrityHash).not.toBe(entry2.integrityHash);
    });

    it('should skip hash when disabled', async () => {
      const noHashLogger = new AuditLogger({
        logPath: join(tempDir, 'no-hash.jsonl'),
        enableIntegrity: false,
      });

      await noHashLogger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
      });

      const content = await readFile(noHashLogger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      expect(entry.integrityHash).toBeUndefined();
    });

    it('should verify integrity correctly', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(verifyLogIntegrity(entry)).toBe(true);
    });

    it('should detect tampered entry', async () => {
      await logger.log({
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());
      entry.success = false; // Tamper with entry

      expect(verifyLogIntegrity(entry)).toBe(false);
    });

    it('should return false for entry without hash', () => {
      const entry = {
        operation: 'fetch',
        requestId: 'test-1',
        success: true,
        timestamp: '2024-01-01T00:00:00Z',
      };

      expect(verifyLogIntegrity(entry)).toBe(false);
    });
  });

  describe('JSONL Format', () => {
    it('should write one entry per line', async () => {
      await logger.log({ operation: 'fetch', requestId: '1', success: true });
      await logger.log({ operation: 'fetch', requestId: '2', success: true });
      await logger.log({ operation: 'fetch', requestId: '3', success: true });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('should write valid JSON per line', async () => {
      await logger.log({ operation: 'fetch', requestId: '1', success: true });
      await logger.log({ operation: 'fetch', requestId: '2', success: true });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should end each line with newline', async () => {
      await logger.log({ operation: 'fetch', requestId: '1', success: true });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      expect(content.endsWith('\n')).toBe(true);
    });
  });

  describe('Log Rotation', () => {
    it('should rotate when size limit reached', async () => {
      // Create logger with very small size limit
      const smallLogger = new AuditLogger({
        logPath: join(tempDir, 'small.jsonl'),
        maxFileSize: 100, // Very small for testing
        maxFiles: 3,
      });

      // Write enough data to trigger rotation
      for (let i = 0; i < 10; i++) {
        await smallLogger.log({
          operation: 'fetch',
          requestId: `req-${i}`,
          success: true,
          metadata: { data: 'x'.repeat(50) },
        });
      }

      const files = await readdir(tempDir);
      const rotatedFiles = files.filter(f => f.includes('small.jsonl.'));
      expect(rotatedFiles.length).toBeGreaterThan(0);
    });

    it('should maintain max number of rotated files', async () => {
      // This test verifies rotation behavior
      const rotateLogger = new AuditLogger({
        logPath: join(tempDir, 'rotate.jsonl'),
        maxFileSize: 50,
        maxFiles: 2,
      });

      // Trigger multiple rotations
      for (let i = 0; i < 20; i++) {
        await rotateLogger.log({
          operation: 'fetch',
          requestId: `req-${i}`,
          success: true,
          metadata: { data: 'x'.repeat(100) },
        });
      }

      const files = await readdir(tempDir);
      const rotatedFiles = files.filter(f => f.match(/rotate\.jsonl\.\d+$/));
      expect(rotatedFiles.length).toBeLessThanOrEqual(2);
    });

    it('should force rotation on demand', async () => {
      await logger.log({ operation: 'fetch', requestId: '1', success: true });
      await logger.forceRotation();
      await logger.log({ operation: 'fetch', requestId: '2', success: true });

      const files = await readdir(tempDir);
      expect(files).toContain('audit.jsonl.1');
    });

    it('should get log stats', async () => {
      await logger.log({ operation: 'fetch', requestId: '1', success: true });

      const stats = await logger.getStats();
      expect(stats.currentSize).toBeGreaterThan(0);
    });
  });

  describe('Helper Functions', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\w+-\w+$/);
    });

    it('should create audit logger with defaults', () => {
      const defaultLogger = createAuditLogger();
      expect(defaultLogger).toBeInstanceOf(AuditLogger);
    });

    it('should create audit logger with custom config', () => {
      const customLogger = createAuditLogger({
        maxFiles: 10,
        consoleOutput: true,
      });

      expect(customLogger.getConfig().maxFiles).toBe(10);
      expect(customLogger.getConfig().consoleOutput).toBe(true);
    });
  });

  describe('Convenience Methods', () => {
    it('should log fetch with convenience method', async () => {
      await logger.logFetch({
        requestId: 'test-1',
        url: 'https://example.com',
        success: true,
        statusCode: 200,
        responseSize: 1024,
        durationMs: 150,
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.operation).toBe('fetch');
      expect(entry.domain).toBe('example.com');
    });

    it('should log failed fetch with error', async () => {
      await logger.logFetch({
        requestId: 'test-1',
        url: 'https://example.com',
        success: false,
        error: { code: 'TIMEOUT', message: 'Request timeout' },
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.success).toBe(false);
      expect(entry.error.code).toBe('TIMEOUT');
    });

    it('should log policy check', async () => {
      await logger.logPolicyCheck({
        requestId: 'test-1',
        url: 'https://example.com',
        allowed: false,
        reason: 'Domain not in allowlist',
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.operation).toBe('policy_check');
      expect(entry.policyResult.allowed).toBe(false);
    });

    it('should log error', async () => {
      await logger.logError({
        requestId: 'test-1',
        url: 'https://example.com',
        operation: 'fetch',
        code: 'NETWORK_ERROR',
        message: 'Connection refused',
        metadata: { retryCount: 3 },
      });

      const content = await readFile(logger.getConfig().logPath, 'utf-8');
      const entry = JSON.parse(content.trim());

      expect(entry.operation).toBe('fetch');
      expect(entry.success).toBe(false);
      expect(entry.error.code).toBe('NETWORK_ERROR');
      expect(entry.metadata.retryCount).toBe(3);
    });
  });

  describe('Configuration', () => {
    it('should have default config', () => {
      const defaultLogger = new AuditLogger();
      const config = defaultLogger.getConfig();

      expect(config.maxFileSize).toBe(10 * 1024 * 1024);
      expect(config.maxFiles).toBe(5);
      expect(config.enableIntegrity).toBe(true);
      expect(config.consoleOutput).toBe(false);
    });

    it('should merge partial config', () => {
      const partialLogger = new AuditLogger({
        maxFiles: 10,
      });

      expect(partialLogger.getConfig().maxFiles).toBe(10);
      expect(partialLogger.getConfig().maxFileSize).toBe(10 * 1024 * 1024);
    });

    it('should update config', () => {
      logger.updateConfig({ maxFiles: 20 });
      expect(logger.getConfig().maxFiles).toBe(20);
    });

    it('should return frozen config', () => {
      const config = logger.getConfig();
      expect(() => {
        (config as { maxFiles: number }).maxFiles = 100;
      }).toThrow();
    });
  });
});
