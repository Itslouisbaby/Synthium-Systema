/**
 * Identity Types Module
 *
 * Core interfaces for the identity and access management system.
 *
 * NOTE: These types are intentionally permissive (many optional fields)
 * to support incremental rollout and lightweight unit tests.
 */

export type OperatorId = string;
export type TenantId = string;
export type RoleId = string;
export type PermissionId = string;

export type ResourceAction = 'create' | 'read' | 'update' | 'delete' | 'execute' | 'admin' | string;

/** Represents a permission in the system */
export interface Permission {
  id: PermissionId;
  name: string;
  description: string;
  resource: string;
  action: ResourceAction;
  conditions?: Record<string, unknown>;
}

/** Represents a role in the system */
export interface Role {
  id: RoleId;
  name: string;
  description: string;
  permissions: Permission[];
  isSystemRole: boolean;
  tenantId?: TenantId;
}

/** Represents an operator/user */
export interface Operator {
  id: OperatorId;
  name: string;
  email: string;
  createdAt: Date;
  lastLoginAt?: Date;

  // Optional for tests / bootstrapping; required in production flows.
  tenantId?: TenantId;
  roleIds?: RoleId[];
  isActive?: boolean;
}

/** Represents a tenant */
export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  createdAt: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;

  // Optional/advanced
  ownerId?: OperatorId;
  settings?: Record<string, unknown>;
}
