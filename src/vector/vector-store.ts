/**
 * Vector Store for Semantic Search
 * 
 * In-memory cosine similarity (Week 1) with HNSW upgrade path (Week 3)
 * 
 * Features:
 * - Cosine similarity search
 * - Metadata filtering
 * - Persistence to JSON
 * - Batch operations
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Vector entry with metadata */
export interface VectorEntry {
  readonly id: string;
  readonly vector: number[];
  readonly metadata: Record<string, unknown>;
  readonly timestamp: number;
}

/** Search result */
export interface SearchResult {
  readonly id: string;
  readonly score: number; // Cosine similarity (0-1)
  readonly metadata: Record<string, unknown>;
}

/** Vector store configuration */
export interface VectorStoreConfig {
  readonly baseDir: string;
  readonly dimension: number;
  readonly persistIntervalMs?: number;
}

/**
 * In-Memory Vector Store with Cosine Similarity
 * 
 * O(n) search - suitable for < 10K vectors
 * For larger scale, upgrade to HNSW (week 3)
 */
export class VectorStore {
  private config: Required<VectorStoreConfig>;
  private vectors: Map<string, VectorEntry> = new Map();
  private lastPersistTime = 0;
  private persistScheduled = false;

  constructor(config: VectorStoreConfig) {
    this.config = {
      baseDir: config.baseDir,
      dimension: config.dimension,
      persistIntervalMs: config.persistIntervalMs ?? 60000, // 1 minute
    };
  }

  async initialize(): Promise<void> {
    await mkdir(this.config.baseDir, { recursive: true });
    await this.load();
  }

  /**
   * Add a vector
   */
  async add(id: string, vector: number[], metadata: Record<string, unknown> = {}): Promise<void> {
    if (vector.length !== this.config.dimension) {
      throw new Error(`Expected dimension ${this.config.dimension}, got ${vector.length}`);
    }

    const entry: VectorEntry = {
      id,
      vector: this.normalize(vector),
      metadata,
      timestamp: Date.now(),
    };

    this.vectors.set(id, entry);
    this.schedulePersist();
  }

  /**
   * Add multiple vectors (batch)
   */
  async addBatch(entries: Array<{ id: string; vector: number[]; metadata?: Record<string, unknown> }>): Promise<void> {
    for (const entry of entries) {
      await this.add(entry.id, entry.vector, entry.metadata);
    }
  }

  /**
   * Search by vector similarity
   */
  search(query: number[], k: number = 10, filter?: (metadata: Record<string, unknown>) => boolean): SearchResult[] {
    if (query.length !== this.config.dimension) {
      throw new Error(`Expected dimension ${this.config.dimension}, got ${query.length}`);
    }

    const normalizedQuery = this.normalize(query);
    const results: Array<{ id: string; score: number; metadata: Record<string, unknown> }> = [];

    for (const entry of this.vectors.values()) {
      // Apply filter if provided
      if (filter && !filter(entry.metadata)) continue;

      const score = this.cosineSimilarity(normalizedQuery, entry.vector);

      results.push({
        id: entry.id,
        score,
        metadata: entry.metadata,
      });
    }

    // Sort by score descending and take top k
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  /**
   * Search by text (requires embedding)
   */
  async searchByText(
    text: string,
    embedFn: (text: string) => Promise<number[]>,
    k: number = 10,
    filter?: (metadata: Record<string, unknown>) => boolean
  ): Promise<SearchResult[]> {
    const embedding = await embedFn(text);
    return this.search(embedding, k, filter);
  }

  /**
   * Get entry by ID
   */
  get(id: string): VectorEntry | undefined {
    return this.vectors.get(id);
  }

  /**
   * Delete entry
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.vectors.delete(id);
    if (existed) this.schedulePersist();
    return existed;
  }

  /**
   * Update metadata
   */
  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<boolean> {
    const entry = this.vectors.get(id);
    if (!entry) return false;

    const updated: VectorEntry = {
      ...entry,
      metadata: { ...entry.metadata, ...metadata },
    };

    this.vectors.set(id, updated);
    this.schedulePersist();
    return true;
  }

  /**
   * Get all entries (for debugging)
   */
  getAll(): VectorEntry[] {
    return Array.from(this.vectors.values());
  }

  /**
   * Get count
   */
  count(): number {
    return this.vectors.size;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    this.vectors.clear();
    await this.persist();
  }

  /**
   * Persist to disk
   */
  async persist(): Promise<void> {
    const data = {
      dimension: this.config.dimension,
      vectors: Array.from(this.vectors.entries()),
      timestamp: Date.now(),
    };

    const tmpPath = join(this.config.baseDir, `vectors.tmp.${Date.now()}.json`);
    const finalPath = join(this.config.baseDir, 'vectors.json');

    await writeFile(tmpPath, JSON.stringify(data, null, 2));
    await writeFile(finalPath, JSON.stringify(data, null, 2));

    // Clean up temp file
    try {
      const fs = await import('node:fs');
      fs.unlinkSync(tmpPath);
    } catch {
      // Ignore
    }

    this.lastPersistTime = Date.now();
  }

  /**
   * Load from disk
   */
  private async load(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'vectors.json'), 'utf-8');
      const parsed = JSON.parse(data);

      if (parsed.dimension !== this.config.dimension) {
        console.warn(`[VectorStore] Dimension mismatch: stored=${parsed.dimension}, config=${this.config.dimension}`);
        return;
      }

      this.vectors = new Map(parsed.vectors);
    } catch {
      // No existing data
    }
  }

  private schedulePersist(): void {
    if (this.persistScheduled) return;

    this.persistScheduled = true;
    setTimeout(() => {
      this.persist();
      this.persistScheduled = false;
    }, this.config.persistIntervalMs);
  }

  private normalize(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vector;
    return vector.map(v => v / norm);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
    }
    return dot; // Already normalized, so just dot product
  }
}

/**
 * HNSW Vector Store (Week 3 Upgrade)
 * 
 * Approximate nearest neighbor search using HNSW algorithm
 * O(log n) search - suitable for 100K+ vectors
 * 
 * Note: Requires hnswlib-node package
 */
export class HNSWVectorStore {
  // Placeholder for HNSW implementation
  // Will be implemented in week 3

  private config: VectorStoreConfig;
  private hnswIndex: unknown = null;

  constructor(config: VectorStoreConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // TODO: Implement HNSW index
    throw new Error('HNSWVectorStore not yet implemented. Use VectorStore for now.');
  }
}
