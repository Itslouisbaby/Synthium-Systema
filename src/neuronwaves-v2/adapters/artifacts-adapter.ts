/**
 * Artifacts Adapter — bridges v2 MicroLoops to v1 ArtifactStore.
 * MicroLoops never import ArtifactStore directly; they call this adapter.
 */
import { join } from 'node:path';
import { ArtifactStore } from '../../artifacts/store.js';
import type { SessionKey } from '../../types.js';

export interface ArtifactsAdapterConfig {
  baseDir: string;
  sessionKey: SessionKey;
}

export class ArtifactsAdapter {
  private readonly store: ArtifactStore;
  private readonly sessionKey: SessionKey;

  constructor(config: ArtifactsAdapterConfig) {
    this.store = new ArtifactStore({ baseDir: config.baseDir });
    this.sessionKey = config.sessionKey;
  }

  async ensureSession(): Promise<void> {
    await this.store.ensureSessionDir(this.sessionKey);
  }

  getPaths() {
    return this.store.getSessionPaths(this.sessionKey);
  }

  async appendAudit(entry: Record<string, unknown>): Promise<void> {
    const paths = this.store.getSessionPaths(this.sessionKey);
    await this.store.appendAudit(paths, {
      ...entry,
      timestamp: new Date().toISOString(),
    } as any);
  }
}
