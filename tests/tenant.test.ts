/**
 * Tenant Module Tests
 */

import type { TenantWorkspace, TenantContext } from '../src/tenant/types.js';
import { TenantWorkspaceImpl, createTenantWorkspace } from '../src/tenant/workspace.js';
import { TenantIsolationGuard } from '../src/tenant/isolation.js';
import { SYSTEM_ROLES, ROLE_SUPER_ADMIN, ROLE_TENANT_ADMIN, ROLE_STANDARD_USER, ROLE_GUEST, ROLE_AUDITOR } from '../src/identity';

describe('TenantWorkspace', () => {
  const tenantId = 'tenant-001';
  const basePath = './workspace';

  it('should create a tenant workspace with correct paths', () => {
    const workspace = createTenantWorkspace(tenantId, basePath);

    expect(workspace.tenantId).toBe(tenantId);
    expect(workspace.basePath).toBe(basePath);
    expect(workspace.artifactsPath).toBe(`${basePath}/tenants/${tenantId}/artifacts`);
    expect(workspace.memoryPath).toBe(`${basePath}/tenants/${tenantId}/memory`);
    expect(workspace.configPath).toBe(`${basePath}/tenants/${tenantId}/config`);
    expect(workspace.logsPath).toBe(`${basePath}/tenants/${tenantId}/logs`);
  });

  it('should use default base path if not provided', () => {
    const workspace = createTenantWorkspace(tenantId);

    expect(workspace.basePath).toBe('./workspace');
  });

  describe('getPath', () => {
    it('should return artifacts path', () => {
      const workspace = createTenantWorkspace(tenantId, basePath);
      expect(workspace.getPath('artifacts')).toBe(`${basePath}/tenants/${tenantId}/artifacts`);
    });

    it('should return memory path', () => {
      const workspace = createTenantWorkspace(tenantId, basePath);
      expect(workspace.getPath('memory')).toBe(`${basePath}/tenants/${tenantId}/memory`);
    });

    it('should return config path', () => {
      const workspace = createTenantWorkspace(tenantId, basePath);
      expect(workspace.getPath('config')).toBe(`${basePath}/tenants/${tenantId}/config`);
    });

    it('should return logs path', () => {
      const workspace = createTenantWorkspace(tenantId, basePath);
      expect(workspace.getPath('logs')).toBe(`${basePath}/tenants/${tenantId}/logs`);
    });

    it('should return base path', () => {
      const workspace = createTenantWorkspace(tenantId, basePath);
      expect(workspace.getPath('base')).toBe(basePath);
    });

    it('should return custom path for unknown resource', () => {
      const workspace = createTenantWorkspace(tenantId, basePath);
      expect(workspace.getPath('custom')).toBe(`${basePath}/tenants/${tenantId}/custom`);
    });
  });

  it('should implement TenantWorkspace interface', () => {
    const workspace: TenantWorkspace = new TenantWorkspaceImpl(tenantId, basePath);

    expect(typeof workspace.getPath).toBe('function');
    expect(workspace.tenantId).toBe(tenantId);
  });
});

describe('TenantIsolationGuard', () => {
  const tenantId = 'tenant-001';
  const otherTenantId = 'tenant-002';
  const basePath = './workspace';

  describe('canAccessWorkspace', () => {
    it('should allow SUPER_ADMIN to access any workspace', () => {
      const superAdmin = SYSTEM_ROLES[ROLE_SUPER_ADMIN];
      expect(TenantIsolationGuard.canAccessWorkspace(superAdmin, tenantId, null)).toBe(true);
      expect(TenantIsolationGuard.canAccessWorkspace(superAdmin, otherTenantId, null)).toBe(true);
    });

    it('should allow TENANT_ADMIN to access their own tenant workspace', () => {
      const tenantAdmin = SYSTEM_ROLES[ROLE_TENANT_ADMIN];
      const context = createMockContext(tenantId);

      // TENANT_ADMIN should be able to access their own tenant's workspace
      expect(TenantIsolationGuard.canAccessWorkspace(tenantAdmin, tenantId, context)).toBe(true);
    });

    it('should allow STANDARD_USER to access their own tenant workspace', () => {
      const standardUser = SYSTEM_ROLES[ROLE_STANDARD_USER];
      const context = createMockContext(tenantId);

      // STANDARD_USER should be able to access their own tenant's workspace
      expect(TenantIsolationGuard.canAccessWorkspace(standardUser, tenantId, context)).toBe(true);
    });

    it('should allow GUEST to access their own tenant workspace', () => {
      const guest = SYSTEM_ROLES[ROLE_GUEST];
      const context = createMockContext(tenantId);

      // GUEST should be able to access their own tenant's workspace
      expect(TenantIsolationGuard.canAccessWorkspace(guest, tenantId, context)).toBe(true);
    });

    it('should allow AUDITOR to access any tenant workspace', () => {
      const auditor = SYSTEM_ROLES[ROLE_AUDITOR];
      expect(TenantIsolationGuard.canAccessWorkspace(auditor, tenantId, null)).toBe(true);
      expect(TenantIsolationGuard.canAccessWorkspace(auditor, otherTenantId, null)).toBe(true);
    });
  });

  describe('canRead', () => {
    it('should have same behavior as canAccessWorkspace for read operations', () => {
      const superAdmin = SYSTEM_ROLES[ROLE_SUPER_ADMIN];
      const tenantAdmin = SYSTEM_ROLES[ROLE_TENANT_ADMIN];
      const standardUser = SYSTEM_ROLES[ROLE_STANDARD_USER];
      const guest = SYSTEM_ROLES[ROLE_GUEST];
      const auditor = SYSTEM_ROLES[ROLE_AUDITOR];

      const context = createMockContext(tenantId);

      expect(TenantIsolationGuard.canRead(superAdmin, tenantId, context)).toBe(true);
      expect(TenantIsolationGuard.canRead(tenantAdmin, tenantId, context)).toBe(true);
      expect(TenantIsolationGuard.canRead(standardUser, tenantId, context)).toBe(true);
      expect(TenantIsolationGuard.canRead(guest, tenantId, context)).toBe(true);
      expect(TenantIsolationGuard.canRead(auditor, tenantId, context)).toBe(true);
    });
  });

  describe('canWrite', () => {
    it('should allow SUPER_ADMIN to write anywhere', () => {
      const superAdmin = SYSTEM_ROLES[ROLE_SUPER_ADMIN];
      expect(TenantIsolationGuard.canWrite(superAdmin, tenantId, null)).toBe(true);
    });

    it('should allow TENANT_ADMIN to write to their tenant', () => {
      const tenantAdmin = SYSTEM_ROLES[ROLE_TENANT_ADMIN];
      const context = createMockContext(tenantId);

      // TENANT_ADMIN should be able to write to their own tenant
      expect(TenantIsolationGuard.canWrite(tenantAdmin, tenantId, context)).toBe(true);
    });

    it('should allow STANDARD_USER to write to their tenant', () => {
      const standardUser = SYSTEM_ROLES[ROLE_STANDARD_USER];
      const context = createMockContext(tenantId);

      // STANDARD_USER should be able to write to their own tenant
      expect(TenantIsolationGuard.canWrite(standardUser, tenantId, context)).toBe(true);
    });

    it('should NOT allow GUEST to write anywhere', () => {
      const guest = SYSTEM_ROLES[ROLE_GUEST];
      const context = createMockContext(tenantId);

      expect(TenantIsolationGuard.canWrite(guest, tenantId, context)).toBe(false);
    });

    it('should NOT allow AUDITOR to write anywhere', () => {
      const auditor = SYSTEM_ROLES[ROLE_AUDITOR];

      expect(TenantIsolationGuard.canWrite(auditor, tenantId, null)).toBe(false);
    });
  });

  describe('canDelete', () => {
    it('should allow SUPER_ADMIN to delete anywhere', () => {
      const superAdmin = SYSTEM_ROLES[ROLE_SUPER_ADMIN];
      expect(TenantIsolationGuard.canDelete(superAdmin, tenantId, null)).toBe(true);
    });

    it('should allow TENANT_ADMIN to delete in their tenant', () => {
      const tenantAdmin = SYSTEM_ROLES[ROLE_TENANT_ADMIN];
      const context = createMockContext(tenantId);

      // TENANT_ADMIN should be able to delete in their own tenant
      expect(TenantIsolationGuard.canDelete(tenantAdmin, tenantId, context)).toBe(true);
    });

    it('should allow STANDARD_USER to delete in their tenant', () => {
      const standardUser = SYSTEM_ROLES[ROLE_STANDARD_USER];
      const context = createMockContext(tenantId);

      // STANDARD_USER should be able to delete in their own tenant
      expect(TenantIsolationGuard.canDelete(standardUser, tenantId, context)).toBe(true);
    });

    it('should NOT allow GUEST to delete anywhere', () => {
      const guest = SYSTEM_ROLES[ROLE_GUEST];
      const context = createMockContext(tenantId);

      expect(TenantIsolationGuard.canDelete(guest, tenantId, context)).toBe(false);
    });

    it('should NOT allow AUDITOR to delete anywhere', () => {
      const auditor = SYSTEM_ROLES[ROLE_AUDITOR];

      expect(TenantIsolationGuard.canDelete(auditor, tenantId, null)).toBe(false);
    });
  });

  describe('createScopedPath', () => {
    it('should create scoped paths for resources', () => {
      const scopedPath = TenantIsolationGuard.createScopedPath(tenantId, 'artifacts', basePath);
      expect(scopedPath).toBe(`${basePath}/tenants/${tenantId}/artifacts`);
    });

    it('should use default base path if not provided', () => {
      const scopedPath = TenantIsolationGuard.createScopedPath(tenantId, 'memory');
      expect(scopedPath).toBe(`./workspace/tenants/${tenantId}/memory`);
    });
  });

  describe('isPathInScope', () => {
    it('should return true for paths within tenant scope', () => {
      const workspace = createTenantWorkspace(tenantId, basePath);

      expect(TenantIsolationGuard.isPathInScope(`${basePath}/tenants/${tenantId}/artifacts/file.txt`, workspace)).toBe(true);
      expect(TenantIsolationGuard.isPathInScope(`${basePath}/tenants/${tenantId}/memory/data.json`, workspace)).toBe(true);
    });

    it('should return false for paths outside tenant scope', () => {
      const workspace = createTenantWorkspace(tenantId, basePath);

      expect(TenantIsolationGuard.isPathInScope(`${basePath}/tenants/${otherTenantId}/artifacts/file.txt`, workspace)).toBe(false);
      expect(TenantIsolationGuard.isPathInScope(`${basePath}/other/path/file.txt`, workspace)).toBe(false);
    });

    it('should handle Windows-style paths', () => {
      const workspace = createTenantWorkspace(tenantId, './workspace');
      const windowsPath = '.\\workspace\\tenants\\tenant-001\\artifacts\\file.txt';

      expect(TenantIsolationGuard.isPathInScope(windowsPath, workspace)).toBe(true);
    });
  });
});

describe('Acceptance Criteria: Artifact and Memory Directories Are Tenant Scoped', () => {
  const tenantId = 'tenant-001';
  const otherTenantId = 'tenant-002';
  const basePath = './workspace';

  it('should have unique artifacts paths per tenant', () => {
    const workspace1 = createTenantWorkspace(tenantId, basePath);
    const workspace2 = createTenantWorkspace(otherTenantId, basePath);

    expect(workspace1.artifactsPath).not.toBe(workspace2.artifactsPath);
    expect(workspace1.artifactsPath).toBe(`${basePath}/tenants/${tenantId}/artifacts`);
    expect(workspace2.artifactsPath).toBe(`${basePath}/tenants/${otherTenantId}/artifacts`);
  });

  it('should have unique memory paths per tenant', () => {
    const workspace1 = createTenantWorkspace(tenantId, basePath);
    const workspace2 = createTenantWorkspace(otherTenantId, basePath);

    expect(workspace1.memoryPath).not.toBe(workspace2.memoryPath);
    expect(workspace1.memoryPath).toBe(`${basePath}/tenants/${tenantId}/memory`);
    expect(workspace2.memoryPath).toBe(`${basePath}/tenants/${otherTenantId}/memory`);
  });

  it('should enforce tenant isolation for artifacts', () => {
    const workspace1 = createTenantWorkspace(tenantId, basePath);
    const workspace2 = createTenantWorkspace(otherTenantId, basePath);

    // Workspace1 should only allow access to its own tenant's artifacts
    expect(TenantIsolationGuard.isPathInScope(workspace1.artifactsPath, workspace1)).toBe(true);
    expect(TenantIsolationGuard.isPathInScope(workspace2.artifactsPath, workspace1)).toBe(false);
  });

  it('should enforce tenant isolation for memory', () => {
    const workspace1 = createTenantWorkspace(tenantId, basePath);
    const workspace2 = createTenantWorkspace(otherTenantId, basePath);

    // Workspace1 should only allow access to its own tenant's memory
    expect(TenantIsolationGuard.isPathInScope(workspace1.memoryPath, workspace1)).toBe(true);
    expect(TenantIsolationGuard.isPathInScope(workspace2.memoryPath, workspace1)).toBe(false);
  });
});

// Helper function to create mock tenant context
function createMockContext(tenantId: string): TenantContext {
  return {
    tenant: {
      id: tenantId,
      name: `Tenant ${tenantId}`,
      slug: `tenant-${tenantId}`,
      createdAt: new Date(),
      isActive: true
    },
    workspace: createTenantWorkspace(tenantId, './workspace'),
    isActive: true,
    isValid() {
      return this.isActive && this.tenant.isActive;
    }
  };
}