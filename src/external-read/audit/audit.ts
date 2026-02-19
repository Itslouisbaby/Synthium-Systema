/**
 * M11 Task 3: Audit Logging
 * 
 * JSONL logs with SHA-256 integrity hashing and log rotation.
 */

import { createHash } from 'node:crypto';
import { appendFile, rename, stat, unlink, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Unique request ID */
  requestId: string;
  /** Operation type */
  operation: 'fetch' | 'policy_check' | 'error' | string;
  /** Target URL */
  url?: string;
  /** Domain extracted from URL */
  domain?: string;
  /** Success/failure status */
  success: boolean;
  /** HTTP status code (if applicable) */
  statusCode?: number;
  /** Response size in bytes */
  responseSize?: number;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Policy decision details */
  policyResult?: {
    allowed: boolean;
    reason?: string;
  };
  /** Error details */
  error?: {
    code: string;
    message: string;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** SHA-256 hash of this log entry for integrity */
  integrityHash?: string;
}

/**
 * Audit logger configuration
 */
export interface AuditConfig {
  /** Log file path */
  logPath: string;
  /** Maximum log file size in bytes before rotation (default: 10MB) */
  maxFileSize: number;
  /** Number of rotated files to keep (default: 5) */
  maxFiles: number;
  /** Enable integrity hashing (default: true) */
  enableIntegrity: boolean;
  /** Enable console output (default: false) */
  consoleOutput: boolean;
}

/**
 * Default audit configuration
 */
const DEFAULT_CONFIG: AuditConfig = {
  logPath: './logs/external-read-audit.jsonl',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  enableIntegrity: true,
  consoleOutput: false,
};

/**
 * Audit Logger for external read operations
 */
export class AuditLogger {
  private config: AuditConfig;
  private initialized: boolean = false;

  constructor(config: Partial<AuditConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the logger
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure log directory exists
    const logDir = dirname(this.config.logPath);
    try {
      await access(logDir);
    } catch {
      // Directory doesn't exist - we'll try to create it when writing
    }

    this.initialized = true;
  }

  /**
   * Calculate SHA-256 hash of log entry
   */
  private calculateHash(entry: Omit<AuditLogEntry, 'integrityHash' | 'timestamp'>): string {
    // Sort keys for consistent hashing
    const sortedKeys = Object.keys(entry).sort() as Array<keyof typeof entry>;
    const sortedEntry: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sortedEntry[key] = entry[key];
    }
    const data = JSON.stringify(sortedEntry);
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Write a log entry
   */
  async log(entry: Omit<AuditLogEntry, 'timestamp' | 'integrityHash'>): Promise<void> {
    await this.initialize();

    // Auto-extract domain from URL if not provided
    const entryWithDomain = { ...entry } as AuditLogEntry & { domain?: string };
    
    if (entryWithDomain.url && !entryWithDomain.domain) {
      try {
        entryWithDomain.domain = new URL(entryWithDomain.url).hostname;
      } catch {
        // Invalid URL, ignore
      }
    }

    // Calculate integrity hash BEFORE adding timestamp (for consistency)
    if (this.config.enableIntegrity) {
      entryWithDomain.integrityHash = this.calculateHash(entryWithDomain as Omit<AuditLogEntry, 'integrityHash' | 'timestamp'>);
    }

    // Add timestamp
    entryWithDomain.timestamp = new Date().toISOString();

    // Check if rotation is needed
    await this.checkRotation();

    // Append to log file
    const line = JSON.stringify(entryWithDomain) + '\n';
    await appendFile(this.config.logPath, line, 'utf-8');

    // Console output if enabled
    if (this.config.consoleOutput) {
      console.log('[AUDIT]', JSON.stringify(entryWithDomain, null, 2));
    }
  }

  /**
   * Log a fetch operation
   */
  async logFetch(params: {
    requestId: string;
    url: string;
    success: boolean;
    statusCode?: number;
    responseSize?: number;
    durationMs?: number;
    error?: { code: string; message: string };
  }): Promise<void> {
    const url = new URL(params.url);
    await this.log({
      operation: 'fetch',
      requestId: params.requestId,
      url: params.url,
      domain: url.hostname,
      success: params.success,
      statusCode: params.statusCode,
      responseSize: params.responseSize,
      durationMs: params.durationMs,
      error: params.error,
    });
  }

  /**
   * Log a policy check
   */
  async logPolicyCheck(params: {
    requestId: string;
    url: string;
    allowed: boolean;
    reason?: string;
  }): Promise<void> {
    const url = new URL(params.url);
    await this.log({
      operation: 'policy_check',
      requestId: params.requestId,
      url: params.url,
      domain: url.hostname,
      success: params.allowed,
      policyResult: {
        allowed: params.allowed,
        reason: params.reason,
      },
    });
  }

  /**
   * Log an error
   */
  async logError(params: {
    requestId: string;
    url?: string;
    operation: string;
    code: string;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.log({
      operation: params.operation,
      requestId: params.requestId,
      url: params.url,
      domain: params.url ? new URL(params.url).hostname : undefined,
      success: false,
      error: {
        code: params.code,
        message: params.message,
      },
      metadata: params.metadata,
    });
  }

  /**
   * Check if log rotation is needed and perform rotation
   */
  private async checkRotation(): Promise<void> {
    try {
      const stats = await stat(this.config.logPath);
      
      if (stats.size >= this.config.maxFileSize) {
        await this.rotate();
      }
    } catch {
      // File doesn't exist yet, no rotation needed
    }
  }

  /**
   * Perform log rotation
   * Moves current log to .1, .2, etc. and removes old logs
   */
  private async rotate(): Promise<void> {
    const basePath = this.config.logPath;

    // Remove oldest log file if it exists
    const oldestPath = `${basePath}.${this.config.maxFiles}`;
    try {
      await unlink(oldestPath);
    } catch {
      // File doesn't exist, ignore
    }

    // Shift existing log files
    for (let i = this.config.maxFiles - 1; i >= 1; i--) {
      const oldPath = `${basePath}.${i}`;
      const newPath = `${basePath}.${i + 1}`;
      
      try {
        await rename(oldPath, newPath);
      } catch {
        // File doesn't exist, ignore
      }
    }

    // Move current log to .1
    try {
      await rename(basePath, `${basePath}.1`);
    } catch {
      // File doesn't exist, ignore
    }
  }

  /**
   * Force immediate log rotation
   */
  async forceRotation(): Promise<void> {
    await this.rotate();
  }

  /**
   * Get current log file stats
   */
  async getStats(): Promise<{
    currentSize: number;
    rotatedFiles: number;
  }> {
    let currentSize = 0;
    try {
      const stats = await stat(this.config.logPath);
      currentSize = stats.size;
    } catch {
      // File doesn't exist
    }

    let rotatedFiles = 0;
    for (let i = 1; i <= this.config.maxFiles; i++) {
      try {
        await stat(`${this.config.logPath}.${i}`);
        rotatedFiles++;
      } catch {
        break;
      }
    }

    return { currentSize, rotatedFiles };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AuditConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<AuditConfig> {
    return Object.freeze({ ...this.config });
  }
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

/**
 * Verify integrity of a log entry
 */
export function verifyLogIntegrity(entry: AuditLogEntry): boolean {
  if (!entry.integrityHash) {
    return false; // No hash to verify
  }

  const { integrityHash, timestamp, ...data } = entry;
  // Sort keys for consistent hashing
  const sortedKeys = Object.keys(data).sort() as Array<keyof typeof data>;
  const sortedEntry: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    sortedEntry[key] = data[key];
  }
  const calculated = createHash('sha256')
    .update(JSON.stringify(sortedEntry))
    .digest('hex');

  return calculated === integrityHash;
}

/**
 * Parse JSONL log file
 */
export async function* parseLogFile(
  logPath: string
): AsyncGenerator<AuditLogEntry> {
  const { createReadStream } = await import('node:fs');
  const { createInterface } = await import('node:readline');

  const stream = createReadStream(logPath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        yield JSON.parse(line) as AuditLogEntry;
      } catch {
        // Skip malformed lines
      }
    }
  }
}

/**
 * Create default logger instance
 */
export function createAuditLogger(
  config?: Partial<AuditConfig>
): AuditLogger {
  return new AuditLogger(config);
}
