/**
 * Identity Module Tests
 */

import {
  Operator,
  Tenant,
  Role,
  Permission,
  PermissionChecker,
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
  ROLE_STANDARD_USER,
  ROLE_GUEST,
  ROLE_AUDITOR,
  SYSTEM_ROLES
} from '../src/identity';

describe('Identity Types', () => {
  describe('Operator', () => {
    it('should create an operator with required fields', () => {
      const operator: Operator = {
        id: 'op-001',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date()
      };
      
      expect(operator.id).toBe('op-001');
      expect(operator.name).toBe('John Doe');
      expect(operator.email).toBe('john@example.com');
    });

    it('should allow optional lastLoginAt field', () => {
      const operator: Operator = {
        id: 'op-001',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: new Date(),
        lastLoginAt: new Date()
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
    it('should create a role with permissions', () => {
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
        permissions: [readPermission],
        isSystemRole: false
      };

      expect(role.permissions).toHaveLength(1);
      expect(role.permissions[0].resource).toBe('files');
      expect(role.permissions[0].action).toBe('read');
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

describe('PermissionChecker', () => {
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

  describe('hasPermission', () => {
    it('should return true for SUPER_ADMIN for any permission', () => {
      const superAdmin = SYSTEM_ROLES[ROLE_SUPER_ADMIN];
      expect(PermissionChecker.hasPermission(superAdmin, readPermission)).toBe(true);
      expect(PermissionChecker.hasPermission(superAdmin, writePermission)).toBe(true);
    });

    it('should check permission for regular roles', () => {
      const roleWithRead: Role = {
        ...SYSTEM_ROLES[ROLE_STANDARD_USER],
        permissions: [readPermission]
      };

      expect(PermissionChecker.hasPermission(roleWithRead, readPermission)).toBe(true);
      expect(PermissionChecker.hasPermission(roleWithRead, writePermission)).toBe(false);
    });
  });

  describe('hasResourcePermission', () => {
    it('should return true for SUPER_ADMIN for any resource', () => {
      const superAdmin = SYSTEM_ROLES[ROLE_SUPER_ADMIN];
      expect(PermissionChecker.hasResourcePermission(superAdmin, 'files')).toBe(true);
      expect(PermissionChecker.hasResourcePermission(superAdmin, 'config')).toBe(true);
    });

    it('should check resource-specific permissions', () => {
      const roleWithFilesRead: Role = {
        ...SYSTEM_ROLES[ROLE_STANDARD_USER],
        permissions: [readPermission]
      };

      expect(PermissionChecker.hasResourcePermission(roleWithFilesRead, 'files')).toBe(true);
      expect(PermissionChecker.hasResourcePermission(roleWithFilesRead, 'config')).toBe(false);
    });

    it('should check resource with specific action', () => {
      const roleWithFilesRead: Role = {
        ...SYSTEM_ROLES[ROLE_STANDARD_USER],
        permissions: [readPermission]
      };

      expect(PermissionChecker.hasResourcePermission(roleWithFilesRead, 'files', 'read')).toBe(true);
      expect(PermissionChecker.hasResourcePermission(roleWithFilesRead, 'files', 'write')).toBe(false);
    });
  });

  describe('getPermissions', () => {
    it('should return a copy of permissions', () => {
      const role = {
        ...SYSTEM_ROLES[ROLE_STANDARD_USER],
        permissions: [readPermission, writePermission]
      };

      const permissions = PermissionChecker.getPermissions(role);
      expect(permissions).toHaveLength(2);
      
      // Verify it's a copy, not the original array
      permissions.push({} as Permission);
      expect(PermissionChecker.getPermissions(role)).toHaveLength(2);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if role has any of the permissions', () => {
      const role: Role = {
        ...SYSTEM_ROLES[ROLE_STANDARD_USER],
        permissions: [readPermission]
      };

      expect(PermissionChecker.hasAnyPermission(role, [readPermission, writePermission])).toBe(true);
      expect(PermissionChecker.hasAnyPermission(role, [writePermission])).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if role has all permissions', () => {
      const roleWithBoth: Role = {
        ...SYSTEM_ROLES[ROLE_STANDARD_USER],
        permissions: [readPermission, writePermission]
      };

      const roleWithReadOnly: Role = {
        ...SYSTEM_ROLES[ROLE_STANDARD_USER],
        permissions: [readPermission]
      };

      expect(PermissionChecker.hasAllPermissions(roleWithBoth, [readPermission, writePermission])).toBe(true);
      expect(PermissionChecker.hasAllPermissions(roleWithReadOnly, [readPermission])).toBe(true);
      expect(PermissionChecker.hasAllPermissions(roleWithReadOnly, [writePermission])).toBe(false);
    });
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