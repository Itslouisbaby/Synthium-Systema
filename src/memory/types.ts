/**
 * Memory Types - Milestone 4 (with COO Amendments)
 * Local memory storage contracts
 */
import type { UUID, TimestampMs, SessionKey } from '../types.js';

/**
 * Privacy level for memory entries
 * Amendment: Default to "private" for user-generated
 * No filtering in recall yet (M5)
 */
export type PrivacyLevel = 'public' | 'private';

/**
 * A single memory entry
 */
export interface MemoryEntry {
  readonly id: UUID;
  readonly timestampMs: TimestampMs;
  readonly type: 'observation';
  readonly content: string;
  readonly keywords: string[];
  readonly speaker: 'user' | 'system';
  /** Amendment: Store privacy level, default "private" */
  readonly privacyLevel: PrivacyLevel;
}

/**
 * Flash memory file structure
 */
export interface FlashMemoryFile {
  readonly entries: MemoryEntry[];
  readonly updatedAtMs: TimestampMs;
}

/**
 * Warm memory file structure (weekly compressed)
 */
export interface WarmMemoryFile {
  readonly weekKey: string; // Format: "YYYY-WW" (ISO week)
  readonly entries: MemoryEntry[];
  readonly updatedAtMs: TimestampMs;
}

/**
 * Keyword -> entry IDs index
 */
export interface MemoryIndex {
  readonly keywords: Record<string, UUID[]>;
  readonly updatedAtMs: TimestampMs;
}

/**
 * Context bundle passed to planner
 */
export interface ContextBundle {
  readonly flash: MemoryEntry[];
  readonly warmHits: MemoryEntry[];
  readonly recalledAtMs: TimestampMs;
}

/**
 * Memory system configuration
 * Amendment: maxFlashEntries capped at 2000
 */
export interface MemoryConfig {
  readonly baseDir: string;
  readonly flashLimit: number;
  readonly warmLimit: number;
  readonly flashCutoffMs: number;
  /** Amendment: Max flash entries before FIFO eviction (default: 2000) */
  readonly maxFlashEntries?: number;
}

/**
 * Default memory configuration
 * Amendment: maxFlashEntries = 2000
 */
export const DefaultMemoryConfig: MemoryConfig = {
  baseDir: '.synth/memory',
  flashLimit: 100,
  warmLimit: 50,
  flashCutoffMs: 48 * 60 * 60 * 1000, // 48 hours
  maxFlashEntries: 2000, // Amendment: Cap flash storage
};

/**
 * Amendment: Built-in stopwords (~25 common words)
 * No external dependencies
 */
export const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
  'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
  'how', 'man', 'men', 'too', 'way', 'who'
]);
