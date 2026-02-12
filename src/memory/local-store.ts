/**
 * Local Memory Store - Milestone 4 (with COO Amendments)
 * JSON-based storage for flash and warm memory
 */
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { MemoryEntry, FlashMemoryFile, WarmMemoryFile, MemoryIndex, MemoryConfig } from './types.js';
import { DefaultMemoryConfig, STOPWORDS } from './types.js';

/**
 * LocalMemoryStore - Handles file-based memory storage
 * Amendments:
 * - ISO week calculation (test Sunday/Monday boundary)
 * - Stopword filtering before indexing
 * - Flash capped at 2000 entries with FIFO eviction
 */
export class LocalMemoryStore {
  private config: MemoryConfig;

  constructor(config?: Partial<MemoryConfig>) {
    this.config = { ...DefaultMemoryConfig, ...config };
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  /**
   * Get session base path
   */
  private getSessionPath(sessionKey: string): string {
    return join(this.config.baseDir, 'sessions', sessionKey);
  }

  /**
   * Get flash file path
   */
  private getFlashPath(sessionKey: string): string {
    return join(this.getSessionPath(sessionKey), 'hot', 'flash', 'current.json');
  }

  /**
   * Get warm file path
   */
  private getWarmPath(sessionKey: string, weekKey: string): string {
    return join(this.getSessionPath(sessionKey), 'hot', 'warm', `week-${weekKey}.json`);
  }

  /**
   * Get index file path
   */
  private getIndexPath(sessionKey: string): string {
    return join(this.getSessionPath(sessionKey), 'index.json');
  }

  /**
   * Amendment: ISO week calculation (ISO-8601)
   * Week starts on Monday. Week 1 is the week with first Thursday.
   * Test Sunday/Monday boundary.
   */
  getCurrentWeekKey(): string {
    const now = new Date();
    return this.getISOWeekKey(now);
  }

  /**
   * Get ISO week key for a given date
   * Format: YYYY-WW where WW is 01-53
   */
  getISOWeekKey(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Set to nearest Thursday (current date + 4 - current day number, make Sunday=7)
    const dayNum = (d.getUTCDay() + 6) % 7; // Convert to 0=Monday, 6=Sunday
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    // Get first day of year
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum);
    // Calculate week number
    const weekNum = Math.floor((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    return `${d.getUTCFullYear()}-${weekNum.toString().padStart(2, '0')}`;
  }

  /**
   * Amendment: Generate keywords with stopword filtering
   * - lowercase
   * - split non-letters
   * - remove stopwords (~25 built-in)
   * - unique, top N
   */
  generateKeywords(content: string): string[] {
    const lower = content.toLowerCase();
    const tokens = lower
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 2)
      .filter(t => !STOPWORDS.has(t)); // Amendment: Filter stopwords
    
    // Return unique keywords, top 20
    return [...new Set(tokens)].slice(0, 20);
  }

  /**
   * Read JSON file or return null if not exists
   */
  private async readJson<T>(path: string): Promise<T | null> {
    try {
      const data = await readFile(path, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Write JSON file atomically
   */
  private async writeJson<T>(path: string, data: T): Promise<void> {
    await this.ensureDir(dirname(path));
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
    // Windows fallback
    try {
      const fs = await import('node:fs');
      fs.renameSync(tempPath, path);
    } catch {
      // Already written above
    }
  }

  /**
   * Write entry to flash memory
   * Amendment: Cap at 2000 entries, drop oldest when exceeded (FIFO)
   */
  async writeEntry(sessionKey: string, entry: MemoryEntry): Promise<void> {
    // Write to flash
    const flashPath = this.getFlashPath(sessionKey);
    const flash: FlashMemoryFile = (await this.readJson<FlashMemoryFile>(flashPath)) || {
      entries: [],
      updatedAtMs: Date.now(),
    };
    
    flash.entries.push(entry);
    
    // Amendment: FIFO eviction if over maxFlashEntries (default 2000)
    const maxEntries = this.config.maxFlashEntries ?? 2000;
    if (flash.entries.length > maxEntries) {
      // Sort by timestamp and keep newest
      flash.entries = flash.entries
        .sort((a, b) => b.timestampMs - a.timestampMs)
        .slice(0, maxEntries);
    }
    
    flash.updatedAtMs = Date.now();
    await this.writeJson(flashPath, flash);

    // Amendment: Update index (stopwords already filtered in generateKeywords)
    const indexPath = this.getIndexPath(sessionKey);
    const index: MemoryIndex = (await this.readJson<MemoryIndex>(indexPath)) || {
      keywords: {},
      updatedAtMs: Date.now(),
    };

    for (const keyword of entry.keywords) {
      if (!index.keywords[keyword]) {
        index.keywords[keyword] = [];
      }
      if (!index.keywords[keyword].includes(entry.id)) {
        index.keywords[keyword].push(entry.id);
      }
    }
    index.updatedAtMs = Date.now();
    await this.writeJson(indexPath, index);
  }

  /**
   * Read flash memory entries
   */
  async readFlash(sessionKey: string, cutoffMs?: number, limit?: number): Promise<MemoryEntry[]> {
    const flashPath = this.getFlashPath(sessionKey);
    const flash = await this.readJson<FlashMemoryFile>(flashPath);
    
    if (!flash) return [];

    let entries = flash.entries;
    
    if (cutoffMs) {
      entries = entries.filter(e => e.timestampMs >= cutoffMs);
    }

    // Sort by timestamp desc (newest first)
    entries = entries.sort((a, b) => b.timestampMs - a.timestampMs);

    if (limit) {
      entries = entries.slice(0, limit);
    }

    return entries;
  }

  /**
   * Read warm memory for a specific week
   */
  async readWarmForWeek(sessionKey: string, weekKey: string): Promise<MemoryEntry[]> {
    const warmPath = this.getWarmPath(sessionKey, weekKey);
    const warm = await this.readJson<WarmMemoryFile>(warmPath);
    return warm?.entries || [];
  }

  /**
   * Get available week keys
   */
  async getWeekKeys(sessionKey: string): Promise<string[]> {
    const warmDir = join(this.getSessionPath(sessionKey), 'hot', 'warm');
    try {
      const files = await readdir(warmDir);
      return files
        .filter(f => f.startsWith('week-') && f.endsWith('.json'))
        .map(f => f.slice(5, -5)); // Remove "week-" prefix and ".json" suffix
    } catch {
      return [];
    }
  }

  /**
   * Search entries by keywords
   */
  async searchKeywords(sessionKey: string, keywords: string[]): Promise<MemoryEntry[]> {
    const indexPath = this.getIndexPath(sessionKey);
    const index = await this.readJson<MemoryIndex>(indexPath);
    
    if (!index) return [];

    const entryIds = new Set<string>();
    for (const keyword of keywords) {
      const ids = index.keywords[keyword.toLowerCase()] || [];
      for (const id of ids) {
        entryIds.add(id);
      }
    }

    // Read flash entries and filter by ID
    const flash = await this.readFlash(sessionKey);
    return flash.filter(e => entryIds.has(e.id));
  }
}
