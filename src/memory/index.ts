/**
 * Memory Module - Milestone 4 (with COO Amendments)
 * Local memory storage without external dependencies
 * 
 * Amendments:
 * - privacyLevel: default "private" for user-generated
 * - maxFlashEntries: capped at 2000
 * - Stopwords: built-in ~25 common words
 * - ISO week: standard ISO-8601 calculation
 */
export { LocalMemoryStore } from './local-store.js';
export { LocalMemoryAdapter } from './adapter-local.js';
export {
  DefaultMemoryConfig,
  STOPWORDS,
  type MemoryEntry,
  type FlashMemoryFile,
  type WarmMemoryFile,
  type MemoryIndex,
  type ContextBundle,
  type MemoryConfig,
  type PrivacyLevel,
} from './types.js';
