/**
 * M11 Task 1: Policy Engine
 * 
 * Domain allowlists, rate limiting, and SSRF protection
 * for external read operations.
 */

/**
 * Pattern types for domain matching
 */
export type DomainPatternType = 'exact' | 'wildcard' | 'regex';

/**
 * Domain pattern for allowlist matching
 */
export interface DomainPattern {
  type: DomainPatternType;
  pattern: string;
  regex?: RegExp;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests allowed per window */
  maxRequests: number;
  /** Time window in seconds */
  windowSeconds: number;
}

/**
 * Token bucket state for rate limiting
 */
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

/**
 * Policy check result
 */
export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
}

/**
 * SSRF protection configuration
 */
export interface SSRFConfig {
  /** Block localhost/loopback addresses */
  blockLocalhost: boolean;
  /** Block private IP ranges (RFC 1918) */
  blockPrivateIPs: boolean;
  /** Block link-local addresses */
  blockLinkLocal: boolean;
}

/**
 * Complete policy configuration
 */
export interface PolicyConfig {
  /** Allowed domain patterns */
  allowedDomains: DomainPattern[];
  /** Rate limit configuration */
  rateLimit: RateLimitConfig;
  /** SSRF protection settings */
  ssrf: SSRFConfig;
  /** Maximum response size in bytes */
  maxResponseSize: number;
  /** Default request timeout in milliseconds */
  defaultTimeoutMs: number;
}

/**
 * Policy validation context
 */
export interface PolicyContext {
  /** Request ID for tracking */
  requestId: string;
  /** Target URL */
  url: URL;
  /** Timestamp of request */
  timestamp: Date;
}

// Private IP ranges for SSRF protection
const PRIVATE_IP_PATTERNS = [
  /^127\./, // 127.0.0.0/8 (loopback)
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // 169.254.0.0/16 (link-local)
  /^0\./, // 0.0.0.0/8
  /^\[?::1\]?$/, // IPv6 loopback (with optional brackets)
  /^\[?0:0:0:0:0:0:0:1\]?$/, // IPv6 loopback expanded
  /^\[?fc00:/i, // IPv6 unique local
  /^\[?fcff:/i, // IPv6 unique local end range
  /^\[?fe80:/i, // IPv6 link-local
];

/**
 * Policy Engine for external read operations
 * Validates URLs against security policies
 */
export class PolicyEngine {
  private config: PolicyConfig;
  private buckets: Map<string, TokenBucket> = new Map();

  constructor(config: Partial<PolicyConfig> = {}) {
    this.config = {
      allowedDomains: config.allowedDomains ?? [],
      rateLimit: config.rateLimit ?? { maxRequests: 100, windowSeconds: 60 },
      ssrf: config.ssrf ?? {
        blockLocalhost: true,
        blockPrivateIPs: true,
        blockLinkLocal: true,
      },
      maxResponseSize: config.maxResponseSize ?? 10 * 1024 * 1024, // 10MB
      defaultTimeoutMs: config.defaultTimeoutMs ?? 30000,
    };
  }

  /**
   * Validate a URL against all policies
   */
  validate(context: PolicyContext): PolicyResult {
    // Check domain allowlist
    const domainResult = this.checkDomain(context.url);
    if (!domainResult.allowed) return domainResult;

    // Check SSRF protection
    const ssrfResult = this.checkSSRF(context.url);
    if (!ssrfResult.allowed) return ssrfResult;

    // Check rate limits
    const rateLimitResult = this.checkRateLimit(context);
    if (!rateLimitResult.allowed) return rateLimitResult;

    return { allowed: true };
  }

  /**
   * Check if domain is in allowlist
   */
  checkDomain(url: URL): PolicyResult {
    const hostname = url.hostname.toLowerCase();

    // Empty allowlist means allow all (dev mode - not recommended for prod)
    if (this.config.allowedDomains.length === 0) {
      return { allowed: true };
    }

    for (const pattern of this.config.allowedDomains) {
      if (this.matchesPattern(hostname, pattern)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `Domain '${hostname}' not in allowlist`,
    };
  }

  /**
   * Match hostname against pattern
   */
  private matchesPattern(hostname: string, pattern: DomainPattern): boolean {
    switch (pattern.type) {
      case 'exact':
        return hostname === pattern.pattern.toLowerCase();

      case 'wildcard':
        return this.matchesWildcard(hostname, pattern.pattern);

      case 'regex':
        if (!pattern.regex) {
          pattern.regex = new RegExp(pattern.pattern, 'i');
        }
        return pattern.regex.test(hostname);

      default:
        return false;
    }
  }

  /**
   * Match hostname against wildcard pattern
   * Supports patterns like *.example.com
   */
  private matchesWildcard(hostname: string, pattern: string): boolean {
    const lowerPattern = pattern.toLowerCase();
    
    // Exact match
    if (hostname === lowerPattern) {
      return true;
    }

    // Wildcard at start: *.example.com
    if (lowerPattern.startsWith('*.')) {
      const suffix = lowerPattern.slice(2);
      if (hostname === suffix) return true;
      if (hostname.endsWith('.' + suffix)) return true;
    }

    // Wildcard at end: example.*
    if (lowerPattern.endsWith('.*')) {
      const prefix = lowerPattern.slice(0, -2);
      if (hostname.startsWith(prefix + '.')) return true;
    }

    return false;
  }

  /**
   * Check for SSRF vulnerabilities
   */
  checkSSRF(url: URL): PolicyResult {
    const hostname = url.hostname;

    // Check for localhost variants
    if (this.config.ssrf.blockLocalhost) {
      const localhostVariants = [
        'localhost',
        '127.0.0.1',
        '127.0.0.0',
        '127.1',
        '127.0.1',
        '::1',
        '[::1]',
        '0:0:0:0:0:0:0:1',
        '[0:0:0:0:0:0:0:1]',
        '0000:0000:0000:0000:0000:0000:0000:0001',
        '[0000:0000:0000:0000:0000:0000:0000:0001]',
      ];
      
      if (localhostVariants.includes(hostname.toLowerCase())) {
        return {
          allowed: false,
          reason: 'SSRF: localhost access blocked',
        };
      }
    }

    // Check for private IP ranges
    if (this.config.ssrf.blockPrivateIPs || this.config.ssrf.blockLinkLocal) {
      for (const pattern of PRIVATE_IP_PATTERNS) {
        if (pattern.test(hostname)) {
          // Check if this is link-local
          const isLinkLocal = hostname.startsWith('169.254.') || 
                             hostname.toLowerCase().startsWith('fe80:') ||
                             hostname.toLowerCase().startsWith('[fe80:');
          
          if (isLinkLocal && this.config.ssrf.blockLinkLocal) {
            return {
              allowed: false,
              reason: 'SSRF: link-local address blocked',
            };
          }
          
          if (!isLinkLocal && this.config.ssrf.blockPrivateIPs) {
            return {
              allowed: false,
              reason: 'SSRF: private IP range blocked',
            };
          }
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Check rate limits using Token Bucket algorithm
   */
  checkRateLimit(context: PolicyContext): PolicyResult {
    const key = context.url.hostname;
    const now = Date.now();
    const windowMs = this.config.rateLimit.windowSeconds * 1000;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.config.rateLimit.maxRequests,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on time elapsed
    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(
      (timePassed / windowMs) * this.config.rateLimit.maxRequests
    );
    
    bucket.tokens = Math.min(
      bucket.tokens + tokensToAdd,
      this.config.rateLimit.maxRequests
    );
    bucket.lastRefill = now;

    // Check if we have tokens available
    if (bucket.tokens < 1) {
      const retryAfter = Math.ceil(
        windowMs / this.config.rateLimit.maxRequests
      );
      return {
        allowed: false,
        reason: `Rate limit exceeded for ${key}`,
        retryAfter,
      };
    }

    // Consume token
    bucket.tokens--;
    return { allowed: true };
  }

  /**
   * Get current rate limit status for a domain
   */
  getRateLimitStatus(domain: string): { remaining: number; resetAt: Date } {
    const bucket = this.buckets.get(domain);
    if (!bucket) {
      return {
        remaining: this.config.rateLimit.maxRequests,
        resetAt: new Date(Date.now() + this.config.rateLimit.windowSeconds * 1000),
      };
    }

    return {
      remaining: Math.floor(bucket.tokens),
      resetAt: new Date(bucket.lastRefill + this.config.rateLimit.windowSeconds * 1000),
    };
  }

  /**
   * Reset rate limit bucket for a domain
   */
  resetRateLimit(domain: string): void {
    this.buckets.delete(domain);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PolicyConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<PolicyConfig> {
    return Object.freeze({ ...this.config });
  }
}

/**
 * Create a domain pattern from string shorthand
 * @example createDomainPattern("*.example.com") // wildcard
 * @example createDomainPattern("example.com") // exact
 * @example createDomainPattern("/^.*\.gov$/") // regex
 */
export function createDomainPattern(pattern: string): DomainPattern {
  // Detect regex pattern (starts and ends with /)
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    return {
      type: 'regex',
      pattern: pattern.slice(1, -1),
      regex: new RegExp(pattern.slice(1, -1), 'i'),
    };
  }

  // Detect wildcard pattern
  if (pattern.includes('*')) {
    return {
      type: 'wildcard',
      pattern,
    };
  }

  // Default to exact match
  return {
    type: 'exact',
    pattern: pattern.toLowerCase(),
  };
}

/**
 * Default restrictive policy for production use
 */
export function createDefaultPolicy(allowedDomains: string[] = []): PolicyConfig {
  return {
    allowedDomains: allowedDomains.map(createDomainPattern),
    rateLimit: {
      maxRequests: 100,
      windowSeconds: 60,
    },
    ssrf: {
      blockLocalhost: true,
      blockPrivateIPs: true,
      blockLinkLocal: true,
    },
    maxResponseSize: 10 * 1024 * 1024, // 10MB
    defaultTimeoutMs: 30000, // 30s
  };
}
