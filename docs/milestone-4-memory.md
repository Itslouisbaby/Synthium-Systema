# Milestone 4: Memory Storage Implementation

## Overview

Milestone 4 implements the core memory storage layer for Synthium-Systema, providing flash and cold store tiers with keyword search capabilities.

## What Was Implemented

### 1. Type Definitions (`src/memory/types.ts`)

Core memory types:
- `MemoryConfig` - Configuration for memory store (base path)
- `MemoryEntry` - Single memory entry with id, content, timestamp, keywords, weekKey
- `MemoryIndex` - Keyword index for fast lookups
- `FlashStoreConfig` - Flash memory configuration
- `RecallOptions` - Options for recalling memory entries
- `WarmSearchOptions` - Options for searching warm storage
- `ContextBundle` - Contextual memory bundle for sessions
- Supporting types: `SessionKey`, `WeekKey`, `MemoryTier`

### 2. LocalMemoryStore (`src/memory/local-store.ts`)

Core storage implementation with:

#### Constructor
```typescript
constructor(config: MemoryConfig = {})
```
- Takes optional MemoryConfig
- Defaults base path to `~/.synth/memory`

#### Private Methods
- `ensureDir(path)` - Creates directories recursively
- `getSessionPath(sessionKey)` - Returns base path for session
- `getFlashPath(sessionKey)` - Returns path to `hot/flash/current.json`
- `getWarmPath(sessionKey, weekKey)` - Returns path to `hot/warm/week-<YYYY-WW>.json`
- `getIndexPath(sessionKey)` - Returns path to `index.json`

#### Public Methods
- `async writeEntry(sessionKey, entry)` - Writes entry to flash + warm + updates index
- `async readFlash(sessionKey, cutoffMs?)` - Returns MemoryEntry[] from flash, filtered by cutoff
- `async readWarmForWeek(sessionKey, weekKey)` - Returns MemoryEntry[] for specific week
- `async getWeekKeys(sessionKey)` - Returns string[] of available week keys
- `async searchKeywords(sessionKey, keywords)` - Returns MemoryEntry[] matching ANY keyword

#### Helper Methods
- `generateKeywords(content)` - Extracts keywords (lowercase, split non-letters, unique, top 20)
- `getCurrentWeekKey()` - Returns "YYYY-WW" format using ISO week numbering

### 3. Storage Layout

```
.synth/memory/sessions/<sessionKey>/
  hot/flash/current.json      - Current flash memory (latest entries)
  hot/warm/week-YYYY-WW.json  - Warm storage by week
  index.json                  - Keyword index for all entries
```

All file writes are atomic (write to temp, then rename).

### 4. Key Features

**Atomic Writes**: Every file write uses a temporary file followed by a rename to ensure atomicity and prevent corruption.

**Two-Tier Storage**:
- **Flash**: Recent entries in `current.json` for fast access
- **Warm**: Weekly aggregated storage in `week-YYYY-WW.json` files

**Keyword Search**: Full keyword index enables fast search across all memory entries:
- Index maps entry IDs to their metadata (timestamp, weekKey, keywords)
- Search finds entries matching ANY of the provided keywords
- Efficiently loads warm files only for weeks containing matching entries

**ISO Week Support**: Week keys use ISO 8601 week numbering (`YYYY-WW` format) for consistent grouping across years.

### 5. Files Created/Modified

**Created**:
- `src/memory/local-store.ts` (290 lines)
- `src/memory/types.ts` (94 lines)
- `src/memory/index.ts` (9 lines)
- `docs/milestone-4-memory.md` (this file)

**Modified**:
- `src/index.ts` - Added memory exports

## Usage Example

```typescript
import { LocalMemoryStore } from '@synth/neuronwaves';

// Create store with custom path (optional)
const store = new LocalMemoryStore({
  basePath: './my-memory',
});

// Write an entry
const entry: MemoryEntry = {
  id: 'entry-1',
  sessionKey: 'session-abc',
  content: 'The user asked about AI safety',
  timestamp: Date.now(),
  keywords: store.generateKeywords('The user asked about AI safety'),
  weekKey: store.getCurrentWeekKey(),
};
await store.writeEntry('session-abc', entry);

// Read recent flash memories
const recent = await store.readFlash('session-abc');

// Search by keywords
const results = await store.searchKeywords('session-abc', ['ai', 'safety']);

// Get available weeks
const weeks = await store.getWeekKeys('session-abc');

// Read specific week
const weekEntries = await store.readWarmForWeek('session-abc', '2024-42');
```

## Next Steps (Future Milestones)

Potential enhancements for Memory module:
1. Memory pruning/compaction strategies
2. Memory importance scoring
3. Context extraction and summarization
4. Vector embeddings for semantic search
5. Cross-session memory sharing
6. Memory adapter interface for backends (Redis, PostgreSQL, etc.)

## Testing Considerations

Tests should verify:
- ✅ Atomic file writes (no corruption even with crashes)
- ✅ Flash/warm storage separation
- ✅ Keyword extraction and search accuracy
- ✅ ISO week key generation edge cases (year boundaries)
- ✅ Index updates on every writeEntry
- ✅ Efficient warm file loading during search
- ✅ Multiple concurrent writes don't cause corruption
