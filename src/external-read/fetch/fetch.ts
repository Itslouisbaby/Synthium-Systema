/**
 * M11 Task 2: Fetch Engine
 * 
 * web_read and http_get implementations with
 * timeout handling, streaming, and content extraction.
 */

/// <reference types="node" />

/**
 * Fetch response with content and metadata
 */
export interface FetchResponse {
  /** Response body as string */
  content: string;
  /** Content-Type header */
  contentType: string;
  /** Response status code */
  status: number;
  /** Response status text */
  statusText: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Final URL (after redirects) */
  url: string;
  /** Content length in bytes */
  contentLength: number;
  /** Fetch duration in milliseconds */
  durationMs: number;
}

/**
 * Streaming fetch response
 */
export interface StreamingFetchResponse {
  /** Readable stream of response body */
  stream: globalThis.ReadableStream<Uint8Array>;
  /** Content-Type header */
  contentType: string;
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Final URL (after redirects) */
  url: string;
}

/**
 * HTTP GET options
 */
export interface HttpGetOptions {
  /** Request timeout in milliseconds (default: 30000, max: 60000) */
  timeoutMs?: number;
  /** Maximum redirects to follow */
  maxRedirects?: number;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Whether to return raw response (no extraction) */
  raw?: boolean;
  /** Maximum content size in bytes */
  maxSize?: number;
  /** User agent string */
  userAgent?: string;
}

/**
 * web_read options
 */
export interface WebReadOptions extends HttpGetOptions {
  /** Extract main content only (remove boilerplate) */
  extractMainContent?: boolean;
  /** Convert HTML to markdown */
  toMarkdown?: boolean;
  /** Maximum paragraph length for extraction */
  maxParagraphLength?: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial retry delay in milliseconds */
  initialDelayMs: number;
  /** Maximum retry delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Default fetch options
 */
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 60000;
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Custom error for fetch operations
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly url?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

/**
 * Validate and normalize URL
 */
function validateUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new FetchError(`Invalid URL: ${url}`, 'INVALID_URL', url);
  }
}

/**
 * Validate timeout
 */
function validateTimeout(timeoutMs?: number): number {
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (timeout <= 0) {
    throw new FetchError('Timeout must be positive', 'INVALID_TIMEOUT');
  }
  if (timeout > MAX_TIMEOUT_MS) {
    throw new FetchError(
      `Timeout exceeds maximum of ${MAX_TIMEOUT_MS}ms`,
      'TIMEOUT_TOO_LARGE'
    );
  }
  return timeout;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  const delay = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs
  );
  // Add jitter to prevent thundering herd, but never exceed maxDelayMs
  const jitter = Math.random() * Math.min(1000, config.maxDelayMs);
  return Math.min(delay + jitter, config.maxDelayMs);
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await globalThis.fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new FetchError(
        `Request timeout after ${timeoutMs}ms`,
        'TIMEOUT',
        url
      );
    }
    throw error;
  }
}

/**
 * Convert headers to Record
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * Read stream with size limit
 */
async function readStreamWithLimit(
  stream: ReadableStream<Uint8Array>,
  maxSize: number
): Promise<{ content: string; size: number }> {
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value) {
        totalSize += value.length;
        if (totalSize > maxSize) {
          throw new FetchError(
            `Response size exceeds maximum of ${maxSize} bytes`,
            'SIZE_LIMIT_EXCEEDED'
          );
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Concatenate chunks and decode
  const allBytes = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    allBytes.set(chunk, offset);
    offset += chunk.length;
  }

  const content = new TextDecoder('utf-8', { fatal: false }).decode(allBytes);
  return { content, size: totalSize };
}

/**
 * Extract main content from HTML
 */
function extractMainContent(html: string): string {
  // Remove script and style tags with content
  let cleaned = html
    .replace(/<script[^\u003e]*\u003e[\s\S]*?\u003c\/script>/gi, '')
    .replace(/<style[^\u003e]*\u003e[\s\S]*?\u003c\/style>/gi, '')
    .replace(/<nav[^\u003e]*\u003e[\s\S]*?\u003c\/nav>/gi, '')
    .replace(/<header[^\u003e]*\u003e[\s\S]*?\u003c\/header>/gi, '')
    .replace(/<footer[^\u003e]*\u003e[\s\S]*?\u003c\/footer>/gi, '')
    .replace(/<aside[^\u003e]*\u003e[\s\S]*?\u003c\/aside>/gi, '');

  // Try to find main content area
  const mainMatch = cleaned.match(/<main[^\u003e]*\u003e([\s\S]*?)\u003c\/main>/i) ||
                   cleaned.match(/<article[^\u003e]*\u003e([\s\S]*?)\u003c\/article>/i) ||
                   cleaned.match(/id=["']main["'][^\u003e]*\u003e([\s\S]*?)(?:\u003cdiv|\u003csection|\u003cfooter)/i);
  
  if (mainMatch) {
    cleaned = mainMatch[1];
  }

  // Extract text content
  const text = cleaned
    .replace(/<[^\u003e]+>/g, ' ') // Remove tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .trim();

  return text;
}

/**
 * Simple HTML to Markdown converter
 */
function htmlToMarkdown(html: string): string {
  let md = html;

  // Headers
  md = md.replace(/<h1[^\u003e]*\u003e([\s\S]*?)\u003c\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^\u003e]*\u003e([\s\S]*?)\u003c\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^\u003e]*\u003e([\s\S]*?)\u003c\/h3>/gi, '### $1\n\n');
  md = md.replace(/<h4[^\u003e]*\u003e([\s\S]*?)\u003c\/h4>/gi, '#### $1\n\n');
  md = md.replace(/<h5[^\u003e]*\u003e([\s\S]*?)\u003c\/h5>/gi, '##### $1\n\n');
  md = md.replace(/<h6[^\u003e]*\u003e([\s\S]*?)\u003c\/h6>/gi, '###### $1\n\n');

  // Bold and italic
  md = md.replace(/<strong\u003e([\s\S]*?)\u003c\/strong>/gi, '**$1**');
  md = md.replace(/<b\u003e([\s\S]*?)\u003c\/b>/gi, '**$1**');
  md = md.replace(/<em\u003e([\s\S]*?)\u003c\/em>/gi, '*$1*');
  md = md.replace(/<i\u003e([\s\S]*?)\u003c\/i>/gi, '*$1*');

  // Links
  md = md.replace(/<a[^\u003e]+href=["']([^"']+)["'][^\u003e]*\u003e([\s\S]*?)\u003c\/a>/gi, '[$2]($1)');

  // Code
  md = md.replace(/<code\u003e([\s\S]*?)\u003c\/code\u003e/gi, '`$1`');
  md = md.replace(/<pre\u003e([\s\S]*?)\u003c\/pre\u003e/gi, '```\n$1\n```\n\n');

  // Lists
  md = md.replace(/<ul[^\u003e]*\u003e([\s\S]*?)\u003c\/ul>/gi, (match, content) => {
    return content.replace(/<li\u003e([\s\S]*?)\u003c\/li\u003e/gi, '- $1\n');
  });
  md = md.replace(/<ol[^\u003e]*\u003e([\s\S]*?)\u003c\/ol>/gi, (match, content) => {
    let index = 1;
    return content.replace(/<li\u003e([\s\S]*?)\u003c\/li\u003e/gi, () => `${index++}. $1\n`);
  });

  // Paragraphs
  md = md.replace(/<p[^\u003e]*\u003e([\s\S]*?)\u003c\/p\u003e/gi, '$1\n\n');

  // Line breaks
  md = md.replace(/<br\s*\/?\u003e/gi, '\n');

  // Remove remaining tags
  md = md.replace(/<[^\u003e]+>/g, '');

  // Decode HTML entities
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  // Normalize whitespace
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  return md;
}

/**
 * Process content based on options
 */
function processContent(
  content: string,
  contentType: string,
  options: WebReadOptions
): string {
  const isHtml = contentType.includes('text/html');

  if (!isHtml) {
    return content;
  }

  let processed = content;

  if (options.extractMainContent) {
    processed = extractMainContent(processed);
  }

  if (options.toMarkdown) {
    processed = htmlToMarkdown(processed);
  }

  return processed;
}

/**
 * HTTP GET with retry logic
 */
export async function http_get(
  url: string,
  options: HttpGetOptions = {},
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<FetchResponse> {
  const validatedUrl = validateUrl(url);
  const timeoutMs = validateTimeout(options.timeoutMs);
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;

  const headers: Record<string, string> = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    ...options.headers,
  };

  if (options.userAgent) {
    headers['User-Agent'] = options.userAgent;
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    const startTime = Date.now();

    try {
      const response = await fetchWithTimeout(
        validatedUrl.toString(),
        {
          method: 'GET',
          headers,
          redirect: 'follow',
        },
        timeoutMs
      );

      const durationMs = Date.now() - startTime;

      // Handle non-OK status
      if (!response.ok) {
        // Retry on server errors (5xx) and some client errors
        if (response.status >= 500 && attempt < retryConfig.maxRetries) {
          const delay = calculateRetryDelay(attempt, retryConfig);
          await sleep(delay);
          continue;
        }

        throw new FetchError(
          `HTTP ${response.status}: ${response.statusText}`,
          `HTTP_${response.status}`,
          url
        );
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      
      // For raw responses, just return headers without reading body
      if (options.raw) {
        return {
          content: '',
          contentType,
          status: response.status,
          statusText: response.statusText,
          headers: headersToRecord(response.headers),
          url: response.url,
          contentLength: 0,
          durationMs,
        };
      }

      // Read response body with size limit
      if (!response.body) {
        return {
          content: '',
          contentType,
          status: response.status,
          statusText: response.statusText,
          headers: headersToRecord(response.headers),
          url: response.url,
          contentLength: 0,
          durationMs,
        };
      }

      const { content, size } = await readStreamWithLimit(response.body, maxSize);

      return {
        content,
        contentType,
        status: response.status,
        statusText: response.statusText,
        headers: headersToRecord(response.headers),
        url: response.url,
        contentLength: size,
        durationMs,
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on certain errors
      if (error instanceof FetchError) {
        // URL/option validation and size limit errors should not be retried
        if (['INVALID_URL', 'TIMEOUT_TOO_LARGE', 'SIZE_LIMIT_EXCEEDED'].includes(error.code)) {
          throw error;
        }

        // Client errors (4xx) should not be retried
        if (error.code.startsWith('HTTP_4')) {
          throw error;
        }
      }

      // Retry with backoff
      if (attempt < retryConfig.maxRetries) {
        const delay = calculateRetryDelay(attempt, retryConfig);
        await sleep(delay);
        continue;
      }

      break;
    }
  }

  // All retries exhausted
  throw new FetchError(
    `Failed after ${retryConfig.maxRetries + 1} attempts: ${lastError?.message}`,
    'RETRY_EXHAUSTED',
    url,
    lastError
  );
}

/**
 * Read web content with extraction options
 */
export async function web_read(
  url: string,
  options: WebReadOptions = {}
): Promise<FetchResponse> {
  const response = await http_get(url, options);

  // Process content if HTML
  if (response.contentType.includes('text/html')) {
    const processed = processContent(response.content, response.contentType, {
      extractMainContent: true,
      toMarkdown: true,
      ...options,
    });

    return {
      ...response,
      content: processed,
    };
  }

  return response;
}

/**
 * Stream response for large content
 */
export async function stream_get(
  url: string,
  options: HttpGetOptions = {}
): Promise<StreamingFetchResponse> {
  const validatedUrl = validateUrl(url);
  const timeoutMs = validateTimeout(options.timeoutMs);

  const headers: Record<string, string> = {
    'Accept': '*/*',
    ...options.headers,
  };

  if (options.userAgent) {
    headers['User-Agent'] = options.userAgent;
  }

  const response = await fetchWithTimeout(
    validatedUrl.toString(),
    {
      method: 'GET',
      headers,
      redirect: 'follow',
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new FetchError(
      `HTTP ${response.status}: ${response.statusText}`,
      `HTTP_${response.status}`,
      url
    );
  }

  if (!response.body) {
    throw new FetchError('Response has no body', 'NO_BODY', url);
  }

  return {
    stream: response.body,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    status: response.status,
    headers: headersToRecord(response.headers),
    url: response.url,
  };
}

/**
 * Configure default retry behavior
 */
export function configureRetry(config: Partial<RetryConfig>): RetryConfig {
  return { ...DEFAULT_RETRY_CONFIG, ...config };
}
