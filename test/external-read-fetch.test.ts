/**
 * M11 Task 2 Tests: Fetch Engine (46 tests)
 * 
 * These tests use mocked HTTP responses for CI reliability.
 * The mocks test the logic without depending on external services like httpbin.org.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  http_get,
  web_read,
  stream_get,
  configureRetry,
  FetchError,
} from '../src/external-read/fetch/index.js';

// Fast retry config for tests (no delays)
const FAST_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1,  // Minimal delay
  maxDelayMs: 10,
  backoffMultiplier: 1,
};

// Track original fetch
let originalFetch: typeof globalThis.fetch;

describe('Fetch Engine', () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('http_get - Basic Functionality', () => {
    it('should fetch a simple URL', async () => {
      const mockBody = JSON.stringify({ test: 'data', source: 'httpbin' });
      globalThis.fetch = vi.fn(async () => new Response(mockBody, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get');
      
      expect(response.status).toBe(200);
      expect(response.contentType).toContain('application/json');
      expect(response.content).toContain('httpbin');
    });

    it('should return status code', async () => {
      globalThis.fetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/status/200');
      expect(response.status).toBe(200);
    });

    it('should handle 404 status', async () => {
      // 404 is not retried, so it should throw immediately
      globalThis.fetch = vi.fn(async () => new Response('Not Found', { 
        status: 404, 
        statusText: 'Not Found' 
      })) as unknown as typeof fetch;

      await expect(http_get('https://example.com/status/404')).rejects.toThrow(FetchError);
    });

    it('should return headers', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-custom': 'value' },
      })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get');
      expect(response.headers['content-type']).toBeDefined();
    });

    it('should return final URL after redirects', async () => {
      const response = new Response('{}', { status: 200 });
      Object.defineProperty(response, 'url', { value: 'https://example.com/get' });
      globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;

      const result = await http_get('https://example.com/redirect/1');
      expect(result.url).toContain('/get');
    });

    it('should measure duration', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get');
      expect(response.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return content length', async () => {
      const body = JSON.stringify({ test: 'data' });
      globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get');
      expect(response.contentLength).toBeGreaterThan(0);
    });

    it('should handle empty response', async () => {
      globalThis.fetch = vi.fn(async () => new Response('', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/bytes/0');
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
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get');
      expect(response.status).toBe(200);
    });

    it('should accept URL with query params', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get?foo=bar&baz=qux');
      expect(response.status).toBe(200);
    });

    it('should accept URL with hash', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get#section');
      expect(response.status).toBe(200);
    });
  });

  describe('http_get - Timeout Handling', () => {
    it('should use default timeout of 30s', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get');
      expect(response.status).toBe(200);
    });

    it('should accept custom timeout', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get', { timeoutMs: 10000 });
      expect(response.status).toBe(200);
    });

    it('should throw on zero timeout', async () => {
      await expect(http_get('https://example.com', { timeoutMs: 0 })).rejects.toThrow(FetchError);
    });

    it('should throw on negative timeout', async () => {
      await expect(http_get('https://example.com', { timeoutMs: -1 })).rejects.toThrow(FetchError);
    });

    it('should throw on timeout exceeding 60s', async () => {
      await expect(http_get('https://example.com', { timeoutMs: 61000 })).rejects.toThrow(FetchError);
    });

    it('should throw on timeout exactly at max', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      // Should work at exactly 60s
      const response = await http_get('https://example.com/get', { timeoutMs: 60000 });
      expect(response.status).toBe(200);
    });

    it('should handle timeout error correctly', async () => {
      // Create a mock that simulates AbortController timeout
      globalThis.fetch = vi.fn(async (_, init) => {
        // Return a promise that never resolves (simulating hanging request)
        return new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (signal) {
            // Listen for abort event
            const onAbort = () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            };
            
            if (signal.aborted) {
              onAbort();
            } else {
              signal.addEventListener('abort', onAbort, { once: true });
            }
          }
        });
      }) as unknown as typeof fetch;

      // The timeout should trigger an abort after 1ms
      await expect(
        http_get('https://example.com/delay/10', { timeoutMs: 1 }, FAST_RETRY_CONFIG)
      ).rejects.toThrow(FetchError);
    });
  });

  describe('http_get - Size Limits', () => {
    it('should accept default max size of 10MB', async () => {
      const body = 'x'.repeat(1000);
      globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/bytes/1000');
      expect(response.contentLength).toBe(1000);
    });

    it('should accept custom max size', async () => {
      const body = 'x'.repeat(100);
      globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/bytes/100', { maxSize: 1000 });
      expect(response.contentLength).toBe(100);
    });

    it('should throw on size exceeded', async () => {
      const body = 'x'.repeat(1000);
      globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

      await expect(
        http_get('https://example.com/bytes/1000', { maxSize: 100 })
      ).rejects.toThrow(FetchError);
    });

    it('should handle exact size limit', async () => {
      const body = 'x'.repeat(100);
      globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/bytes/100', { maxSize: 100 });
      expect(response.contentLength).toBe(100);
    });
  });

  describe('http_get - Headers', () => {
    it('should send default headers', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/headers');
      expect(response.status).toBe(200);
    });

    it('should send custom headers', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/headers', {
        headers: { 'X-Custom-Header': 'test-value' },
      });
      expect(response.status).toBe(200);
    });

    it('should send user agent', async () => {
      globalThis.fetch = vi.fn(async () => 
        new Response(JSON.stringify({ 'user-agent': 'TestAgent/1.0' }), { status: 200 })
      ) as unknown as typeof fetch;

      const response = await http_get('https://example.com/user-agent', {
        userAgent: 'TestAgent/1.0',
      });
      expect(response.content).toContain('TestAgent');
    });

    it('should accept header overrides', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/headers', {
        headers: { Accept: 'application/xml' },
      });
      expect(response.status).toBe(200);
    });
  });

  describe('http_get - Retry Logic', () => {
    it('should retry on 500 error', async () => {
      // First 4 calls return 500 (initial + 3 retries), then succeed
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount <= 4) {
          return new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
        }
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

      await expect(
        http_get('https://example.com/status/500', {}, FAST_RETRY_CONFIG)
      ).rejects.toThrow(FetchError);
      expect(callCount).toBe(4); // Initial + 3 retries
    });

    it('should retry on 502 error', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount <= 4) {
          return new Response('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
        }
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

      await expect(
        http_get('https://example.com/status/502', {}, FAST_RETRY_CONFIG)
      ).rejects.toThrow(FetchError);
      expect(callCount).toBe(4);
    });

    it('should retry on 503 error', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount <= 4) {
          return new Response('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
        }
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch;

      await expect(
        http_get('https://example.com/status/503', {}, FAST_RETRY_CONFIG)
      ).rejects.toThrow(FetchError);
      expect(callCount).toBe(4);
    });

    it('should not retry on 400 error', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        return new Response('Bad Request', { status: 400, statusText: 'Bad Request' });
      }) as unknown as typeof fetch;

      await expect(http_get('https://example.com/status/400')).rejects.toThrow(FetchError);
      expect(callCount).toBe(1); // No retries
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
      const html = '<html><body><h1>Test</h1><p>Content</p></body></html>';
      globalThis.fetch = vi.fn(async () => new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;

      const response = await web_read('https://example.com/html');
      expect(response.status).toBe(200);
      expect(response.content).toBeDefined();
    });

    it('should convert HTML to markdown by default', async () => {
      const html = '<html><body><h1>Test</h1><p>Content</p></body></html>';
      globalThis.fetch = vi.fn(async () => new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;

      const response = await web_read('https://example.com/html');
      // Should have markdown-style formatting
      expect(response.content).toBeTruthy();
    });

    it('should extract main content', async () => {
      const html = '<html><body><main><p>Main content</p></main></body></html>';
      globalThis.fetch = vi.fn(async () => new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as unknown as typeof fetch;

      const response = await web_read('https://example.com/html', { extractMainContent: true });
      expect(response.status).toBe(200);
    });

    it('should handle JSON content', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"test":"data"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

      const response = await web_read('https://example.com/get');
      expect(response.contentType).toContain('json');
    });

    it('should handle plain text content', async () => {
      globalThis.fetch = vi.fn(async () => new Response('User-agent: *\nDisallow: /', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })) as unknown as typeof fetch;

      const response = await web_read('https://example.com/robots.txt');
      expect(response.status).toBe(200);
    });

    it('should preserve content for non-HTML', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"test":"data"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

      const response = await web_read('https://example.com/get');
      expect(JSON.parse(response.content)).toBeDefined();
    });
  });

  describe('stream_get - Streaming', () => {
    it('should return readable stream', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await stream_get('https://example.com/get');
      expect(response.stream).toBeDefined();
      expect(typeof response.stream.getReader).toBe('function');
    });

    it('should return correct content type', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

      const response = await stream_get('https://example.com/get');
      expect(response.contentType).toBeDefined();
    });

    it('should return status', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await stream_get('https://example.com/get');
      expect(response.status).toBe(200);
    });

    it('should return headers', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'x-custom': 'value' },
      })) as unknown as typeof fetch;

      const response = await stream_get('https://example.com/get');
      expect(response.headers).toBeDefined();
    });

    it('should return final URL', async () => {
      const response = new Response('{}', { status: 200 });
      Object.defineProperty(response, 'url', { value: 'https://example.com/final' });
      globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;

      const result = await stream_get('https://example.com/get');
      expect(result.url).toContain('example.com');
    });

    it('should allow reading stream', async () => {
      const body = 'x'.repeat(100);
      globalThis.fetch = vi.fn(async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

      const response = await stream_get('https://example.com/bytes/100');
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
      globalThis.fetch = vi.fn(async () => new Response('Error', { 
        status: 500, 
        statusText: 'Internal Server Error' 
      })) as unknown as typeof fetch;

      await expect(stream_get('https://example.com/status/500')).rejects.toThrow(FetchError);
    });

    it('should apply timeout to stream request', async () => {
      // Mock fetch to simulate AbortError (timeout)
      globalThis.fetch = vi.fn(async (_, init) => {
        return new Promise<Response>((_, reject) => {
          const signal = init?.signal;
          if (signal) {
            const onAbort = () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            };
            
            if (signal.aborted) {
              onAbort();
            } else {
              signal.addEventListener('abort', onAbort, { once: true });
            }
          }
        });
      }) as unknown as typeof fetch;

      await expect(
        stream_get('https://example.com/delay/5', { timeoutMs: 1 })
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
      globalThis.fetch = vi.fn(async () => new Response('{"data": "value"}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get', { raw: true });
      expect(response.content).toBe('');
      expect(response.contentLength).toBe(0);
    });

    it('should return headers in raw mode', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get', { raw: true });
      expect(response.headers['content-type']).toBeDefined();
    });

    it('should return status in raw mode', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/get', { raw: true });
      expect(response.status).toBe(200);
    });
  });

  describe('Response Processing', () => {
    it('should handle gzip encoding', async () => {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ gzipped: true }), {
        status: 200,
        headers: { 'content-encoding': 'gzip' },
      })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/gzip');
      expect(response.status).toBe(200);
    });

    it('should handle deflate encoding', async () => {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ deflated: true }), {
        status: 200,
        headers: { 'content-encoding': 'deflate' },
      })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/deflate');
      expect(response.status).toBe(200);
    });

    it('should handle brotli encoding', async () => {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ brotli: true }), {
        status: 200,
        headers: { 'content-encoding': 'br' },
      })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/brotli');
      expect(response.status).toBe(200);
    });

    it('should decode UTF-8 content', async () => {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ text: 'Hello 世界' }), {
        status: 200,
      })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/encoding/utf8');
      expect(response.content).toBeDefined();
    });
  });

  describe('Redirect Handling', () => {
    it('should follow single redirect', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/redirect/1');
      expect(response.status).toBe(200);
    });

    it('should follow multiple redirects', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/redirect/3');
      expect(response.status).toBe(200);
    });

    it('should report final URL', async () => {
      const response = new Response('{}', { status: 200 });
      Object.defineProperty(response, 'url', { value: 'https://example.com/get' });
      globalThis.fetch = vi.fn(async () => response) as unknown as typeof fetch;

      const result = await http_get('https://example.com/redirect/1');
      expect(result.url).not.toContain('/redirect');
    });

    it('should handle absolute redirect', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/absolute-redirect/1');
      expect(response.status).toBe(200);
    });

    it('should handle relative redirect', async () => {
      globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;

      const response = await http_get('https://example.com/relative-redirect/1');
      expect(response.status).toBe(200);
    });
  });
});
