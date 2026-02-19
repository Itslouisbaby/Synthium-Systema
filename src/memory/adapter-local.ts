/**
 * Local Memory Adapter - Milestone 4 (with COO Amendments)
 * Adapter layer between orchestrator and local storage
 */
import { randomUUID } from 'node:crypto';
import { LocalMemoryStore } from './local-store.js';
import type { MemoryEntry, ContextBundle, MemoryConfig } from './types.js';
import { DefaultMemoryConfig } from './types.js';
import type { Observation } from '../types.js';

/**
 * LocalMemoryAdapter - High-level memory interface for the loop
 * Amendment: privacyLevel defaults to "private" for user observations
 */
export class LocalMemoryAdapter {
  private store: LocalMemoryStore;
  private config: MemoryConfig;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = { ...DefaultMemoryConfig, ...config };
    this.store = new LocalMemoryStore(this.config);
  }

  /**
   * Convert observation to memory entry and store it
   * Amendment: privacyLevel defaults to "private" for user-generated
   */
  async writeObservation(sessionKey: string, observation: Observation): Promise<void> {
    const keywords = this.store.generateKeywords(observation.content);
    
    const entry: MemoryEntry = {
      id: observation.id,
      timestampMs: observation.observedAtMs,
      type: 'observation',
      content: observation.content,
      keywords,
      speaker: observation.source === 'user' ? 'user' : 'system',
      /** Amendment: Default to "private" for user-generated content */
      privacyLevel: observation.source === 'user' ? 'private' : 'public',
    };

    await this.store.writeEntry(sessionKey, entry);
  }

  /**
   * Recall recent flash entries
   */
  async recallFlash(
    sessionKey: string,
    limit?: number,
    cutoffMs?: number
  ): Promise<MemoryEntry[]> {
    const cutoff = cutoffMs ?? (Date.now() - this.config.flashCutoffMs);
    return this.store.readFlash(sessionKey, cutoff, limit ?? this.config.flashLimit);
  }

  /**
   * Recall warm hits matching keywords
   */
  async recallWarmHits(
    sessionKey: string,
    keywords: string[],
    limit?: number
  ): Promise<MemoryEntry[]> {
    const weekKey = this.store.getCurrentWeekKey();
    const warmEntries = await this.store.readWarmForWeek(sessionKey, weekKey);
    
    // Filter by keyword intersection
    const searchKeywords = keywords.map(k => k.toLowerCase());
    const hits = warmEntries.filter(entry => 
      entry.keywords.some(k => searchKeywords.includes(k.toLowerCase()))
    );

    // Deduplicate by ID, sort by timestamp desc, limit
    const seen = new Set<string>();
    const unique = hits
      .filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      })
      .sort((a, b) => b.timestampMs - a.timestampMs)
      .slice(0, limit ?? this.config.warmLimit);

    return unique;
  }

  /**
   * Build context bundle for planner
   */
  async buildContextBundle(
    sessionKey: string,
    keywords: string[]
  ): Promise<ContextBundle> {
    const [flash, warmHits] = await Promise.all([
      this.recallFlash(sessionKey),
      this.recallWarmHits(sessionKey, keywords),
    ]);

    return {
      flash,
      warmHits,
      recalledAtMs: Date.now(),
    };
  }
}
