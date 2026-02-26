/**
 * Concept Registry + Tagger - Abstraction building
 * Section 8.1: Concept detection and tagging
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Concept, Signal, SessionKey } from '../types.js';
import { deterministicId } from '../runtime/deterministic-id.js';

/** Concept registry configuration */
export interface ConceptRegistryConfig {
  /** Base directory for concept storage */
  readonly baseDir: string;
}

/** Concept detection result */
export interface ConceptDetection {
  readonly conceptId: string;
  readonly name: string;
  readonly confidence: number;
  readonly matchedPatterns: string[];
}

/** Concept tagger input */
export interface ConceptTaggerInput {
  readonly content: string;
  readonly sessionKey: SessionKey;
  readonly existingConcepts?: string[];
}

/**
 * ConceptRegistry - Manages concept definitions
 */
export class ConceptRegistry {
  private readonly config: ConceptRegistryConfig;
  private readonly concepts: Map<string, Concept> = new Map();
  private loaded = false;

  constructor(config: ConceptRegistryConfig) {
    this.config = config;
  }

  /**
   * Get registry file path
   */
  private getRegistryPath(): string {
    return join(this.config.baseDir, 'concepts', 'registry.json');
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(): Promise<void> {
    await mkdir(join(this.config.baseDir, 'concepts'), { recursive: true });
  }

  /**
   * Load registry from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const registryPath = this.getRegistryPath();
      const content = await readFile(registryPath, 'utf-8');
      const concepts: Concept[] = JSON.parse(content);
      
      for (const concept of concepts) {
        this.concepts.set(concept.conceptId, concept);
      }
    } catch {
      // Registry doesn't exist yet
    }

    this.loaded = true;
  }

  /**
   * Save registry to disk
   */
  async save(): Promise<void> {
    await this.ensureDir();
    const registryPath = this.getRegistryPath();
    const concepts = Array.from(this.concepts.values());
    await writeFile(registryPath, JSON.stringify(concepts, null, 2));
  }

  /**
   * Register a new concept
   */
  async registerConcept(concept: Omit<Concept, 'conceptId'>): Promise<Concept> {
    await this.load();

    const timestamp = Date.now();
    const conceptId = deterministicId.generateConceptId(timestamp, concept.name);
    
    const newConcept: Concept = {
      ...concept,
      conceptId,
    };

    this.concepts.set(newConcept.conceptId, newConcept);
    await this.save();

    return newConcept;
  }

  /**
   * Get a concept by ID
   */
  getConcept(conceptId: string): Concept | undefined {
    return this.concepts.get(conceptId);
  }

  /**
   * Get a concept by name
   */
  getConceptByName(name: string): Concept | undefined {
    const lowerName = name.toLowerCase();
    return Array.from(this.concepts.values()).find(
      c => c.name.toLowerCase() === lowerName
    );
  }

  /**
   * Get all concepts
   */
  getAllConcepts(): Concept[] {
    return Array.from(this.concepts.values());
  }

  /**
   * Update concept exemplars
   */
  async updateExemplars(
    conceptId: string,
    positiveTraceId: string,
    isPositive: boolean
  ): Promise<Concept | null> {
    await this.load();

    const concept = this.concepts.get(conceptId);
    if (!concept) return null;

    const updated: Concept = {
      ...concept,
      positiveExemplars: isPositive
        ? [...concept.positiveExemplars, positiveTraceId]
        : concept.positiveExemplars,
      negativeExemplars: !isPositive
        ? [...concept.negativeExemplars, positiveTraceId]
        : concept.negativeExemplars,
    };

    this.concepts.set(conceptId, updated);
    await this.save();

    return updated;
  }

  /**
   * Remove a concept
   */
  async removeConcept(conceptId: string): Promise<boolean> {
    await this.load();
    const removed = this.concepts.delete(conceptId);
    if (removed) await this.save();
    return removed;
  }
}

/**
 * ConceptTagger - Detects concepts in content
 */
export class ConceptTagger {
  private readonly registry: ConceptRegistry;

  constructor(registry: ConceptRegistry) {
    this.registry = registry;
  }

  /**
   * Tag concepts in content
   */
  async tag(input: ConceptTaggerInput): Promise<ConceptDetection[]> {
    await this.registry.load();

    const detections: ConceptDetection[] = [];
    const content = input.content.toLowerCase();

    for (const concept of this.registry.getAllConcepts()) {
      const detection = this.detectConcept(concept, content);
      
      if (detection.confidence >= concept.confidenceThreshold) {
        detections.push(detection);
      }
    }

    // Sort by confidence descending
    detections.sort((a, b) => b.confidence - a.confidence);

    return detections;
  }

  /**
   * Detect a single concept
   */
  private detectConcept(concept: Concept, content: string): ConceptDetection {
    const matchedPatterns: string[] = [];
    let totalConfidence = 0;

    for (const detector of concept.detectors) {
      if (detector.type === 'rule') {
        const config = detector.config as { patterns: string[] };
        
        for (const pattern of config.patterns) {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(content)) {
            matchedPatterns.push(pattern);
            totalConfidence += 0.3;
          }
        }
      }
    }

    // Cap confidence at 1.0
    const confidence = Math.min(1.0, totalConfidence);

    return {
      conceptId: concept.conceptId,
      name: concept.name,
      confidence,
      matchedPatterns,
    };
  }

  /**
   * Create CONCEPTS_DETECTED signal
   */
  createSignal(
    detections: ConceptDetection[],
    sessionKey: SessionKey
  ): Omit<Signal, 'signalId'> {
    return {
      sessionKey,
      type: 'CONCEPTS_DETECTED',
      payload: {
        concepts: detections.map(d => ({
          conceptId: d.conceptId,
          name: d.name,
          confidence: d.confidence,
        })),
      },
      emittedAtMs: Date.now(),
      sourceLoop: 'ConceptTagger',
      priority: 'event',
    };
  }
}

/** Predefined common concepts */
export const CommonConcepts = {
  FileOperation: {
    name: 'file_operation',
    detectors: [{
      type: 'rule' as const,
      config: {
        patterns: [
          'read file',
          'write file',
          'delete file',
          'create file',
          'open file',
          'save file',
          'file content',
        ],
      },
    }],
    confidenceThreshold: 0.5,
    positiveExemplars: [],
    negativeExemplars: [],
  },
  
  DataAnalysis: {
    name: 'data_analysis',
    detectors: [{
      type: 'rule' as const,
      config: {
        patterns: [
          'analyze',
          'statistics',
          'average',
          'sum',
          'count',
          'group by',
          'aggregate',
          'trend',
        ],
      },
    }],
    confidenceThreshold: 0.5,
    positiveExemplars: [],
    negativeExemplars: [],
  },

  WebRequest: {
    name: 'web_request',
    detectors: [{
      type: 'rule' as const,
      config: {
        patterns: [
          'http',
          'request',
          'fetch',
          'api',
          'endpoint',
          'url',
          'get data',
          'post data',
        ],
      },
    }],
    confidenceThreshold: 0.5,
    positiveExemplars: [],
    negativeExemplars: [],
  },

  Calculation: {
    name: 'calculation',
    detectors: [{
      type: 'rule' as const,
      config: {
        patterns: [
          'calculate',
          'compute',
          'math',
          'formula',
          'equation',
          'add',
          'subtract',
          'multiply',
          'divide',
        ],
      },
    }],
    confidenceThreshold: 0.5,
    positiveExemplars: [],
    negativeExemplars: [],
  },

  Search: {
    name: 'search',
    detectors: [{
      type: 'rule' as const,
      config: {
        patterns: [
          'search',
          'find',
          'lookup',
          'query',
          'filter',
          'where',
          'match',
        ],
      },
    }],
    confidenceThreshold: 0.5,
    positiveExemplars: [],
    negativeExemplars: [],
  },
};
