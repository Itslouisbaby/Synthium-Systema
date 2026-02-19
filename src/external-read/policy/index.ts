/**
 * M11 Task 1: Policy Engine
 * 
 * Domain allowlists, rate limiting, and SSRF protection
 */

export {
  PolicyEngine,
  createDomainPattern,
  createDefaultPolicy,
} from './policy.js';

export type {
  DomainPattern,
  DomainPatternType,
  RateLimitConfig,
  PolicyResult,
  SSRFConfig,
  PolicyConfig,
  PolicyContext,
} from './policy.js';
