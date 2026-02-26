/**
 * Semantic Store - Milestone 8 Track A
 * Deduplication, reinforcement, eviction, indexing
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  SemanticFact,
  SemanticStoreConfig,
  CandidateFact,
  AddFactResult,
  KeywordIndex,
} from './types.js';
import { DEFAULT_SEMANTIC_CONFIG } from './types.js';

/**
 * SemanticStore - Persistent storage with dedupe and reinforcement
 */
export class SemanticStore {
  private config: Required<SemanticStoreConfig>;
  private facts: SemanticFact[] = [];
  private index: KeywordIndex = {};
  private basePath: string;

  constructor(config?: Partial<SemanticStoreConfig>) {
    this.config = { ...DEFAULT_SEMANTIC_CONFIG, ...config };
    this.basePath = this.config.baseDir;
  }

  /**
   * Initialize store - load existing data
   */
  async init(): Promise<void> {
    // Ensure directory exists
    mkdirSync(this.basePath, { recursive: true });

    // Load facts
    const factsPath = join(this.basePath, 'facts.json');
    if (existsSync(factsPath)) {
      try {
        const content = readFileSync(factsPath, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l);
        this.facts = lines.map(line => JSON.parse(line));
      } catch {
        this.facts = [];
      }
    }

    // Load index
    const indexPath = join(this.basePath, 'index.json');
    if (existsSync(indexPath)) {
      try {
        const content = readFileSync(indexPath, 'utf-8');
        this.index = JSON.parse(content);
      } catch {
        this.index = {};
      }
    }

    // Enforce cap on load
    this.enforceCap();
  }

  /**
   * Normalize statement for hashing
   * lowercase, trim, collapse whitespace
   */
  normalizeStatement(statement: string): string {
    return statement
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Compute SHA-256 hash of normalized statement
   */
  hashStatement(statement: string): string {
    const normalized = this.normalizeStatement(statement);
    return createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Add a candidate fact
   * Deduplicates, reinforces, enforces cap, updates index
   */
  async addFact(candidate: CandidateFact): Promise<AddFactResult> {
    const statementHash = this.hashStatement(candidate.statement);

    // Check for existing
    const existing = this.facts.find(f => f.statementHash === statementHash);

    if (existing) {
      // Reinforce
      const reinforced = this.reinforceFact(existing, candidate);
      await this.saveFacts();
      return { added: false, fact: reinforced };
    }

    // Create new fact
    const now = Date.now();
    const newFact: SemanticFact = {
      factId: crypto.randomUUID ? crypto.randomUUID() : `fact-${now}`,
      statement: candidate.statement,
      statementHash,
      confidence: 0.9,
      createdAtMs: now,
      lastVerifiedMs: now,
      lastReinforcedMs: now,
      evidence: [...candidate.evidence],
      source: 'consolidator',
      privacyLevel: candidate.privacyLevel,
    };

    // Add to facts
    this.facts.push(newFact);

    // Enforce cap
    this.enforceCap();

    // Update index
    this.updateKeywordIndex(newFact);

    // Persist
    await this.saveFacts();

    return { added: true, fact: newFact };
  }

  /**
   * Reinforce an existing fact
   * confidence += 0.05, cap 0.99
   * merge evidence, update timestamps
   */
  private reinforceFact(
    existing: SemanticFact,
    candidate: CandidateFact
  ): SemanticFact {
    const now = Date.now();

    // Merge evidence (dedupe by refId)
    const existingRefIds = new Set(existing.evidence.map(e => e.refId));
    const newEvidence = candidate.evidence.filter(
      e => !existingRefIds.has(e.refId)
    );

    const reinforced: SemanticFact = {
      ...existing,
      confidence: Math.min(0.99, existing.confidence + 0.05),
      lastVerifiedMs: now,
      lastReinforcedMs: now,
      evidence: [...existing.evidence, ...newEvidence],
    };

    // Replace in facts array
    const index = this.facts.findIndex(f => f.factId === existing.factId);
    if (index !== -1) {
      this.facts[index] = reinforced;
    }

    return reinforced;
  }

  /**
   * Enforce fact cap
   * Evict lowest confidence → oldest lastVerifiedMs
   */
  private enforceCap(): void {
    if (this.facts.length <= this.config.maxFacts) {
      return;
    }

    // Sort by confidence asc, then lastVerifiedMs asc
    this.facts.sort((a, b) => {
      if (a.confidence !== b.confidence) {
        return a.confidence - b.confidence;
      }
      return a.lastVerifiedMs - b.lastVerifiedMs;
    });

    // Evict excess
    const toEvict = this.facts.length - this.config.maxFacts;
    this.facts = this.facts.slice(toEvict);
  }

  /**
   * Update keyword index
   */
  private updateKeywordIndex(fact: SemanticFact): void {
    const words = this.extractKeywords(fact.statement);
    for (const word of words) {
      if (!this.index[word]) {
        this.index = { ...this.index, [word]: [] };
      }
      if (!this.index[word].includes(fact.factId)) {
        this.index = {
          ...this.index,
          [word]: [...this.index[word], fact.factId]
        };
      }
    }
  }

  /**
   * Extract keywords from statement
   */
  private extractKeywords(statement: string): string[] {
    return statement
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  /**
   * Recall relevant facts
   * Keyword match → sort by confidence desc, lastVerifiedMs desc
   */
  recallFacts(keywords: string[]): SemanticFact[] {
    const factIds = new Set<string>();

    for (const kw of keywords) {
      const normalized = kw.toLowerCase();
      const matches = this.index[normalized] || [];
      for (const id of matches) {
        factIds.add(id);
      }
    }

    // Get facts
    const relevant = this.facts.filter(f => factIds.has(f.factId));

    // Sort by confidence desc, then lastVerifiedMs desc
    return relevant
      .sort((a, b) => {
        if (b.confidence !== a.confidence) {
          return b.confidence - a.confidence;
        }
        return b.lastVerifiedMs - a.lastVerifiedMs;
      })
      .slice(0, this.config.recallLimit);
  }

  /**
   * Get all facts
   */
  getFacts(): SemanticFact[] {
    return [...this.facts];
  }

  /**
   * Get fact count
   */
  getFactCount(): number {
    return this.facts.length;
  }

  /**
   * Save facts append-only
   */
  private async saveFacts(): Promise<void> {
    const factsPath = join(this.basePath, 'facts.json');
    const lines = this.facts.map(f => JSON.stringify(f)).join('\n') + '\n';
    writeFileSync(factsPath, lines, 'utf-8');

    const indexPath = join(this.basePath, 'index.json');
    writeFileSync(indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
  }
}
