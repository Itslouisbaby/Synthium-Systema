/**
 * Tenant path-scoping utilities
 *
 * These helpers preserve the useful filesystem scoping behavior from the older
 * tenant modules, without making them the primary tenant API.
 */

export interface TenantPathWorkspace {
  tenantId: string;
  basePath: string;
  artifactsPath: string;
  memoryPath: string;
  configPath: string;
  logsPath: string;
  getPath(resource: string): string;
}

export function createTenantPathWorkspace(
  tenantId: string,
  basePath: string = './workspace'
): TenantPathWorkspace {
  const tenantPrefix = `${basePath}/tenants/${tenantId}`;

  const workspace: TenantPathWorkspace = {
    tenantId,
    basePath,
    artifactsPath: `${tenantPrefix}/artifacts`,
    memoryPath: `${tenantPrefix}/memory`,
    configPath: `${tenantPrefix}/config`,
    logsPath: `${tenantPrefix}/logs`,
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
    },
  };

  return workspace;
}

export function createScopedPath(
  tenantId: string,
  resource: string,
  basePath?: string
): string {
  const workspace = createTenantPathWorkspace(tenantId, basePath);
  return workspace.getPath(resource);
}

export function isPathInScope(path: string, workspace: TenantPathWorkspace): boolean {
  const normalizedPath = path.replace(/\\/g, '/');

  return (
    normalizedPath.startsWith(workspace.basePath) &&
    normalizedPath.includes(`/tenants/${workspace.tenantId}/`)
  );
}
