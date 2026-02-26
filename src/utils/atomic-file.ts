/**
 * Atomic File Operations
 * 
 * Prevents corruption from concurrent writes using:
 * - Write-to-temp-then-rename pattern
 * - File locking (advisory)
 * - Retry with exponential backoff
 */

import { writeFile, readFile, rename, unlink, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';

/** Atomic file configuration */
export interface AtomicFileConfig {
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly lockTimeoutMs: number;
}

/** File lock entry */
interface FileLock {
  path: string;
  acquiredAt: number;
  owner: string;
}

/**
 * Atomic File Operations
 * 
 * Thread-safe file I/O for concurrent environments
 */
export class AtomicFile {
  private config: Required<AtomicFileConfig>;
  private locks: Map<string, FileLock> = new Map();
  private lockId: string;

  constructor(config: Partial<AtomicFileConfig> = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 5,
      retryDelayMs: config.retryDelayMs ?? 100,
      lockTimeoutMs: config.lockTimeoutMs ?? 5000,
    };
    this.lockId = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Write file atomically
   * 
   * 1. Write to temp file
   * 2. Sync to disk
   * 3. Atomic rename
   */
  async write<T>(path: string, data: T, options?: { pretty?: boolean }): Promise<void> {
    await this.withLock(path, async () => {
      const content = typeof data === 'string' 
        ? data 
        : JSON.stringify(data, null, options?.pretty ? 2 : undefined);

      // Ensure directory exists
      await mkdir(dirname(path), { recursive: true });

      // Write to temp file
      const tmpPath = `${path}.tmp.${Date.now()}.${this.lockId}`;
      await writeFile(tmpPath, content, 'utf-8');

      // Atomic rename
      try {
        await rename(tmpPath, path);
      } catch (error) {
        // Clean up temp file on failure
        try { await unlink(tmpPath); } catch { /* ignore */ }
        throw error;
      }
    });
  }

  /**
   * Read file with retry
   */
  async read<T>(path: string, defaultValue?: T): Promise<T> {
    return this.withRetry(async () => {
      try {
        const content = await readFile(path, 'utf-8');
        return JSON.parse(content) as T;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && defaultValue !== undefined) {
          return defaultValue;
        }
        throw error;
      }
    });
  }

  /**
   * Read file as string
   */
  async readText(path: string, defaultValue?: string): Promise<string> {
    return this.withRetry(async () => {
      try {
        return await readFile(path, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && defaultValue !== undefined) {
          return defaultValue;
        }
        throw error;
      }
    });
  }

  /**
   * Check if file exists
   */
  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file atomically
   */
  async delete(path: string): Promise<void> {
    await this.withLock(path, async () => {
      try {
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    });
  }

  /**
   * Update file (read → modify → write atomically)
   */
  async update<T>(
    path: string,
    updater: (data: T) => T | Promise<T>,
    defaultValue: T
  ): Promise<T> {
    return this.withLock(path, async () => {
      // Read current value
      let current: T;
      try {
        current = await this.read<T>(path);
      } catch {
        current = defaultValue;
      }

      // Apply update
      const updated = await updater(current);

      // Write atomically
      await this.write(path, updated);

      return updated;
    });
  }

  /**
   * Append to JSONL file (line-delimited JSON)
   */
  async appendJsonL<T>(path: string, entry: T): Promise<void> {
    await this.withLock(path, async () => {
      const line = JSON.stringify(entry) + '\n';
      await mkdir(dirname(path), { recursive: true });
      
      // Use append mode (atomic on most filesystems for single writes)
      const fs = await import('node:fs');
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createWriteStream(path, { flags: 'a' });
        stream.write(line, (err) => {
          if (err) reject(err);
          else stream.end(resolve);
        });
      });
    });
  }

  /**
   * Read JSONL file
   */
  async readJsonL<T>(path: string): Promise<T[]> {
    try {
      const content = await readFile(path, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as T);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Compact JSONL to single JSON (for read-heavy files)
   */
  async compactJsonL<T>(path: string, outputPath?: string): Promise<void> {
    const entries = await this.readJsonL<T>(path);
    await this.write(outputPath ?? path.replace('.jsonl', '.json'), entries);
  }

  /**
   * Acquire advisory lock on file
   */
  private async acquireLock(path: string): Promise<void> {
    const lockPath = `${path}.lock`;
    const startTime = Date.now();

    while (Date.now() - startTime < this.config.lockTimeoutMs) {
      // Check if lock exists and is valid
      const existingLock = this.locks.get(lockPath);
      
      if (!existingLock) {
        // Try to acquire lock
        try {
          await writeFile(lockPath, JSON.stringify({
            owner: this.lockId,
            acquiredAt: Date.now(),
          }), { flag: 'wx' }); // wx = fail if exists

          this.locks.set(lockPath, {
            path: lockPath,
            acquiredAt: Date.now(),
            owner: this.lockId,
          });

          return;
        } catch {
          // Lock exists, retry
        }
      } else if (Date.now() - existingLock.acquiredAt > this.config.lockTimeoutMs) {
        // Stale lock, break it
        try {
          await unlink(lockPath);
          this.locks.delete(lockPath);
        } catch {
          // Someone else might have broken it
        }
      }

      // Wait before retry
      await this.sleep(this.config.retryDelayMs);
    }

    throw new Error(`Failed to acquire lock on ${path} after ${this.config.lockTimeoutMs}ms`);
  }

  /**
   * Release advisory lock
   */
  private async releaseLock(path: string): Promise<void> {
    const lockPath = `${path}.lock`;
    const lock = this.locks.get(lockPath);

    if (lock && lock.owner === this.lockId) {
      try {
        await unlink(lockPath);
      } catch {
        // Lock might have been broken by timeout
      }
      this.locks.delete(lockPath);
    }
  }

  /**
   * Execute function with file lock
   */
  private async withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
    await this.acquireLock(path);
    try {
      return await fn();
    } finally {
      await this.releaseLock(path);
    }
  }

  /**
   * Retry function with exponential backoff
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries - 1) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/** Global atomic file instance */
export const atomicFile = new AtomicFile();
