import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../src/session/SessionManager.js';
import type { OperatorId, TenantId, Operator, RoleId } from '../src/identity/types.js';
import type { SessionId, SessionPolicy } from '../src/session/types.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  const defaultPolicy: SessionPolicy = {
    maxIdleTimeMs: 30 * 60 * 1000, // 30 minutes
    maxTotalTimeMs: 8 * 60 * 60 * 1000, // 8 hours
    requireReauthForSensitive: false,
  };

  function createOperator(id: string, tenantId: string): Operator {
    return {
      id: id as OperatorId,
      email: `${id}@example.com`,
      name: `User ${id}`,
      tenantId: tenantId as TenantId,
      roleIds: ['role-user'] as RoleId[],
      isActive: true,
      createdAt: new Date(),
    };
  }

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe('createSession', () => {
    it('should create session with policy context', async () => {
      const operator = createOperator('op-1', 'tenant-1');
      const policy: SessionPolicy = {
        ...defaultPolicy,
        requireReauthForSensitive: true,
      };

      const session = await manager.createSession({
        operator,
        policy,
        metadata: { source: 'test' },
      });

      expect(session.sessionId).toBeDefined();
      expect(session.operatorId).toBe('op-1');
      expect(session.tenantId).toBe('tenant-1');
      expect(session.policy).toEqual(policy);
      expect(session.metadata).toEqual({ source: 'test' });
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActiveAt).toBeInstanceOf(Date);
    });

    it('should emit created event', async () => {
      const events: any[] = [];
      manager.onEvent((e) => events.push(e));

      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: defaultPolicy });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('created');
      expect(events[0].sessionId).toBe(session.sessionId);
      expect(events[0].operatorId).toBe('op-1');
    });
  });

  describe('validateSession', () => {
    it('should validate active session', async () => {
      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: defaultPolicy });

      const result = await manager.validateSession(session.sessionId);
      expect(result.valid).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context?.sessionId).toBe(session.sessionId);
    });

    it('should reject expired idle session', async () => {
      const shortPolicy: SessionPolicy = {
        ...defaultPolicy,
        maxIdleTimeMs: 1, // 1ms
      };

      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: shortPolicy });

      // Wait for expiration
      await new Promise(r => setTimeout(r, 10));

      const result = await manager.validateSession(session.sessionId);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('idle');
    });

    it('should reject expired total time session', async () => {
      const shortPolicy: SessionPolicy = {
        ...defaultPolicy,
        maxTotalTimeMs: 1, // 1ms
      };

      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: shortPolicy });

      // Wait for expiration
      await new Promise(r => setTimeout(r, 10));

      const result = await manager.validateSession(session.sessionId);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('duration');
    });

    it('should reject unknown session', async () => {
      const result = await manager.validateSession('unknown' as SessionId);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Session not found');
    });
  });

  describe('checkPolicyCompliance', () => {
    it('should allow compliant actions', async () => {
      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: defaultPolicy });

      const result = await manager.checkPolicyCompliance(session.sessionId, 'read');
      expect(result.compliant).toBe(true);
    });

    it('should require reauth for sensitive actions when policy requires it', async () => {
      const strictPolicy: SessionPolicy = {
        ...defaultPolicy,
        requireReauthForSensitive: true,
      };

      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: strictPolicy });

      const result = await manager.checkPolicyCompliance(session.sessionId, 'delete');
      expect(result.compliant).toBe(false);
      expect(result.violation).toContain('re-authentication');
    });

    it('should allow sensitive actions after reauth', async () => {
      const strictPolicy: SessionPolicy = {
        ...defaultPolicy,
        requireReauthForSensitive: true,
      };

      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ 
        operator, 
        policy: strictPolicy,
        metadata: { reauthAt: new Date() },
      });

      const result = await manager.checkPolicyCompliance(session.sessionId, 'delete');
      expect(result.compliant).toBe(true);
    });
  });

  describe('terminate', () => {
    it('should terminate session and emit event', async () => {
      const events: any[] = [];
      manager.onEvent((e) => events.push(e));

      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: defaultPolicy });

      const terminated = await manager.terminate(session.sessionId);
      expect(terminated).toBe(true);

      // Check event
      expect(events.some(e => e.type === 'terminated' && e.sessionId === session.sessionId)).toBe(true);
    });

    it('should return false for unknown session', async () => {
      const terminated = await manager.terminate('unknown' as SessionId);
      expect(terminated).toBe(false);
    });

    it('should track who terminated', async () => {
      const events: any[] = [];
      manager.onEvent((e) => events.push(e));

      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: defaultPolicy });

      await manager.terminate(session.sessionId, 'admin-1' as OperatorId);

      const terminatedEvent = events.find(e => e.type === 'terminated');
      expect(terminatedEvent.terminatedBy).toBe('admin-1');
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should remove expired sessions', async () => {
      const shortPolicy: SessionPolicy = {
        ...defaultPolicy,
        maxIdleTimeMs: 1,
      };

      const operator = createOperator('op-1', 'tenant-1');
      const session = await manager.createSession({ operator, policy: shortPolicy });

      // Wait for expiration
      await new Promise(r => setTimeout(r, 10));

      const removed = await manager.cleanupExpiredSessions();
      expect(removed).toBe(1);

      const retrieved = await manager.getSession(session.sessionId);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('onEvent', () => {
    it('should support unsubscribing', async () => {
      const events: any[] = [];
      const unsubscribe = manager.onEvent((e) => events.push(e));

      const operator = createOperator('op-1', 'tenant-1');
      await manager.createSession({ operator, policy: defaultPolicy });

      expect(events).toHaveLength(1);

      unsubscribe();

      const session2 = await manager.createSession({ operator, policy: defaultPolicy });
      await manager.terminate(session2.sessionId);

      // Should still have only 1 event
      expect(events).toHaveLength(1);
    });
  });
});
