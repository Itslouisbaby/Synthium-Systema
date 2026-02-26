/**
 * Versioned Storage System
 * 
 * File-based versioning with symlinks for "current" version.
 * Supports rollback, history, and atomic updates.
 */

import { mkdir, writeFile, readFile, readdir, symlink, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { atomicFile } from '../utils/atomic-file.js';

/** Version metadata */
export interface VersionMetadata {
  version: string;
  previousVersion?: string;
  createdAt: number;
  deployedAt?: number;
  rolledBackAt?: number;
  rolledBackTo?: string;
  reason?: string;
  author?: string;
}

/** Versioned resource */
export interface VersionedResource<T> {
  id: string;
  currentVersion: string;
  versions: VersionMetadata[];
  data: T;
}

/** Versioned storage configuration */
export interface VersionedStorageConfig {
  baseDir: string;
  maxVersions: number;
}

/**
 * Versioned Storage
 * 
 * Stores resources with full version history:
 * .synth/versions/
 * └── resource-id/
 *     ├── 1.0.0/
 *     │   └── data.json
 *     ├── 1.1.0/
 *     │   └── data.json
 *     ├── 1.2.0/
 *     │   └── data.json
 *     ├── current -> 1.2.0  (symlink)
 *     └── versions.json      (metadata)
 */
export class VersionedStorage<T> {
  private config: Required<VersionedStorageConfig>;

  constructor(config: VersionedStorageConfig) {
    this.config = {
      baseDir: config.baseDir,
      maxVersions: config.maxVersions ?? 10,
    };
  }

  /**
   * Save a new version
   */
  async save(id: string, data: T, options?: {
    version?: string;
    reason?: string;
    author?: string;
  }): Promise<string> {
    const resourceDir = join(this.config.baseDir, id);
    await mkdir(resourceDir, { recursive: true });

    // Get current version info
    const versions = await this.getVersions(id);
    const currentVersion = versions.length > 0 ? versions[versions.length - 1].version : null;

    // Generate new version
    let newVersion: string;
    if (options?.version) {
      newVersion = options.version;
    } else if (currentVersion) {
      // Auto-increment patch version
      const parts = currentVersion.split('.').map(Number);
      parts[2] = (parts[2] || 0) + 1;
      newVersion = parts.join('.');
    } else {
      newVersion = '1.0.0';
    }

    // Create version directory
    const versionDir = join(resourceDir, newVersion);
    await mkdir(versionDir, { recursive: true });

    // Save data
    const dataPath = join(versionDir, 'data.json');
    await atomicFile.write(dataPath, data, { pretty: true });

    // Create metadata
    const metadata: VersionMetadata = {
      version: newVersion,
      previousVersion: currentVersion ?? undefined,
      createdAt: Date.now(),
      deployedAt: Date.now(),
      reason: options?.reason,
      author: options?.author,
    };

    // Update versions list
    versions.push(metadata);

    // Trim old versions
    while (versions.length > this.config.maxVersions) {
      const old = versions.shift();
      if (old) {
        // Don't delete, just remove from metadata
        // Old versions are kept for audit trail
      }
    }

    // Save versions metadata
    await atomicFile.write(
      join(resourceDir, 'versions.json'),
      versions,
      { pretty: true }
    );

    // Update symlink to current
    const currentLink = join(resourceDir, 'current');
    try {
      await unlink(currentLink);
    } catch {
      // Link doesn't exist
    }
    await symlink(versionDir, currentLink, 'dir');

    return newVersion;
  }

  /**
   * Load current version
   */
  async load(id: string): Promise<T | null> {
    const resourceDir = join(this.config.baseDir, id);
    const currentLink = join(resourceDir, 'current');

    try {
      const linkStat = await stat(currentLink);
      if (!linkStat.isSymbolicLink()) {
        return null;
      }

      const dataPath = join(currentLink, 'data.json');
      return await atomicFile.read<T>(dataPath);
    } catch {
      return null;
    }
  }

  /**
   * Load specific version
   */
  async loadVersion(id: string, version: string): Promise<T | null> {
    const dataPath = join(this.config.baseDir, id, version, 'data.json');
    try {
      return await atomicFile.read<T>(dataPath);
    } catch {
      return null;
    }
  }

  /**
   * Rollback to previous version
   */
  async rollback(id: string, options?: {
    toVersion?: string;
    reason?: string;
  }): Promise<string | null> {
    const resourceDir = join(this.config.baseDir, id);
    const versions = await this.getVersions(id);

    if (versions.length < 2) {
      return null; // No previous version
    }

    const currentVersion = versions[versions.length - 1];
    const targetVersion = options?.toVersion ?? currentVersion.previousVersion;

    if (!targetVersion) {
      return null;
    }

    // Verify target version exists
    const targetData = await this.loadVersion(id, targetVersion);
    if (!targetData) {
      return null;
    }

    // Update symlink
    const currentLink = join(resourceDir, 'current');
    try {
      await unlink(currentLink);
    } catch {
      // Link doesn't exist
    }
    await symlink(join(resourceDir, targetVersion), currentLink, 'dir');

    // Update metadata
    const updatedVersions = versions.map(v => {
      if (v.version === currentVersion.version) {
        return {
          ...v,
          rolledBackAt: Date.now(),
          rolledBackTo: targetVersion,
        };
      }
      return v;
    });

    await atomicFile.write(
      join(resourceDir, 'versions.json'),
      updatedVersions,
      { pretty: true }
    );

    return targetVersion;
  }

  /**
   * Get version history
   */
  async getVersions(id: string): Promise<VersionMetadata[]> {
    const versionsPath = join(this.config.baseDir, id, 'versions.json');
    try {
      return await atomicFile.read<VersionMetadata[]>(versionsPath, []);
    } catch {
      return [];
    }
  }

  /**
   * List all resources
   */
  async listResources(): Promise<string[]> {
    try {
      const entries = await readdir(this.config.baseDir);
      const resources: string[] = [];

      for (const entry of entries) {
        const fileStat = await stat(join(this.config.baseDir, entry));
        if (fileStat.isDirectory()) {
          resources.push(entry);
        }
      }

      return resources;
    } catch {
      return [];
    }
  }

  /**
   * Delete a resource (all versions)
   */
  async delete(id: string): Promise<boolean> {
    const resourceDir = join(this.config.baseDir, id);
    try {
      const fs = await import('node:fs');
      fs.rmSync(resourceDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current version string
   */
  async getCurrentVersion(id: string): Promise<string | null> {
    const versions = await this.getVersions(id);
    if (versions.length === 0) return null;

    // Find the version that's currently deployed (not rolled back)
    for (let i = versions.length - 1; i >= 0; i--) {
      if (!versions[i].rolledBackAt) {
        return versions[i].version;
      }
    }

    return null;
  }

  /**
   * Compare two versions
   */
  async compareVersions(id: string, v1: string, v2: string): Promise<{
    v1: T | null;
    v2: T | null;
    diff: unknown;
  }> {
    const data1 = await this.loadVersion(id, v1);
    const data2 = await this.loadVersion(id, v2);

    // Simple diff (could be more sophisticated)
    const diff = {
      added: {},
      removed: {},
      changed: {},
    };

    return { v1: data1, v2: data2, diff };
  }
}
