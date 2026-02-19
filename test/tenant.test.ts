import { describe, it, expect, beforeEach } from 'vitest';
import { TenantIsolationGuard, TenantIsolationError } from '../src/tenant/TenantIsolationGuard.js';
import type { TenantId, OperatorId, Operator } from '../src/identity/types.js';

describe('TenantIsolationGuard', () => {
  let guard: TenantIsolationGuard;

  beforeEach(() => {
    guard = new TenantIsolationGuard();
  });

  function createOperator(tenantId: string, roleIds: string[] = ['role-user']): Operator {
    return {
      id: 'op-1' as OperatorId,
      email: 'test@example.com',
      name: 'Test',
      tenantId: tenantId as TenantId,
      roleIds: roleIds as any,
      isActive: true,
      createdAt: new Date(),
    };
  }

  describe('enforce', () => {
    it('should allow access when operator belongs to tenant', () => {
      const operator = createOperator('tenant-1');
      expect(() => {
        guard.enforce({
          tenantId: 'tenant-1' as TenantId,
          operator,
          resourceType: 'workspace',
          resourceId: 'ws-1',
        });
      }).not.toThrow();
    });

    it('should throw when operator belongs to different tenant', () => {
      const operator = createOperator('tenant-1');
      expect(() => {
        guard.enforce({
          tenantId: 'tenant-2' as TenantId,
          operator,
          resourceType: 'workspace',
          resourceId: 'ws-1',
        });
      }).toThrow(TenantIsolationError);
    });

    it('should allow access for admin operators', () => {
      const operator = createOperator('tenant-1', ['role-admin']);
      expect(() => {
        guard.enforce({
          tenantId: 'tenant-2' as TenantId,
          operator,
          resourceType: 'workspace',
          resourceId: 'ws-1',
        });
      }).not.toThrow();
    });

    it('should register resource when enforcing', () => {
      const operator = createOperator('tenant-1');
      guard.enforce({
        tenantId: 'tenant-1' as TenantId,
        operator,
        resourceType: 'workspace',
        resourceId: 'ws-1',
      });

      const resources = guard.getTenantResources('tenant-1' as TenantId);
      expect(resources).toContain('ws-1');
    });
  });

  describe('canAccess', () => {
    it('should return true for same tenant', () => {
      const operator = createOperator('tenant-1');
      expect(guard.canAccess(operator, 'tenant-1' as TenantId)).toBe(true);
    });

    it('should return false for different tenant without admin', () => {
      const operator = createOperator('tenant-1');
      expect(guard.canAccess(operator, 'tenant-2' as TenantId)).toBe(false);
    });

    it('should return true for admin on any tenant', () => {
      const operator = createOperator('tenant-1', ['role-superadmin']);
      expect(guard.canAccess(operator, 'tenant-2' as TenantId)).toBe(true);
    });
  });

  describe('registerResource', () => {
    it('should track resources per tenant', () => {
      guard.registerResource('tenant-1' as TenantId, 'res-1');
      guard.registerResource('tenant-1' as TenantId, 'res-2');
      guard.registerResource('tenant-2' as TenantId, 'res-3');

      expect(guard.getTenantResources('tenant-1' as TenantId)).toHaveLength(2);
      expect(guard.getTenantResources('tenant-2' as TenantId)).toHaveLength(1);
    });

    it('should deduplicate resources', () => {
      guard.registerResource('tenant-1' as TenantId, 'res-1');
      guard.registerResource('tenant-1' as TenantId, 'res-1');

      expect(guard.getTenantResources('tenant-1' as TenantId)).toHaveLength(1);
    });
  });
});
