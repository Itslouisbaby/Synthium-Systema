import type { Operator, Role, Permission, PermissionId } from './types.js';

export interface CheckResult {
  allowed: boolean;
  reason?: string;
  matchedPermission?: Permission;
}

export class PermissionChecker {
  constructor(
    private roles: Map<string, Role>,
    private permissions: Map<string, Permission>
  ) {}

  check(
    operator: Operator,
    resource: string,
    action: string,
    context?: Record<string, unknown>
  ): CheckResult {
    if (!operator.isActive) {
      return { allowed: false, reason: 'Operator is inactive' };
    }

    const perms = this.resolvePermissions(operator.roleIds);
    
    for (const perm of perms) {
      if (this.matches(perm, resource, action, context)) {
        return {
          allowed: true,
          matchedPermission: perm
        };
      }
    }

    return {
      allowed: false,
      reason: `No permission for ${action} on ${resource}`
    };
  }

  checkAny(
    operator: Operator,
    requirements: Array<{ resource: string; action: string }>
  ): CheckResult {
    if (!operator.isActive) {
      return { allowed: false, reason: 'Operator is inactive' };
    }

    for (const req of requirements) {
      const result = this.check(operator, req.resource, req.action);
      if (result.allowed) {
        return result;
      }
    }

    return {
      allowed: false,
      reason: 'None of the required permissions found'
    };
  }

  checkAll(
    operator: Operator,
    requirements: Array<{ resource: string; action: string }>
  ): CheckResult {
    if (!operator.isActive) {
      return { allowed: false, reason: 'Operator is inactive' };
    }

    for (const req of requirements) {
      const result = this.check(operator, req.resource, req.action);
      if (!result.allowed) {
        return {
          allowed: false,
          reason: `Missing permission for ${req.action} on ${req.resource}`
        };
      }
    }

    return { allowed: true };
  }

  private resolvePermissions(roleIds: string[]): Permission[] {
    const seen = new Set<string>();
    const result: Permission[] = [];

    for (const roleId of roleIds) {
      const role = this.roles.get(roleId);
      if (!role) continue;

      for (const permId of role.permissions) {
        if (seen.has(permId)) continue;
        seen.add(permId);

        const perm = this.permissions.get(permId);
        if (perm) {
          result.push(perm);
        }
      }
    }

    return result;
  }

  private matches(
    perm: Permission,
    resource: string,
    action: string,
    context?: Record<string, unknown>
  ): boolean {
    // Check resource match (supports wildcards)
    if (!this.resourceMatches(perm.resource, resource)) {
      return false;
    }

    // Check action match
    if (perm.action !== action && perm.action !== 'admin') {
      return false;
    }

    // Check conditions if present
    if (perm.conditions && context) {
      return this.evaluateConditions(perm.conditions, context);
    }

    return true;
  }

  private resourceMatches(pattern: string, resource: string): boolean {
    if (pattern === '*') return true;
    if (pattern === resource) return true;
    
    // Support for pattern matching like "workspace:*"
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2);
      return resource.startsWith(prefix + ':');
    }

    return false;
  }

  private evaluateConditions(
    conditions: Record<string, unknown>,
    context: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(conditions)) {
      if (context[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
