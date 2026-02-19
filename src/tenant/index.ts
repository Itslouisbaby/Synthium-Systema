/**
 * Tenant Module Public API
 *
 * Canonical API exports:
 * - TenantWorkspace (workspace entities)
 * - TenantIsolationGuard (runtime enforcement)
 *
 * Supplemental utilities:
 * - pathScope helpers for tenant-scoped filesystem paths
 */

export * from './TenantWorkspace.js';
export * from './TenantIsolationGuard.js';
export * from './pathScope.js';
