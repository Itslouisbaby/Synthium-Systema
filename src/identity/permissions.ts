/**
 * Permissions Module (LEGACY)
 *
 * Deprecated: prefer the instance-based PermissionChecker in `src/identity/PermissionChecker.ts`.
 * This file remains temporarily for transition.
 */

import { Permission, Role } from './types';

/**
 * PermissionChecker class for validating permissions
 */
export class PermissionChecker {
  /**
   * Check if a role has a specific permission
   * @param role The role to check
   * @param permission The permission to check for
   * @returns True if the role has the permission, false otherwise
   */
  static hasPermission(role: Role, permission: Permission): boolean {
    // Super admins have all permissions
    if (role.id === 'SUPER_ADMIN') {
      return true;
    }

    // Check if the permission exists in the role's permissions
    return role.permissions.some(p => 
      p.id === permission.id || 
      (p.resource === permission.resource && p.action === permission.action)
    );
  }

  /**
   * Check if a role has permissions for a specific resource
   * @param role The role to check
   * @param resource The resource to check permissions for
   * @param action Optional specific action to check
   * @returns True if the role has permissions for the resource, false otherwise
   */
  static hasResourcePermission(role: Role, resource: string, action?: string): boolean {
    // Super admins have all permissions
    if (role.id === 'SUPER_ADMIN') {
      return true;
    }

    // Check if the role has any permissions for the resource
    return role.permissions.some(p => {
      if (action) {
        return p.resource === resource && p.action === action;
      }
      return p.resource === resource;
    });
  }

  /**
   * Get all permissions for a role
   * @param role The role to get permissions for
   * @returns Array of permissions
   */
  static getPermissions(role: Role): Permission[] {
    return [...role.permissions];
  }

  /**
   * Check if a role has any of the specified permissions
   * @param role The role to check
   * @param permissions Array of permissions to check for
   * @returns True if the role has any of the permissions, false otherwise
   */
  static hasAnyPermission(role: Role, permissions: Permission[]): boolean {
    return permissions.some(permission => this.hasPermission(role, permission));
  }

  /**
   * Check if a role has all of the specified permissions
   * @param role The role to check
   * @param permissions Array of permissions to check for
   * @returns True if the role has all of the permissions, false otherwise
   */
  static hasAllPermissions(role: Role, permissions: Permission[]): boolean {
    return permissions.every(permission => this.hasPermission(role, permission));
  }
}