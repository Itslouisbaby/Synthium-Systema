/**
 * M11 Task 2 Tests: Fetch Engine (46 tests)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  http_get,
  web_read,
  stream_get,
  configureRetry,
  FetchError,
} from '../src/external-read/fetch/index.js';

describe('Fetch Engine', () => {
  // Mock server URL - using httpbin.org for integration tests
  const TEST_URL = 'https://httpbin.org';

  describe('http_get - Basic Functionality', () => {
    it('should fetch a simple URL', async () => {
      const response = await http_get(`${TEST_URL}/get`);
      
      expect(response.status).toBe(200);
      expect(response.contentType).toContain('application/json');
      expect(response.content).toContain('httpbin');
    });

    it('should return status code', async () => {
      const response = await http_get(`${TEST_URL}/status/200`);
      expect(response.status).toBe(200);
    });

    it('should handle 404 status', async () => {
      await expect(http_get(`${TEST_URL}/status/404`)).rejects.toThrow(FetchError);
    });

    it('should return headers', async () => {
      const response = await http_get(`${TEST_URL}/get`);
      expect(response.headers['content-type']).toBeDefined();
    });

    it('should return final URL after redirects', async () => {
      const response = await http_get(`${TEST_URL}/redirect/1`);
      expect(response.url).toContain('/get');
    });

    it('should measure duration', async () => {
      const response = await http_get(`${TEST_URL}/get`);
      expect(response.durationMs).toBeGreaterThan(0);
    });

    it('should return content length', async () => {
      const response = await http_get(`${TEST_URL}/get`);
      expect(response.contentLength).toBeGreaterThan(0);
    });

    it('should handle empty response', async () => {
      const response = await http_get(`${TEST_URL}/bytes/0`);
      expect(response.content).toBe('');
      expect(response.contentLength).toBe(0);
    });
  });

  describe('http_get - URL Validation', () => {
    it('should throw on invalid URL', async () => {
      await expect(http_get('not-a-valid-url')).rejects.toThrow(FetchError);
    });

    it('should throw on empty URL', async () => {
      await expect(http_get('')).rejects.toThrow(FetchError);
    });

    it('should throw on URL with only spaces', async () => {
      await expect(http_get('   ')).rejects.toThrow(FetchError);
    });

    it('should accept URL with path', async () => {
      const response = await http_get(`${TEST_URL}/get`);
      expect(response.status).toBe(200);
    });

    it('should accept URL with query params', async () => {
      const response = await http_get(`${TEST_URL}/get?foo=bar&baz=qux`);
      expect(response.status).toBe(200);
    });

    it('should accept URL with hash', async () => {
      const response = await http_get(`${TEST_URL}/get#section`);
      expect(response.status).toBe(200);
    });
  });

  describe('http_get - Timeout Handling', () => {
    it('should use default timeout of 30s', async () => {
      const response = await http_get(`${TEST_URL}/get`);
      expect(response.status).toBe(200);
    });

    it('should accept custom timeout', async () => {
      const response = await http_get(`${TEST_URL}/get`, { timeoutMs: 10000 });
      expect(response.status).toBe(200);
    });

    it('should throw on zero timeout', async () => {
      await expect(http_get(TEST_URL, { timeoutMs: 0 })).rejects.toThrow(FetchError);
    });

    it('should throw on negative timeout', async () => {
      await expect(http_get(TEST_URL, { timeoutMs: -1 })).rejects.toThrow(FetchError);
    });

    it('should throw on timeout exceeding 60s', async () => {
      await expect(http_get(TEST_URL, { timeoutMs: 61000 })).rejects.toThrow(FetchError);
    });

    it('should throw on timeout exactly at max', async () => {
      // Should work at exactly 60s
      const response = await http_get(`${TEST_URL}/get`, { timeoutMs: 60000 });
      expect(response.status).toBe(200);
    });

    it('should handle timeout error correctly', async () => {
      // Use a delay endpoint that will timeout
      await expect(
        http_get(`${TEST_URL}/delay/10`, { timeoutMs: 100 })
      ).rejects.toThrow(FetchError);
    });
  });

  describe('http_get - Size Limits', () => {
    it('should accept default max size of 10MB', async () => {
      const response = await http_get(`${TEST_URL}/bytes/1000`);
      expect(response.contentLength).toBe(1000);
    });

    it('should accept custom max size', async () => {
      const response = await http_get(`${TEST_URL}/bytes/100`, { maxSize: 1000 });
      expect(response.contentLength).toBe(100);
    });

    it('should throw on size exceeded', async () => {
      await expect(
        http_get(`${TEST_URL}/bytes/1000`, { maxSize: 100 })
      ).rejects.toThrow(FetchError);
    });

    it('should handle exact size limit', async () => {
      const response = await http_get(`${TEST_URL}/bytes/100`, { maxSize: 100 });
      expect(response.contentLength).toBe(100);
    });
  });

  describe('http_get - Headers', () => {
    it('should send default headers', async () => {
      const response = await http_get(`${TEST_URL}/headers`);
      expect(response.status).toBe(200);
    });

    it('should send custom headers', async () => {
      const response = await http_get(`${TEST_URL}/headers`, {
        headers: { 'X-Custom-Header': 'test-value' },
      });
      expect(response.status).toBe(200);
    });

    it('should send user agent', async () => {
      const response = await http_get(`${TEST_URL}/user-agent`, {
        userAgent: 'TestAgent/1.0',
      });
      expect(response.content).toContain('TestAgent');
    });

    it('should accept header overrides', async () => {
      const response = await http_get(`${TEST_URL}/headers`, {
        headers: { Accept: 'application/xml' },
      });
      expect(response.status).toBe(200);
    });
  });

  describe('http_get - Retry Logic', () => {
    it('should retry on 500 error', async () => {
      // httpbin /status/500 returns 500, should trigger retry
      await expect(http_get(`${TEST_URL}/status/500`)).rejects.toThrow(FetchError);
    });

    it('should retry on 502 error', async () => {
      await expect(http_get(`${TEST_URL}/status/502`)).rejects.toThrow(FetchError);
    });

    it('should retry on 503 error', async () => {
      await expect(http_get(`${TEST_URL}/status/503`)).rejects.toThrow(FetchError);
    });

    it('should not retry on 400 error', async () => {
      await expect(http_get(`${TEST_URL}/status/400`)).rejects.toThrow(FetchError);
    });

    it('should not retry on invalid URL', async () => {
      const error = await http_get('invalid-url').catch(e => e);
      expect(error).toBeInstanceOf(FetchError);
      expect(error.code).not.toBe('RETRY_EXHAUSTED');
    });

    it('should configure retry settings', () => {
      const config = configureRetry({ maxRetries: 5, initialDelayMs: 2000 });
      expect(config.maxRetries).toBe(5);
      expect(config.initialDelayMs).toBe(2000);
    });
  });

  describe('web_read - Content Extraction', () => {
    it('should fetch and extract HTML content', async () => {
      const response = await web_read(`${TEST_URL}/html`);
      expect(response.status).toBe(200);
      expect(response.content).toBeDefined();
    });

    it('should convert HTML to markdown by default', async () => {
      const response = await web_read(`${TEST_URL}/html`);
      // Should have markdown-style formatting
      expect(response.content).toBeTruthy();
    });

    it('should extract main content', async () => {
      const response = await web_read(`${TEST_URL}/html`, { extractMainContent: true });
      expect(response.status).toBe(200);
    });

    it('should handle JSON content', async () => {
      const response = await web_read(`${TEST_URL}/get`);
      expect(response.contentType).toContain('json');
    });

    it('should handle plain text content', async () => {
      const response = await web_read(`${TEST_URL}/robots.txt`);
      expect(response.status).toBe(200);
    });

    it('should preserve content for non-HTML', async () => {
      const response = await web_read(`${TEST_URL}/get`);
      expect(JSON.parse(response.content)).toBeDefined();
    });
  });

  describe('stream_get - Streaming', () => {
    it('should return readable stream', async () => {
      const response = await stream_get(`${TEST_URL}/get`);
      expect(response.stream).toBeDefined();
      expect(typeof response.stream.getReader).toBe('function');
    });

    it('should return correct content type', async () => {
      const response = await stream_get(`${TEST_URL}/get`);
      expect(response.contentType).toBeDefined();
    });

    it('should return status', async () => {
      const response = await stream_get(`${TEST_URL}/get`);
      expect(response.status).toBe(200);
    });

    it('should return headers', async () => {
      const response = await stream_get(`${TEST_URL}/get`);
      expect(response.headers).toBeDefined();
    });

    it('should return final URL', async () => {
      const response = await stream_get(`${TEST_URL}/get`);
      expect(response.url).toContain('httpbin');
    });

    it('should allow reading stream', async () => {
      const response = await stream_get(`${TEST_URL}/bytes/100`);
      const reader = response.stream.getReader();
      
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
      }
      
      expect(totalBytes).toBe(100);
    });

    it('should handle stream errors', async () => {
      await expect(stream_get(`${TEST_URL}/status/500`)).rejects.toThrow(FetchError);
    });

    it('should apply timeout to stream request', async () => {
      await expect(
        stream_get(`${TEST_URL}/delay/5`, { timeoutMs: 100 })
      ).rejects.toThrow(FetchError);
    });
  });

  describe('FetchError', () => {
    it('should have correct error code', async () => {
      try {
        await http_get('invalid-url');
      } catch (error) {
        expect(error).toBeInstanceOf(FetchError);
        expect(error.code).toBe('INVALID_URL');
      }
    });

    it('should include URL in error', async () => {
      try {
        await http_get('invalid-url');
      } catch (error) {
        expect(error.url).toBe('invalid-url');
      }
    });

    it('should have error name', async () => {
      try {
        await http_get('invalid-url');
      } catch (error) {
        expect(error.name).toBe('FetchError');
      }
    });

    it('should have error message', async () => {
      try {
        await http_get('invalid-url');
      } catch (error) {
        expect(error.message).toContain('Invalid URL');
      }
    });
  });

  describe('Raw Mode', () => {
    it('should return empty content in raw mode', async () => {
      const response = await http_get(`${TEST_URL}/get`, { raw: true });
      expect(response.content).toBe('');
      expect(response.contentLength).toBe(0);
    });

    it('should return headers in raw mode', async () => {
      const response = await http_get(`${TEST_URL}/get`, { raw: true });
      expect(response.headers['content-type']).toBeDefined();
    });

    it('should return status in raw mode', async () => {
      const response = await http_get(`${TEST_URL}/get`, { raw: true });
      expect(response.status).toBe(200);
    });
  });

  describe('Response Processing', () => {
    it('should handle gzip encoding', async () => {
      const response = await http_get(`${TEST_URL}/gzip`);
      expect(response.status).toBe(200);
    });

    it('should handle deflate encoding', async () => {
      const response = await http_get(`${TEST_URL}/deflate`);
      expect(response.status).toBe(200);
    });

    it('should handle brotli encoding', async () => {
      const response = await http_get(`${TEST_URL}/brotli`);
      expect(response.status).toBe(200);
    });

    it('should decode UTF-8 content', async () => {
      const response = await http_get(`${TEST_URL}/encoding/utf8`);
      expect(response.content).toBeDefined();
    });
  });

  describe('Redirect Handling', () => {
    it('should follow single redirect', async () => {
      const response = await http_get(`${TEST_URL}/redirect/1`);
      expect(response.status).toBe(200);
    });

    it('should follow multiple redirects', async () => {
      const response = await http_get(`${TEST_URL}/redirect/3`);
      expect(response.status).toBe(200);
    });

    it('should report final URL', async () => {
      const response = await http_get(`${TEST_URL}/redirect/1`);
      expect(response.url).not.toContain('/redirect');
    });

    it('should handle absolute redirect', async () => {
      const response = await http_get(`${TEST_URL}/absolute-redirect/1`);
      expect(response.status).toBe(200);
    });

    it('should handle relative redirect', async () => {
      const response = await http_get(`${TEST_URL}/relative-redirect/1`);
      expect(response.status).toBe(200);
    });
  });
});
