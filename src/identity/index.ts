/**
 * Identity Module Public API
 * 
 * Exports all public interfaces and classes from the identity module.
 */

// Export types
export type { Operator, Tenant, Role, Permission } from './types';

// Export roles
export {
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
  ROLE_STANDARD_USER,
  ROLE_GUEST,
  ROLE_AUDITOR,
  SUPER_ADMIN,
  TENANT_ADMIN,
  STANDARD_USER,
  GUEST,
  AUDITOR,
  SYSTEM_ROLES
} from './roles';

// Export permissions
export { PermissionChecker } from './permissions';