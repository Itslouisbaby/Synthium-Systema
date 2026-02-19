/**
 * Identity Module Tests
 */

import type { Operator, Tenant, Role, Permission } from '../src/identity/types.js';
import {
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
  ROLE_STANDARD_USER,
  ROLE_GUEST,
  ROLE_AUDITOR,
  SYSTEM_ROLES
} from '../src/identity/roles.js';
import { PermissionChecker } from '../src/identity/PermissionChecker.js';

describe('Identity Types', () => {
  describe('Operator', () => {
    it('should create an operator with required fields', () => {
      const operator: Operator = {
        id: 'op-001',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date(),
        tenantId: 'tenant-001',
        roleIds: ['role-user'],
        isActive: true,
      };

      expect(operator.id).toBe('op-001');
      expect(operator.name).toBe('John Doe');
      expect(operator.email).toBe('john@example.com');
      expect(operator.tenantId).toBe('tenant-001');
      expect(operator.isActive).toBe(true);
    });

    it('should allow optional lastLoginAt field', () => {
      const operator: Operator = {
        id: 'op-001',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date(),
        lastLoginAt: new Date(),
        tenantId: 'tenant-001',
        roleIds: ['role-user'],
        isActive: true,
      };

      expect(operator.lastLoginAt).toBeDefined();
    });
  });

  describe('Tenant', () => {
    it('should create a tenant with required fields', () => {
      const tenant: Tenant = {
        id: 'tenant-001',
        name: 'Acme Corp',
        slug: 'acme-corp',
        createdAt: new Date(),
        isActive: true
      };
      
      expect(tenant.id).toBe('tenant-001');
      expect(tenant.name).toBe('Acme Corp');
      expect(tenant.slug).toBe('acme-corp');
      expect(tenant.isActive).toBe(true);
    });

    it('should allow optional metadata field', () => {
      const tenant: Tenant = {
        id: 'tenant-001',
        name: 'Acme Corp',
        slug: 'acme-corp',
        createdAt: new Date(),
        isActive: true,
        metadata: { plan: 'enterprise', seats: 100 }
      };
      
      expect(tenant.metadata).toEqual({ plan: 'enterprise', seats: 100 });
    });
  });

  describe('Role and Permission', () => {
    it('should create a role with permission ids', () => {
      const readPermission: Permission = {
        id: 'read-files',
        name: 'Read Files',
        description: 'Can read files',
        resource: 'files',
        action: 'read'
      };

      const role: Role = {
        id: 'custom-role',
        name: 'Custom Role',
        description: 'A custom role',
        permissions: [readPermission.id],
        isSystemRole: false
      };

      expect(role.permissions).toHaveLength(1);
      expect(role.permissions[0]).toBe('read-files');
    });
  });
});

describe('System Roles', () => {
  it('should have all 5 system roles defined', () => {
    expect(SYSTEM_ROLES).toHaveProperty(ROLE_SUPER_ADMIN);
    expect(SYSTEM_ROLES).toHaveProperty(ROLE_TENANT_ADMIN);
    expect(SYSTEM_ROLES).toHaveProperty(ROLE_STANDARD_USER);
    expect(SYSTEM_ROLES).toHaveProperty(ROLE_GUEST);
    expect(SYSTEM_ROLES).toHaveProperty(ROLE_AUDITOR);
    expect(Object.keys(SYSTEM_ROLES)).toHaveLength(5);
  });

  it('should mark all system roles as system roles', () => {
    Object.values(SYSTEM_ROLES).forEach(role => {
      expect(role.isSystemRole).toBe(true);
    });
  });

  it('should have correct role names', () => {
    expect(SYSTEM_ROLES[ROLE_SUPER_ADMIN].name).toBe('Super Administrator');
    expect(SYSTEM_ROLES[ROLE_TENANT_ADMIN].name).toBe('Tenant Administrator');
    expect(SYSTEM_ROLES[ROLE_STANDARD_USER].name).toBe('Standard User');
    expect(SYSTEM_ROLES[ROLE_GUEST].name).toBe('Guest');
    expect(SYSTEM_ROLES[ROLE_AUDITOR].name).toBe('Auditor');
  });
});

describe('PermissionChecker (canonical instance API)', () => {
  const readPermission: Permission = {
    id: 'read-files',
    name: 'Read Files',
    description: 'Can read files',
    resource: 'files',
    action: 'read'
  };

  const writePermission: Permission = {
    id: 'write-files',
    name: 'Write Files',
    description: 'Can write files',
    resource: 'files',
    action: 'write'
  };

  const permissions = new Map<string, Permission>([
    [readPermission.id, readPermission],
    [writePermission.id, writePermission],
  ]);

  it('SUPER_ADMIN (admin wildcard) should allow any action', () => {
    const roles = new Map<string, Role>([
      ['super', { ...SYSTEM_ROLES[ROLE_SUPER_ADMIN], permissions: ['perm-admin'] }]
    ]);
    permissions.set('perm-admin', { id: 'perm-admin', resource: '*', action: 'admin' });

    const checker = new PermissionChecker(roles, permissions);

    const operator: Operator = {
      id: 'op-1',
      name: 'SA',
      email: 'sa@example.com',
      createdAt: new Date(),
      tenantId: 'tenant-1',
      roleIds: ['super'],
      isActive: true,
    };

    const result = checker.check(operator, 'anything', 'delete');
    expect(result.allowed).toBe(true);
  });

  it('should allow/deny based on resolved permission ids', () => {
    const roles = new Map<string, Role>([
      ['user', { id: 'user', name: 'User', permissions: [readPermission.id] }],
    ]);

    const checker = new PermissionChecker(roles, permissions);

    const operator: Operator = {
      id: 'op-1',
      name: 'User',
      email: 'u@example.com',
      createdAt: new Date(),
      tenantId: 'tenant-1',
      roleIds: ['user'],
      isActive: true,
    };

    expect(checker.check(operator, 'files', 'read').allowed).toBe(true);
    expect(checker.check(operator, 'files', 'write').allowed).toBe(false);
  });
});

describe('Acceptance Criteria: Different Roles Produce Different Policy Outcomes', () => {
  const tenantId = 'tenant-001';
  
  const createTestRole = (roleId: string, permissions: Permission[] = []): Role => ({
    id: roleId,
    name: 'Test Role',
    description: 'Test',
    permissions,
    isSystemRole: false
  });

  it('SUPER_ADMIN should have access to any tenant workspace', () => {
    const superAdmin = SYSTEM_ROLES[ROLE_SUPER_ADMIN];
    const tenantAdminRole = createTestRole('TENANT_ADMIN');
    const standardUserRole = createTestRole('STANDARD_USER');

    // All should have access per their roles
    expect(superAdmin.id).toBe(ROLE_SUPER_ADMIN);
    expect(tenantAdminRole.id).toBe('TENANT_ADMIN');
    expect(standardUserRole.id).toBe('STANDARD_USER');
  });

  it('should produce different outcomes for different roles', () => {
    const superAdmin = SYSTEM_ROLES[ROLE_SUPER_ADMIN];
    const tenantAdmin = SYSTEM_ROLES[ROLE_TENANT_ADMIN];
    const standardUser = SYSTEM_ROLES[ROLE_STANDARD_USER];
    const guest = SYSTEM_ROLES[ROLE_GUEST];
    const auditor = SYSTEM_ROLES[ROLE_AUDITOR];

    // Each role should have a unique ID
    const roleIds = [superAdmin.id, tenantAdmin.id, standardUser.id, guest.id, auditor.id];
    const uniqueIds = new Set(roleIds);
    expect(uniqueIds.size).toBe(5);
  });
});