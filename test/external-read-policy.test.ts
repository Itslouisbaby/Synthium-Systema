/**
 * M11 Task 1 Tests: Policy Engine (45 tests)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PolicyEngine,
  createDomainPattern,
  createDefaultPolicy,
  type PolicyContext,
} from '../src/external-read/policy/index.js';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('Domain Allowlist - Exact Match', () => {
    it('should allow exact domain match', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
      });

      const result = engine.checkDomain(new URL('https://example.com'));
      expect(result.allowed).toBe(true);
    });

    it('should block non-matching domain', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
      });

      const result = engine.checkDomain(new URL('https://other.com'));
      expect(result.allowed).toBe(false);
    });

    it('should be case insensitive for domains', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('EXAMPLE.COM')],
      });

      const result = engine.checkDomain(new URL('https://example.com'));
      expect(result.allowed).toBe(true);
    });

    it('should not match subdomains with exact pattern', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
      });

      const result = engine.checkDomain(new URL('https://sub.example.com'));
      expect(result.allowed).toBe(false);
    });

    it('should match exact subdomain', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('api.example.com')],
      });

      const result = engine.checkDomain(new URL('https://api.example.com'));
      expect(result.allowed).toBe(true);
    });

    it('should allow all domains when allowlist is empty', () => {
      engine = new PolicyEngine({ allowedDomains: [] });

      const result = engine.checkDomain(new URL('https://any-domain.com'));
      expect(result.allowed).toBe(true);
    });

    it('should match multiple exact domains', () => {
      engine = new PolicyEngine({
        allowedDomains: [
          createDomainPattern('example.com'),
          createDomainPattern('test.com'),
        ],
      });

      expect(engine.checkDomain(new URL('https://example.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://test.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://other.com')).allowed).toBe(false);
    });

    it('should match domain with port', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
      });

      const result = engine.checkDomain(new URL('https://example.com:8080'));
      expect(result.allowed).toBe(true);
    });

    it('should match domain with path', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
      });

      const result = engine.checkDomain(new URL('https://example.com/path/to/resource'));
      expect(result.allowed).toBe(true);
    });

    it('should include reason for blocked domain', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
      });

      const result = engine.checkDomain(new URL('https://blocked.com'));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked.com');
      expect(result.reason).toContain('allowlist');
    });
  });

  describe('Domain Allowlist - Wildcard Match', () => {
    it('should match subdomains with wildcard prefix', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('*.example.com')],
      });

      expect(engine.checkDomain(new URL('https://api.example.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://www.example.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://deep.sub.example.com')).allowed).toBe(true);
    });

    it('should not match parent domain with wildcard', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('*.example.com')],
      });

      const result = engine.checkDomain(new URL('https://example.com'));
      expect(result.allowed).toBe(true); // Exact match with stripped wildcard
    });

    it('should match with wildcard at end', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.*')],
      });

      expect(engine.checkDomain(new URL('https://example.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://example.org')).allowed).toBe(true);
    });

    it('should create wildcard pattern via factory', () => {
      const pattern = createDomainPattern('*.test.com');
      expect(pattern.type).toBe('wildcard');
      expect(pattern.pattern).toBe('*.test.com');
    });

    it('should handle multiple wildcards', () => {
      engine = new PolicyEngine({
        allowedDomains: [
          createDomainPattern('*.example.com'),
          createDomainPattern('*.test.org'),
        ],
      });

      expect(engine.checkDomain(new URL('https://a.example.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://b.test.org')).allowed).toBe(true);
    });

    it('should be case insensitive for wildcards', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('*.EXAMPLE.COM')],
      });

      const result = engine.checkDomain(new URL('https://API.example.com'));
      expect(result.allowed).toBe(true);
    });

    it('should not match different domain with wildcard', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('*.example.com')],
      });

      const result = engine.checkDomain(new URL('https://api.other.com'));
      expect(result.allowed).toBe(false);
    });

    it('should handle wildcard with hyphens in subdomain', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('*.example.com')],
      });

      const result = engine.checkDomain(new URL('https://my-api-server.example.com'));
      expect(result.allowed).toBe(true);
    });

    it('should handle multiple levels of subdomains', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('*.example.com')],
      });

      const result = engine.checkDomain(new URL('https://a.b.c.d.example.com'));
      expect(result.allowed).toBe(true);
    });
  });

  describe('Domain Allowlist - Regex Match', () => {
    it('should match domains with regex pattern', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('/^.*\\.gov$/')],
      });

      expect(engine.checkDomain(new URL('https://agency.gov')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://sub.agency.gov')).allowed).toBe(true);
    });

    it('should not match non-gov domains with gov regex', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('/^.*\\.gov$/')],
      });

      const result = engine.checkDomain(new URL('https://example.com'));
      expect(result.allowed).toBe(false);
    });

    it('should create regex pattern via factory', () => {
      const pattern = createDomainPattern('/^api\\.\\w+\\.com$/');
      expect(pattern.type).toBe('regex');
      expect(pattern.regex).toBeDefined();
    });

    it('should be case insensitive for regex patterns', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('/^EXAMPLE\\.COM$/')],
      });

      const result = engine.checkDomain(new URL('https://example.com'));
      expect(result.allowed).toBe(true);
    });

    it('should match complex regex pattern', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('/^api-[0-9]+\\.example\\.com$/')],
      });

      expect(engine.checkDomain(new URL('https://api-1.example.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://api-99.example.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://api.example.com')).allowed).toBe(false);
    });

    it('should handle regex with escaped dots', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('/^api\\.example\\.com$/')],
      });

      expect(engine.checkDomain(new URL('https://api.example.com')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://apiXexample.com')).allowed).toBe(false);
    });

    it('should handle multiple regex patterns', () => {
      engine = new PolicyEngine({
        allowedDomains: [
          createDomainPattern('/^.*\\.gov$/'),
          createDomainPattern('/^.*\\.edu$/'),
        ],
      });

      expect(engine.checkDomain(new URL('https://agency.gov')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://university.edu')).allowed).toBe(true);
      expect(engine.checkDomain(new URL('https://example.com')).allowed).toBe(false);
    });

    it('should cache compiled regex', () => {
      const pattern = createDomainPattern('/^test\\.com$/');
      
      // First match should compile regex
      pattern.regex?.test('test.com');
      
      // Second match should use cached regex
      expect(pattern.regex?.test('test.com')).toBe(true);
    });
  });

  describe('SSRF Protection - Localhost', () => {
    it('should block localhost by default', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('*')],
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://localhost'));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('localhost');
    });

    it('should block 127.0.0.1', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('*')],
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://127.0.0.1'));
      expect(result.allowed).toBe(false);
    });

    it('should block 127.0.0.0', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://127.0.0.0'));
      expect(result.allowed).toBe(false);
    });

    it('should block 127.1 (shorthand)', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://127.1'));
      expect(result.allowed).toBe(false);
    });

    it('should block IPv6 loopback ::1', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://[::1]'));
      expect(result.allowed).toBe(false);
    });

    it('should allow localhost when disabled', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: false, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://localhost'));
      expect(result.allowed).toBe(true);
    });

    it('should be case insensitive for localhost', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://LOCALHOST')).allowed).toBe(false);
      expect(engine.checkSSRF(new URL('http://LocalHost')).allowed).toBe(false);
    });

    it('should block localhost with port', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://localhost:8080'));
      expect(result.allowed).toBe(false);
    });

    it('should block localhost with path', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://localhost/admin'));
      expect(result.allowed).toBe(false);
    });

    it('should block 0.0.0.0', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://0.0.0.0'));
      expect(result.allowed).toBe(false);
    });
  });

  describe('SSRF Protection - Private IP Ranges', () => {
    it('should block 10.0.0.0/8', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://10.0.0.1')).allowed).toBe(false);
      expect(engine.checkSSRF(new URL('http://10.255.255.255')).allowed).toBe(false);
    });

    it('should block 172.16.0.0/12', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://172.16.0.1')).allowed).toBe(false);
      expect(engine.checkSSRF(new URL('http://172.31.255.255')).allowed).toBe(false);
    });

    it('should allow IPs outside 172.16.0.0/12', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://172.15.0.1')).allowed).toBe(true);
      expect(engine.checkSSRF(new URL('http://172.32.0.1')).allowed).toBe(true);
    });

    it('should block 192.168.0.0/16', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://192.168.0.1')).allowed).toBe(false);
      expect(engine.checkSSRF(new URL('http://192.168.255.255')).allowed).toBe(false);
    });

    it('should allow public IPs', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://8.8.8.8')).allowed).toBe(true);
      expect(engine.checkSSRF(new URL('http://1.1.1.1')).allowed).toBe(true);
    });

    it('should allow private IPs when disabled', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: false, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://192.168.1.1')).allowed).toBe(true);
    });

    it('should block IPv6 unique local (fc00::/7)', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://[fc00::1]')).allowed).toBe(false);
      expect(engine.checkSSRF(new URL('http://[fcff::1]')).allowed).toBe(false);
    });

    it('should include reason for blocked private IP', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://192.168.1.1'));
      expect(result.reason).toContain('private');
    });
  });

  describe('SSRF Protection - Link-Local', () => {
    it('should block 169.254.0.0/16', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://169.254.0.1')).allowed).toBe(false);
      expect(engine.checkSSRF(new URL('http://169.254.255.255')).allowed).toBe(false);
    });

    it('should block IPv6 link-local (fe80::/10)', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      expect(engine.checkSSRF(new URL('http://[fe80::1]')).allowed).toBe(false);
      expect(engine.checkSSRF(new URL('http://[FE80::1]')).allowed).toBe(false);
    });

    it('should allow link-local when disabled', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: false },
      });

      expect(engine.checkSSRF(new URL('http://169.254.1.1')).allowed).toBe(true);
    });

    it('should include reason for blocked link-local', () => {
      engine = new PolicyEngine({
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const result = engine.checkSSRF(new URL('http://169.254.1.1'));
      expect(result.reason).toContain('link-local');
    });
  });

  describe('Rate Limiting - Token Bucket', () => {
    it('should allow requests under limit', () => {
      engine = new PolicyEngine({
        rateLimit: { maxRequests: 5, windowSeconds: 60 },
      });

      const context: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://example.com'),
        timestamp: new Date(),
      };

      const result = engine.checkRateLimit(context);
      expect(result.allowed).toBe(true);
    });

    it('should block requests over limit', () => {
      engine = new PolicyEngine({
        rateLimit: { maxRequests: 2, windowSeconds: 60 },
      });

      const context: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://example.com'),
        timestamp: new Date(),
      };

      // Use up tokens
      engine.checkRateLimit(context);
      engine.checkRateLimit(context);
      
      // Third request should be blocked
      const result = engine.checkRateLimit(context);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit');
    });

    it('should track limits per domain separately', () => {
      engine = new PolicyEngine({
        rateLimit: { maxRequests: 2, windowSeconds: 60 },
      });

      const ctx1: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://example.com'),
        timestamp: new Date(),
      };

      const ctx2: PolicyContext = {
        requestId: 'test-2',
        url: new URL('https://other.com'),
        timestamp: new Date(),
      };

      // Use up tokens for example.com
      engine.checkRateLimit(ctx1);
      engine.checkRateLimit(ctx1);
      expect(engine.checkRateLimit(ctx1).allowed).toBe(false);

      // other.com should still have tokens
      expect(engine.checkRateLimit(ctx2).allowed).toBe(true);
    });

    it('should provide retry-after header value', () => {
      engine = new PolicyEngine({
        rateLimit: { maxRequests: 1, windowSeconds: 60 },
      });

      const context: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://example.com'),
        timestamp: new Date(),
      };

      engine.checkRateLimit(context);
      const result = engine.checkRateLimit(context);
      
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset rate limit for a domain', () => {
      engine = new PolicyEngine({
        rateLimit: { maxRequests: 1, windowSeconds: 60 },
      });

      const context: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://example.com'),
        timestamp: new Date(),
      };

      engine.checkRateLimit(context);
      expect(engine.checkRateLimit(context).allowed).toBe(false);

      engine.resetRateLimit('example.com');
      expect(engine.checkRateLimit(context).allowed).toBe(true);
    });

    it('should get rate limit status', () => {
      engine = new PolicyEngine({
        rateLimit: { maxRequests: 5, windowSeconds: 60 },
      });

      const context: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://example.com'),
        timestamp: new Date(),
      };

      engine.checkRateLimit(context);
      engine.checkRateLimit(context);

      const status = engine.getRateLimitStatus('example.com');
      expect(status.remaining).toBe(3);
    });

    it('should return full remaining for unknown domain', () => {
      engine = new PolicyEngine({
        rateLimit: { maxRequests: 10, windowSeconds: 60 },
      });

      const status = engine.getRateLimitStatus('unknown.com');
      expect(status.remaining).toBe(10);
    });
  });

  describe('Full Validation', () => {
    it('should pass all checks for valid request', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
        rateLimit: { maxRequests: 10, windowSeconds: 60 },
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const context: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://example.com/page'),
        timestamp: new Date(),
      };

      const result = engine.validate(context);
      expect(result.allowed).toBe(true);
    });

    it('should fail if any check fails', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
        rateLimit: { maxRequests: 10, windowSeconds: 60 },
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const context: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://localhost/page'),
        timestamp: new Date(),
      };

      const result = engine.validate(context);
      expect(result.allowed).toBe(false);
    });

    it('should check domain before SSRF', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
        ssrf: { blockLocalhost: true, blockPrivateIPs: true, blockLinkLocal: true },
      });

      const context: PolicyContext = {
        requestId: 'test-1',
        url: new URL('https://blocked.com'),
        timestamp: new Date(),
      };

      const result = engine.validate(context);
      expect(result.reason).toContain('allowlist');
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      engine = new PolicyEngine();
      
      engine.updateConfig({
        maxResponseSize: 5 * 1024 * 1024,
      });

      expect(engine.getConfig().maxResponseSize).toBe(5 * 1024 * 1024);
    });

    it('should return frozen config', () => {
      engine = new PolicyEngine();
      const config = engine.getConfig();

      expect(() => {
        (config as { maxResponseSize: number }).maxResponseSize = 100;
      }).toThrow();
    });

    it('should create default policy', () => {
      const config = createDefaultPolicy(['example.com', '*.test.com']);

      expect(config.allowedDomains).toHaveLength(2);
      expect(config.rateLimit.maxRequests).toBe(100);
      expect(config.ssrf.blockLocalhost).toBe(true);
    });

    it('should preserve existing config on partial update', () => {
      engine = new PolicyEngine({
        allowedDomains: [createDomainPattern('example.com')],
        maxResponseSize: 1000,
      });

      engine.updateConfig({ maxResponseSize: 2000 });

      expect(engine.getConfig().maxResponseSize).toBe(2000);
      expect(engine.getConfig().allowedDomains).toHaveLength(1);
    });
  });
});
