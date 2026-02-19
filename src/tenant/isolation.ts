/**
 * Tenant Isolation Module
 * 
 * Provides guards for tenant isolation and access control.
 */

import { TenantContext, TenantWorkspace } from './types';
import { TenantWorkspaceImpl } from './workspace';
import { PermissionChecker } from '../identity/permissions';
import { Role, Permission } from '../identity/types';

/**
 * TenantIsolationGuard class for enforcing tenant isolation
 */
export class TenantIsolationGuard {
  /**
   * Check if a user can access a tenant workspace
   */
  static canAccessWorkspace(
    role: Role,
    tenantId: string,
    context: TenantContext | null
  ): boolean {
    // Super admins can access any workspace
    if (role.id === 'SUPER_ADMIN') {
      return true;
    }

    // Tenant admins can access their own tenant's workspace
    if (role.id === 'TENANT_ADMIN' && context?.tenant.id === tenantId) {
      return true;
    }

    // Standard users can access their own tenant's workspace
    if (role.id === 'STANDARD_USER' && context?.tenant.id === tenantId) {
      return true;
    }

    // Guests can only access read-only resources in their tenant
    if (role.id === 'GUEST' && context?.tenant.id === tenantId) {
      return true;
    }

    // Auditors can access any tenant in read-only mode
    if (role.id === 'AUDITOR') {
      return true;
    }

    return false;
  }

  /**
   * Check if a user can read from a specific path
   */
  static canRead(role: Role, tenantId: string, context: TenantContext | null): boolean {
    return this.canAccessWorkspace(role, tenantId, context);
  }

  /**
   * Check if a user can write to a specific path
   */
  static canWrite(role: Role, tenantId: string, context: TenantContext | null): boolean {
    // Super admins can write anywhere
    if (role.id === 'SUPER_ADMIN') {
      return true;
    }

    // Tenant admins can write to their tenant
    if (role.id === 'TENANT_ADMIN' && context?.tenant.id === tenantId) {
      return true;
    }

    // Standard users can write to their tenant
    if (role.id === 'STANDARD_USER' && context?.tenant.id === tenantId) {
      return true;
    }

    // Guests cannot write
    if (role.id === 'GUEST') {
      return false;
    }

    // Auditors cannot write
    if (role.id === 'AUDITOR') {
      return false;
    }

    return false;
  }

  /**
   * Check if a user can delete resources
   */
  static canDelete(role: Role, tenantId: string, context: TenantContext | null): boolean {
    // Super admins can delete anywhere
    if (role.id === 'SUPER_ADMIN') {
      return true;
    }

    // Tenant admins can delete in their tenant
    if (role.id === 'TENANT_ADMIN' && context?.tenant.id === tenantId) {
      return true;
    }

    // Standard users can delete their own resources (simplified)
    if (role.id === 'STANDARD_USER' && context?.tenant.id === tenantId) {
      return true;
    }

    // Guests and auditors cannot delete
    return false;
  }

  /**
   * Create a scoped path for a tenant
   */
  static createScopedPath(tenantId: string, resource: string, basePath?: string): string {
    const workspace = new TenantWorkspaceImpl(tenantId, basePath);
    return workspace.getPath(resource);
  }

  /**
   * Validate that a path is within the tenant's scope
   */
  static isPathInScope(path: string, workspace: TenantWorkspace): boolean {
    const normalizedPath = path.replace(/\\/g, '/');
    
    return (
      normalizedPath.startsWith(workspace.basePath) &&
      normalizedPath.includes(`/tenants/${workspace.tenantId}/`)
    );
  }
}