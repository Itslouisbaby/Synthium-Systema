/**
 * Neural Learning Layer - Part 1: Embedding Network
 * 
 * Learns distributed representations from experiences.
 * Unlike static concept patterns, this network learns from outcomes.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Experience tuple for learning */
export interface Experience {
  readonly experienceId: string;
  readonly timestampMs: number;
  readonly input: string;
  readonly context: Record<string, unknown>;
  readonly action: string;
  readonly outcome: {
    success: boolean;
    result?: unknown;
    unexpected?: boolean;
  };
  readonly feedback?: number; // -1 to 1
}

/** Learned embedding vector */
export type Embedding = number[];

/** Concept formed through clustering */
export interface LearnedConcept {
  readonly conceptId: string;
  readonly name: string;
  readonly centroid: Embedding;
  readonly memberExperiences: string[];
  readonly formedAt: number;
  readonly confidence: number;
  readonly prototypicalExample?: Experience;
}

/** Causal relationship discovered */
export interface CausalLink {
  readonly linkId: string;
  readonly cause: string; // concept or action
  readonly effect: string; // concept or outcome
  readonly strength: number; // 0-1
  readonly support: number; // number of supporting observations
  readonly discoveredAt: number;
}

/** Configuration for embedding network */
export interface EmbeddingNetworkConfig {
  readonly embeddingDim: number;
  readonly learningRate: number;
  readonly conceptFormationThreshold: number;
  readonly maxConcepts: number;
  readonly baseDir: string;
}

/** 
 * Simple neural embedding network
 * Uses online learning to update representations
 */
export class EmbeddingNetwork {
  private config: Required<EmbeddingNetworkConfig>;
  private embeddings: Map<string, Embedding> = new Map();
  private experiences: Experience[] = [];
  private learnedConcepts: Map<string, LearnedConcept> = new Map();
  private causalLinks: Map<string, CausalLink> = new Map();
  private initialized = false;

  constructor(config: Partial<EmbeddingNetworkConfig> = {}) {
    this.config = {
      embeddingDim: config.embeddingDim ?? 64,
      learningRate: config.learningRate ?? 0.1,
      conceptFormationThreshold: config.conceptFormationThreshold ?? 0.7,
      maxConcepts: config.maxConcepts ?? 100,
      baseDir: config.baseDir ?? '.synth/v2/neural',
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    this.initialized = true;
  }

  /**
   * Learn from a new experience
   * Updates embeddings and potentially forms new concepts
   */
  async learn(experience: Experience): Promise<{
    embedding: Embedding;
    conceptsActivated: string[];
    newConceptFormed?: string;
    causalLinksDiscovered: string[];
  }> {
    await this.initialize();

    // Store experience
    this.experiences.push(experience);

    // Create or update embedding for this experience
    const embedding = this.computeEmbedding(experience);
    this.embeddings.set(experience.experienceId, embedding);

    // Find activated concepts (similarity to existing concepts)
    const conceptsActivated = this.findActivatedConcepts(embedding);

    // Potentially form new concept
    let newConceptFormed: string | undefined;
    if (conceptsActivated.length === 0 || this.shouldFormNewConcept(embedding)) {
      newConceptFormed = await this.formConcept(experience, embedding);
    }

    // Update existing concept centroids
    for (const conceptId of conceptsActivated) {
      await this.updateConceptCentroid(conceptId, embedding, experience.experienceId);
    }

    // Discover causal links
    const causalLinksDiscovered = await this.discoverCausalLinks(experience);

    // Periodically save state
    if (this.experiences.length % 10 === 0) {
      await this.saveState();
    }

    return {
      embedding,
      conceptsActivated,
      newConceptFormed,
      causalLinksDiscovered,
    };
  }

  /**
   * Compute embedding for an experience
   * Uses simple bag-of-words + context features
   */
  private computeEmbedding(experience: Experience): Embedding {
    // Extract features from input
    const inputTokens = this.tokenize(experience.input);
    const actionTokens = this.tokenize(experience.action);
    
    // Create feature vector
    const features = new Map<string, number>();
    
    // Input features
    for (const token of inputTokens) {
      features.set(`input:${token}`, (features.get(`input:${token}`) ?? 0) + 1);
    }
    
    // Action features
    for (const token of actionTokens) {
      features.set(`action:${token}`, (features.get(`action:${token}`) ?? 0) + 1);
    }
    
    // Context features
    for (const [key, value] of Object.entries(experience.context)) {
      const strValue = String(value).toLowerCase();
      features.set(`ctx:${key}:${strValue}`, 1);
    }
    
    // Outcome features
    features.set(`outcome:success`, experience.outcome.success ? 1 : 0);
    features.set(`outcome:unexpected`, experience.outcome.unexpected ? 1 : 0);
    
    // Convert to fixed-size embedding using hash trick
    const embedding: Embedding = new Array(this.config.embeddingDim).fill(0);
    
    for (const [feature, value] of features) {
      const hash = this.hashFeature(feature);
      for (let i = 0; i < this.config.embeddingDim; i++) {
        const index = (hash + i) % this.config.embeddingDim;
        embedding[index] += value * (i % 2 === 0 ? 1 : -1);
      }
    }
    
    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      return embedding.map(v => v / norm);
    }
    return embedding;
  }

  /**
   * Find concepts activated by an embedding
   */
  private findActivatedConcepts(embedding: Embedding): string[] {
    const activated: string[] = [];
    
    for (const [conceptId, concept] of this.learnedConcepts) {
      const similarity = this.cosineSimilarity(embedding, concept.centroid);
      if (similarity > this.config.conceptFormationThreshold) {
        activated.push(conceptId);
      }
    }
    
    return activated;
  }

  /**
   * Decide whether to form a new concept
   */
  private shouldFormNewConcept(embedding: Embedding): boolean {
    // Don't form too many concepts
    if (this.learnedConcepts.size >= this.config.maxConcepts) {
      return false;
    }
    
    // Check if embedding is far from all existing concepts
    let maxSimilarity = 0;
    for (const concept of this.learnedConcepts.values()) {
      const sim = this.cosineSimilarity(embedding, concept.centroid);
      maxSimilarity = Math.max(maxSimilarity, sim);
    }
    
    // If sufficiently different from all concepts, form new one
    return maxSimilarity < 0.5;
  }

  /**
   * Form a new concept from an experience
   */
  private async formConcept(experience: Experience, embedding: Embedding): Promise<string> {
    const conceptId = `concept-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    
    // Generate name from input keywords
    const tokens = this.tokenize(experience.input);
    const name = this.generateConceptName(tokens, experience.action);
    
    const concept: LearnedConcept = {
      conceptId,
      name,
      centroid: [...embedding], // Copy embedding as initial centroid
      memberExperiences: [experience.experienceId],
      formedAt: Date.now(),
      confidence: 0.5, // Initial confidence
      prototypicalExample: experience,
    };
    
    this.learnedConcepts.set(conceptId, concept);
    
    console.log(`[NeuralLearning] Formed new concept: ${name} (${conceptId})`);
    
    return conceptId;
  }

  /**
   * Update concept centroid with new member
   */
  private async updateConceptCentroid(
    conceptId: string, 
    embedding: Embedding,
    experienceId: string
  ): Promise<void> {
    const concept = this.learnedConcepts.get(conceptId);
    if (!concept) return;
    
    // Online mean update
    const n = concept.memberExperiences.length;
    const newCentroid = concept.centroid.map((c, i) => 
      (c * n + embedding[i]) / (n + 1)
    );
    
    // Update in place (we're modifying the stored concept)
    const updatedConcept: LearnedConcept = {
      ...concept,
      centroid: newCentroid,
      memberExperiences: [...concept.memberExperiences, experienceId],
      confidence: Math.min(0.95, concept.confidence + 0.05),
    };
    
    this.learnedConcepts.set(conceptId, updatedConcept);
  }

  /**
   * Discover causal links from an experience
   */
  private async discoverCausalLinks(experience: Experience): Promise<string[]> {
    const discovered: string[] = [];
    
    // Look for patterns in recent experiences
    const recentExperiences = this.experiences.slice(-20);
    
    // Find experiences with similar contexts but different actions
    const similarContext = recentExperiences.filter(e => 
      e.experienceId !== experience.experienceId &&
      this.contextSimilarity(e.context, experience.context) > 0.7
    );
    
    for (const similar of similarContext) {
      // If same action → similar outcome, strengthen causal link
      if (similar.action === experience.action) {
        const cause = this.extractCause(experience);
        const effect = this.extractEffect(experience);
        
        if (cause && effect) {
          const linkId = await this.addOrStrengthenCausalLink(cause, effect);
          discovered.push(linkId);
        }
      }
      
      // If different action → different outcome, potential causal difference
      if (similar.action !== experience.action && 
          similar.outcome.success !== experience.outcome.success) {
        const cause = this.extractCause(experience);
        const effect = experience.outcome.success ? 'success' : 'failure';
        
        if (cause) {
          const linkId = await this.addOrStrengthenCausalLink(cause, effect);
          discovered.push(linkId);
        }
      }
    }
    
    return discovered;
  }

  /**
   * Add or strengthen a causal link
   */
  private async addOrStrengthenCausalLink(cause: string, effect: string): Promise<string> {
    const linkId = createHash('sha256').update(`${cause}->${effect}`).digest('hex').slice(0, 16);
    
    const existing = this.causalLinks.get(linkId);
    if (existing) {
      // Strengthen existing link
      const updated: CausalLink = {
        ...existing,
        strength: Math.min(1, existing.strength + 0.1),
        support: existing.support + 1,
      };
      this.causalLinks.set(linkId, updated);
    } else {
      // Create new link
      const link: CausalLink = {
        linkId,
        cause,
        effect,
        strength: 0.3, // Initial strength
        support: 1,
        discoveredAt: Date.now(),
      };
      this.causalLinks.set(linkId, link);
      console.log(`[NeuralLearning] Discovered causal link: ${cause} → ${effect}`);
    }
    
    return linkId;
  }

  /**
   * Predict outcome for a hypothetical action
   */
  predict(input: string, action: string, context: Record<string, unknown>): {
    predictedSuccess: number;
    predictedConcepts: string[];
    relevantCauses: string[];
  } {
    const hypothetical: Experience = {
      experienceId: 'hypothetical',
      timestampMs: Date.now(),
      input,
      context,
      action,
      outcome: { success: true }, // Placeholder
    };
    
    const embedding = this.computeEmbedding(hypothetical);
    
    // Find similar past experiences
    const similar = this.experiences
      .map(e => ({
        experience: e,
        similarity: this.cosineSimilarity(embedding, this.embeddings.get(e.experienceId) || embedding),
      }))
      .filter(s => s.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
    
    // Predict success rate
    const successCount = similar.filter(s => s.experience.outcome.success).length;
    const predictedSuccess = similar.length > 0 ? successCount / similar.length : 0.5;
    
    // Predict which concepts will be activated
    const predictedConcepts = this.findActivatedConcepts(embedding);
    
    // Find relevant causal links
    const cause = this.extractCause(hypothetical);
    const relevantCauses = cause 
      ? Array.from(this.causalLinks.values())
          .filter(l => l.cause === cause)
          .map(l => l.effect)
      : [];
    
    return {
      predictedSuccess,
      predictedConcepts,
      relevantCauses,
    };
  }

  /**
   * Get learned concepts
   */
  getConcepts(): LearnedConcept[] {
    return Array.from(this.learnedConcepts.values());
  }

  /**
   * Get causal links
   */
  getCausalLinks(): CausalLink[] {
    return Array.from(this.causalLinks.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    experienceCount: number;
    conceptCount: number;
    causalLinkCount: number;
  } {
    return {
      experienceCount: this.experiences.length,
      conceptCount: this.learnedConcepts.size,
      causalLinkCount: this.causalLinks.size,
    };
  }

  // Helper methods
  private tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2);
  }

  private hashFeature(feature: string): number {
    const hash = createHash('sha256').update(feature).digest('hex');
    return parseInt(hash.slice(0, 8), 16);
  }

  private cosineSimilarity(a: Embedding, b: Embedding): number {
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

  private contextSimilarity(a: Record<string, unknown>, b: Record<string, unknown>): number {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let matches = 0;
    for (const key of keys) {
      if (JSON.stringify(a[key]) === JSON.stringify(b[key])) {
        matches++;
      }
    }
    return keys.size > 0 ? matches / keys.size : 0;
  }

  private generateConceptName(tokens: string[], action: string): string {
    // Extract meaningful keywords
    const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that']);
    const keywords = tokens.filter(t => !stopWords.has(t)).slice(0, 3);
    
    if (keywords.length > 0) {
      return keywords.join('_');
    }
    return `concept_${action}`;
  }

  private extractCause(experience: Experience): string | null {
    // Simple extraction: use action as cause
    return experience.action;
  }

  private extractEffect(experience: Experience): string | null {
    // Simple extraction: use outcome type
    if (experience.outcome.unexpected) return 'unexpected';
    return experience.outcome.success ? 'success' : 'failure';
  }

  private async saveState(): Promise<void> {
    const state = {
      embeddings: Array.from(this.embeddings.entries()),
      experiences: this.experiences,
      concepts: Array.from(this.learnedConcepts.entries()),
      causalLinks: Array.from(this.causalLinks.entries()),
    };
    await writeFile(
      join(this.config.baseDir, 'network-state.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'network-state.json'), 'utf-8');
      const state = JSON.parse(data);
      this.embeddings = new Map(state.embeddings);
      this.experiences = state.experiences;
      this.learnedConcepts = new Map(state.concepts);
      this.causalLinks = new Map(state.causalLinks);
    } catch {
      // No state to load
    }
  }
}
