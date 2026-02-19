import type { TenantId, Operator } from '../identity/types.js';

export interface IsolationContext {
  tenantId: TenantId;
  operator: Operator;
  resourceType: string;
  resourceId: string;
}

export class TenantIsolationError extends Error {
  constructor(
    message: string,
    public readonly context: IsolationContext
  ) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

export class TenantIsolationGuard {
  private tenantBoundaries = new Map<string, Set<string>>(); // tenantId -> resourceIds

  enforce(context: IsolationContext): void {
    // Check if operator belongs to the tenant
    if (context.operator.tenantId !== context.tenantId) {
      // Check if operator has admin privileges (can access all tenants)
      const isAdmin = this.isAdmin(context.operator);
      if (!isAdmin) {
        throw new TenantIsolationError(
          `Access denied: operator ${context.operator.id} cannot access tenant ${context.tenantId}`,
          context
        );
      }
    }

    // Register resource under tenant for tracking
    this.registerResource(context.tenantId, context.resourceId);
  }

  canAccess(operator: Operator, tenantId: TenantId): boolean {
    if (operator.tenantId === tenantId) {
      return true;
    }
    return this.isAdmin(operator);
  }

  registerResource(tenantId: TenantId, resourceId: string): void {
    let resources = this.tenantBoundaries.get(tenantId);
    if (!resources) {
      resources = new Set<string>();
      this.tenantBoundaries.set(tenantId, resources);
    }
    resources.add(resourceId);
  }

  getTenantResources(tenantId: TenantId): string[] {
    const resources = this.tenantBoundaries.get(tenantId);
    return resources ? Array.from(resources) : [];
  }

  private isAdmin(operator: Operator): boolean {
    // Simple admin check - could be expanded based on roles
    return operator.roleIds.some(roleId => 
      roleId.toLowerCase().includes('admin') || 
      roleId.toLowerCase().includes('super')
    );
  }
}
