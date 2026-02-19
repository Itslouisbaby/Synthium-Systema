/**
 * Identity Module Public API
 *
 * Canonical API exports the instance-based PermissionChecker for auditability + governance.
 */

export * from './types.js';
export * from './roles.js';
export * from './PermissionChecker.js';

// Legacy static helpers (deprecated): import directly from ./permissions.js if needed.
