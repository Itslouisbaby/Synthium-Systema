/**
 * Tenant Module Public API
 *
 * Canonical API exports:
 * - TenantWorkspace (workspace entities)
 * - TenantIsolationGuard (runtime enforcement)
 */

export * from './TenantWorkspace.js';
export * from './TenantIsolationGuard.js';

// Legacy/utility modules (deprecated): import directly if needed.
// - ./workspace.js (path-scoped workspace paths)
// - ./isolation.js (static checks + path scoping helpers)
// - ./types.js (path-scoped tenant context types)
