/**
 * Identity Types Module
 *
 * Canonical model: ID-based RBAC.
 * - Roles store Permission IDs
 * - Operators store Role IDs
 * - Permission resolution happens via registries (maps), enabling governance/versioning.
 */

export type OperatorId = string;
export type TenantId = string;
export type RoleId = string;
export type PermissionId = string;

export type ResourceAction = 'create' | 'read' | 'update' | 'delete' | 'execute' | 'admin' | string;

/** Represents a permission in the system */
export interface Permission {
  id: PermissionId;
  resource: string;
  action: ResourceAction;
  name?: string;
  description?: string;
  conditions?: Record<string, unknown>;
}

/** Represents a role in the system */
export interface Role {
  id: RoleId;
  name: string;
  permissions: PermissionId[];
  description?: string;
  isSystemRole?: boolean;
  tenantId?: TenantId;
}

/** Represents an operator/user */
export interface Operator {
  id: OperatorId;
  name: string;
  email: string;
  createdAt: Date;
  lastLoginAt?: Date;

  tenantId: TenantId;
  roleIds: RoleId[];
  isActive: boolean;
}

/** Represents a tenant */
export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  createdAt: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;

  ownerId?: OperatorId;
  settings?: Record<string, unknown>;
}
