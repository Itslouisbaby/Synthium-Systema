/**
 * M11 Task 3: Audit Logging
 * 
 * JSONL logs with SHA-256 integrity hashing and log rotation
 */

export {
  AuditLogger,
  generateRequestId,
  verifyLogIntegrity,
  parseLogFile,
  createAuditLogger,
} from './audit.js';

export type {
  AuditLogEntry,
  AuditConfig,
} from './audit.js';
