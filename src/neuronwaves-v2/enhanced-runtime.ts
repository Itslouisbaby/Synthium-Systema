/**
 * NeuronWaves v2 - ENHANCED Runtime with AGI Components
 * 
 * Integrates all 8 original phases (A-H) PLUS:
 * - Neural Learning Layer (concept formation from experience)
 * - Generative World Model (simulation, causal reasoning)
 * - Intrinsic Motivation (curiosity, goal generation)
 * - Self-Modification (system improves itself)
 * - Perception System (representation building)
 * - Active Working Memory (manipulation, maintenance)
 * - Memory Consolidation (episodic → semantic)
 */

import { 
  IntegratedNeuronWavesRuntime,
  type IntegratedRuntimeConfig,
} from './integrated-runtime.js';

import {
  EmbeddingNetwork,
  type Experience,
} from './neural-learning/index.js';

import {
  WorldSimulator,
  type SimAction,
  type SimState,
} from './generative-world/index.js';

import {
  IntrinsicDrive,
  type IntrinsicGoal,
} from './motivation/index.js';

import {
  SelfModifier,
} from './meta-learning/index.js';

import {
  RepresentationBuilder,
  type Representation,
} from './perception/index.js';

import {
  ActiveWorkingMemory,
  MemoryConsolidation,
} from './memory/index.js';

import type { SessionKey } from './types.js';

/** Enhanced runtime configuration */
export interface EnhancedRuntimeConfig extends IntegratedRuntimeConfig {
  /** Enable neural learning */
  enableNeuralLearning?: boolean;
  /** Enable world simulation */
  enableWorldSimulation?: boolean;
  /** Enable intrinsic motivation */
  enableIntrinsicMotivation?: boolean;
  /** Enable self-modification */
  enableSelfModification?: boolean;
  /** Enable rich perception */
  enableRichPerception?: boolean;
  /** Enable active memory */
  enableActiveMemory?: boolean;
  /** Enable memory consolidation */
  enableConsolidation?: boolean;
}

/**
 * EnhancedNeuronWavesRuntime - AGI-capable system
 * 
 * This runtime adds genuine learning, reasoning, and adaptation capabilities
 * to the base orchestration framework.
 */
export class EnhancedNeuronWavesRuntime extends IntegratedNeuronWavesRuntime {
  // Neural Learning
  private embeddingNetwork: EmbeddingNetwork;
  
  // Generative World Model
  private worldSimulator: WorldSimulator;
  
  // Intrinsic Motivation
  private intrinsicDrive: IntrinsicDrive;
  
  // Self-Modification
  private selfModifier: SelfModifier;
  
  // Perception
  private representationBuilder: RepresentationBuilder;
  
  // Memory Systems
  private activeMemory: ActiveWorkingMemory;
  private memoryConsolidation: MemoryConsolidation;
  
  // Configuration
  private enhancedConfig: Required<EnhancedRuntimeConfig>;
  
  // Learning metrics
  private experienceCount = 0;
  private goalsGenerated = 0;

  constructor(config: EnhancedRuntimeConfig = { artifactBaseDir: '.synth/v2-enhanced' }) {
    super(config);

    this.enhancedConfig = {
      ...config as Required<EnhancedRuntimeConfig>,
      enableNeuralLearning: config.enableNeuralLearning ?? true,
      enableWorldSimulation: config.enableWorldSimulation ?? true,
      enableIntrinsicMotivation: config.enableIntrinsicMotivation ?? true,
      enableSelfModification: config.enableSelfModification ?? true,
      enableRichPerception: config.enableRichPerception ?? true,
      enableActiveMemory: config.enableActiveMemory ?? true,
      enableConsolidation: config.enableConsolidation ?? true,
    };

    // Initialize new components
    this.embeddingNetwork = new EmbeddingNetwork({
      baseDir: `${this.enhancedConfig.artifactBaseDir}/neural`,
    });

    this.worldSimulator = new WorldSimulator({
      baseDir: `${this.enhancedConfig.artifactBaseDir}/worldsim`,
    });

    this.intrinsicDrive = new IntrinsicDrive({
      baseDir: `${this.enhancedConfig.artifactBaseDir}/motivation`,
    });

    this.selfModifier = new SelfModifier({
      baseDir: `${this.enhancedConfig.artifactBaseDir}/metalearning`,
    });

    this.representationBuilder = new RepresentationBuilder({
      baseDir: `${this.enhancedConfig.artifactBaseDir}/perception`,
    });

    this.activeMemory = new ActiveWorkingMemory({
      baseDir: `${this.enhancedConfig.artifactBaseDir}/memory`,
    });

    this.memoryConsolidation = new MemoryConsolidation({
      baseDir: `${this.enhancedConfig.artifactBaseDir}/consolidation`,
    });
  }

  /**
   * Initialize all enhanced components
   */
  async initialize(): Promise<void> {
    console.log('[EnhancedRuntime] Initializing AGI components...');

    if (this.enhancedConfig.enableNeuralLearning) {
      await this.embeddingNetwork.initialize();
      console.log('[EnhancedRuntime] ✓ Neural Learning initialized');
    }

    if (this.enhancedConfig.enableWorldSimulation) {
      await this.worldSimulator.initialize();
      console.log('[EnhancedRuntime] ✓ World Simulator initialized');
    }

    if (this.enhancedConfig.enableIntrinsicMotivation) {
      await this.intrinsicDrive.initialize();
      console.log('[EnhancedRuntime] ✓ Intrinsic Motivation initialized');
    }

    if (this.enhancedConfig.enableSelfModification) {
      await this.selfModifier.initialize();
      console.log('[EnhancedRuntime] ✓ Self-Modifier initialized');
    }

    if (this.enhancedConfig.enableRichPerception) {
      await this.representationBuilder.initialize();
      console.log('[EnhancedRuntime] ✓ Perception System initialized');
    }

    if (this.enhancedConfig.enableActiveMemory) {
      await this.activeMemory.initialize();
      console.log('[EnhancedRuntime] ✓ Active Memory initialized');
    }

    if (this.enhancedConfig.enableConsolidation) {
      await this.memoryConsolidation.initialize();
      console.log('[EnhancedRuntime] ✓ Memory Consolidation initialized');
    }

    console.log('[EnhancedRuntime] All AGI components ready');
  }

  /**
   * Submit input with full cognitive processing
   */
  async submitInputEnhanced(sessionKey: SessionKey, content: string): Promise<{
    signalId: string;
    representation: Representation | null;
    learnedConcepts: string[];
    predictedOutcomes: string[];
    generatedGoals: IntrinsicGoal[];
  }> {
    // 1. Build rich representation (perception)
    let representation: Representation | null = null;
    if (this.enhancedConfig.enableRichPerception) {
      representation = await this.representationBuilder.buildRepresentation(content);
      
      // Store in active memory
      if (this.enhancedConfig.enableActiveMemory) {
        await this.activeMemory.encode(representation, {
          type: 'entity',
          importance: 0.8,
          source: 'perception',
        });
      }
    }

    // 2. Submit to base runtime
    const signalId = await super.submitInput(sessionKey, content);

    // 3. Learn from this interaction
    let learnedConcepts: string[] = [];
    if (this.enhancedConfig.enableNeuralLearning) {
      const experience: Experience = {
        experienceId: `exp-${Date.now()}`,
        timestampMs: Date.now(),
        input: content,
        context: { sessionKey, representation: representation?.representationId },
        action: 'process_input',
        outcome: { success: true },
      };

      const learnResult = await this.embeddingNetwork.learn(experience);
      learnedConcepts = learnResult.conceptsActivated;
      
      if (learnResult.newConceptFormed) {
        console.log(`[EnhancedRuntime] New concept formed: ${learnResult.newConceptFormed}`);
      }

      this.experienceCount++;
    }

    // 4. Predict outcomes (world simulation)
    let predictedOutcomes: string[] = [];
    if (this.enhancedConfig.enableWorldSimulation && representation) {
      for (const action of representation.actions) {
        const prediction = this.worldSimulator.quickPredict(
          action.verb,
          action.object || 'unknown',
          { entities: representation.entities.map(e => e.type) }
        );
        predictedOutcomes.push(...prediction.likelyOutcomes);
      }
    }

    // 5. Generate intrinsic goals
    let generatedGoals: IntrinsicGoal[] = [];
    if (this.enhancedConfig.enableIntrinsicMotivation) {
      generatedGoals = await this.intrinsicDrive.generateGoals({
        knownConcepts: learnedConcepts,
        recentExperiences: [content],
        uncertainties: predictedOutcomes.filter(o => o.includes('unknown')),
      });
      this.goalsGenerated += generatedGoals.length;
    }

    // 6. Store episodic memory
    if (this.enhancedConfig.enableConsolidation) {
      const experience: Experience = {
        experienceId: `exp-${Date.now()}`,
        timestampMs: Date.now(),
        input: content,
        context: { sessionKey },
        action: 'submit_input',
        outcome: { success: true },
      };
      await this.memoryConsolidation.storeEpisode(experience);
    }

    // 7. Record performance metric for self-modification
    if (this.enhancedConfig.enableSelfModification) {
      await this.selfModifier.recordMetric({
        component: 'EnhancedRuntime',
        metricName: 'input_processed',
        value: 1,
        timestamp: Date.now(),
        context: sessionKey,
      });
    }

    return {
      signalId,
      representation,
      learnedConcepts,
      predictedOutcomes,
      generatedGoals,
    };
  }

  /**
   * Simulate an action before executing
   */
  async simulateAction(
    action: SimAction,
    sessionKey: SessionKey
  ): Promise<{
    simulation: import('./generative-world/world-simulator.js').SimulationResult | null;
    recommendation: string;
  }> {
    if (!this.enhancedConfig.enableWorldSimulation) {
      return { simulation: null, recommendation: 'Simulation disabled' };
    }

    const state = this.getWorkingState(sessionKey);
    const simState: SimState = {
      entities: state.activeConcepts.map((c, i) => ({
        entityId: `ent-${i}`,
        type: 'concept',
        properties: { name: c },
        state: 'active',
        confidence: 0.8,
      })),
      relations: [],
      timestamp: Date.now(),
    };

    const simulation = await this.worldSimulator.simulate(action, simState);
    
    const hasRisks = simulation.outcomes.some(o => o.type === 'failure' || o.severity === 'high');
    const recommendation = hasRisks
      ? 'Warning: Simulation shows potential risks. Consider alternatives.'
      : 'Simulation looks favorable. Proceed with confidence.';

    return { simulation, recommendation };
  }

  /**
   * Generate counterfactual analysis
   */
  async whatIf(
    originalAction: SimAction,
    alternativeAction: SimAction,
    sessionKey: SessionKey
  ): Promise<import('./generative-world/world-simulator.js').Counterfactual | null> {
    if (!this.enhancedConfig.enableWorldSimulation) return null;

    const state = this.getWorkingState(sessionKey);
    const simState: SimState = {
      entities: state.activeConcepts.map((c, i) => ({
        entityId: `ent-${i}`,
        type: 'concept',
        properties: { name: c },
        state: 'active',
        confidence: 0.8,
      })),
      relations: [],
      timestamp: Date.now(),
    };

    return this.worldSimulator.generateCounterfactual(
      originalAction,
      alternativeAction,
      simState
    );
  }

  /**
   * Report a surprise event to drive learning
   */
  async reportSurprise(
    description: string,
    expected: unknown,
    actual: unknown,
    sessionKey: SessionKey
  ): Promise<IntrinsicGoal | null> {
    if (!this.enhancedConfig.enableIntrinsicMotivation) return null;

    const surpriseMagnitude = this.calculateSurprise(expected, actual);
    
    return this.intrinsicDrive.reportSurprise({
      timestamp: Date.now(),
      description,
      expected,
      actual,
      surpriseMagnitude,
      learningOpportunity: description,
    });
  }

  /**
   * Get recommended next action based on intrinsic motivation
   */
  getRecommendedAction(): {
    action: string;
    reason: string;
    expectedLearning: string;
  } | null {
    if (!this.enhancedConfig.enableIntrinsicMotivation) return null;
    return this.intrinsicDrive.getRecommendedAction();
  }

  /**
   * Force memory consolidation
   */
  async consolidateMemories(): Promise<{
    episodesProcessed: number;
    patternsDiscovered: number;
    semanticMemoriesCreated: number;
  }> {
    if (!this.enhancedConfig.enableConsolidation) {
      return { episodesProcessed: 0, patternsDiscovered: 0, semanticMemoriesCreated: 0 };
    }
    return this.memoryConsolidation.forceConsolidation();
  }

  /**
   * Query learned knowledge
   */
  queryKnowledge(query: string): unknown {
    if (!this.enhancedConfig.enableConsolidation) return null;
    return this.memoryConsolidation.queryKnowledge(query);
  }

  /**
   * Get enhanced status
   */
  getEnhancedStatus(): {
    neuralLearning: { enabled: boolean; experiences: number; concepts: number };
    worldSimulation: { enabled: boolean; simulations: number };
    intrinsicMotivation: { enabled: boolean; goals: number; activeGoals: number };
    selfModification: { enabled: boolean; modifications: number };
    perception: { enabled: boolean; representations: number };
    activeMemory: { enabled: boolean; chunks: number; focus: string | null };
    consolidation: { enabled: boolean; episodic: number; semantic: number };
  } {
    return {
      neuralLearning: {
        enabled: this.enhancedConfig.enableNeuralLearning,
        experiences: this.experienceCount,
        concepts: this.embeddingNetwork.getStats().conceptCount,
      },
      worldSimulation: {
        enabled: this.enhancedConfig.enableWorldSimulation,
        simulations: this.worldSimulator.getStats().totalSimulations,
      },
      intrinsicMotivation: {
        enabled: this.enhancedConfig.enableIntrinsicMotivation,
        goals: this.goalsGenerated,
        activeGoals: this.intrinsicDrive.getStats().activeGoals,
      },
      selfModification: {
        enabled: this.enhancedConfig.enableSelfModification,
        modifications: this.selfModifier.getStats().totalModifications,
      },
      perception: {
        enabled: this.enhancedConfig.enableRichPerception,
        representations: this.representationBuilder.getStats().totalRepresentations,
      },
      activeMemory: {
        enabled: this.enhancedConfig.enableActiveMemory,
        chunks: this.activeMemory.getStats().chunkCount,
        focus: this.activeMemory.getCurrentFocus()?.focusId || null,
      },
      consolidation: {
        enabled: this.enhancedConfig.enableConsolidation,
        episodic: this.memoryConsolidation.getStats().episodicCount,
        semantic: this.memoryConsolidation.getStats().semanticCount,
      },
    };
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    console.log('[EnhancedRuntime] Shutting down AGI components...');

    await this.activeMemory.shutdown();
    await this.memoryConsolidation.shutdown();

    console.log('[EnhancedRuntime] Shutdown complete');
  }

  // Private helper methods
  private calculateSurprise(expected: unknown, actual: unknown): number {
    const expectedStr = JSON.stringify(expected);
    const actualStr = JSON.stringify(actual);
    
    if (expectedStr === actualStr) return 0;
    
    // Simple surprise metric: difference in structure
    const expectedKeys = Object.keys(JSON.parse(expectedStr || '{}'));
    const actualKeys = Object.keys(JSON.parse(actualStr || '{}'));
    
    const common = expectedKeys.filter(k => actualKeys.includes(k));
    const total = new Set([...expectedKeys, ...actualKeys]).size;
    
    return 1 - (common.length / total);
  }
}

/** Create enhanced runtime */
export function createEnhancedRuntime(config?: EnhancedRuntimeConfig): EnhancedNeuronWavesRuntime {
  return new EnhancedNeuronWavesRuntime(config);
}
