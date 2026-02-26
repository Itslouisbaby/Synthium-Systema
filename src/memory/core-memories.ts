/**
 * CoreMemories - Human-like Hierarchical Memory System
 * 
 * Mimics human memory consolidation with progressive compression:
 * - Flash (0-48h): Full detail, always loaded
 * - Warm (2-7d): Compressed summaries, per-week files
 * - Recent (7-48d): Compressed, keyword search
 * - Archive (1-12mo): Essence extraction
 * - Core (1yr+): Permanent hooks
 * 
 * Key features:
 * - Progressive compression (detail fades, hooks remain)
 * - Event-driven retrieval (load only when keywords match)
 * - Cross-session keyword search via global links index
 * - MEMORY.md integration (proposes important memories)
 * - Automatic consolidation via heartbeat
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/** CoreMemories configuration */
export interface CoreMemoriesConfig {
  readonly baseDir: string;
  readonly maxFlashEntries: number;
  readonly maxWarmEntriesPerWeek: number;
  readonly maxRecentEntries: number;
  readonly compressionIntervalMs: number;
  readonly consolidationIntervalMs: number;
  readonly enableMemoryMdIntegration: boolean;
  readonly emotionalThreshold: number;
  readonly enableCrossSessionSearch: boolean;
}

/** Memory entry in Flash layer (0-48h) */
export interface FlashEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly type: 'conversation' | 'observation' | 'decision' | 'milestone' | 'learning';
  readonly content: string;
  readonly speaker: 'user' | 'assistant' | 'system';
  readonly keywords: string[];
  readonly emotionalSalience: number;
  readonly userFlagged: boolean;
  readonly linkedTo: string[];
  readonly sessionKey: string;
  readonly metadata: Record<string, unknown>;
}

/** Memory entry in Warm layer (2-7d) - compressed */
export interface WarmEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly originalId: string;
  readonly summary: string;
  readonly hook: string; // Key phrase for recall
  readonly keyPoints: string[];
  readonly keyQuotes: string[];
  readonly keywords: string[];
  readonly emotionalTone: string;
  readonly linkedTo: string[];
  readonly compressionMethod: 'rule-based' | 'llm-assisted';
  readonly memoryMdProposal?: MemoryMdProposal;
  readonly sessionKey: string;
}

/** Memory entry in Recent layer (7-48d) - further compressed */
export interface RecentEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly originalIds: string[];
  readonly essence: string;
  readonly hook: string;
  readonly keywords: string[];
  accessCount: number;
  lastAccessed: number;
  readonly sessionKey: string;
}

/** Memory entry in Archive layer (1-12mo) - essence only */
export interface ArchiveEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly originalIds: string[];
  readonly essence: string;
  readonly hook: string;
  readonly keywords: string[];
  readonly importanceScore: number;
  readonly sessionKey: string;
}

/** Core memory (1yr+) - permanent hooks */
export interface CoreEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly originalIds: string[];
  readonly hook: string;
  readonly essence: string;
  readonly category: 'identity' | 'values' | 'skills' | 'relationships' | 'knowledge';
  readonly keywords: string[];
  readonly sessionKey: string;
}

/** Proposal for MEMORY.md update */
export interface MemoryMdProposal {
  readonly entryId: string;
  readonly timestamp: number;
  readonly essence: string;
  readonly section: string;
  readonly reason: string;
  readonly keywords: string[];
}

/** Global link reference for cross-session search */
export interface GlobalLinkRef {
  readonly session: string;
  readonly id: string;
  readonly timestamp: number;
  readonly type: string;
  readonly location: string;
  readonly layer: 'flash' | 'warm' | 'recent' | 'archive';
  readonly keywords: string[];
}

/** Search result from CoreMemories */
export interface MemorySearchResult {
  readonly flash: FlashEntry[];
  readonly warm: WarmEntry[];
  readonly recent: RecentEntry[];
  readonly archive: ArchiveEntry[];
  readonly core: CoreEntry[];
  readonly totalFound: number;
}

/** Memory statistics */
export interface CoreMemoriesStats {
  readonly flashCount: number;
  readonly warmCount: number;
  readonly recentCount: number;
  readonly archiveCount: number;
  readonly coreCount: number;
  readonly totalMemories: number;
  readonly pendingMemoryMdProposals: number;
  readonly oldestMemory: number;
  readonly newestMemory: number;
}

/**
 * CoreMemories - Human-like hierarchical memory system
 */
export class CoreMemories {
  private config: Required<CoreMemoriesConfig>;
  private initialized = false;
  private lastCompressionTime = 0;
  private lastConsolidationTime = 0;

  constructor(config: Partial<CoreMemoriesConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/core-memories',
      maxFlashEntries: config.maxFlashEntries ?? 250,
      maxWarmEntriesPerWeek: config.maxWarmEntriesPerWeek ?? 200,
      maxRecentEntries: config.maxRecentEntries ?? 500,
      compressionIntervalMs: config.compressionIntervalMs ?? 6 * 60 * 60 * 1000, // 6 hours
      consolidationIntervalMs: config.consolidationIntervalMs ?? 24 * 60 * 60 * 1000, // 24 hours
      enableMemoryMdIntegration: config.enableMemoryMdIntegration ?? true,
      emotionalThreshold: config.emotionalThreshold ?? 0.8,
      enableCrossSessionSearch: config.enableCrossSessionSearch ?? true,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create directory structure
    await this.ensureDir(this.getFlashDir());
    await this.ensureDir(this.getWarmDir());
    await this.ensureDir(this.getRecentDir());
    await this.ensureDir(this.getArchiveDir());
    await this.ensureDir(this.getCoreDir());
    await this.ensureDir(this.getLinksDir());

    this.initialized = true;
  }

  /**
   * Add a memory to Flash layer (0-48h)
   */
  async addFlashEntry(entry: Omit<FlashEntry, 'id' | 'timestamp'>): Promise<FlashEntry> {
    const fullEntry: FlashEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    const flashPath = join(this.getFlashDir(), 'current.json');
    let flashData: { entries: FlashEntry[] } = { entries: [] };

    try {
      const data = await readFile(flashPath, 'utf-8');
      flashData = JSON.parse(data);
    } catch {
      // File doesn't exist yet
    }

    // Remove entries older than 48 hours
    const cutoff = Date.now() - 48 * 60 * 60 * 1000;
    flashData.entries = flashData.entries.filter(e => e.timestamp > cutoff);

    // Add new entry
    flashData.entries.push(fullEntry);

    // Enforce cap
    if (flashData.entries.length > this.config.maxFlashEntries) {
      flashData.entries = flashData.entries.slice(-this.config.maxFlashEntries);
    }

    await this.writeJsonAtomic(flashPath, flashData);
    await this.updateGlobalLinks(fullEntry, 'flash');

    return fullEntry;
  }

  /**
   * Compress Flash entries to Warm layer
   */
  async compressToWarm(): Promise<number> {
    const flashPath = join(this.getFlashDir(), 'current.json');
    let flashData: { entries: FlashEntry[] } = { entries: [] };

    try {
      const data = await readFile(flashPath, 'utf-8');
      flashData = JSON.parse(data);
    } catch {
      return 0;
    }

    // Find entries older than 2 hours but younger than 48 hours
    const now = Date.now();
    const compressCutoff = now - 2 * 60 * 60 * 1000;
    const removeCutoff = now - 48 * 60 * 60 * 1000;

    const toCompress = flashData.entries.filter(
      e => e.timestamp <= compressCutoff && e.timestamp > removeCutoff
    );

    let compressed = 0;
    for (const entry of toCompress) {
      const warmEntry = await this.compressEntry(entry);
      await this.addWarmEntry(warmEntry);
      compressed++;
    }

    // Remove compressed entries from flash
    flashData.entries = flashData.entries.filter(e => e.timestamp > compressCutoff);
    await this.writeJsonAtomic(flashPath, flashData);

    if (compressed > 0) {
      console.log(`[CoreMemories] Compressed ${compressed} entries to Warm layer`);
    }

    return compressed;
  }

  /**
   * Compress Warm entries to Recent layer
   */
  async compressToRecent(): Promise<number> {
    const warmDir = this.getWarmDir();
    const files = await readdir(warmDir).catch(() => [] as string[]);

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    let compressed = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const warmPath = join(warmDir, file);
      let warmData: { entries: WarmEntry[] } = { entries: [] };

      try {
        const data = await readFile(warmPath, 'utf-8');
        warmData = JSON.parse(data);
      } catch {
        continue;
      }

      // Find entries older than a week
      const toCompress = warmData.entries.filter(e => e.timestamp < weekAgo);

      for (const entry of toCompress) {
        const recentEntry = await this.warmToRecent(entry);
        await this.addRecentEntry(recentEntry);
        compressed++;
      }

      // Remove compressed entries
      warmData.entries = warmData.entries.filter(e => e.timestamp >= weekAgo);
      await this.writeJsonAtomic(warmPath, warmData);
    }

    if (compressed > 0) {
      console.log(`[CoreMemories] Compressed ${compressed} entries to Recent layer`);
    }

    return compressed;
  }

  /**
   * Search memories by keyword across all layers
   */
  async searchByKeyword(keyword: string): Promise<MemorySearchResult> {
    const normalized = keyword.toLowerCase();

    // Search each layer
    const flash = await this.searchFlash(normalized);
    const warm = await this.searchWarm(normalized);
    const recent = await this.searchRecent(normalized);
    const archive = await this.searchArchive(normalized);
    const core = await this.searchCore(normalized);

    // Update access counts for found memories
    for (const entry of [...recent, ...archive]) {
      await this.updateAccessCount(entry.id);
    }

    return {
      flash,
      warm,
      recent,
      archive,
      core,
      totalFound: flash.length + warm.length + recent.length + archive.length + core.length,
    };
  }

  /**
   * Cross-session keyword search using global links
   */
  async searchGlobal(keyword: string): Promise<Array<{
    session: string;
    entry: FlashEntry | WarmEntry | RecentEntry | ArchiveEntry;
    layer: string;
  }>> {
    if (!this.config.enableCrossSessionSearch) {
      return [];
    }

    const normalized = keyword.toLowerCase();
    const linksPath = join(this.getLinksDir(), 'index.json');

    let links: { keywords: Record<string, GlobalLinkRef[]> } = { keywords: {} };
    try {
      const data = await readFile(linksPath, 'utf-8');
      links = JSON.parse(data);
    } catch {
      return [];
    }

    const refs = links.keywords[normalized] ?? [];
    const results: Array<{
      session: string;
      entry: FlashEntry | WarmEntry | RecentEntry | ArchiveEntry;
      layer: string;
    }> = [];

    for (const ref of refs.slice(0, 50)) {
      const entry = await this.loadEntryByRef(ref);
      if (entry) {
        results.push({
          session: ref.session,
          entry,
          layer: ref.layer,
        });
      }
    }

    return results;
  }

  /**
   * Get memories for context loading (Flash + relevant Warm)
   */
  async getContextMemories(sessionKey?: string): Promise<{
    flash: FlashEntry[];
    warm: WarmEntry[];
    totalTokens: number;
  }> {
    const flash = await this.getAllFlash();
    const warm = sessionKey
      ? await this.getWarmForSession(sessionKey)
      : await this.getAllWarm();

    // Estimate tokens (rough approximation)
    const flashTokens = flash.reduce((sum, e) => sum + e.content.length / 4, 0);
    const warmTokens = warm.reduce((sum, e) => sum + e.summary.length / 4, 0);

    return {
      flash,
      warm,
      totalTokens: Math.round(flashTokens + warmTokens),
    };
  }

  /**
   * Get pending MEMORY.md proposals
   */
  async getMemoryMdProposals(): Promise<MemoryMdProposal[]> {
    const proposals: MemoryMdProposal[] = [];
    const warm = await this.getAllWarm();

    for (const entry of warm) {
      if (entry.memoryMdProposal) {
        proposals.push(entry.memoryMdProposal);
      }
    }

    return proposals.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Run maintenance (compression + consolidation)
   */
  async runMaintenance(): Promise<{
    compressed: number;
    consolidated: number;
    decayed: number;
  }> {
    const now = Date.now();
    let compressed = 0;
    let consolidated = 0;
    let decayed = 0;

    // Compress Flash to Warm if due
    if (now - this.lastCompressionTime > this.config.compressionIntervalMs) {
      compressed += await this.compressToWarm();
      compressed += await this.compressToRecent();
      this.lastCompressionTime = now;
    }

    // Consolidate if due
    if (now - this.lastConsolidationTime > this.config.consolidationIntervalMs) {
      consolidated += await this.consolidateRecent();
      decayed += await this.decayUnusedMemories();
      this.lastConsolidationTime = now;
    }

    return { compressed, consolidated, decayed };
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<CoreMemoriesStats> {
    const flash = await this.getAllFlash();
    const warm = await this.getAllWarm();
    const recent = await this.getAllRecent();
    const archive = await this.getAllArchive();
    const core = await this.getAllCore();

    const allTimestamps = [
      ...flash.map(e => e.timestamp),
      ...warm.map(e => e.timestamp),
      ...recent.map(e => e.timestamp),
      ...archive.map(e => e.timestamp),
      ...core.map(e => e.timestamp),
    ];

    return {
      flashCount: flash.length,
      warmCount: warm.length,
      recentCount: recent.length,
      archiveCount: archive.length,
      coreCount: core.length,
      totalMemories: flash.length + warm.length + recent.length + archive.length + core.length,
      pendingMemoryMdProposals: (await this.getMemoryMdProposals()).length,
      oldestMemory: allTimestamps.length > 0 ? Math.min(...allTimestamps) : Date.now(),
      newestMemory: allTimestamps.length > 0 ? Math.max(...allTimestamps) : Date.now(),
    };
  }

  // Private helper methods

  private async addWarmEntry(entry: WarmEntry): Promise<void> {
    const weekNumber = this.getWeekNumber(new Date(entry.timestamp));
    const warmPath = join(this.getWarmDir(), `week-${weekNumber}.json`);

    let warmData: { week: string; entries: WarmEntry[] } = {
      week: `week-${weekNumber}`,
      entries: [],
    };

    try {
      const data = await readFile(warmPath, 'utf-8');
      warmData = JSON.parse(data);
    } catch {
      // File doesn't exist
    }

    warmData.entries.push(entry);

    // Enforce cap
    if (warmData.entries.length > this.config.maxWarmEntriesPerWeek) {
      warmData.entries = warmData.entries.slice(-this.config.maxWarmEntriesPerWeek);
    }

    await this.writeJsonAtomic(warmPath, warmData);
    await this.updateGlobalLinks(entry, 'warm');
  }

  private async addRecentEntry(entry: RecentEntry): Promise<void> {
    const recentPath = join(this.getRecentDir(), 'current.json');
    let recentData: { entries: RecentEntry[] } = { entries: [] };

    try {
      const data = await readFile(recentPath, 'utf-8');
      recentData = JSON.parse(data);
    } catch {
      // File doesn't exist
    }

    recentData.entries.push(entry);

    // Enforce cap
    if (recentData.entries.length > this.config.maxRecentEntries) {
      recentData.entries = recentData.entries.slice(-this.config.maxRecentEntries);
    }

    await this.writeJsonAtomic(recentPath, recentData);
    await this.updateGlobalLinks(entry, 'recent');
  }

  private async compressEntry(flashEntry: FlashEntry): Promise<WarmEntry> {
    // Rule-based compression
    const content = flashEntry.content;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);

    // Extract key sentences (first, last, and any with keywords)
    const keySentences = [
      sentences[0],
      ...sentences.filter(s => flashEntry.keywords.some(k => s.toLowerCase().includes(k))),
      sentences[sentences.length - 1],
    ].filter(Boolean).slice(0, 3);

    const summary = keySentences.join('. ') + '.';
    const hook = this.extractHook(content);

    // Check if should propose for MEMORY.md
    const proposal = this.shouldProposeForMemoryMd(flashEntry)
      ? this.createMemoryMdProposal(flashEntry, summary)
      : undefined;

    return {
      id: this.generateId(),
      timestamp: Date.now(),
      originalId: flashEntry.id,
      summary,
      hook,
      keyPoints: keySentences,
      keyQuotes: [content.slice(0, 100)],
      keywords: flashEntry.keywords,
      emotionalTone: flashEntry.emotionalSalience > 0.7 ? 'high' : 'neutral',
      linkedTo: flashEntry.linkedTo,
      compressionMethod: 'rule-based',
      memoryMdProposal: proposal,
      sessionKey: flashEntry.sessionKey,
    };
  }

  private async warmToRecent(warmEntry: WarmEntry): Promise<RecentEntry> {
    return {
      id: this.generateId(),
      timestamp: Date.now(),
      originalIds: [warmEntry.originalId],
      essence: warmEntry.summary.slice(0, 200),
      hook: warmEntry.hook,
      keywords: warmEntry.keywords,
      accessCount: 0,
      lastAccessed: Date.now(),
      sessionKey: warmEntry.sessionKey,
    };
  }

  private shouldProposeForMemoryMd(entry: FlashEntry): boolean {
    if (!this.config.enableMemoryMdIntegration) return false;

    // User flagged
    if (entry.userFlagged) return true;

    // High emotional salience
    if (entry.emotionalSalience >= this.config.emotionalThreshold) return true;

    // Important types
    if (['decision', 'milestone', 'learning'].includes(entry.type)) return true;

    return false;
  }

  private createMemoryMdProposal(entry: FlashEntry, summary: string): MemoryMdProposal {
    const section = this.determineMemorySection(entry);

    return {
      entryId: entry.id,
      timestamp: Date.now(),
      essence: summary.slice(0, 300),
      section,
      reason: entry.userFlagged
        ? 'User flagged as important'
        : `High emotional salience (${entry.emotionalSalience.toFixed(2)})`,
      keywords: entry.keywords,
    };
  }

  private determineMemorySection(entry: FlashEntry): string {
    switch (entry.type) {
      case 'decision': return '## Decisions Made';
      case 'milestone': return '## Milestones';
      case 'learning': return '## Key Learnings';
      default: return '## Important Memories';
    }
  }

  private extractHook(content: string): string {
    // Extract a memorable phrase (first 5-8 words of first sentence)
    const firstSentence = content.split(/[.!?]+/)[0] || content;
    const words = firstSentence.split(' ').slice(0, 8);
    return words.join(' ');
  }

  private async consolidateRecent(): Promise<number> {
    // Group similar recent entries and merge them
    const recent = await this.getAllRecent();
    const merged: RecentEntry[] = [];
    const toRemove: string[] = [];

    for (let i = 0; i < recent.length; i++) {
      if (toRemove.includes(recent[i].id)) continue;

      for (let j = i + 1; j < recent.length; j++) {
        if (toRemove.includes(recent[j].id)) continue;

        const similarity = this.keywordSimilarity(recent[i].keywords, recent[j].keywords);
        if (similarity > 0.7) {
          // Merge entries
          const mergedEntry: RecentEntry = {
            ...recent[i],
            originalIds: [...recent[i].originalIds, ...recent[j].originalIds],
            essence: `${recent[i].essence} | ${recent[j].essence}`.slice(0, 250),
            keywords: [...new Set([...recent[i].keywords, ...recent[j].keywords])].slice(0, 10),
          };
          merged.push(mergedEntry);
          toRemove.push(recent[i].id, recent[j].id);
          break;
        }
      }
    }

    // Update recent layer
    const recentPath = join(this.getRecentDir(), 'current.json');
    const remaining = recent.filter(e => !toRemove.includes(e.id));
    await this.writeJsonAtomic(recentPath, { entries: [...remaining, ...merged] });

    return merged.length;
  }

  private async decayUnusedMemories(): Promise<number> {
    const now = Date.now();
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    let decayed = 0;

    // Decay recent entries not accessed in a month
    const recent = await this.getAllRecent();
    const decayedRecent = recent.filter(e => {
      if (e.lastAccessed < monthAgo && e.accessCount < 3) {
        decayed++;
        return false;
      }
      return true;
    });

    if (decayed > 0) {
      const recentPath = join(this.getRecentDir(), 'current.json');
      await this.writeJsonAtomic(recentPath, { entries: decayedRecent });
    }

    return decayed;
  }

  private async updateAccessCount(entryId: string): Promise<void> {
    const recentPath = join(this.getRecentDir(), 'current.json');
    try {
      const data = await readFile(recentPath, 'utf-8');
      const recentData: { entries: RecentEntry[] } = JSON.parse(data);

      const entry = recentData.entries.find(e => e.id === entryId);
      if (entry) {
        entry.accessCount++;
        entry.lastAccessed = Date.now();
        await this.writeJsonAtomic(recentPath, recentData);
      }
    } catch {
      // Entry not found
    }
  }

  private async updateGlobalLinks(
    entry: FlashEntry | WarmEntry | RecentEntry | ArchiveEntry,
    layer: 'flash' | 'warm' | 'recent' | 'archive'
  ): Promise<void> {
    if (!this.config.enableCrossSessionSearch) return;

    const linksPath = join(this.getLinksDir(), 'index.json');
    let links: { keywords: Record<string, GlobalLinkRef[]> } = { keywords: {} };

    try {
      const data = await readFile(linksPath, 'utf-8');
      links = JSON.parse(data);
    } catch {
      // File doesn't exist
    }

    const ref: GlobalLinkRef = {
      session: (entry as FlashEntry).sessionKey || 'default',
      id: entry.id,
      timestamp: Date.now(),
      type: (entry as FlashEntry).type || 'memory',
      location: `${layer}/${entry.id}`,
      layer,
      keywords: entry.keywords,
    };

    for (const keyword of entry.keywords) {
      const normalized = keyword.toLowerCase();
      if (!links.keywords[normalized]) {
        links.keywords[normalized] = [];
      }

      // Avoid duplicates
      if (!links.keywords[normalized].some(r => r.id === entry.id)) {
        links.keywords[normalized].push(ref);

        // Cap per keyword
        if (links.keywords[normalized].length > 500) {
          links.keywords[normalized] = links.keywords[normalized].slice(-500);
        }
      }
    }

    await this.writeJsonAtomic(linksPath, links);
  }

  private async loadEntryByRef(ref: GlobalLinkRef): Promise<FlashEntry | WarmEntry | RecentEntry | ArchiveEntry | null> {
    try {
      switch (ref.layer) {
        case 'flash': {
          const flashPath = join(this.getFlashDir(), 'current.json');
          const data = await readFile(flashPath, 'utf-8');
          const flashData: { entries: FlashEntry[] } = JSON.parse(data);
          return flashData.entries.find(e => e.id === ref.id) || null;
        }
        case 'warm': {
          const warmFiles = await readdir(this.getWarmDir()).catch(() => []);
          for (const file of warmFiles) {
            const warmPath = join(this.getWarmDir(), file);
            const data = await readFile(warmPath, 'utf-8');
            const warmData: { entries: WarmEntry[] } = JSON.parse(data);
            const entry = warmData.entries.find(e => e.id === ref.id);
            if (entry) return entry;
          }
          return null;
        }
        case 'recent': {
          const recentPath = join(this.getRecentDir(), 'current.json');
          const data = await readFile(recentPath, 'utf-8');
          const recentData: { entries: RecentEntry[] } = JSON.parse(data);
          return recentData.entries.find(e => e.id === ref.id) || null;
        }
        default:
          return null;
      }
    } catch {
      return null;
    }
  }

  // Search methods for each layer

  private async searchFlash(keyword: string): Promise<FlashEntry[]> {
    const flashPath = join(this.getFlashDir(), 'current.json');
    try {
      const data = await readFile(flashPath, 'utf-8');
      const flashData: { entries: FlashEntry[] } = JSON.parse(data);
      return flashData.entries.filter(e =>
        e.keywords.some(k => k.toLowerCase().includes(keyword)) ||
        e.content.toLowerCase().includes(keyword)
      );
    } catch {
      return [];
    }
  }

  private async searchWarm(keyword: string): Promise<WarmEntry[]> {
    const warmFiles = await readdir(this.getWarmDir()).catch(() => [] as string[]);
    const results: WarmEntry[] = [];

    for (const file of warmFiles) {
      if (!file.endsWith('.json')) continue;

      try {
        const warmPath = join(this.getWarmDir(), file);
        const data = await readFile(warmPath, 'utf-8');
        const warmData: { entries: WarmEntry[] } = JSON.parse(data);

        results.push(...warmData.entries.filter(e =>
          e.keywords.some(k => k.toLowerCase().includes(keyword)) ||
          e.summary.toLowerCase().includes(keyword) ||
          e.hook.toLowerCase().includes(keyword)
        ));
      } catch {
        continue;
      }
    }

    return results;
  }

  private async searchRecent(keyword: string): Promise<RecentEntry[]> {
    const recentPath = join(this.getRecentDir(), 'current.json');
    try {
      const data = await readFile(recentPath, 'utf-8');
      const recentData: { entries: RecentEntry[] } = JSON.parse(data);
      return recentData.entries.filter(e =>
        e.keywords.some(k => k.toLowerCase().includes(keyword)) ||
        e.essence.toLowerCase().includes(keyword) ||
        e.hook.toLowerCase().includes(keyword)
      );
    } catch {
      return [];
    }
  }

  private async searchArchive(keyword: string): Promise<ArchiveEntry[]> {
    const archivePath = join(this.getArchiveDir(), 'current.json');
    try {
      const data = await readFile(archivePath, 'utf-8');
      const archiveData: { entries: ArchiveEntry[] } = JSON.parse(data);
      return archiveData.entries.filter(e =>
        e.keywords.some(k => k.toLowerCase().includes(keyword)) ||
        e.essence.toLowerCase().includes(keyword)
      );
    } catch {
      return [];
    }
  }

  private async searchCore(keyword: string): Promise<CoreEntry[]> {
    const corePath = join(this.getCoreDir(), 'current.json');
    try {
      const data = await readFile(corePath, 'utf-8');
      const coreData: { entries: CoreEntry[] } = JSON.parse(data);
      return coreData.entries.filter(e =>
        e.keywords.some(k => k.toLowerCase().includes(keyword)) ||
        e.essence.toLowerCase().includes(keyword) ||
        e.hook.toLowerCase().includes(keyword)
      );
    } catch {
      return [];
    }
  }

  // Get all methods for each layer

  private async getAllFlash(): Promise<FlashEntry[]> {
    const flashPath = join(this.getFlashDir(), 'current.json');
    try {
      const data = await readFile(flashPath, 'utf-8');
      const flashData: { entries: FlashEntry[] } = JSON.parse(data);
      return flashData.entries;
    } catch {
      return [];
    }
  }

  private async getAllWarm(): Promise<WarmEntry[]> {
    const warmFiles = await readdir(this.getWarmDir()).catch(() => [] as string[]);
    const all: WarmEntry[] = [];

    for (const file of warmFiles) {
      if (!file.endsWith('.json')) continue;
      try {
        const warmPath = join(this.getWarmDir(), file);
        const data = await readFile(warmPath, 'utf-8');
        const warmData: { entries: WarmEntry[] } = JSON.parse(data);
        all.push(...warmData.entries);
      } catch {
        continue;
      }
    }

    return all;
  }

  private async getWarmForSession(sessionKey: string): Promise<WarmEntry[]> {
    return (await this.getAllWarm()).filter(e => e.sessionKey === sessionKey);
  }

  private async getAllRecent(): Promise<RecentEntry[]> {
    const recentPath = join(this.getRecentDir(), 'current.json');
    try {
      const data = await readFile(recentPath, 'utf-8');
      const recentData: { entries: RecentEntry[] } = JSON.parse(data);
      return recentData.entries;
    } catch {
      return [];
    }
  }

  private async getAllArchive(): Promise<ArchiveEntry[]> {
    const archivePath = join(this.getArchiveDir(), 'current.json');
    try {
      const data = await readFile(archivePath, 'utf-8');
      const archiveData: { entries: ArchiveEntry[] } = JSON.parse(data);
      return archiveData.entries;
    } catch {
      return [];
    }
  }

  private async getAllCore(): Promise<CoreEntry[]> {
    const corePath = join(this.getCoreDir(), 'current.json');
    try {
      const data = await readFile(corePath, 'utf-8');
      const coreData: { entries: CoreEntry[] } = JSON.parse(data);
      return coreData.entries;
    } catch {
      return [];
    }
  }

  // Utility methods

  private getFlashDir(): string {
    return join(this.config.baseDir, 'hot', 'flash');
  }

  private getWarmDir(): string {
    return join(this.config.baseDir, 'hot', 'warm');
  }

  private getRecentDir(): string {
    return join(this.config.baseDir, 'recent');
  }

  private getArchiveDir(): string {
    return join(this.config.baseDir, 'archive');
  }

  private getCoreDir(): string {
    return join(this.config.baseDir, 'core');
  }

  private getLinksDir(): string {
    return join(this.config.baseDir, 'links');
  }

  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    await writeFile(tmpPath, JSON.stringify(data, null, 2));
    await writeFile(filePath, JSON.stringify(data, null, 2));
    try {
      await import('node:fs').then(fs => fs.promises.unlink(tmpPath));
    } catch {
      // Ignore
    }
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  private keywordSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a.map(k => k.toLowerCase()));
    const setB = new Set(b.map(k => k.toLowerCase()));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }
}

