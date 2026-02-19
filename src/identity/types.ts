/**
 * Identity Types Module
 * 
 * Core interfaces for the identity and access management system.
 */

/**
 * Represents a system operator with administrative privileges
 */
export interface Operator {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

/**
 * Represents a tenant in the multi-tenant system
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string; // URL-friendly identifier
  createdAt: Date;
  isActive: boolean;
  metadata?: Record<string, any>;
}

/**
 * Represents a role in the system
 */
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystemRole: boolean;
}

/**
 * Represents a permission in the system
 */
export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string; // What resource this permission applies to
  action: string;   // What action can be performed (e.g., read, write, delete)
}