/**
 * System Roles Module
 * 
 * Predefined system roles with their associated permissions.
 */

import { Role } from './types';

// System role identifiers
export const ROLE_SUPER_ADMIN = 'SUPER_ADMIN';
export const ROLE_TENANT_ADMIN = 'TENANT_ADMIN';
export const ROLE_STANDARD_USER = 'STANDARD_USER';
export const ROLE_GUEST = 'GUEST';
export const ROLE_AUDITOR = 'AUDITOR';

// System roles with their permissions
export const SUPER_ADMIN: Role = {
  id: ROLE_SUPER_ADMIN,
  name: 'Super Administrator',
  description: 'Full system access with unrestricted permissions',
  permissions: [], // Super admin has all permissions by default
  isSystemRole: true
};

export const TENANT_ADMIN: Role = {
  id: ROLE_TENANT_ADMIN,
  name: 'Tenant Administrator',
  description: 'Administrative access within a specific tenant',
  permissions: [], // Will be populated with tenant-specific permissions
  isSystemRole: true
};

export const STANDARD_USER: Role = {
  id: ROLE_STANDARD_USER,
  name: 'Standard User',
  description: 'Regular user with standard permissions within their tenant',
  permissions: [], // Will be populated with standard user permissions
  isSystemRole: true
};

export const GUEST: Role = {
  id: ROLE_GUEST,
  name: 'Guest',
  description: 'Limited access for unauthenticated or trial users',
  permissions: [], // Will be populated with minimal permissions
  isSystemRole: true
};

export const AUDITOR: Role = {
  id: ROLE_AUDITOR,
  name: 'Auditor',
  description: 'Read-only access for compliance and auditing purposes',
  permissions: [], // Will be populated with read-only permissions
  isSystemRole: true
};

// Export all system roles as a map for easy access
export const SYSTEM_ROLES: Record<string, Role> = {
  [ROLE_SUPER_ADMIN]: SUPER_ADMIN,
  [ROLE_TENANT_ADMIN]: TENANT_ADMIN,
  [ROLE_STANDARD_USER]: STANDARD_USER,
  [ROLE_GUEST]: GUEST,
  [ROLE_AUDITOR]: AUDITOR
};