/**
 * Identity Types
 *
 * Core interfaces for the identity and access management system.
 */

export type OperatorId = string & { __brand: 'OperatorId' };
export type TenantId = string & { __brand: 'TenantId' };
export type RoleId = string & { __brand: 'RoleId' };
export type PermissionId = string & { __brand: 'PermissionId' };

export type ResourceAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'execute'
  | 'admin';

export interface Permission {
  id: PermissionId;
  resource: string;
  action: ResourceAction;
  name?: string;
  description?: string;
  conditions?: Record<string, unknown>;
}

export interface Role {
  id: RoleId;
  name: string;
  description?: string;
  /** Permission IDs (resolved via registry / map) */
  permissions: PermissionId[];
  /** undefined for global/system roles */
  tenantId?: TenantId;
  isSystemRole?: boolean;
}

export interface Operator {
  id: OperatorId;
  email: string;
  name: string;
  tenantId: TenantId;
  roleIds: RoleId[];
  isActive: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export interface TenantSettings {
  maxUsers: number;
  maxWorkspaces: number;
  allowedFeatures: string[];
  dataRetentionDays: number;
}

export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  ownerId: OperatorId;
  settings: TenantSettings;
  isActive: boolean;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}
