/**
 * Tenant Workspace Module
 * 
 * Manages tenant-scoped paths for artifact and memory directories.
 */

import { TenantWorkspace } from './types';

/**
 * TenantWorkspace implementation with scoped paths
 */
export class TenantWorkspaceImpl implements TenantWorkspace {
  tenantId: string;
  basePath: string;
  artifactsPath: string;
  memoryPath: string;
  configPath: string;
  logsPath: string;

  constructor(tenantId: string, basePath: string = './workspace') {
    this.tenantId = tenantId;
    this.basePath = basePath;
    
    // Create tenant-scoped paths
    const tenantPrefix = `${basePath}/tenants/${tenantId}`;
    this.artifactsPath = `${tenantPrefix}/artifacts`;
    this.memoryPath = `${tenantPrefix}/memory`;
    this.configPath = `${tenantPrefix}/config`;
    this.logsPath = `${tenantPrefix}/logs`;
  }

  /**
   * Get the scoped path for a specific resource type
   */
  getPath(resource: string): string {
    switch (resource) {
      case 'artifacts':
        return this.artifactsPath;
      case 'memory':
        return this.memoryPath;
      case 'config':
        return this.configPath;
      case 'logs':
        return this.logsPath;
      case 'base':
        return this.basePath;
      default:
        return `${this.basePath}/tenants/${this.tenantId}/${resource}`;
    }
  }
}

/**
 * Factory function to create a tenant workspace
 */
export function createTenantWorkspace(tenantId: string, basePath?: string): TenantWorkspace {
  return new TenantWorkspaceImpl(tenantId, basePath);
}