/**
 * BeliefGraph - Explicit world model with versioning
 * Section 9.1: Testable and revisable world model
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BeliefGraph,
  BeliefEntity,
  BeliefRelation,
  Belief,
  SessionKey,
  TimestampMs,
  Hash
} from '../types.js';
import { deterministicId } from '../runtime/deterministic-id.js';

/** BeliefGraph configuration */
export interface BeliefGraphConfig {
  /** Base directory for world model storage */
  readonly baseDir: string;
  /** Maximum versions to keep */
  readonly maxVersions?: number;
}

/** Belief update operation */
export interface BeliefUpdate {
  readonly type: 'add_entity' | 'add_relation' | 'add_belief' | 'update_confidence' | 'retire_belief';
  readonly data: unknown;
  readonly provenance: {
    readonly source: 'signal' | 'tool' | 'user' | 'inference';
    readonly refId: string;
  };
}

/**
 * BeliefGraphManager - Manages explicit world model
 * 
 * Design principles:
 * - Entities, relations, beliefs with confidence
 * - Provenance tracking
 * - Version history (no silent overwrite)
 * - Contradictions tracked and resolved by arbitration
 */
export class BeliefGraphManager {
  private readonly config: BeliefGraphConfig;
  private readonly graphs: Map<SessionKey, BeliefGraph> = new Map();
  private readonly versions: Map<SessionKey, BeliefGraph[]> = new Map();

  constructor(config: BeliefGraphConfig) {
    this.config = config;
  }

  /**
   * Get world model directory for a session
   */
  private getWorldModelDir(sessionKey: SessionKey): string {
    return join(this.config.baseDir, 'worldmodel', sessionKey, 'beliefgraph');
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  /**
   * Compute graph hash
   */
  private computeGraphHash(graph: BeliefGraph): Hash {
    const data = JSON.stringify({
      entities: graph.entities,
      relations: graph.relations,
      beliefs: graph.beliefs,
    });
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create initial empty graph
   */
  private createEmptyGraph(sessionKey: SessionKey): BeliefGraph {
    const now = Date.now();
    const graph: BeliefGraph = {
      version: 1,
      versionHash: '',
      sessionKey,
      entities: [],
      relations: [],
      beliefs: [],
      contradictions: [],
      createdAtMs: now,
    };

    return { ...graph, versionHash: this.computeGraphHash(graph) };
  }

  /**
   * Get or create graph for session
   */
  getGraph(sessionKey: SessionKey): BeliefGraph {
    let graph = this.graphs.get(sessionKey);
    if (!graph) {
      graph = this.createEmptyGraph(sessionKey);
      this.graphs.set(sessionKey, graph);
      this.versions.set(sessionKey, [graph]);
    }
    return graph;
  }

  /**
   * Add entity to graph
   */
  addEntity(
    sessionKey: SessionKey,
    entity: Omit<BeliefEntity, 'entityId'>,
    provenance: { source: 'signal' | 'tool' | 'user' | 'inference'; refId: string }
  ): BeliefEntity {
    const graph = this.getGraph(sessionKey);

    const timestamp = Date.now();
    const entityId = deterministicId.generateMemoryId('entity', timestamp, entity.type);

    const newEntity: BeliefEntity = {
      ...entity,
      entityId,
    };

    const updated: BeliefGraph = {
      ...graph,
      entities: [...graph.entities, newEntity],
    };

    this.updateGraph(sessionKey, updated);
    return newEntity;
  }

  /**
   * Add relation to graph
   */
  addRelation(
    sessionKey: SessionKey,
    relation: Omit<BeliefRelation, 'relationId'>,
    provenance: { source: 'signal' | 'tool' | 'user' | 'inference'; refId: string }
  ): BeliefRelation {
    const graph = this.getGraph(sessionKey);

    const timestamp = Date.now();
    const relationId = deterministicId.generateMemoryId('relation', timestamp, `${relation.sourceId}-${relation.targetId}`);

    const newRelation: BeliefRelation = {
      ...relation,
      relationId,
    };

    const updated: BeliefGraph = {
      ...graph,
      relations: [...graph.relations, newRelation],
    };

    this.updateGraph(sessionKey, updated);
    return newRelation;
  }

  /**
   * Add belief to graph
   */
  addBelief(
    sessionKey: SessionKey,
    belief: Omit<Belief, 'beliefId' | 'version'>,
    provenance: { source: 'signal' | 'tool' | 'user' | 'inference'; refId: string }
  ): Belief {
    const graph = this.getGraph(sessionKey);

    const timestamp = Date.now();
    const beliefId = deterministicId.generateMemoryId('belief', timestamp, (belief as any)?.entityId || 'unknown');

    const newBelief: Belief = {
      ...belief,
      beliefId,
      version: 1,
    };

    // Check for contradictions
    const contradictions = this.findContradictions(graph, newBelief);

    const updated: BeliefGraph = {
      ...graph,
      beliefs: [...graph.beliefs, newBelief],
      contradictions: [...graph.contradictions, ...contradictions],
    };

    this.updateGraph(sessionKey, updated);
    return newBelief;
  }

  /**
   * Update belief confidence
   */
  updateBeliefConfidence(
    sessionKey: SessionKey,
    beliefId: string,
    newConfidence: number,
    provenance: { source: 'signal' | 'tool' | 'user' | 'inference'; refId: string }
  ): Belief | null {
    const graph = this.getGraph(sessionKey);

    const beliefIndex = graph.beliefs.findIndex(b => b.beliefId === beliefId);
    if (beliefIndex === -1) return null;

    const oldBelief = graph.beliefs[beliefIndex];

    // Create new version instead of modifying
    const updatedBelief: Belief = {
      ...oldBelief,
      confidence: newConfidence,
      version: oldBelief.version + 1,
    };

    const updatedBeliefs = [...graph.beliefs];
    updatedBeliefs[beliefIndex] = updatedBelief;

    const updated: BeliefGraph = {
      ...graph,
      beliefs: updatedBeliefs,
    };

    this.updateGraph(sessionKey, updated);
    return updatedBelief;
  }

  /**
   * Retire a belief (versioned retirement)
   */
  retireBelief(
    sessionKey: SessionKey,
    beliefId: string,
    reason: string,
    provenance: { source: 'signal' | 'tool' | 'user' | 'inference'; refId: string }
  ): boolean {
    const graph = this.getGraph(sessionKey);

    const beliefIndex = graph.beliefs.findIndex(b => b.beliefId === beliefId);
    if (beliefIndex === -1) return false;

    const oldBelief = graph.beliefs[beliefIndex];

    // Mark as retired by setting confidence to 0 and adding retirement note
    const retiredBelief: Belief = {
      ...oldBelief,
      confidence: 0,
      version: oldBelief.version + 1,
      statement: `${oldBelief.statement} [RETIRED: ${reason}]`,
    };

    const updatedBeliefs = [...graph.beliefs];
    updatedBeliefs[beliefIndex] = retiredBelief;

    const updated: BeliefGraph = {
      ...graph,
      beliefs: updatedBeliefs,
    };

    this.updateGraph(sessionKey, updated);
    return true;
  }

  /**
   * Find contradictions with existing beliefs
   */
  private findContradictions(
    graph: BeliefGraph,
    newBelief: Belief
  ): Array<{ beliefId1: string; beliefId2: string; detectedAtMs: TimestampMs }> {
    const contradictions: Array<{ beliefId1: string; beliefId2: string; detectedAtMs: TimestampMs }> = [];

    for (const existing of graph.beliefs) {
      // Check for direct negation
      if (this.areContradictory(newBelief, existing)) {
        contradictions.push({
          beliefId1: newBelief.beliefId,
          beliefId2: existing.beliefId,
          detectedAtMs: Date.now(),
        });
      }
    }

    return contradictions;
  }

  /**
   * Check if two beliefs are contradictory
   */
  private areContradictory(belief1: Belief, belief2: Belief): boolean {
    const s1 = belief1.statement.toLowerCase();
    const s2 = belief2.statement.toLowerCase();

    // Direct negation patterns
    const negations = [
      { pos: 'is', neg: 'is not' },
      { pos: 'can', neg: 'cannot' },
      { pos: 'has', neg: 'does not have' },
      { pos: 'will', neg: 'will not' },
    ];

    for (const neg of negations) {
      if (s1.includes(neg.pos) && s2.includes(s1.replace(neg.pos, neg.neg))) {
        return true;
      }
      if (s2.includes(neg.pos) && s1.includes(s2.replace(neg.pos, neg.neg))) {
        return true;
      }
    }

    // Numeric contradictions (e.g., "value is 5" vs "value is 10")
    const numMatch1 = s1.match(/(\w+)\s+is\s+(\d+)/);
    const numMatch2 = s2.match(/(\w+)\s+is\s+(\d+)/);

    if (numMatch1 && numMatch2) {
      const [, key1, val1] = numMatch1;
      const [, key2, val2] = numMatch2;

      if (key1 === key2 && val1 !== val2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Update graph with new version
   */
  private updateGraph(sessionKey: SessionKey, updated: BeliefGraph): void {
    const newVersion = updated.version + 1;
    const versioned: BeliefGraph = {
      ...updated,
      version: newVersion,
      versionHash: this.computeGraphHash(updated),
    };

    this.graphs.set(sessionKey, versioned);

    // Track versions
    const versions = this.versions.get(sessionKey) ?? [];
    versions.push(versioned);

    // Enforce max versions
    const maxVersions = this.config.maxVersions ?? 100;
    if (versions.length > maxVersions) {
      versions.shift();
    }

    this.versions.set(sessionKey, versions);
  }

  /**
   * Get entity by ID
   */
  getEntity(sessionKey: SessionKey, entityId: string): BeliefEntity | undefined {
    const graph = this.getGraph(sessionKey);
    return graph.entities.find(e => e.entityId === entityId);
  }

  /**
   * Get relations for an entity
   */
  getEntityRelations(sessionKey: SessionKey, entityId: string): BeliefRelation[] {
    const graph = this.getGraph(sessionKey);
    return graph.relations.filter(
      r => r.sourceId === entityId || r.targetId === entityId
    );
  }

  /**
   * Get beliefs about an entity
   */
  getEntityBeliefs(sessionKey: SessionKey, entityId: string): Belief[] {
    const graph = this.getGraph(sessionKey);
    return graph.beliefs.filter(b =>
      b.statement.toLowerCase().includes(entityId.toLowerCase())
    );
  }

  /**
   * Query graph by relation type
   */
  queryByRelation(
    sessionKey: SessionKey,
    relationType: string
  ): Array<{ source: BeliefEntity; relation: BeliefRelation; target: BeliefEntity }> {
    const graph = this.getGraph(sessionKey);
    const results: Array<{ source: BeliefEntity; relation: BeliefRelation; target: BeliefEntity }> = [];

    for (const relation of graph.relations) {
      if (relation.type === relationType) {
        const source = graph.entities.find(e => e.entityId === relation.sourceId);
        const target = graph.entities.find(e => e.entityId === relation.targetId);

        if (source && target) {
          results.push({ source, relation, target });
        }
      }
    }

    return results;
  }

  /**
   * Get graph version history
   */
  getVersionHistory(sessionKey: SessionKey): BeliefGraph[] {
    return [...(this.versions.get(sessionKey) ?? [])];
  }

  /**
   * Get graph at specific version
   */
  getGraphAtVersion(sessionKey: SessionKey, version: number): BeliefGraph | null {
    const versions = this.versions.get(sessionKey) ?? [];
    return versions.find(v => v.version === version) ?? null;
  }

  /**
   * Persist graph to disk
   */
  async persistGraph(sessionKey: SessionKey): Promise<void> {
    const graph = this.getGraph(sessionKey);
    const dir = this.getWorldModelDir(sessionKey);
    await this.ensureDir(dir);

    const filePath = join(dir, `v${graph.version}.json`);
    await writeFile(filePath, JSON.stringify(graph, null, 2));
  }

  /**
   * Load graph from disk
   */
  async loadGraph(sessionKey: SessionKey, version?: number): Promise<BeliefGraph | null> {
    try {
      const dir = this.getWorldModelDir(sessionKey);

      if (version) {
        const filePath = join(dir, `v${version}.json`);
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content);
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Clear session data
   */
  clearSession(sessionKey: SessionKey): void {
    this.graphs.delete(sessionKey);
    this.versions.delete(sessionKey);
  }

  /**
   * Get graph statistics
   */
  getStats(sessionKey: SessionKey): {
    entityCount: number;
    relationCount: number;
    beliefCount: number;
    contradictionCount: number;
    version: number;
  } {
    const graph = this.getGraph(sessionKey);
    return {
      entityCount: graph.entities.length,
      relationCount: graph.relations.length,
      beliefCount: graph.beliefs.length,
      contradictionCount: graph.contradictions.length,
      version: graph.version,
    };
  }
}
