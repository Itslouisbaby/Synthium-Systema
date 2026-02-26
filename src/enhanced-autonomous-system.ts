/**
 * Enhanced Autonomous System with Continuous Pre-Training
 * 
 * Integrates autonomous self-direction with continuous learning
 * from every interaction. This creates a system that truly learns
 * and accumulates knowledge over time.
 */

import { AutonomousCognitiveSystem, AutonomousCognitiveConfig } from './autonomous-cognitive-system.js';
import { LearningIntegration } from './learning/learning-integration.js';
import { SignalBus } from './runtime/signal-bus.js';
import { WorkingStateManager } from './runtime/working-state.js';
import { LLMInterface } from './autonomy/autonomous-learning-loop.js';

/** Enhanced configuration */
export interface EnhancedAutonomousConfig extends AutonomousCognitiveConfig {
  readonly embeddingDimension: number; // 10000+
  readonly enableContinuousLearning: boolean;
  readonly learnFromSignals: boolean;
  readonly learnFromInteractions: boolean;
  readonly knowledgeConsolidationInterval: number;
}

/** Enhanced system snapshot */
export interface EnhancedSystemSnapshot {
  readonly timestamp: number;
  readonly autonomySnapshot: ReturnType<AutonomousCognitiveSystem['getSnapshot']>;
  readonly learningStats: {
    readonly totalExperiences: number;
    readonly totalKnowledgeUnits: number;
    readonly averageConfidence: number;
    readonly experiencesPerHour: number;
    readonly knowledgeGrowthRate: number;
  };
  readonly embeddingDimension: number;
}

/**
 * Enhanced Autonomous System with Continuous Pre-Training
 */
export class EnhancedAutonomousSystem {
  private config: Required<EnhancedAutonomousConfig>;
  private baseSystem: AutonomousCognitiveSystem;
  private learning: LearningIntegration;
  private signalBus: SignalBus;
  private workingState: WorkingStateManager;
  private initialized = false;

  constructor(config: EnhancedAutonomousConfig) {
    this.config = {
      ...config,
      embeddingDimension: config.embeddingDimension ?? 12288,
      enableContinuousLearning: config.enableContinuousLearning ?? true,
      learnFromSignals: config.learnFromSignals ?? true,
      learnFromInteractions: config.learnFromInteractions ?? true,
      knowledgeConsolidationInterval: config.knowledgeConsolidationInterval ?? 3600000,
    };

    // Create shared components
    this.signalBus = new SignalBus({ baseDir: `${config.baseDir}/signals` });
    this.workingState = new WorkingStateManager({
      baseDir: `${config.baseDir}/state`
    });

    // Create base autonomous system
    this.baseSystem = new AutonomousCognitiveSystem({
      baseDir: config.baseDir,
      llm: config.llm,
      enableMetacognition: config.enableMetacognition,
      enableAutonomousGoals: config.enableAutonomousGoals,
      enableLearning: config.enableLearning,
      autonomyLevel: config.autonomyLevel,
    });

    // Create learning integration
    this.learning = new LearningIntegration({
      signalBus: this.signalBus,
      workingState: this.workingState,
      llm: config.llm,
      embeddingDimension: this.config.embeddingDimension,
      enableAutomaticLearning: this.config.enableContinuousLearning,
      learnFromSignals: this.config.learnFromSignals,
      learnFromInteractions: this.config.learnFromInteractions,
      learnFromReflections: true,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // WorkingStateManager initialization is synchronous in V2 or not needed
    await this.baseSystem.initialize();
    await this.learning.initialize();

    this.initialized = true;
    console.log('[EnhancedAutonomousSystem] Initialized');
    console.log(`  Embedding dimension: ${this.config.embeddingDimension}`);
    console.log(`  Continuous learning: ${this.config.enableContinuousLearning}`);
  }

  /**
   * Start the system
   */
  async start(): Promise<void> {
    await this.baseSystem.start();
    console.log('[EnhancedAutonomousSystem] Started');
  }

  /**
   * Stop the system
   */
  stop(): void {
    this.baseSystem.stop();
    this.learning.stop();
  }

  /**
   * Process input with continuous learning
   */
  async processInput(input: {
    type: 'user_request' | 'observation' | 'feedback' | 'task';
    content: string;
    priority?: number;
  }): Promise<{
    response?: string;
    knowledgeRetrieved: boolean;
    learned: boolean;
  }> {
    // Process with base system
    await this.baseSystem.processInput(input);

    // Learn from interaction
    let response: string | undefined;
    let knowledgeRetrieved = false;

    if (input.type === 'user_request' || input.type === 'task') {
      // Try to answer from learned knowledge first
      const knowledge = await this.learning.queryKnowledge(input.content, {
        maxResults: 1,
        minConfidence: 0.6,
      });

      if (knowledge.length > 0) {
        response = knowledge[0].definition;
        knowledgeRetrieved = true;
      }

      // Learn from the interaction
      await this.learning.learnFromInteraction({
        text: input.content,
        output: response,
        sessionKey: 'main-session',
      });
    } else if (input.type === 'observation') {
      await this.learning.learnFromObservation({
        description: input.content,
        sessionKey: 'main-session',
      });
    }

    return {
      response,
      knowledgeRetrieved,
      learned: this.config.enableContinuousLearning,
    };
  }

  /**
   * Query accumulated knowledge
   */
  async queryKnowledge(query: string): Promise<{
    answer: string;
    confidence: number;
    sources: string[];
    learnedFromExperience: boolean;
  }> {
    // Query learning system first
    const learnedKnowledge = await this.learning.queryKnowledge(query, {
      maxResults: 3,
      minConfidence: 0.4,
    });

    if (learnedKnowledge.length > 0) {
      const best = learnedKnowledge[0];
      return {
        answer: best.definition,
        confidence: best.confidence,
        sources: learnedKnowledge.map(k => k.concept),
        learnedFromExperience: true,
      };
    }

    // Fall back to base system
    const baseResult = await this.baseSystem.queryKnowledge(query);
    return {
      ...baseResult,
      learnedFromExperience: false,
    };
  }

  /**
   * Provide feedback to improve learning
   */
  async provideFeedback(interactionId: string, feedback: 'positive' | 'negative'): Promise<void> {
    // This would integrate with the learning system
    console.log(`[Feedback] ${feedback} for interaction ${interactionId}`);
  }

  /**
   * Get enhanced system snapshot
   */
  getSnapshot(): EnhancedSystemSnapshot {
    const baseSnapshot = this.baseSystem.getSnapshot();
    const learningStats = this.learning.getStats();

    return {
      timestamp: Date.now(),
      autonomySnapshot: baseSnapshot,
      learningStats: {
        totalExperiences: learningStats.totalExperiences,
        totalKnowledgeUnits: learningStats.totalKnowledgeUnits,
        averageConfidence: learningStats.averageConfidence,
        experiencesPerHour: learningStats.experiencesPerHour,
        knowledgeGrowthRate: learningStats.knowledgeGrowthRate,
      },
      embeddingDimension: this.config.embeddingDimension,
    };
  }

  /**
   * Get learning statistics
   */
  getLearningStats() {
    return this.learning.getStats();
  }

  /**
   * Find similar past experiences
   */
  async findSimilarExperiences(query: string, limit: number = 5) {
    return this.learning.findSimilarExperiences(query, limit);
  }

  /**
   * Get knowledge growth over time
   */
  getKnowledgeGrowth() {
    return this.learning.getKnowledgeGrowth();
  }

  /**
   * Force save checkpoint
   */
  async saveCheckpoint(): Promise<void> {
    await this.learning.saveCheckpoint();
  }

  /**
   * Get embedding for text
   */
  async getEmbedding(text: string): Promise<number[]> {
    return this.learning.getEmbedding(text);
  }
}
