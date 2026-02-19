import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionChecker } from '../src/identity/PermissionChecker.js';
import type { Operator, Role, Permission, OperatorId, TenantId, RoleId, PermissionId } from '../src/identity/types.js';

describe('PermissionChecker', () => {
  let checker: PermissionChecker;
  let operator: Operator;
  let roles: Map<string, Role>;
  let permissions: Map<string, Permission>;

  beforeEach(() => {
    permissions = new Map<string, Permission>([
      ['perm-read-workspace', { id: 'perm-read-workspace' as PermissionId, resource: 'workspace', action: 'read' }],
      ['perm-write-workspace', { id: 'perm-write-workspace' as PermissionId, resource: 'workspace', action: 'update' }],
      ['perm-admin', { id: 'perm-admin' as PermissionId, resource: '*', action: 'admin' }],
      ['perm-delete-user', { id: 'perm-delete-user' as PermissionId, resource: 'user', action: 'delete', conditions: { tenantAdmin: true } }],
    ]);

    roles = new Map<string, Role>([
      ['role-user', { id: 'role-user' as RoleId, name: 'User', permissions: ['perm-read-workspace'] }],
      ['role-admin', { id: 'role-admin' as RoleId, name: 'Admin', permissions: ['perm-read-workspace', 'perm-write-workspace', 'perm-delete-user'] }],
      ['role-superadmin', { id: 'role-superadmin' as RoleId, name: 'SuperAdmin', permissions: ['perm-admin'] }],
    ]);

    checker = new PermissionChecker(roles, permissions);

    operator = {
      id: 'op-1' as OperatorId,
      email: 'test@example.com',
      name: 'Test User',
      tenantId: 'tenant-1' as TenantId,
      roleIds: ['role-user'],
      isActive: true,
      createdAt: new Date(),
    };
  });

  describe('check', () => {
    it('should allow permission that operator has', () => {
      const result = checker.check(operator, 'workspace', 'read');
      expect(result.allowed).toBe(true);
    });

    it('should deny permission that operator does not have', () => {
      const result = checker.check(operator, 'workspace', 'update');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No permission');
    });

    it('should deny for inactive operator', () => {
      operator.isActive = false;
      const result = checker.check(operator, 'workspace', 'read');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Operator is inactive');
    });

    it('should allow admin action with wildcard resource', () => {
      operator.roleIds = ['role-superadmin'];
      const result = checker.check(operator, 'anything', 'delete');
      expect(result.allowed).toBe(true);
    });

    it('should evaluate conditions correctly', () => {
      operator.roleIds = ['role-admin'];
      const result = checker.check(operator, 'user', 'delete', { tenantAdmin: true });
      expect(result.allowed).toBe(true);
    });

    it('should fail conditions when context does not match', () => {
      operator.roleIds = ['role-admin'];
      const result = checker.check(operator, 'user', 'delete', { tenantAdmin: false });
      expect(result.allowed).toBe(false);
    });
  });

  describe('checkAny', () => {
    it('should pass when any permission is granted', () => {
      operator.roleIds = ['role-user', 'role-admin'];
      const result = checker.checkAny(operator, [
        { resource: 'workspace', action: 'read' },
        { resource: 'workspace', action: 'update' },
      ]);
      expect(result.allowed).toBe(true);
    });

    it('should fail when no permissions are granted', () => {
      const result = checker.checkAny(operator, [
        { resource: 'workspace', action: 'update' },
        { resource: 'user', action: 'delete' },
      ]);
      expect(result.allowed).toBe(false);
    });
  });

  describe('checkAll', () => {
    it('should pass when all permissions are granted', () => {
      operator.roleIds = ['role-admin'];
      const result = checker.checkAll(operator, [
        { resource: 'workspace', action: 'read' },
        { resource: 'workspace', action: 'update' },
      ]);
      expect(result.allowed).toBe(true);
    });

    it('should fail when any permission is missing', () => {
      const result = checker.checkAll(operator, [
        { resource: 'workspace', action: 'read' },
        { resource: 'workspace', action: 'update' },
      ]);
      expect(result.allowed).toBe(false);
    });
  });
});
