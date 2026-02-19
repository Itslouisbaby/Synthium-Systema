/**
 * Tenant Types Module
 * 
 * Core interfaces for tenant management and isolation.
 */

import { Tenant } from '../identity/types';

/**
 * Represents a tenant workspace with scoped paths
 */
export interface TenantWorkspace {
  tenantId: string;
  basePath: string;
  artifactsPath: string;
  memoryPath: string;
  configPath: string;
  logsPath: string;
  
  /**
   * Get the scoped path for a specific resource type
   */
  getPath(resource: string): string;
}

/**
 * Represents a tenant context for request processing
 */
export interface TenantContext {
  tenant: Tenant;
  workspace: TenantWorkspace;
  isActive: boolean;
  
  /**
   * Check if the context is valid and active
   */
  isValid(): boolean;
}