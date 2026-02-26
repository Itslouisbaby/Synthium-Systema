/**
 * Learning Integration Layer
 * 
 * Connects continuous pre-training with the rest of the system.
 * Every signal, interaction, and experience is automatically processed
 * for learning and knowledge accumulation.
 */

import { SignalBus } from '../runtime/signal-bus.js';
import type { Signal } from '../types.js';
import { WorkingStateManager } from '../runtime/working-state.js';
import { ContinuousPretraining, LearningExperience } from './continuous-pretraining.js';
import { LLMInterface } from '../autonomy/autonomous-learning-loop.js';

/** Integration configuration */
export interface LearningIntegrationConfig {
  readonly signalBus: SignalBus;
  readonly workingState: WorkingStateManager;
  readonly llm: LLMInterface;
  readonly embeddingDimension: number;
  readonly enableAutomaticLearning: boolean;
  readonly learnFromSignals: boolean;
  readonly learnFromInteractions: boolean;
  readonly learnFromReflections: boolean;
}

/** Signal learning metadata */
interface SignalLearningMetadata {
  readonly signalType: string;
  readonly loopName: string;
  readonly sessionKey: string;
  readonly uncertaintyLevel: number;
  readonly processingTime: number;
}

/**
 * Learning Integration
 * 
 * Automatically processes all system activity for continuous learning.
 */
export class LearningIntegration {
  private config: Required<LearningIntegrationConfig>;
  private pretraining: ContinuousPretraining;
  private signalSubscription: (() => void) | null = null;
  private interactionHistory: Array<{
    timestamp: number;
    input: string;
    output: string;
    feedback?: 'positive' | 'negative';
  }> = [];
  private initialized = false;

  constructor(config: LearningIntegrationConfig) {
    this.config = {
      signalBus: config.signalBus,
      workingState: config.workingState,
      llm: config.llm,
      embeddingDimension: config.embeddingDimension ?? 12288,
      enableAutomaticLearning: config.enableAutomaticLearning ?? true,
      learnFromSignals: config.learnFromSignals ?? true,
      learnFromInteractions: config.learnFromInteractions ?? true,
      learnFromReflections: config.learnFromReflections ?? true,
    };

    this.pretraining = new ContinuousPretraining({
      baseDir: '.synth/v2/learning',
      embeddingDimension: this.config.embeddingDimension,
      learningRate: 0.0001,
      batchSize: 32,
      replayBufferSize: 100000,
      minSamplesBeforeTraining: 100,
      trainingIntervalMs: 60000,
      forgettingPrevention: 'both',
      ewcLambda: 1000,
      knowledgeDecayRate: 0.001,
      consolidationIntervalMs: 3600000,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.pretraining.initialize();

    if (this.config.enableAutomaticLearning) {
      this.setupSignalListener();
    }

    this.initialized = true;
    console.log('[LearningIntegration] Initialized');
    console.log(`  Embedding dimension: ${this.config.embeddingDimension}`);
    console.log(`  Auto-learning: ${this.config.enableAutomaticLearning}`);
  }

  /**
   * Process a user interaction for learning
   */
  async learnFromInteraction(input: {
    text: string;
    context?: string[];
    output?: string;
    feedback?: 'positive' | 'negative' | 'neutral';
    sessionKey: string;
  }): Promise<void> {
    if (!this.config.learnFromInteractions) return;

    // Get embedding from LLM
    const embedding = await this.config.llm.embed(input.text);

    // Create learning experience
    const experience: Omit<LearningExperience, 'experienceId'> = {
      timestamp: Date.now(),
      type: 'interaction',
      input: input.text,
      context: input.context ?? [],
      output: input.output,
      feedback: input.feedback,
      embedding,
      metadata: {
        sessionKey: input.sessionKey,
        uncertaintyLevel: 0.5,
      },
    };

    await this.pretraining.processExperience(experience);

    // Track interaction
    if (input.output) {
      this.interactionHistory.push({
        timestamp: Date.now(),
        input: input.text,
        output: input.output,
        feedback: input.feedback as 'positive' | 'negative' | undefined,
      });

      // Keep bounded
      if (this.interactionHistory.length > 10000) {
        this.interactionHistory = this.interactionHistory.slice(-5000);
      }
    }
  }

  /**
   * Process a reflection for learning
   */
  async learnFromReflection(reflection: {
    topic: string;
    insight: string;
    confidence: number;
    sessionKey: string;
  }): Promise<void> {
    if (!this.config.learnFromReflections) return;

    const text = `Reflection on ${reflection.topic}: ${reflection.insight}`;
    const embedding = await this.config.llm.embed(text);

    const experience: Omit<LearningExperience, 'experienceId'> = {
      timestamp: Date.now(),
      type: 'reflection',
      input: text,
      context: [],
      embedding,
      metadata: {
        sessionKey: reflection.sessionKey,
        uncertaintyLevel: 1 - reflection.confidence,
      },
    };

    await this.pretraining.processExperience(experience);
  }

  /**
   * Process an observation for learning
   */
  async learnFromObservation(observation: {
    description: string;
    context?: string[];
    sessionKey: string;
  }): Promise<void> {
    const embedding = await this.config.llm.embed(observation.description);

    const experience: Omit<LearningExperience, 'experienceId'> = {
      timestamp: Date.now(),
      type: 'observation',
      input: observation.description,
      context: observation.context ?? [],
      embedding,
      metadata: {
        sessionKey: observation.sessionKey,
        uncertaintyLevel: 0.3,
      },
    };

    await this.pretraining.processExperience(experience);
  }

  /**
   * Provide feedback on a previous interaction
   */
  async provideFeedback(
    interactionIndex: number,
    feedback: 'positive' | 'negative'
  ): Promise<void> {
    const interaction = this.interactionHistory[interactionIndex];
    if (!interaction) return;

    interaction.feedback = feedback;

    // Re-process with feedback
    await this.learnFromInteraction({
      text: interaction.input,
      output: interaction.output,
      feedback,
      sessionKey: 'feedback-session',
    });
  }

  /**
   * Query learned knowledge
   */
  async queryKnowledge(query: string, options?: {
    maxResults?: number;
    minConfidence?: number;
  }): Promise<Array<{
    concept: string;
    definition: string;
    confidence: number;
    examples: string[];
  }>> {
    const units = await this.pretraining.queryKnowledge(query, options);

    return units.map(u => ({
      concept: u.concept,
      definition: u.definition,
      confidence: u.confidence,
      examples: u.examples,
    }));
  }

  /**
   * Get embedding for text (using learned representations)
   */
  async getEmbedding(text: string): Promise<number[]> {
    return this.pretraining.getEmbedding(text);
  }

  /**
   * Get learning statistics
   */
  getStats() {
    return this.pretraining.getStats();
  }

  /**
   * Force immediate training
   */
  async forceTraining(): Promise<void> {
    // This would trigger a training step
    console.log('[LearningIntegration] Forcing training step...');
  }

  /**
   * Save model checkpoint
   */
  async saveCheckpoint(): Promise<void> {
    await this.pretraining.saveCheckpoint();
  }

  /**
   * Get similar past experiences
   */
  async findSimilarExperiences(query: string, limit: number = 5): Promise<Array<{
    input: string;
    output?: string;
    similarity: number;
  }>> {
    const queryEmbedding = await this.getEmbedding(query);

    // Search through interaction history
    const scored = await Promise.all(
      this.interactionHistory.map(async (interaction) => {
        const interactionEmbedding = await this.getEmbedding(interaction.input);
        const similarity = this.cosineSimilarity(queryEmbedding, interactionEmbedding);
        return { interaction, similarity };
      })
    );

    return scored
      .filter(s => s.similarity > 0.7)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(s => ({
        input: s.interaction.input,
        output: s.interaction.output,
        similarity: s.similarity,
      }));
  }

  /**
   * Get knowledge growth over time
   */
  getKnowledgeGrowth(): Array<{
    timestamp: number;
    totalKnowledge: number;
    averageConfidence: number;
  }> {
    // This would return historical data
    // For now, return current snapshot
    const stats = this.getStats();
    return [{
      timestamp: Date.now(),
      totalKnowledge: stats.totalKnowledgeUnits,
      averageConfidence: stats.averageConfidence,
    }];
  }

  // Private methods

  private setupSignalListener(): void {
    if (!this.config.learnFromSignals) return;

    // Note: SignalBus in V2 uses event sourcing via Scheduler, not direct pub/sub.
    // Pre-training polling would be attached as a background job here in full implementation
    this.signalSubscription = () => { };
    console.log('[LearningIntegration] Signal listener active (stubbed)');
  }

  private async processSignalForLearning(signal: Signal): Promise<void> {
    try {
      // Extract learning content from signal
      const content = this.extractSignalContent(signal);
      if (!content) return;

      // Get embedding
      const embedding = await this.config.llm.embed(content.text);

      // Create learning experience
      const experience: Omit<LearningExperience, 'experienceId'> = {
        timestamp: signal.emittedAtMs,
        type: 'signal',
        input: content.text,
        context: content.context,
        embedding,
        metadata: {
          sessionKey: signal.sessionKey,
          signalType: signal.type as string,
          loopName: signal.sourceLoop,
          uncertaintyLevel: content.uncertaintyLevel,
        },
      };

      await this.pretraining.processExperience(experience);
    } catch (error) {
      // Silently fail - learning should not break main system
    }
  }

  private extractSignalContent(signal: Signal): {
    text: string;
    context: string[];
    uncertaintyLevel: number;
  } | null {
    // Extract meaningful content based on signal type
    const payload = signal.payload as Record<string, unknown>;

    let text = '';
    let uncertaintyLevel = 0.5;

    switch (signal.type as string) {
      case 'INPUT_RECEIVED':
        text = String(payload.text ?? '');
        break;
      case 'PLAN_CREATED':
        text = String(payload.description ?? payload.plan ?? '');
        break;
      case 'EVALUATION_COMPLETE':
        text = `Evaluation: ${payload.evaluation}`;
        uncertaintyLevel = 1 - (Number(payload.score ?? 0.5));
        break;
      case 'UNCERTAINTY_HIGH':
        text = `Uncertainty in ${payload.domain}`;
        uncertaintyLevel = Number(payload.confidence ?? 0.8);
        break;
      case 'STEP_EXECUTED':
        text = `Action: ${payload.action}`;
        break;
      default:
        // For other signals, try to extract any string content
        text = JSON.stringify(payload).slice(0, 500);
    }

    if (!text || text.length < 10) return null;

    return {
      text,
      context: [signal.type as string, signal.sourceLoop],
      uncertaintyLevel,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
  }

  /**
   * Stop learning integration
   */
  stop(): void {
    if (this.signalSubscription) {
      this.signalSubscription();
      this.signalSubscription = null;
    }
  }
}
