/**
 * Scaled Neural Learning Layer
 * 
 * Enhanced version with:
 * - Larger embedding dimensions (512D default, configurable up to 2048D)
 * - Multi-layer neural network for concept learning
 * - Attention mechanism for feature weighting
 * - Hierarchical concept formation
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Experience tuple for learning */
export interface ScaledExperience {
  readonly experienceId: string;
  readonly timestampMs: number;
  readonly input: string;
  readonly context: Record<string, unknown>;
  readonly action: string;
  readonly outcome: {
    success: boolean;
    result?: unknown;
    unexpected?: boolean;
    reward?: number; // Numeric reward signal
  };
  readonly feedback?: number;
  readonly metadata?: {
    source?: string;
    importance?: number;
    tags?: string[];
  };
}

/** Learned embedding vector - high dimensional */
export type ScaledEmbedding = Float32Array;

/** Hierarchical concept */
export interface HierarchicalConcept {
  readonly conceptId: string;
  readonly name: string;
  readonly level: 'instance' | 'concept' | 'category' | 'abstraction';
  readonly parentId?: string;
  readonly children: string[];
  readonly centroid: ScaledEmbedding;
  readonly memberExperiences: string[];
  readonly formedAt: number;
  readonly confidence: number;
  readonly activationCount: number;
  readonly prototypicalExample?: ScaledExperience;
  readonly featureWeights: Map<string, number>; // Attention weights
}

/** Causal relationship with strength and context */
export interface ScaledCausalLink {
  readonly linkId: string;
  readonly cause: string;
  readonly effect: string;
  readonly strength: number;
  readonly support: number;
  readonly contexts: string[]; // Situations where this holds
  readonly discoveredAt: number;
  readonly lastUpdated: number;
}

/** Attention head - what features to focus on */
interface AttentionHead {
  readonly query: Float32Array;
  readonly key: Float32Array;
  readonly value: Float32Array;
}

/** Neural network layer */
interface NeuralLayer {
  weights: Float32Array[];
  bias: Float32Array;
  activation: 'relu' | 'sigmoid' | 'tanh';
}

/** Configuration for scaled embedding network */
export interface ScaledEmbeddingNetworkConfig {
  readonly embeddingDim: number; // 128-2048
  readonly numLayers: number; // 2-8
  readonly numAttentionHeads: number; // 2-16
  readonly learningRate: number;
  readonly conceptFormationThreshold: number;
  readonly maxConcepts: number;
  readonly hierarchyDepth: number; // 2-4
  readonly baseDir: string;
}

/**
 * Scaled neural embedding network with multi-layer architecture
 */
export class ScaledEmbeddingNetwork {
  private config: Required<ScaledEmbeddingNetworkConfig>;
  private embeddings: Map<string, ScaledEmbedding> = new Map();
  private experiences: ScaledExperience[] = [];
  private concepts: Map<string, HierarchicalConcept> = new Map();
  private causalLinks: Map<string, ScaledCausalLink> = new Map();

  // Neural network layers
  private layers: NeuralLayer[] = [];
  private attentionHeads: AttentionHead[] = [];

  // Feature vocabulary
  private featureVocab: Map<string, number> = new Map();
  private nextFeatureId = 0;

  private initialized = false;

  constructor(config: Partial<ScaledEmbeddingNetworkConfig> = {}) {
    this.config = {
      embeddingDim: config.embeddingDim ?? 512,
      numLayers: config.numLayers ?? 4,
      numAttentionHeads: config.numAttentionHeads ?? 8,
      learningRate: config.learningRate ?? 0.01,
      conceptFormationThreshold: config.conceptFormationThreshold ?? 0.6,
      maxConcepts: config.maxConcepts ?? 500,
      hierarchyDepth: config.hierarchyDepth ?? 3,
      baseDir: config.baseDir ?? '.synth/v2/neural-scaled',
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });

    // Initialize neural network layers
    this.initializeNeuralNetwork();

    await this.loadState();
    this.initialized = true;
  }

  /**
   * Learn from a new experience with full neural processing
   */
  async learn(experience: ScaledExperience): Promise<{
    embedding: ScaledEmbedding;
    conceptsActivated: string[];
    newConceptsFormed: string[];
    causalLinksDiscovered: string[];
    attentionWeights: Map<string, number>;
  }> {
    await this.initialize();

    // Store experience
    this.experiences.push(experience);

    // Extract features and get feature IDs
    const features = this.extractFeatures(experience);

    // Compute embedding through neural network
    const embedding = this.computeEmbeddingNeural(features);
    this.embeddings.set(experience.experienceId, embedding);

    // Apply attention mechanism
    const attentionWeights = this.computeAttention(features, embedding);

    // Find activated concepts (with attention-weighted similarity)
    const conceptsActivated = this.findActivatedConcepts(embedding, attentionWeights);

    // Potentially form new concepts at appropriate hierarchy level
    const newConceptsFormed = await this.formHierarchicalConcept(
      experience,
      embedding,
      attentionWeights,
      conceptsActivated
    );

    // Update existing concept centroids with attention weighting
    for (const conceptId of conceptsActivated) {
      await this.updateConceptWithAttention(conceptId, embedding, attentionWeights, experience.experienceId);
    }

    // Discover causal links
    const causalLinksDiscovered = await this.discoverCausalLinksEnhanced(experience, embedding);

    // Periodically save state
    if (this.experiences.length % 10 === 0) {
      await this.saveState();
    }

    return {
      embedding,
      conceptsActivated,
      newConceptsFormed,
      causalLinksDiscovered,
      attentionWeights,
    };
  }

  /**
   * Predict outcome using learned model
   */
  predict(
    input: string,
    action: string,
    context: Record<string, unknown>
  ): {
    predictedSuccess: number;
    predictedConcepts: string[];
    relevantCauses: string[];
    confidence: number;
    attentionFocus: string[];
  } {
    const features = this.extractFeatures({ input, action, context } as ScaledExperience);
    const embedding = this.computeEmbeddingNeural(features);
    const attentionWeights = this.computeAttention(features, embedding);

    // Find similar past experiences
    const similar = this.findSimilarExperiences(embedding, 10);

    // Predict success rate
    const successCount = similar.filter(s => s.experience.outcome.success).length;
    const predictedSuccess = similar.length > 0 ? successCount / similar.length : 0.5;

    // Predict which concepts will be activated
    const predictedConcepts = this.findActivatedConcepts(embedding, attentionWeights);

    // Find relevant causal links
    const relevantCauses = this.findRelevantCauses(action, context);

    // Get top attention focuses
    const attentionFocus = Array.from(attentionWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([feature]) => feature);

    // Confidence based on similarity density
    const avgSimilarity = similar.length > 0
      ? similar.reduce((sum, s) => sum + s.similarity, 0) / similar.length
      : 0.3;

    return {
      predictedSuccess,
      predictedConcepts,
      relevantCauses,
      confidence: avgSimilarity,
      attentionFocus,
    };
  }

  /**
   * Get concept hierarchy
   */
  getConceptHierarchy(rootId?: string): {
    concept: HierarchicalConcept;
    children: Array<{ concept: HierarchicalConcept; children: unknown[] }>;
  } | null {
    if (rootId) {
      const root = this.concepts.get(rootId);
      if (!root) return null;
      return this.buildHierarchy(root);
    }

    // Find top-level concepts (no parent)
    const topLevel = Array.from(this.concepts.values())
      .filter(c => !c.parentId && c.level === 'category');

    if (topLevel.length === 0) return null;

    // Return the most activated top-level concept
    const mostActive = topLevel.sort((a, b) => b.activationCount - a.activationCount)[0];
    return this.buildHierarchy(mostActive);
  }

  /**
   * Get learned concepts
   */
  getConcepts(options?: {
    level?: HierarchicalConcept['level'];
    minConfidence?: number;
    minActivations?: number;
  }): HierarchicalConcept[] {
    let concepts = Array.from(this.concepts.values());

    if (options?.level) {
      concepts = concepts.filter(c => c.level === options.level);
    }
    if (options && options.minConfidence !== undefined) {
      concepts = concepts.filter(c => c.confidence >= options.minConfidence!);
    }
    if (options && options.minActivations !== undefined) {
      concepts = concepts.filter(c => c.activationCount >= options.minActivations!);
    }

    return concepts.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get causal links
   */
  getCausalLinks(options?: {
    minStrength?: number;
    cause?: string;
    effect?: string;
  }): ScaledCausalLink[] {
    let links = Array.from(this.causalLinks.values());

    if (options && options.minStrength !== undefined) {
      links = links.filter(l => l.strength >= options.minStrength!);
    }
    if (options?.cause) {
      links = links.filter(l => l.cause === options.cause);
    }
    if (options?.effect) {
      links = links.filter(l => l.effect === options.effect);
    }

    return links.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Get statistics
   */
  getStats(): {
    experienceCount: number;
    conceptCount: number;
    conceptByLevel: Record<HierarchicalConcept['level'], number>;
    causalLinkCount: number;
    embeddingDim: number;
    featureVocabSize: number;
  } {
    const byLevel: Record<HierarchicalConcept['level'], number> = {
      instance: 0,
      concept: 0,
      category: 0,
      abstraction: 0,
    };

    for (const concept of this.concepts.values()) {
      byLevel[concept.level]++;
    }

    return {
      experienceCount: this.experiences.length,
      conceptCount: this.concepts.size,
      conceptByLevel: byLevel,
      causalLinkCount: this.causalLinks.size,
      embeddingDim: this.config.embeddingDim,
      featureVocabSize: this.featureVocab.size,
    };
  }

  // Private methods

  private initializeNeuralNetwork(): void {
    const dims = this.config.embeddingDim;

    // Initialize layers with Xavier initialization
    for (let i = 0; i < this.config.numLayers; i++) {
      const layerSize = Math.floor(dims * Math.pow(0.8, i)); // Decreasing size
      const layer: NeuralLayer = {
        weights: Array(layerSize).fill(0).map(() =>
          this.randomNormal(dims, Math.sqrt(2 / (dims + layerSize)))
        ),
        bias: new Float32Array(layerSize).fill(0),
        activation: i < this.config.numLayers - 1 ? 'relu' : 'tanh',
      };
      this.layers.push(layer);
    }

    // Initialize attention heads
    for (let i = 0; i < this.config.numAttentionHeads; i++) {
      this.attentionHeads.push({
        query: this.randomNormal(dims, 0.02),
        key: this.randomNormal(dims, 0.02),
        value: this.randomNormal(dims, 0.02),
      });
    }
  }

  private extractFeatures(experience: Partial<ScaledExperience>): Map<string, number> {
    const features = new Map<string, number>();

    // Input features (n-grams)
    if (experience.input) {
      const tokens = this.tokenize(experience.input);
      for (let n = 1; n <= 3; n++) {
        for (let i = 0; i <= tokens.length - n; i++) {
          const ngram = tokens.slice(i, i + n).join('_');
          features.set(`in_${n}gram_${ngram}`, (features.get(`in_${n}gram_${ngram}`) ?? 0) + 1);
        }
      }
    }

    // Action features
    if (experience.action) {
      features.set(`act_${experience.action}`, 1);
    }

    // Context features
    if (experience.context) {
      for (const [key, value] of Object.entries(experience.context)) {
        const strValue = String(value).toLowerCase().slice(0, 50);
        features.set(`ctx_${key}_${strValue}`, 1);
      }
    }

    // Outcome features
    if (experience.outcome) {
      features.set(`out_success`, experience.outcome.success ? 1 : 0);
      features.set(`out_unexpected`, experience.outcome.unexpected ? 1 : 0);
      if (experience.outcome.reward !== undefined) {
        features.set(`out_reward`, experience.outcome.reward);
      }
    }

    // Metadata features
    if (experience.metadata?.tags) {
      for (const tag of experience.metadata.tags) {
        features.set(`tag_${tag}`, 1);
      }
    }

    return features;
  }

  private computeEmbeddingNeural(features: Map<string, number>): ScaledEmbedding {
    // Convert features to initial embedding using hash trick
    const embedding = new Float32Array(this.config.embeddingDim).fill(0);

    for (const [feature, value] of features) {
      const featureId = this.getOrCreateFeatureId(feature);
      const hash = this.hashFeature(feature, featureId);

      for (let i = 0; i < this.config.embeddingDim; i++) {
        const index = (hash + i * featureId) % this.config.embeddingDim;
        embedding[index] += value * (i % 2 === 0 ? 1 : -1) * 0.1;
      }
    }

    // Pass through neural network layers
    let current = embedding;
    for (const layer of this.layers) {
      current = this.applyLayer(current, layer) as any;
    }

    // Normalize
    const norm = Math.sqrt(current.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < current.length; i++) {
        current[i] /= norm;
      }
    }

    return current as unknown as ScaledEmbedding;
  }

  private computeAttention(features: Map<string, number>, embedding: ScaledEmbedding): Map<string, number> {
    const weights = new Map<string, number>();

    // Compute attention for each feature
    for (const [feature, value] of features) {
      let totalAttention = 0;

      for (const head of this.attentionHeads) {
        const query = this.dotProduct(embedding, head.query);
        const featureId = this.getOrCreateFeatureId(feature);
        const keyValue = this.hashToVector(featureId, this.config.embeddingDim);
        const key = this.dotProduct(keyValue, head.key);

        // Attention score
        const score = Math.tanh(query + key) * value;
        totalAttention += Math.abs(score);
      }

      weights.set(feature, totalAttention / this.config.numAttentionHeads);
    }

    // Normalize weights
    const maxWeight = Math.max(...weights.values(), 1);
    for (const [feature, weight] of weights) {
      weights.set(feature, weight / maxWeight);
    }

    return weights;
  }

  private async formHierarchicalConcept(
    experience: ScaledExperience,
    embedding: ScaledEmbedding,
    attentionWeights: Map<string, number>,
    activatedConcepts: string[]
  ): Promise<string[]> {
    const newConcepts: string[] = [];

    // Check if we should form a new concept
    if (this.concepts.size >= this.config.maxConcepts) {
      return newConcepts;
    }

    // Determine appropriate hierarchy level
    let level: HierarchicalConcept['level'] = 'concept';
    let parentId: string | undefined;

    if (activatedConcepts.length === 0) {
      // No similar concepts - form new concept
      level = 'concept';
    } else if (activatedConcepts.length === 1) {
      // One similar concept - could be instance or child
      const similar = this.concepts.get(activatedConcepts[0]);
      if (similar && similar.level === 'concept') {
        level = 'instance';
        parentId = similar.conceptId;
      }
    } else {
      // Multiple similar concepts - could form category
      const categories = activatedConcepts
        .map(id => this.concepts.get(id))
        .filter(c => c?.level === 'concept');

      if (categories.length >= 2 && this.config.hierarchyDepth >= 3) {
        level = 'category';
        // Find common parent or create new category
      }
    }

    // Form the concept
    const conceptId = `concept-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const name = this.generateConceptName(experience, attentionWeights);

    const concept: HierarchicalConcept = {
      conceptId,
      name,
      level,
      parentId,
      children: [],
      centroid: Float32Array.from(embedding),
      memberExperiences: [experience.experienceId],
      formedAt: Date.now(),
      confidence: 0.5,
      activationCount: 1,
      prototypicalExample: experience,
      featureWeights: new Map(attentionWeights),
    };

    this.concepts.set(conceptId, concept);

    // Update parent if exists
    if (parentId) {
      const parent = this.concepts.get(parentId);
      if (parent) {
        parent.children.push(conceptId);
      }
    }

    newConcepts.push(conceptId);
    console.log(`[ScaledNeural] Formed ${level} concept: ${name} (${conceptId})`);

    return newConcepts;
  }

  private findActivatedConcepts(
    embedding: ScaledEmbedding,
    attentionWeights: Map<string, number>
  ): string[] {
    const activated: string[] = [];

    for (const [conceptId, concept] of this.concepts) {
      // Attention-weighted similarity
      const similarity = this.computeAttentionWeightedSimilarity(
        embedding,
        concept.centroid,
        attentionWeights,
        concept.featureWeights
      );

      if (similarity > this.config.conceptFormationThreshold) {
        activated.push(conceptId);

        // Update activation count
        this.concepts.set(conceptId, {
          ...concept,
          activationCount: concept.activationCount + 1,
        });
      }
    }

    return activated;
  }

  private async updateConceptWithAttention(
    conceptId: string,
    embedding: ScaledEmbedding,
    attentionWeights: Map<string, number>,
    experienceId: string
  ): Promise<void> {
    const concept = this.concepts.get(conceptId);
    if (!concept) return;

    const n = concept.memberExperiences.length;

    // Attention-weighted centroid update
    const newCentroid = new Float32Array(this.config.embeddingDim);
    for (let i = 0; i < this.config.embeddingDim; i++) {
      const attentionFactor = this.getAverageAttentionForDimension(i, attentionWeights);
      newCentroid[i] = (concept.centroid[i] * n + embedding[i] * attentionFactor) / (n + attentionFactor);
    }

    // Merge feature weights
    const mergedWeights = new Map(concept.featureWeights);
    for (const [feature, weight] of attentionWeights) {
      const existing = mergedWeights.get(feature) ?? 0;
      mergedWeights.set(feature, (existing * n + weight) / (n + 1));
    }

    this.concepts.set(conceptId, {
      ...concept,
      centroid: newCentroid,
      memberExperiences: [...concept.memberExperiences, experienceId],
      confidence: Math.min(0.99, concept.confidence + 0.02),
      featureWeights: mergedWeights,
    });
  }

  private async discoverCausalLinksEnhanced(
    experience: ScaledExperience,
    embedding: ScaledEmbedding
  ): Promise<string[]> {
    const discovered: string[] = [];

    // Look at recent experiences with similar embeddings
    const recentExperiences = this.experiences.slice(-50);

    for (const other of recentExperiences) {
      if (other.experienceId === experience.experienceId) continue;

      const otherEmbedding = this.embeddings.get(other.experienceId);
      if (!otherEmbedding) continue;

      const similarity = this.cosineSimilarity(embedding, otherEmbedding);

      if (similarity > 0.7) {
        // Similar context - check if same action → same outcome
        if (other.action === experience.action) {
          if (other.outcome.success === experience.outcome.success) {
            const linkId = await this.addOrStrengthenCausalLink(
              experience.action,
              experience.outcome.success ? 'success' : 'failure',
              similarity
            );
            discovered.push(linkId);
          }
        }

        // Check for intervention patterns (different action → different outcome)
        if (other.action !== experience.action &&
          other.outcome.success !== experience.outcome.success) {
          const linkId = await this.addOrStrengthenCausalLink(
            `${experience.action}_vs_${other.action}`,
            experience.outcome.success ? 'success' : 'failure',
            similarity * 0.5
          );
          discovered.push(linkId);
        }
      }
    }

    return discovered;
  }

  private async addOrStrengthenCausalLink(
    cause: string,
    effect: string,
    confidence: number
  ): Promise<string> {
    const linkId = `causal-${this.hashString(`${cause}->${effect}`).toString(16).slice(0, 16)}`;

    const existing = this.causalLinks.get(linkId);
    if (existing) {
      // Strengthen with exponential moving average
      const alpha = 0.1;
      const updated: ScaledCausalLink = {
        ...existing,
        strength: existing.strength * (1 - alpha) + confidence * alpha,
        support: existing.support + 1,
        lastUpdated: Date.now(),
      };
      this.causalLinks.set(linkId, updated);
    } else {
      const link: ScaledCausalLink = {
        linkId,
        cause,
        effect,
        strength: confidence * 0.5,
        support: 1,
        contexts: [],
        discoveredAt: Date.now(),
        lastUpdated: Date.now(),
      };
      this.causalLinks.set(linkId, link);
      console.log(`[ScaledNeural] Discovered causal link: ${cause} → ${effect}`);
    }

    return linkId;
  }

  // Helper methods
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private getOrCreateFeatureId(feature: string): number {
    if (!this.featureVocab.has(feature)) {
      this.featureVocab.set(feature, this.nextFeatureId++);
    }
    return this.featureVocab.get(feature)!;
  }

  private hashFeature(feature: string, featureId: number): number {
    return this.hashString(`${feature}:${featureId}`);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private hashToVector(hash: number, dim: number): Float32Array {
    const vec = new Float32Array(dim);
    let h = hash;
    for (let i = 0; i < dim; i++) {
      h = ((h * 1103515245) + 12345) & 0x7fffffff;
      vec[i] = (h / 0x7fffffff) * 2 - 1;
    }
    return vec;
  }

  private randomNormal(dim: number, scale: number): Float32Array {
    const vec = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      // Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      vec[i] = z * scale;
    }
    return vec;
  }

  private applyLayer(input: Float32Array, layer: NeuralLayer): Float32Array {
    const output = new Float32Array(layer.weights.length);

    for (let i = 0; i < layer.weights.length; i++) {
      let sum = layer.bias[i];
      for (let j = 0; j < input.length; j++) {
        sum += input[j] * layer.weights[i][j];
      }

      // Apply activation
      switch (layer.activation) {
        case 'relu':
          output[i] = Math.max(0, sum);
          break;
        case 'sigmoid':
          output[i] = 1 / (1 + Math.exp(-sum));
          break;
        case 'tanh':
          output[i] = Math.tanh(sum);
          break;
        default:
          output[i] = sum;
      }
    }

    return output;
  }

  private dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private computeAttentionWeightedSimilarity(
    a: Float32Array,
    b: Float32Array,
    weightsA: Map<string, number>,
    weightsB: Map<string, number>
  ): number {
    // Combine attention weights
    const combinedWeight = Math.min(
      1,
      (Array.from(weightsA.values()).reduce((s, w) => s + w, 0) / weightsA.size) +
      (Array.from(weightsB.values()).reduce((s, w) => s + w, 0) / weightsB.size)
    ) / 2;

    return this.cosineSimilarity(a, b) * combinedWeight;
  }

  private getAverageAttentionForDimension(dim: number, weights: Map<string, number>): number {
    if (weights.size === 0) return 1;
    return Array.from(weights.values()).reduce((s, w) => s + w, 0) / weights.size;
  }

  private findSimilarExperiences(embedding: ScaledEmbedding, topK: number): Array<{
    experience: ScaledExperience;
    similarity: number;
  }> {
    return this.experiences
      .map(e => {
        const emb = this.embeddings.get(e.experienceId);
        return {
          experience: e,
          similarity: emb ? this.cosineSimilarity(embedding, emb) : 0,
        };
      })
      .filter(s => s.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private findRelevantCauses(action: string, context: Record<string, unknown>): string[] {
    return Array.from(this.causalLinks.values())
      .filter(l => l.cause === action || l.cause.includes(action))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5)
      .map(l => l.effect);
  }

  private buildHierarchy(concept: HierarchicalConcept): {
    concept: HierarchicalConcept;
    children: Array<{ concept: HierarchicalConcept; children: unknown[] }>;
  } {
    const children = concept.children
      .map(id => this.concepts.get(id))
      .filter((c): c is HierarchicalConcept => c !== undefined)
      .map(c => this.buildHierarchy(c));

    return { concept, children };
  }

  private generateConceptName(
    experience: ScaledExperience,
    attentionWeights: Map<string, number>
  ): string {
    // Use highest-attention features for name
    const topFeatures = Array.from(attentionWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([f]) => f.replace(/^(in_|act_|ctx_)/, ''));

    if (topFeatures.length > 0) {
      return topFeatures.join('_');
    }
    return `concept_${experience.action}`;
  }

  private async saveState(): Promise<void> {
    const state = {
      embeddings: Array.from(this.embeddings.entries()).map(([k, v]) => [k, Array.from(v)]),
      experiences: this.experiences,
      concepts: Array.from(this.concepts.entries()),
      causalLinks: Array.from(this.causalLinks.entries()),
      featureVocab: Array.from(this.featureVocab.entries()),
      nextFeatureId: this.nextFeatureId,
    };
    await writeFile(
      join(this.config.baseDir, 'scaled-network-state.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'scaled-network-state.json'), 'utf-8');
      const state = JSON.parse(data);
      this.embeddings = new Map(state.embeddings.map(([k, v]: [string, number[]]) => [k, new Float32Array(v)]));
      this.experiences = state.experiences;
      this.concepts = new Map(state.concepts);
      this.causalLinks = new Map(state.causalLinks);
      this.featureVocab = new Map(state.featureVocab);
      this.nextFeatureId = state.nextFeatureId || 0;
    } catch {
      // No state to load
    }
  }
}
