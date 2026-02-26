/**
 * Memory Adapter — bridges v2 MicroLoops to v1 LocalMemoryStore.
 * MicroLoops never import LocalMemoryStore directly; they call this adapter.
 */
import { LocalMemoryStore } from '../../memory/local-store.js';
import type { MemoryEntry } from '../../memory/types.js';

export interface MemoryAdapterConfig {
  baseDir: string;
  sessionKey: string;
}

export class MemoryAdapter {
  private readonly store: LocalMemoryStore;
  private readonly sessionKey: string;

  constructor(config: MemoryAdapterConfig) {
    this.store = new LocalMemoryStore({ baseDir: config.baseDir });
    this.sessionKey = config.sessionKey;
  }

  async addFlash(entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<void> {
    await this.store.addFlashEntry(this.sessionKey, entry as MemoryEntry);
  }

  async getFlash(): Promise<MemoryEntry[]> {
    const file = await this.store.loadFlash(this.sessionKey);
    return file?.entries ?? [];
  }

  async searchMemory(query: string, limit = 10): Promise<MemoryEntry[]> {
    const index = await this.store.loadIndex(this.sessionKey);
    if (!index) return [];
    return this.store.search(this.sessionKey, query, limit);
  }
}
