/**
 * Continuous Pre-Training System
 * 
 * Enables the system to learn from every interaction, accumulating knowledge
 * and refining understanding over time. This bridges the gap between
 * static models and true continuous learning.
 * 
 * Key capabilities:
 * - Online learning from every signal/interaction
 * - Experience replay for stable training
 * - Knowledge accumulation with temporal decay
 * - Self-supervised learning objectives
 * - Catastrophic forgetting prevention
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MockLLMProvider, type LLMProvider } from '../llm/llm-provider.js';

/** Configuration for continuous pre-training */
export interface ContinuousPretrainingConfig {
  readonly baseDir: string;
  readonly embeddingDimension: number; // 10000+
  readonly learningRate: number;
  readonly batchSize: number;
  readonly replayBufferSize: number;
  readonly minSamplesBeforeTraining: number;
  readonly trainingIntervalMs: number;
  readonly forgettingPrevention: 'ewc' | 'replay' | 'both';
  readonly ewcLambda: number; // Elastic Weight Consolidation strength
  readonly knowledgeDecayRate: number; // How fast unused knowledge fades
  readonly consolidationIntervalMs: number;
  readonly llm?: LLMProvider;
}

/** A learning experience from interaction */
export interface LearningExperience {
  readonly experienceId: string;
  readonly timestamp: number;
  readonly type: 'signal' | 'interaction' | 'observation' | 'reflection';
  readonly input: string;
  readonly context: string[];
  readonly output?: string;
  readonly feedback?: 'positive' | 'negative' | 'neutral';
  readonly embedding: number[];
  readonly metadata: {
    readonly sessionKey: string;
    readonly signalType?: string;
    readonly loopName?: string;
    readonly uncertaintyLevel: number;
  };
}

/** Knowledge unit accumulated over time */
export interface KnowledgeUnit {
  readonly unitId: string;
  readonly concept: string;
  readonly embedding: number[];
  readonly definition: string;
  readonly examples: string[];
  readonly relatedConcepts: string[];
  readonly confidence: number;
  readonly createdAt: number;
  readonly lastAccessed: number;
  readonly accessCount: number;
  readonly sourceExperiences: string[];
  readonly refinementHistory: Array<{
    readonly timestamp: number;
    readonly change: string;
    readonly confidenceDelta: number;
  }>;
}

/** Training batch from experience replay */
export interface TrainingBatch {
  readonly batchId: string;
  readonly experiences: LearningExperience[];
  readonly targetEmbeddings: number[][];
  readonly lossWeights: number[];
}

/** Model checkpoint for resuming training */
export interface ModelCheckpoint {
  readonly checkpointId: string;
  readonly timestamp: number;
  readonly weights: Float32Array;
  readonly optimizerState: Float32Array;
  readonly fisherInformation?: Float32Array; // For EWC
  readonly trainingStats: {
    readonly totalExperiences: number;
    readonly totalBatches: number;
    readonly averageLoss: number;
  };
}

/** Learning statistics */
export interface LearningStats {
  readonly totalExperiences: number;
  readonly totalKnowledgeUnits: number;
  readonly averageConfidence: number;
  readonly recentLoss: number;
  readonly experiencesPerHour: number;
  readonly knowledgeGrowthRate: number;
  readonly oldestExperience: number;
  readonly newestExperience: number;
}

/**
 * Neural Network Layer for 10K+ dimensional embeddings
 */
class MassiveEmbeddingNetwork {
  private inputDim: number;
  private hiddenDims: number[];
  private outputDim: number;

  // Weights (stored as Float32Array for memory efficiency)
  private weights: Map<string, Float32Array> = new Map();

  // For EWC (Elastic Weight Consolidation)
  private fisherInformation: Map<string, Float32Array> = new Map();
  private optimalWeights: Map<string, Float32Array> = new Map();

  constructor(inputDim: number, hiddenDims: number[], outputDim: number) {
    this.inputDim = inputDim;
    this.hiddenDims = hiddenDims;
    this.outputDim = outputDim;
    this.initializeWeights();
  }

  private initializeWeights(): void {
    // Layer 1: input -> hidden[0]
    this.weights.set('W1', this.xavierInit(this.inputDim * this.hiddenDims[0]));
    this.weights.set('b1', new Float32Array(this.hiddenDims[0]));

    // Hidden layers
    for (let i = 1; i < this.hiddenDims.length; i++) {
      this.weights.set(`W${i + 1}`, this.xavierInit(this.hiddenDims[i - 1] * this.hiddenDims[i]));
      this.weights.set(`b${i + 1}`, new Float32Array(this.hiddenDims[i]));
    }

    // Output layer
    const lastHidden = this.hiddenDims[this.hiddenDims.length - 1];
    this.weights.set(`W${this.hiddenDims.length + 1}`, this.xavierInit(lastHidden * this.outputDim));
    this.weights.set(`b${this.hiddenDims.length + 1}`, new Float32Array(this.outputDim));
  }

  private xavierInit(size: number): Float32Array {
    const arr = new Float32Array(size);
    const scale = Math.sqrt(2.0 / size);
    for (let i = 0; i < size; i++) {
      arr[i] = (Math.random() * 2 - 1) * scale;
    }
    return arr;
  }

  forward(input: Float32Array): Float32Array {
    let current = input;

    // Forward through all layers
    for (let i = 1; i <= this.hiddenDims.length + 1; i++) {
      const W = this.weights.get(`W${i}`)!;
      const b = this.weights.get(`b${i}`)!;
      const outDim = i <= this.hiddenDims.length ? this.hiddenDims[i - 1] : this.outputDim;
      const inDim = i === 1 ? this.inputDim : this.hiddenDims[i - 2];

      const output = new Float32Array(outDim);
      for (let j = 0; j < outDim; j++) {
        let sum = b[j];
        for (let k = 0; k < inDim; k++) {
          sum += current[k] * W[k * outDim + j];
        }
        // GELU activation for hidden layers, linear for output
        output[j] = i <= this.hiddenDims.length ? this.gelu(sum) : sum;
      }
      current = output;
    }

    // L2 normalize output embedding
    return this.normalize(current);
  }

  private gelu(x: number): number {
    // GELU activation: x * Φ(x) where Φ is standard normal CDF
    return x * 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
  }

  private normalize(vec: Float32Array): Float32Array {
    let sum = 0;
    for (const v of vec) sum += v * v;
    const norm = Math.sqrt(sum) + 1e-10;
    return vec.map(v => v / norm);
  }

  computeLoss(prediction: Float32Array, target: Float32Array, weight: number = 1): number {
    // Cosine similarity loss: 1 - cosine_similarity
    let dot = 0, predNorm = 0, targetNorm = 0;
    for (let i = 0; i < prediction.length; i++) {
      dot += prediction[i] * target[i];
      predNorm += prediction[i] * prediction[i];
      targetNorm += target[i] * target[i];
    }
    const cosine = dot / (Math.sqrt(predNorm) * Math.sqrt(targetNorm) + 1e-10);
    return (1 - cosine) * weight;
  }

  backward(input: Float32Array, target: Float32Array, learningRate: number): number {
    // Forward pass to get activations
    const activations: Float32Array[] = [input];
    let current = input;

    for (let i = 1; i <= this.hiddenDims.length + 1; i++) {
      const W = this.weights.get(`W${i}`)!;
      const b = this.weights.get(`b${i}`)!;
      const outDim = i <= this.hiddenDims.length ? this.hiddenDims[i - 1] : this.outputDim;
      const inDim = i === 1 ? this.inputDim : this.hiddenDims[i - 2];

      const output = new Float32Array(outDim);
      for (let j = 0; j < outDim; j++) {
        let sum = b[j];
        for (let k = 0; k < inDim; k++) {
          sum += current[k] * W[k * outDim + j];
        }
        output[j] = i <= this.hiddenDims.length ? this.gelu(sum) : sum;
      }
      activations.push(output);
      current = output;
    }

    const prediction = activations[activations.length - 1];

    // Compute loss
    const loss = this.computeLoss(prediction, target);

    // Backward pass (simplified gradient computation)
    // Output layer gradient
    const outputGrad = new Float32Array(this.outputDim);
    for (let i = 0; i < this.outputDim; i++) {
      outputGrad[i] = 2 * (prediction[i] - target[i]);
    }

    // Update output layer weights
    const lastHidden = activations[activations.length - 2];
    const Wout = this.weights.get(`W${this.hiddenDims.length + 1}`)!;
    const bout = this.weights.get(`b${this.hiddenDims.length + 1}`)!;

    for (let i = 0; i < this.hiddenDims[this.hiddenDims.length - 1]; i++) {
      for (let j = 0; j < this.outputDim; j++) {
        const grad = outputGrad[j] * lastHidden[i];
        const idx = i * this.outputDim + j;
        Wout[idx] -= learningRate * grad;
      }
    }

    for (let j = 0; j < this.outputDim; j++) {
      bout[j] -= learningRate * outputGrad[j];
    }

    return loss;
  }

  // EWC: Compute Fisher Information matrix diagonal
  computeFisher(experiences: LearningExperience[]): void {
    for (const [name, weights] of this.weights) {
      const fisher = new Float32Array(weights.length);

      // Approximate Fisher as squared gradient over experiences
      for (const exp of experiences.slice(0, 100)) { // Sample for efficiency
        const input = new Float32Array(exp.embedding);
        // Simplified: just use weight magnitude as proxy
        for (let i = 0; i < weights.length; i++) {
          fisher[i] += weights[i] * weights[i];
        }
      }

      // Average
      for (let i = 0; i < fisher.length; i++) {
        fisher[i] /= Math.min(experiences.length, 100);
      }

      this.fisherInformation.set(name, fisher);
      this.optimalWeights.set(name, new Float32Array(weights));
    }
  }

  // EWC loss penalty
  computeEWCPenalty(lambda: number): number {
    let penalty = 0;
    for (const [name, weights] of this.weights) {
      const fisher = this.fisherInformation.get(name);
      const optimal = this.optimalWeights.get(name);
      if (!fisher || !optimal) continue;

      for (let i = 0; i < weights.length; i++) {
        penalty += (fisher[i] / 2) * (weights[i] - optimal[i]) ** 2;
      }
    }
    return lambda * penalty;
  }

  getWeights(): Map<string, Float32Array> {
    return new Map(this.weights);
  }

  setWeights(weights: Map<string, Float32Array>): void {
    this.weights = new Map(weights);
  }

  getParameterCount(): number {
    let count = 0;
    for (const [name, weights] of this.weights) {
      count += weights.length;
    }
    return count;
  }
}

/**
 * Continuous Pre-Training System
 */
export class ContinuousPretraining {
  private config: Required<ContinuousPretrainingConfig>;
  private network: MassiveEmbeddingNetwork;
  private experienceBuffer: LearningExperience[] = [];
  private knowledgeBase: Map<string, KnowledgeUnit> = new Map();
  private trainingStats = {
    totalBatches: 0,
    totalExperiences: 0,
    totalLoss: 0,
  };
  private lastTrainingTime = 0;
  private lastConsolidationTime = 0;
  private initialized = false;

  constructor(config: Partial<ContinuousPretrainingConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/pretraining',
      embeddingDimension: config.embeddingDimension ?? 12288, // ~12K dimensions
      learningRate: config.learningRate ?? 0.0001,
      batchSize: config.batchSize ?? 32,
      replayBufferSize: config.replayBufferSize ?? 100000,
      minSamplesBeforeTraining: config.minSamplesBeforeTraining ?? 100,
      trainingIntervalMs: config.trainingIntervalMs ?? 60000, // 1 minute
      forgettingPrevention: config.forgettingPrevention ?? 'both',
      ewcLambda: config.ewcLambda ?? 1000,
      knowledgeDecayRate: config.knowledgeDecayRate ?? 0.001,
      consolidationIntervalMs: config.consolidationIntervalMs ?? 3600000, // 1 hour
      llm: config.llm ?? new MockLLMProvider(config.embeddingDimension ?? 12288),
    };

    // Initialize massive network: 12K -> 8K -> 4K -> 12K
    this.network = new MassiveEmbeddingNetwork(
      this.config.embeddingDimension,
      [8192, 4096], // Hidden layers
      this.config.embeddingDimension
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    this.initialized = true;

    console.log(`[ContinuousPretraining] Initialized`);
    console.log(`  Embedding dimension: ${this.config.embeddingDimension}`);
    console.log(`  Parameters: ${this.network.getParameterCount().toLocaleString()}`);
  }

  /**
   * Process a new experience for learning
   */
  async processExperience(experience: Omit<LearningExperience, 'experienceId'>): Promise<void> {
    const fullExperience: LearningExperience = {
      ...experience,
      experienceId: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    // Add to buffer
    this.experienceBuffer.push(fullExperience);
    this.trainingStats.totalExperiences++;

    // Maintain buffer size
    if (this.experienceBuffer.length > this.config.replayBufferSize) {
      this.experienceBuffer.shift();
    }

    // Extract knowledge from experience
    await this.extractKnowledge(fullExperience);

    // Check if we should train
    await this.maybeTrain();

    // Check if we should consolidate knowledge
    await this.maybeConsolidate();

    await this.saveState();
  }

  /**
   * Extract structured knowledge from an experience
   */
  private async extractKnowledge(experience: LearningExperience): Promise<void> {
    // Simple keyword extraction (in production, use NLP)
    const text = `${experience.input} ${experience.output ?? ''}`;
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .filter(w => !this.isStopWord(w));

    const uniqueWords = [...new Set(words)].slice(0, 10);

    for (const word of uniqueWords) {
      const existing = this.knowledgeBase.get(word);

      if (existing) {
        // Update existing knowledge
        const updated: KnowledgeUnit = {
          ...existing,
          confidence: Math.min(0.99, existing.confidence + 0.01),
          lastAccessed: Date.now(),
          accessCount: existing.accessCount + 1,
          sourceExperiences: [...existing.sourceExperiences, experience.experienceId].slice(-100),
          refinementHistory: [
            ...existing.refinementHistory,
            {
              timestamp: Date.now(),
              change: 'Reinforced from experience',
              confidenceDelta: 0.01,
            },
          ].slice(-50),
        };
        this.knowledgeBase.set(word, updated);
      } else {
        // Create new knowledge unit
        const unit: KnowledgeUnit = {
          unitId: `ku-${Date.now()}-${word}`,
          concept: word,
          embedding: experience.embedding,
          definition: `Learned from: ${experience.input.slice(0, 100)}`,
          examples: [experience.input.slice(0, 200)],
          relatedConcepts: uniqueWords.filter(w => w !== word).slice(0, 5),
          confidence: 0.5,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          accessCount: 1,
          sourceExperiences: [experience.experienceId],
          refinementHistory: [],
        };
        this.knowledgeBase.set(word, unit);
      }
    }
  }

  /**
   * Train on accumulated experiences if conditions are met
   */
  private async maybeTrain(): Promise<void> {
    const now = Date.now();

    // Check conditions
    if (this.experienceBuffer.length < this.config.minSamplesBeforeTraining) return;
    if (now - this.lastTrainingTime < this.config.trainingIntervalMs) return;

    await this.trainStep();
    this.lastTrainingTime = now;
  }

  /**
   * Perform one training step with experience replay
   */
  private async trainStep(): Promise<void> {
    // Sample batch from replay buffer
    const batch = this.sampleBatch();
    if (batch.length === 0) return;

    let totalLoss = 0;

    // Train on each experience
    for (const experience of batch) {
      const input = new Float32Array(experience.embedding);

      // Create target: slightly improved embedding based on feedback
      const target = this.createTarget(experience);

      // Backward pass
      const loss = this.network.backward(input, target, this.config.learningRate);
      totalLoss += loss;

      // Add EWC penalty if enabled
      if (this.config.forgettingPrevention === 'ewc' || this.config.forgettingPrevention === 'both') {
        const ewcPenalty = this.network.computeEWCPenalty(this.config.ewcLambda);
        totalLoss += ewcPenalty;
      }
    }

    const avgLoss = totalLoss / batch.length;
    this.trainingStats.totalBatches++;
    this.trainingStats.totalLoss += avgLoss;

    console.log(`[Training] Batch ${this.trainingStats.totalBatches}, Loss: ${avgLoss.toFixed(6)}, Experiences: ${this.experienceBuffer.length}`);
  }

  /**
   * Sample a batch from replay buffer with prioritization
   */
  private sampleBatch(): LearningExperience[] {
    if (this.experienceBuffer.length < this.config.batchSize) {
      return this.experienceBuffer;
    }

    // Prioritize: high uncertainty, recent, with feedback
    const scored = this.experienceBuffer.map(exp => {
      let score = 1;

      // Prioritize high uncertainty
      score += exp.metadata.uncertaintyLevel * 2;

      // Prioritize recent
      const age = Date.now() - exp.timestamp;
      score += Math.max(0, 1 - age / (24 * 60 * 60 * 1000));

      // Prioritize with feedback
      if (exp.feedback === 'negative') score += 3; // Learn from mistakes
      if (exp.feedback === 'positive') score += 1;

      return { experience: exp, score };
    });

    // Sort by score and sample
    scored.sort((a, b) => b.score - a.score);

    // Take top batchSize with some randomness
    const batch: LearningExperience[] = [];
    for (let i = 0; i < this.config.batchSize && i < scored.length; i++) {
      if (Math.random() < 0.8 || i < this.config.batchSize / 2) {
        batch.push(scored[i].experience);
      }
    }

    return batch;
  }

  /**
   * Create target embedding for training
   */
  private createTarget(experience: LearningExperience): Float32Array {
    const input = new Float32Array(experience.embedding);

    // Forward pass to get current prediction
    const prediction = this.network.forward(input);

    // Adjust target based on feedback
    const target = new Float32Array(prediction);

    if (experience.feedback === 'positive') {
      // Reinforce: move toward input (self-supervised)
      for (let i = 0; i < target.length; i++) {
        target[i] = target[i] * 0.9 + input[i] * 0.1;
      }
    } else if (experience.feedback === 'negative') {
      // Correct: move away from input
      for (let i = 0; i < target.length; i++) {
        target[i] = target[i] * 1.1 - input[i] * 0.1;
      }
    }

    // Normalize
    let norm = 0;
    for (const v of target) norm += v * v;
    norm = Math.sqrt(norm) + 1e-10;
    for (let i = 0; i < target.length; i++) {
      target[i] /= norm;
    }

    return target;
  }

  /**
   * Consolidate and refine knowledge periodically
   */
  private async maybeConsolidate(): Promise<void> {
    const now = Date.now();
    if (now - this.lastConsolidationTime < this.config.consolidationIntervalMs) return;

    await this.consolidateKnowledge();
    this.lastConsolidationTime = now;
  }

  /**
   * Consolidate knowledge: merge similar concepts, decay unused knowledge
   */
  private async consolidateKnowledge(): Promise<void> {
    console.log('[Consolidation] Starting knowledge consolidation...');

    const now = Date.now();
    let merged = 0;
    let decayed = 0;
    let strengthened = 0;

    // Decay unused knowledge
    for (const [concept, unit] of this.knowledgeBase) {
      const timeSinceAccess = now - unit.lastAccessed;
      const daysSinceAccess = timeSinceAccess / (24 * 60 * 60 * 1000);

      // Exponential decay
      const decayFactor = Math.exp(-this.config.knowledgeDecayRate * daysSinceAccess);
      const newConfidence = unit.confidence * decayFactor;

      if (newConfidence < 0.1) {
        // Remove very weak knowledge
        this.knowledgeBase.delete(concept);
        decayed++;
      } else if (newConfidence !== unit.confidence) {
        this.knowledgeBase.set(concept, { ...unit, confidence: newConfidence });
      }
    }

    // Merge similar concepts
    const concepts = Array.from(this.knowledgeBase.values());
    for (let i = 0; i < concepts.length; i++) {
      for (let j = i + 1; j < concepts.length; j++) {
        const similarity = this.cosineSimilarity(concepts[i].embedding, concepts[j].embedding);

        if (similarity > 0.95) {
          // Merge concepts
          const mergedUnit = this.mergeConcepts(concepts[i], concepts[j]);
          this.knowledgeBase.set(mergedUnit.concept, mergedUnit);
          this.knowledgeBase.delete(concepts[j].concept);
          merged++;
        }
      }
    }

    // Strengthen frequently accessed knowledge
    for (const [concept, unit] of this.knowledgeBase) {
      if (unit.accessCount > 10) {
        const strengthenedUnit: KnowledgeUnit = {
          ...unit,
          confidence: Math.min(0.99, unit.confidence + 0.05),
        };
        this.knowledgeBase.set(concept, strengthenedUnit);
        strengthened++;
      }
    }

    console.log(`[Consolidation] Merged: ${merged}, Decayed: ${decayed}, Strengthened: ${strengthened}`);
  }

  /**
   * Merge two similar concepts
   */
  private mergeConcepts(a: KnowledgeUnit, b: KnowledgeUnit): KnowledgeUnit {
    // Average embeddings
    const mergedEmbedding = new Array(a.embedding.length);
    for (let i = 0; i < a.embedding.length; i++) {
      mergedEmbedding[i] = (a.embedding[i] + b.embedding[i]) / 2;
    }

    return {
      unitId: `ku-merged-${Date.now()}`,
      concept: a.concept, // Keep primary concept name
      embedding: mergedEmbedding,
      definition: `${a.definition} | ${b.definition}`,
      examples: [...a.examples, ...b.examples].slice(0, 10),
      relatedConcepts: [...new Set([...a.relatedConcepts, ...b.relatedConcepts])].slice(0, 10),
      confidence: Math.max(a.confidence, b.confidence),
      createdAt: Math.min(a.createdAt, b.createdAt),
      lastAccessed: Date.now(),
      accessCount: a.accessCount + b.accessCount,
      sourceExperiences: [...a.sourceExperiences, ...b.sourceExperiences].slice(-100),
      refinementHistory: [
        ...a.refinementHistory,
        ...b.refinementHistory,
        {
          timestamp: Date.now(),
          change: `Merged with ${b.concept}`,
          confidenceDelta: 0,
        },
      ].slice(-50),
    };
  }

  /**
   * Get embedding for text (using the actual LLM embedding adapter)
   */
  async getEmbedding(text: string): Promise<number[]> {
    // Generate base embedding from LLM
    const baseEmbedding = await this.config.llm.embed(text);

    // Pad or truncate to the configured embedding dimension
    const input = new Float32Array(this.config.embeddingDimension);
    for (let i = 0; i < this.config.embeddingDimension; i++) {
      input[i] = i < baseEmbedding.length ? baseEmbedding[i] : 0;
    }

    // Pass through network
    const output = this.network.forward(input);

    return Array.from(output);
  }

  /**
   * Query knowledge base
   */
  async queryKnowledge(query: string, options?: {
    maxResults?: number;
    minConfidence?: number;
  }): Promise<KnowledgeUnit[]> {
    const queryEmbedding = await this.getEmbedding(query);

    const results = Array.from(this.knowledgeBase.values())
      .filter(k => k.confidence >= (options?.minConfidence ?? 0.3))
      .map(k => ({
        unit: k,
        similarity: this.cosineSimilarity(queryEmbedding, k.embedding),
      }))
      .filter(r => r.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options?.maxResults ?? 5)
      .map(r => r.unit);

    // Update access stats
    for (const unit of results) {
      const updated: KnowledgeUnit = {
        ...unit,
        accessCount: unit.accessCount + 1,
        lastAccessed: Date.now(),
      };
      this.knowledgeBase.set(unit.concept, updated);
    }

    return results;
  }

  /**
   * Get learning statistics
   */
  getStats(): LearningStats {
    const now = Date.now();
    const experiences = this.experienceBuffer;

    const recentExperiences = experiences.filter(e => now - e.timestamp < 3600000);
    const experiencesPerHour = recentExperiences.length;

    const knowledgeUnits = Array.from(this.knowledgeBase.values());
    const avgConfidence = knowledgeUnits.length > 0
      ? knowledgeUnits.reduce((sum, k) => sum + k.confidence, 0) / knowledgeUnits.length
      : 0;

    // Calculate knowledge growth rate (units per day)
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const newUnits = knowledgeUnits.filter(k => k.createdAt > dayAgo).length;

    return {
      totalExperiences: this.trainingStats.totalExperiences,
      totalKnowledgeUnits: knowledgeUnits.length,
      averageConfidence: avgConfidence,
      recentLoss: this.trainingStats.totalBatches > 0
        ? this.trainingStats.totalLoss / this.trainingStats.totalBatches
        : 0,
      experiencesPerHour,
      knowledgeGrowthRate: newUnits,
      oldestExperience: experiences.length > 0 ? experiences[0].timestamp : now,
      newestExperience: experiences.length > 0 ? experiences[experiences.length - 1].timestamp : now,
    };
  }

  /**
   * Save model checkpoint
   */
  async saveCheckpoint(): Promise<void> {
    const checkpoint: ModelCheckpoint = {
      checkpointId: `ckpt-${Date.now()}`,
      timestamp: Date.now(),
      weights: this.serializeWeights(),
      optimizerState: new Float32Array(0), // Simplified
      trainingStats: {
        totalExperiences: this.trainingStats.totalExperiences,
        totalBatches: this.trainingStats.totalBatches,
        averageLoss: this.trainingStats.totalBatches > 0
          ? this.trainingStats.totalLoss / this.trainingStats.totalBatches
          : 0,
      },
    };

    await writeFile(
      join(this.config.baseDir, 'checkpoint.json'),
      JSON.stringify(checkpoint, null, 2)
    );
  }

  // Helper methods

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'about', 'above', 'after', 'again', 'against', 'all', 'also', 'am', 'an', 'and',
      'any', 'are', "aren't", 'as', 'at', 'be', 'because', 'been', 'before', 'being',
      'below', 'between', 'both', 'but', 'by', 'can', "can't", 'cannot', 'could',
      "couldn't", 'did', "didn't", 'do', 'does', "doesn't", 'doing', "don't", 'down',
      'during', 'each', 'few', 'for', 'from', 'further', 'had', "hadn't", 'has',
      "hasn't", 'have', "haven't", 'having', 'he', "he'd", "he'll", "he's", 'her',
      'here', "here's", 'hers', 'herself', 'him', 'himself', 'his', 'how', "how's",
      'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is', "isn't", 'it',
      "it's", 'its', 'itself', 'let', "let's", 'me', 'more', 'most', "mustn't",
      'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
      'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
      "shan't", 'she', "she'd", "she'll", "she's", 'should', "shouldn't", 'so',
      'some', 'such', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them',
      'themselves', 'then', 'there', "there's", 'these', 'they', "they'd",
      "they'll", "they're", "they've", 'this', 'those', 'through', 'to', 'too',
      'under', 'until', 'up', 'very', 'was', "wasn't", 'we', "we'd", "we'll",
      "we're", "we've", 'were', "weren't", 'what', "what's", 'when', "when's",
      'where', "where's", 'which', 'while', 'who', "who's", 'whom', 'why',
      "why's", 'with', "won't", 'would', "wouldn't", 'you', "you'd", "you'll",
      "you're", "you've", 'your', 'yours', 'yourself', 'yourselves'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  private serializeWeights(): Float32Array {
    const weights = this.network.getWeights();
    let totalSize = 0;
    for (const [, w] of weights) {
      totalSize += w.length;
    }

    const serialized = new Float32Array(totalSize);
    let offset = 0;
    for (const [, w] of weights) {
      serialized.set(w, offset);
      offset += w.length;
    }

    return serialized;
  }

  private async saveState(): Promise<void> {
    const state = {
      config: this.config,
      experienceBuffer: this.experienceBuffer.slice(-1000), // Keep recent only
      knowledgeBase: Array.from(this.knowledgeBase.entries()),
      trainingStats: this.trainingStats,
      lastTrainingTime: this.lastTrainingTime,
      lastConsolidationTime: this.lastConsolidationTime,
    };

    await writeFile(
      join(this.config.baseDir, 'pretraining-state.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'pretraining-state.json'), 'utf-8');
      const state = JSON.parse(data);

      this.experienceBuffer = state.experienceBuffer ?? [];
      this.knowledgeBase = new Map(state.knowledgeBase);
      this.trainingStats = state.trainingStats ?? { totalBatches: 0, totalExperiences: 0, totalLoss: 0 };
      this.lastTrainingTime = state.lastTrainingTime ?? 0;
      this.lastConsolidationTime = state.lastConsolidationTime ?? 0;
    } catch {
      // No state to load
    }
  }
}
