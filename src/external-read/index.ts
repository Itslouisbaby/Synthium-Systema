/**
 * M11: External Read Tools
 * 
 * Secure external HTTP fetching with policy enforcement and audit logging.
 * 
 * @module external-read
 */

// Policy Engine
export {
  PolicyEngine,
  createDomainPattern,
  createDefaultPolicy,
} from './policy/index.js';

export type {
  DomainPattern,
  DomainPatternType,
  RateLimitConfig,
  PolicyResult,
  SSRFConfig,
  PolicyConfig,
  PolicyContext,
} from './policy/index.js';

// Fetch Engine
export {
  http_get,
  web_read,
  stream_get,
  configureRetry,
  FetchError,
} from './fetch/index.js';

export type {
  FetchResponse,
  StreamingFetchResponse,
  HttpGetOptions,
  WebReadOptions,
  RetryConfig,
} from './fetch/index.js';

// Audit Logging
export {
  AuditLogger,
  generateRequestId,
  verifyLogIntegrity,
  parseLogFile,
  createAuditLogger,
} from './audit/index.js';

export type {
  AuditLogEntry,
  AuditConfig,
} from './audit/index.js';
