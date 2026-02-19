// Operator, Tenant, Role, Permission types

export type OperatorId = string & { __brand: 'OperatorId' };
export type TenantId = string & { __brand: 'TenantId' };
export type RoleId = string & { __brand: 'RoleId' };
export type PermissionId = string & { __brand: 'PermissionId' };

export type ResourceAction = 'create' | 'read' | 'update' | 'delete' | 'execute' | 'admin';

export interface Permission {
  id: PermissionId;
  resource: string;
  action: ResourceAction;
  conditions?: Record<string, unknown>;
}

export interface Role {
  id: RoleId;
  name: string;
  permissions: PermissionId[];
  tenantId?: TenantId; // undefined for global roles
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

export interface Tenant {
  id: TenantId;
  name: string;
  slug: string;
  ownerId: OperatorId;
  settings: TenantSettings;
  isActive: boolean;
  createdAt: Date;
}

export interface TenantSettings {
  maxUsers: number;
  maxWorkspaces: number;
  allowedFeatures: string[];
  dataRetentionDays: number;
}
