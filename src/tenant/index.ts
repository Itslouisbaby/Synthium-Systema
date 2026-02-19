/**
 * Tenant Module Public API
 */

// Phase5 tenant API
export * from './types.js';
export * from './workspace.js';
export * from './isolation.js';

// Legacy/alternate tenant workspace API (kept for compatibility)
export * from './TenantWorkspace.js';
export * from './TenantIsolationGuard.js';
