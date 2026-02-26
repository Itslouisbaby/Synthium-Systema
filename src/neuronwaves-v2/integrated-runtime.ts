/**
 * NeuronWaves v2 - FULLY INTEGRATED Runtime
 * All Phases A-H Working Together
 */

import { 
  SignalBus, 
  WorkingStateManager, 
  Scheduler, 
  defaultSchedulerConfig,
  SelfModelManager,
} from './runtime/index.js';

import {
  InputLoop,
  OutputLoop,
  ExecutiveLoop,
  CriticLoop,
  MonitorLoop,
  CortexLoop,
  consolePublisher,
} from './loops/index.js';

import {
  TaskTraceManager,
  SimilarityRetriever,
  SkillsManager,
} from './transfer-learning/index.js';

import {
  ConceptRegistry,
  ConceptTagger,
  CommonConcepts,
  SchemaRegistry,
  SchemaFiller,
  CommonSchemas,
  InvariantRegistry,
  InvariantChecker,
  CommonInvariants,
} from './abstractions/index.js';

import {
  BeliefGraphManager,
  PredictionsManager,
} from './world-model/index.js';

import {
  NoveltyDetector,
  ColdStartProtocol,
} from './cold-start/index.js';

import {
  ReplayEngine,
  CIGate,
} from './replay/index.js';

import type { 
  RuntimeConfig, 
  RuntimeStatus,
  Signal,
  SignalType,
  WorkingState,
  StateDelta,
  SessionKey,
  MicroLoop,
  TickResult,
  PlanStep,
  TaskTrace,
} from './types.js';

/** Integrated runtime configuration */
export interface IntegratedRuntimeConfig extends RuntimeConfig {
  /** Enable transfer learning */
  enableTransferLearning?: boolean;
  /** Enable abstractions (concepts, schemas, invariants) */
  enableAbstractions?: boolean;
  /** Enable world model */
  enableWorldModel?: boolean;
  /** Enable cold-start detection */
  enableColdStart?: boolean;
  /** Enable replay/CI */
  enableReplay?: boolean;
  /** Similarity threshold for novelty detection */
  noveltyThreshold?: number;
}

/**
 * IntegratedNeuronWavesRuntime - All phases A-H working together
 * 
 * This runtime integrates:
 * - Phase A-D: Core runtime + MicroLoops
 * - Phase E: Transfer learning (traces, similarity, skills)
 * - Phase F: Abstractions (concepts, schemas, invariants)
 * - Phase G: World model (BeliefGraph, predictions)
 * - Phase H: Cold-start + Replay
 */
export class IntegratedNeuronWavesRuntime {
  // Core runtime components
  private readonly signalBus: SignalBus;
  protected readonly workingState: WorkingStateManager;
  protected readonly scheduler: Scheduler;
  private readonly selfModel: SelfModelManager;

  // Transfer learning
  private readonly taskTraces: TaskTraceManager;
  private readonly similarity: SimilarityRetriever;
  private readonly skills: SkillsManager;

  // Abstractions
  private readonly conceptRegistry: ConceptRegistry;
  private readonly conceptTagger: ConceptTagger;
  private readonly schemaRegistry: SchemaRegistry;
  private readonly schemaFiller: SchemaFiller;
  private readonly invariantRegistry: InvariantRegistry;
  private readonly invariantChecker: InvariantChecker;

  // World model
  private readonly beliefGraph: BeliefGraphManager;
  private readonly predictions: PredictionsManager;

  // Cold-start
  private readonly noveltyDetector: NoveltyDetector;
  private readonly coldStartProtocol: ColdStartProtocol;

  // Replay
  private readonly replayEngine: ReplayEngine;
  private readonly ciGate: CIGate;

  // Loops
  private readonly inputLoop: InputLoop;
  private readonly outputLoop: OutputLoop;

  // Config
  private readonly config: Required<IntegratedRuntimeConfig>;
  private tickCount = 0;

  constructor(config: IntegratedRuntimeConfig = { artifactBaseDir: '.synth/v2' }) {
    this.config = {
      artifactBaseDir: config.artifactBaseDir,
      schedulerConfig: config.schedulerConfig ?? defaultSchedulerConfig,
      enabledLoops: config.enabledLoops ?? {},
      outputPublisher: config.outputPublisher ?? consolePublisher,
      enableTransferLearning: config.enableTransferLearning ?? true,
      enableAbstractions: config.enableAbstractions ?? true,
      enableWorldModel: config.enableWorldModel ?? true,
      enableColdStart: config.enableColdStart ?? true,
      enableReplay: config.enableReplay ?? true,
      noveltyThreshold: config.noveltyThreshold ?? 0.3,
    };

    // Initialize core components
    this.signalBus = new SignalBus({ baseDir: `${this.config.artifactBaseDir}/signals` });
    this.workingState = new WorkingStateManager({ baseDir: this.config.artifactBaseDir });
    this.selfModel = new SelfModelManager({ baseDir: this.config.artifactBaseDir });

    // Initialize transfer learning
    this.taskTraces = new TaskTraceManager({ baseDir: `${this.config.artifactBaseDir}/traces` });
    this.similarity = new SimilarityRetriever();
    this.skills = new SkillsManager({ baseDir: `${this.config.artifactBaseDir}/skills` });

    // Initialize abstractions
    this.conceptRegistry = new ConceptRegistry({ baseDir: `${this.config.artifactBaseDir}/concepts` });
    this.conceptTagger = new ConceptTagger(this.conceptRegistry);
    this.schemaRegistry = new SchemaRegistry({ baseDir: `${this.config.artifactBaseDir}/schemas` });
    this.schemaFiller = new SchemaFiller(this.schemaRegistry);
    this.invariantRegistry = new InvariantRegistry({ baseDir: this.config.artifactBaseDir });
    this.invariantChecker = new InvariantChecker(this.invariantRegistry);

    // Initialize world model
    this.beliefGraph = new BeliefGraphManager({ baseDir: `${this.config.artifactBaseDir}/worldmodel` });
    this.predictions = new PredictionsManager();

    // Initialize cold-start
    this.noveltyDetector = new NoveltyDetector({ similarityThreshold: this.config.noveltyThreshold });
    this.coldStartProtocol = new ColdStartProtocol({ learnFirstMode: true });

    // Initialize replay
    this.replayEngine = new ReplayEngine({ 
      baseDir: this.config.artifactBaseDir,
      verifyHashes: true,
    });
    this.ciGate = new CIGate(this.replayEngine);

    // Initialize scheduler
    this.scheduler = new Scheduler(
      { ...defaultSchedulerConfig, ...this.config.schedulerConfig },
      this.signalBus,
      this.workingState,
      {
        onTickStart: (tickId, sessionKey) => {
          this.tickCount++;
        },
        onTickComplete: (record) => {
          // Auto-create task trace on completion
          this.maybeCreateTaskTrace(record.sessionKey);
        },
        onLoopError: (loopName, error, recoveryAction) => {
          console.error(`[Runtime] Loop ${loopName} error: ${error.message} (${recoveryAction})`);
        },
        onBudgetExceeded: (sessionKey, budgetType) => {
          console.warn(`[Runtime] Session ${sessionKey} exceeded budget: ${budgetType}`);
        },
      }
    );

    // Initialize loops
    this.inputLoop = new InputLoop();
    this.outputLoop = new OutputLoop({ publisher: this.config.outputPublisher });

    // Register all loops
    this.registerAllLoops();

    // Initialize common abstractions (only if enabled)
    if (this.config.enableAbstractions) {
      this.initializeAbstractions();
    }
  }

  /**
   * Register all micro-loops with the scheduler
   */
  private registerAllLoops(): void {
    // Input/Output loops
    this.scheduler.registerLoop(this.inputLoop, 1);
    this.scheduler.registerLoop(this.outputLoop, 2);

    // Executive loop
    this.scheduler.registerLoop(new ExecutiveLoop({
      maxConcurrentChains: 3,
      clarificationGenerator: (u) => `I need clarification: ${u}`,
    }), 3);

    // Critic loop with invariant checking
    this.scheduler.registerLoop(new IntegratedCriticLoop({
      minPlanDepth: 2,
      invariantChecker: this.invariantChecker,
    }), 4);

    // Monitor loop with self-model integration
    this.scheduler.registerLoop(new IntegratedMonitorLoop({
      confidenceThreshold: 0.5,
      enableExperiments: true,
      selfModel: this.selfModel,
    }), 5);

    // Integrated concept/schema loop
    if (this.config.enableAbstractions) {
      this.scheduler.registerLoop(new AbstractionLoop({
        conceptTagger: this.conceptTagger,
        schemaFiller: this.schemaFiller,
        conceptRegistry: this.conceptRegistry,
        schemaRegistry: this.schemaRegistry,
      }), 6);
    }

    // Integrated transfer learning loop
    if (this.config.enableTransferLearning) {
      this.scheduler.registerLoop(new TransferLearningLoop({
        skills: this.skills,
        similarity: this.similarity,
        taskTraces: this.taskTraces,
      }), 7);
    }

    // Integrated world model loop
    if (this.config.enableWorldModel) {
      this.scheduler.registerLoop(new WorldModelLoop({
        beliefGraph: this.beliefGraph,
        predictions: this.predictions,
      }), 8);
    }

    // Cold-start loop
    if (this.config.enableColdStart) {
      this.scheduler.registerLoop(new ColdStartLoop({
        noveltyDetector: this.noveltyDetector,
        coldStartProtocol: this.coldStartProtocol,
      }), 9);
    }
  }

  /**
   * Initialize common concepts, schemas, and invariants
   */
  private async initializeAbstractions(): Promise<void> {
    // Register common concepts
    await this.conceptRegistry.registerConcept(CommonConcepts.FileOperation);
    await this.conceptRegistry.registerConcept(CommonConcepts.DataAnalysis);
    await this.conceptRegistry.registerConcept(CommonConcepts.WebRequest);
    await this.conceptRegistry.registerConcept(CommonConcepts.Calculation);
    await this.conceptRegistry.registerConcept(CommonConcepts.Search);

    // Register common schemas
    await this.schemaRegistry.registerSchema(CommonSchemas.FileRead);
    await this.schemaRegistry.registerSchema(CommonSchemas.WebRequest);
    await this.schemaRegistry.registerSchema(CommonSchemas.DataQuery);

    // Register common invariants
    await this.invariantRegistry.registerInvariant(CommonInvariants.IrreversibleRequiresApproval);
    await this.invariantRegistry.registerInvariant(CommonInvariants.ExternalWriteJustification);
    await this.invariantRegistry.registerInvariant(CommonInvariants.ToolMustBeAssigned);
  }

  /**
   * Register a custom micro-loop with the scheduler.
   * Call before start() to include the loop in the runtime.
   */
  registerLoop(loop: MicroLoop, priority: number = 0): void {
    this.scheduler.registerLoop(loop, priority);
  }

  /**
   * Start the runtime
   */
  start(): void {
    this.scheduler.start();
    console.log('[IntegratedRuntime] NeuronWaves v2 (All Phases A-H) started');
  }

  /**
   * Stop the runtime
   */
  stop(): void {
    this.scheduler.stop();
    console.log('[IntegratedRuntime] NeuronWaves v2 stopped');
  }

  /**
   * Submit input to the runtime
   */
  async submitInput(sessionKey: SessionKey, content: string): Promise<string> {
    // Ensure session exists
    this.workingState.getState(sessionKey);

    // Detect concepts in input
    if (this.config.enableAbstractions) {
      const conceptDetections = await this.conceptTagger.tag({ content, sessionKey });
      if (conceptDetections.length > 0) {
        const conceptSignal = this.conceptTagger.createSignal(conceptDetections, sessionKey);
        await this.signalBus.append(conceptSignal);

        // Update working state with detected concepts
        this.workingState.applyDeltas(sessionKey, conceptDetections.map(d => ({
          section: 'activeConcepts' as const,
          path: '',
          value: d.name,
          operation: 'push' as const,
        })));
      }
    }

    // Check for novelty (cold-start)
    if (this.config.enableColdStart) {
      const workingState = this.workingState.getState(sessionKey);
      const traces = await this.taskTraces.getSessionTraces(sessionKey);
      const novelty = this.noveltyDetector.detectNovelty(
        { concepts: workingState.activeConcepts, content },
        traces,
        this.skills.getActiveSkills()
      );

      if (novelty.isNovel) {
        this.workingState.applyDeltas(sessionKey, [{
          section: 'coldStart',
          path: '',
          value: true,
          operation: 'set',
        }]);
        console.log(`[ColdStart] Novel domain detected for session ${sessionKey}`);
      }
    }

    // Create input signal
    const signal = await this.signalBus.append({
      signalId: '',
      sessionKey,
      type: 'INPUT_RECEIVED',
      payload: { content, source: 'user' },
      emittedAtMs: Date.now(),
      sourceLoop: 'external',
      priority: 'palpitation',
    });

    // Queue in input loop
    this.inputLoop.queueInput(sessionKey, {
      type: 'user_message',
      content,
      timestampMs: Date.now(),
    });

    // Trigger immediate tick
    await this.scheduler.triggerTick(sessionKey);

    return signal.signalId;
  }

  /**
   * Try to activate a skill for the current context
   */
  async tryActivateSkill(sessionKey: SessionKey): Promise<boolean> {
    if (!this.config.enableTransferLearning) return false;

    const state = this.workingState.getState(sessionKey);
    const filledSlots = state.activeSchemas.flatMap(s => Object.keys(s.filledSlots));

    for (const skill of this.skills.getActiveSkills()) {
      const activation = await this.skills.tryActivate(skill.skillId, skill.version, {
        concepts: state.activeConcepts,
        filledSlots,
      });

      if (activation.activated && activation.planTemplate) {
        console.log(`[Skill] Activated ${skill.skillId}`);
        
        // Emit skill activated signal
        await this.signalBus.append({
          signalId: '',
          sessionKey,
          type: 'SKILL_ACTIVATED',
          payload: { skillId: skill.skillId, planTemplate: activation.planTemplate },
          emittedAtMs: Date.now(),
          sourceLoop: 'TransferLearningLoop',
          priority: 'event',
        });

        return true;
      }
    }

    return false;
  }

  /**
   * Create a prediction for a step
   */
  createPrediction(
    sessionKey: SessionKey,
    stepId: string,
    expectedOutcome: unknown,
    expectedStateTransitions: Array<{ path: string; expectedValue: unknown }>
  ): string {
    if (!this.config.enableWorldModel) return '';

    const prediction = this.predictions.createPrediction(
      stepId,
      expectedOutcome,
      expectedStateTransitions,
      sessionKey
    );

    return prediction.predictionId;
  }

  /**
   * Check a prediction against actual outcome
   */
  checkPrediction(predictionId: string): { matched: boolean; mismatches: string[] } | null {
    if (!this.config.enableWorldModel) return null;

    const check = this.predictions.checkPrediction(predictionId);
    if (!check) return null;

    return {
      matched: check.matched,
      mismatches: check.mismatches,
    };
  }

  /**
   * Maybe create a task trace for a completed session
   */
  private async maybeCreateTaskTrace(sessionKey: SessionKey): Promise<void> {
    if (!this.config.enableTransferLearning) return;

    const state = this.workingState.getState(sessionKey);
    
    // Only create trace if we have meaningful data
    if (state.executionLedger.length < 2) return;

    // Get signals for this session
    const signals = await this.signalBus.readTail(sessionKey, 0, 100);

    // Create task trace
    try {
      await this.taskTraces.createTrace({
        sessionKey,
        taskSignature: state.focus.currentObjective || 'unknown_task',
        detectedConcepts: state.activeConcepts,
        filledSlots: state.activeSchemas.reduce((acc, s) => ({ ...acc, ...s.filledSlots }), {}),
        missingSlots: state.activeSchemas.flatMap(s => s.missingSlots),
        planSteps: [], // Would be populated from actual plan
        policyDecisions: [], // Would be populated from signals
        toolCalls: state.executionLedger
          .filter(e => e.type === 'tool_result')
          .map(e => ({ toolName: 'unknown', success: true, timestampMs: e.timestampMs })),
        evaluation: {
          result: state.uncertainties.length === 0 ? 'success' : 'partial',
          summary: `Session with ${state.executionLedger.length} actions`,
        },
        signals,
      });
    } catch (error) {
      // Silently fail - trace creation is best-effort
    }
  }

  /**
   * Get working state
   */
  getWorkingState(sessionKey: SessionKey): WorkingState {
    return this.workingState.getState(sessionKey);
  }

  /**
   * Get status
   */
  getStatus(): RuntimeStatus & {
    transferLearning: boolean;
    abstractions: boolean;
    worldModel: boolean;
    coldStart: boolean;
    replay: boolean;
  } {
    return {
      isRunning: this.scheduler.getIsRunning(),
      activeSessions: this.workingState.getActiveSessions(),
      registeredLoops: this.scheduler.getRegisteredLoops(),
      tickCount: this.tickCount,
      transferLearning: this.config.enableTransferLearning,
      abstractions: this.config.enableAbstractions,
      worldModel: this.config.enableWorldModel,
      coldStart: this.config.enableColdStart,
      replay: this.config.enableReplay,
    };
  }

  /**
   * Get tick records
   */
  getTickRecords(sessionKey: SessionKey) {
    return this.scheduler.getTickRecords(sessionKey);
  }

  /**
   * Run CI check
   */
  async runCICheck(sessionKey: SessionKey): Promise<{ passed: boolean; message: string }> {
    if (!this.config.enableReplay) {
      return { passed: true, message: 'Replay disabled' };
    }
    const result = await this.ciGate.runCheck(sessionKey);
    return { passed: result.passed, message: result.message };
  }

  /**
   * Get BeliefGraph stats
   */
  getWorldModelStats(sessionKey: SessionKey) {
    if (!this.config.enableWorldModel) return null;
    return this.beliefGraph.getStats(sessionKey);
  }

  /**
   * Get similar traces
   */
  async findSimilarTraces(sessionKey: SessionKey, topK: number = 5): Promise<Array<{ traceId: string; similarity: number }>> {
    if (!this.config.enableTransferLearning) return [];

    const traces = await this.taskTraces.getSessionTraces(sessionKey);
    if (traces.length === 0) return [];

    const targetTrace = traces[traces.length - 1];
    const candidates = traces.slice(0, -1);

    return this.similarity.findSimilar(targetTrace, candidates, topK);
  }
}

// ============================================================================
// Integrated Micro-Loops
// ============================================================================

/** Integrated Critic Loop with invariant checking */
class IntegratedCriticLoop extends CriticLoop {
  private invariantChecker: InvariantChecker;

  constructor(config: CriticLoopConfig & { invariantChecker: InvariantChecker }) {
    super(config);
    this.invariantChecker = config.invariantChecker;
  }

  async tick(input: { signals: Signal[]; workingState: WorkingState; sessionKey: SessionKey }): Promise<TickResult> {
    const result = await super.tick(input);

    // Check invariants for any PLAN_CREATED signals
    for (const signal of input.signals) {
      if (signal.type === 'PLAN_CREATED') {
        const payload = signal.payload as { steps: PlanStep[] };
        const invariantResults = await this.invariantChecker.checkInvariants({
          steps: payload.steps,
          concepts: input.workingState.activeConcepts,
          sessionKey: input.sessionKey,
        });

        for (const invResult of invariantResults) {
          if (invResult.violated) {
            result.signalsOut.push(this.invariantChecker.createViolationSignal(invResult, input.sessionKey));
            result.signalsOut.push(this.invariantChecker.createRepairSignal(invResult, input.sessionKey));
          }
        }
      }
    }

    return result;
  }
}

/** Integrated Monitor Loop with self-model updates */
class IntegratedMonitorLoop extends MonitorLoop {
  private selfModelManager: SelfModelManager;

  constructor(config: MonitorLoopConfig & { selfModel: SelfModelManager }) {
    super(config);
    this.selfModelManager = config.selfModel;
  }

  tick(input: { signals: Signal[]; workingState: WorkingState; sessionKey: SessionKey }): TickResult {
    const result = super.tick(input);

    // Apply self-model updates
    for (const signal of input.signals) {
      if (signal.type === 'STEP_EXECUTED') {
        const payload = signal.payload as { stepId: string; result?: { toolName?: string } };
        const toolName = payload.result?.toolName || 'unknown';
        this.selfModelManager.applyUpdate(input.sessionKey, { type: 'step_executed', stepId: payload.stepId });
        this.selfModelManager.applyUpdate(input.sessionKey, { type: 'tool_success', toolName });
      }
      if (signal.type === 'STEP_FAILED') {
        const payload = signal.payload as { stepId: string; error: string };
        this.selfModelManager.applyUpdate(input.sessionKey, { type: 'step_failed', stepId: payload.stepId, error: payload.error });
      }
    }

    return result;
  }
}

/** Abstraction Loop - handles concept tagging and schema filling */
interface AbstractionLoopConfig {
  conceptTagger: ConceptTagger;
  schemaFiller: SchemaFiller;
  conceptRegistry: ConceptRegistry;
  schemaRegistry: SchemaRegistry;
}

class AbstractionLoop implements MicroLoop {
  readonly name = 'AbstractionLoop';
  readonly rhythm = 'event' as const;
  readonly tickBudgetMs = 100;
  readonly maxSignalsOut = 10;
  readonly reads = ['activeConcepts', 'activeSchemas'] as const;
  readonly writes = ['activeConcepts', 'activeSchemas'] as const;
  readonly subscriptions: SignalType[] = ['INPUT_RECEIVED', 'CONCEPTS_DETECTED'];

  private config: AbstractionLoopConfig;

  constructor(config: AbstractionLoopConfig) {
    this.config = config;
  }

  async tick(input: { signals: Signal[]; workingState: WorkingState; sessionKey: SessionKey }): Promise<TickResult> {
    const signalsOut: Signal[] = [];
    const stateDeltas: StateDelta[] = [];

    for (const signal of input.signals) {
      if (signal.type === 'INPUT_RECEIVED') {
        const payload = signal.payload as { content: string };

        // Tag concepts
        const detections = await this.config.conceptTagger.tag({
          content: payload.content,
          sessionKey: input.sessionKey,
        });

        for (const detection of detections) {
          stateDeltas.push({
            section: 'activeConcepts',
            path: '',
            value: detection.name,
            operation: 'push',
          });

          // Try to fill schemas for detected concepts
          const schemaResults = await this.config.schemaFiller.fillSlots({
            content: payload.content,
            concept: detection.name,
            sessionKey: input.sessionKey,
          });

          for (const result of schemaResults) {
            stateDeltas.push({
              section: 'activeSchemas',
              path: '',
              value: this.config.schemaFiller.toActiveSchema(result),
              operation: 'push',
            });

            if (result.missingSlots.length > 0) {
              const schema = this.config.schemaRegistry.getSchema(result.schemaId);
              if (schema) {
                signalsOut.push(this.config.schemaFiller.createMissingSignal(result, schema, input.sessionKey));
              }
            }
          }
        }
      }
    }

    return {
      signalsOut,
      stateDelta: stateDeltas,
      metrics: { durationMs: 0, signalsProcessed: input.signals.length, signalsEmitted: signalsOut.length },
    };
  }
}

/** Transfer Learning Loop - handles skill activation */
interface TransferLearningLoopConfig {
  skills: SkillsManager;
  similarity: SimilarityRetriever;
  taskTraces: TaskTraceManager;
}

class TransferLearningLoop implements MicroLoop {
  readonly name = 'TransferLearningLoop';
  readonly rhythm = 'event' as const;
  readonly tickBudgetMs = 150;
  readonly maxSignalsOut = 5;
  readonly reads = ['activeConcepts', 'activeSchemas'] as const;
  readonly writes = [] as const;
  readonly subscriptions: SignalType[] = ['CONCEPTS_DETECTED', 'PLAN_CREATED'];

  private config: TransferLearningLoopConfig;

  constructor(config: TransferLearningLoopConfig) {
    this.config = config;
  }

  async tick(input: { signals: Signal[]; workingState: WorkingState; sessionKey: SessionKey }): Promise<TickResult> {
    const signalsOut: Signal[] = [];
    const stateDeltas: StateDelta[] = [];

    for (const signal of input.signals) {
      if (signal.type === 'CONCEPTS_DETECTED') {
        // Try to find applicable skills
        const filledSlots = input.workingState.activeSchemas.flatMap(s => Object.keys(s.filledSlots));
        
        for (const skill of this.config.skills.getActiveSkills()) {
          const activation = await this.config.skills.tryActivate(skill.skillId, skill.version, {
            concepts: input.workingState.activeConcepts,
            filledSlots,
          });

          if (activation.activated) {
            signalsOut.push({
              signalId: '',
              sessionKey: input.sessionKey,
              type: 'SKILL_ACTIVATED',
              payload: { skillId: skill.skillId, planTemplate: activation.planTemplate },
              emittedAtMs: Date.now(),
              sourceLoop: this.name,
              priority: 'event',
              causedBy: [signal.signalId],
            });
          }
        }
      }
    }

    return {
      signalsOut,
      stateDelta: stateDeltas,
      metrics: { durationMs: 0, signalsProcessed: input.signals.length, signalsEmitted: signalsOut.length },
    };
  }
}

/** World Model Loop - handles beliefs and predictions */
interface WorldModelLoopConfig {
  beliefGraph: BeliefGraphManager;
  predictions: PredictionsManager;
}

class WorldModelLoop implements MicroLoop {
  readonly name = 'WorldModelLoop';
  readonly rhythm = 'heartbeat' as const;
  readonly tickBudgetMs = 100;
  readonly maxSignalsOut = 5;
  readonly reads = ['beliefGraphRef'] as const;
  readonly writes = ['beliefGraphRef'] as const;
  readonly subscriptions: SignalType[] = ['TOOL_RESULT_RECEIVED', 'STEP_EXECUTED', 'PREDICTION_MISMATCH'];

  private config: WorldModelLoopConfig;

  constructor(config: WorldModelLoopConfig) {
    this.config = config;
  }

  tick(input: { signals: Signal[]; workingState: WorkingState; sessionKey: SessionKey }): TickResult {
    const signalsOut: Signal[] = [];
    const stateDeltas: StateDelta[] = [];

    for (const signal of input.signals) {
      if (signal.type === 'TOOL_RESULT_RECEIVED') {
        const payload = signal.payload as { result?: { entity?: { type: string; properties: Record<string, unknown> } } };
        
        // Add entity to belief graph if present in result
        if (payload.result?.entity) {
          const entity = this.config.beliefGraph.addEntity(
            input.sessionKey,
            {
              type: payload.result.entity.type,
              properties: payload.result.entity.properties,
              confidence: 0.9,
            },
            { source: 'tool', refId: signal.signalId }
          );

          stateDeltas.push({
            section: 'beliefGraphRef',
            path: '',
            value: entity.entityId,
            operation: 'set',
          });
        }
      }

      if (signal.type === 'PREDICTION_MISMATCH') {
        const payload = signal.payload as { predictionId: string; mismatches: string[] };
        
        // Generate hypotheses
        const check = this.config.predictions.checkPrediction(payload.predictionId);
        if (check && !check.matched) {
          const hypotheses = this.config.predictions.generateHypothesis(check);
          
          for (const hypothesis of hypotheses) {
            const experiment = this.config.predictions.proposeExperiment(hypothesis, check.stepId);
            
            signalsOut.push({
              signalId: '',
              sessionKey: input.sessionKey,
              type: 'SCHEDULE_EXPERIMENT',
              payload: { hypothesis, experiment },
              emittedAtMs: Date.now(),
              sourceLoop: this.name,
              priority: 'heartbeat',
              causedBy: [signal.signalId],
            });
          }
        }
      }
    }

    return {
      signalsOut,
      stateDelta: stateDeltas,
      metrics: { durationMs: 0, signalsProcessed: input.signals.length, signalsEmitted: signalsOut.length },
    };
  }
}

/** Cold-Start Loop - handles novelty detection */
interface ColdStartLoopConfig {
  noveltyDetector: NoveltyDetector;
  coldStartProtocol: ColdStartProtocol;
}

class ColdStartLoop implements MicroLoop {
  readonly name = 'ColdStartLoop';
  readonly rhythm = 'heartbeat' as const;
  readonly tickBudgetMs = 50;
  readonly maxSignalsOut = 3;
  readonly reads = ['coldStart', 'activeConcepts'] as const;
  readonly writes = ['coldStart'] as const;
  readonly subscriptions: SignalType[] = ['NOVEL_DOMAIN_DETECTED'];

  private config: ColdStartLoopConfig;

  constructor(config: ColdStartLoopConfig) {
    this.config = config;
  }

  tick(input: { signals: Signal[]; workingState: WorkingState; sessionKey: SessionKey }): TickResult {
    const signalsOut: Signal[] = [];
    const stateDeltas: StateDelta[] = [];

    // If in cold-start mode, suggest learn-first actions
    if (input.workingState.coldStart) {
      console.log(`[ColdStart] Session ${input.sessionKey} in learn-first mode`);
      
      // This would trigger more conservative behavior in other loops
      // by setting appropriate flags in working state
    }

    return {
      signalsOut,
      stateDelta: stateDeltas,
      metrics: { durationMs: 0, signalsProcessed: input.signals.length, signalsEmitted: signalsOut.length },
    };
  }
}

/** Create integrated runtime */
export function createIntegratedRuntime(config?: IntegratedRuntimeConfig): IntegratedNeuronWavesRuntime {
  return new IntegratedNeuronWavesRuntime(config);
}
