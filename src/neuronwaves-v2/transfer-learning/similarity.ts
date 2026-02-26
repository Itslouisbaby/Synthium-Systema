/**
 * Similarity Retrieval - Find similar traces for case-based reasoning
 * Section 7.2: Similarity retrieval for transfer learning
 */

import type { TaskTrace } from '../types.js';

/** Similarity configuration */
export interface SimilarityConfig {
  /** Weight for concept overlap */
  readonly conceptWeight?: number;
  /** Weight for tool overlap */
  readonly toolWeight?: number;
  /** Weight for task signature similarity */
  readonly signatureWeight?: number;
  /** Minimum similarity threshold */
  readonly minThreshold?: number;
}

/** Similarity result */
export interface SimilarityResult {
  readonly traceId: string;
  readonly similarity: number;
  readonly matchedConcepts: string[];
  readonly matchedTools: string[];
  readonly signatureSimilarity: number;
}

/**
 * SimilarityRetriever - Finds similar traces for transfer learning
 * 
 * Design principles:
 * - Multiple similarity metrics (concepts, tools, signature)
 * - Configurable weights
 * - Minimum threshold filtering
 * - Deterministic results
 */
export class SimilarityRetriever {
  private readonly config: Required<SimilarityConfig>;

  constructor(config: SimilarityConfig = {}) {
    this.config = {
      conceptWeight: config.conceptWeight ?? 0.4,
      toolWeight: config.toolWeight ?? 0.3,
      signatureWeight: config.signatureWeight ?? 0.3,
      minThreshold: config.minThreshold ?? 0.3,
    };
  }

  /**
   * Find similar traces
   * 
   * @param target - Target trace to compare against
   * @param candidates - Candidate traces to search
   * @param topK - Number of results to return
   * @returns Ranked similarity results
   */
  findSimilar(
    target: TaskTrace,
    candidates: TaskTrace[],
    topK: number = 5
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];

    for (const candidate of candidates) {
      // Skip self
      if (candidate.traceId === target.traceId) continue;

      const similarity = this.calculateSimilarity(target, candidate);
      
      if (similarity.similarity >= this.config.minThreshold) {
        results.push(similarity);
      }
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);

    return results.slice(0, topK);
  }

  /**
   * Calculate similarity between two traces
   */
  private calculateSimilarity(target: TaskTrace, candidate: TaskTrace): SimilarityResult {
    // Concept overlap
    const conceptSim = this.calculateConceptOverlap(
      target.detectedConcepts,
      candidate.detectedConcepts
    );

    // Tool overlap
    const targetTools = new Set(target.toolCalls.map(c => c.toolName));
    const candidateTools = new Set(candidate.toolCalls.map(c => c.toolName));
    const toolSim = this.calculateJaccardSimilarity(targetTools, candidateTools);

    // Task signature similarity
    const sigSim = this.calculateSignatureSimilarity(
      target.taskSignature,
      candidate.taskSignature
    );

    // Weighted combination
    const overallSim = 
      conceptSim * this.config.conceptWeight +
      toolSim * this.config.toolWeight +
      sigSim * this.config.signatureWeight;

    return {
      traceId: candidate.traceId,
      similarity: overallSim,
      matchedConcepts: this.getIntersection(
        target.detectedConcepts,
        candidate.detectedConcepts
      ),
      matchedTools: this.getIntersection(
        Array.from(targetTools),
        Array.from(candidateTools)
      ),
      signatureSimilarity: sigSim,
    };
  }

  /**
   * Calculate concept overlap (Jaccard similarity)
   */
  private calculateConceptOverlap(concepts1: string[], concepts2: string[]): number {
    const set1 = new Set(concepts1.map(c => c.toLowerCase()));
    const set2 = new Set(concepts2.map(c => c.toLowerCase()));
    
    return this.calculateJaccardSimilarity(set1, set2);
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  private calculateJaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }

  /**
   * Calculate task signature similarity
   */
  private calculateSignatureSimilarity(sig1: string, sig2: string): number {
    const terms1 = sig1.split('_');
    const terms2 = sig2.split('_');

    // Exact match
    if (sig1 === sig2) return 1.0;

    // Partial term overlap
    const set1 = new Set(terms1);
    const set2 = new Set(terms2);
    
    return this.calculateJaccardSimilarity(set1, set2);
  }

  /**
   * Get intersection of two arrays
   */
  private getIntersection<T>(arr1: T[], arr2: T[]): T[] {
    const set2 = new Set(arr2);
    return arr1.filter(x => set2.has(x));
  }

  /**
   * Find traces by concept
   */
  findByConcept(traces: TaskTrace[], concept: string): TaskTrace[] {
    const lowerConcept = concept.toLowerCase();
    return traces.filter(t => 
      t.detectedConcepts.some(c => c.toLowerCase() === lowerConcept)
    );
  }

  /**
   * Find traces by tool
   */
  findByTool(traces: TaskTrace[], toolName: string): TaskTrace[] {
    return traces.filter(t =>
      t.toolCalls.some(c => c.toolName === toolName)
    );
  }

  /**
   * Find successful traces only
   */
  findSuccessful(traces: TaskTrace[]): TaskTrace[] {
    return traces.filter(t => t.evaluation.result === 'success');
  }

  /**
   * Cluster traces by concept similarity
   */
  clusterByConcept(traces: TaskTrace[]): Map<string, TaskTrace[]> {
    const clusters = new Map<string, TaskTrace[]>();

    for (const trace of traces) {
      for (const concept of trace.detectedConcepts) {
        const lowerConcept = concept.toLowerCase();
        const existing = clusters.get(lowerConcept) ?? [];
        clusters.set(lowerConcept, [...existing, trace]);
      }
    }

    return clusters;
  }
}

/** Simple embedding-based similarity (placeholder for future) */
export class EmbeddingSimilarityRetriever {
  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Create a simple bag-of-words embedding
   */
  static createBOWEmbedding(text: string, vocabulary: string[]): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const wordCounts = new Map<string, number>();
    
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }

    return vocabulary.map(word => wordCounts.get(word) ?? 0);
  }
}
