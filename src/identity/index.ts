/**
 * Identity Module Public API
 */

export * from './types.js';
export * from './roles.js';
export * from './permissions.js';
// NOTE: We intentionally do not export ./PermissionChecker.js here.
// The canonical PermissionChecker API (static helpers) lives in permissions.ts and is what tests + callers import.
