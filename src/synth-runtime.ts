/**
 * Synth Runtime - Complete Working System
 * 
 * This is the main integration that actually runs:
 * - Signal-driven core with all 6 loops
 * - CoreMemories with automatic maintenance
 * - Learning governance with file-based versioning
 * - Continuous operation with heartbeat
 * - Error boundaries and recovery
 */

import { SignalBus, SignalBuilder } from './runtime/signal-bus.js';
import { WorkingStateManager } from './runtime/working-state.js';
import { Scheduler, defaultSchedulerConfig } from './runtime/scheduler.js';
import { InputLoop } from './loops/input-loop.js';
import { ExecutiveLoop } from './loops/executive-loop.js';
import { CriticLoop } from './loops/critic-loop.js';
import { MonitorLoop } from './loops/monitor-loop.js';
import { OutputLoop } from './loops/output-loop.js';
import { CortexLoop } from './loops/cortex-loop.js';
import { CoreMemories } from './memory/core-memories.js';
import { LearningCategories, LearningCategory } from './learning/learning-categories.js';
import { ContinuousPretraining } from './learning/continuous-pretraining.js';
import { GoalAutonomy } from './autonomy/goal-autonomy.js';
import { ExecutiveControl } from './autonomy/executive-control.js';
import { Metacognition } from './cognition/metacognition.js';
import { OllamaProvider, MockLLMProvider, type LLMProvider } from './llm/llm-provider.js';
import { VectorStore } from './vector/vector-store.js';
import { ErrorBoundary } from './utils/error-boundary.js';
import { ConfigManager } from './config/system-config.js';
import { createV1PipelineAdapter } from './runtime/v1-pipeline-adapter.js';
import { Autonomy, type AutonomyLevel } from './policy/types.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Synth runtime configuration */
export interface SynthRuntimeConfig {
  baseDir: string;
  llm: LLMProvider;
  enableAutonomy: boolean;
  enableLearning: boolean;
  enableMemory: boolean;
  tickRate: number;
  autonomyLevel: AutonomyLevel;
  policyPath: string;
}

/**
 * Synth Runtime - Complete Working AGI System
 */
export class SynthRuntime {
  private config: Required<SynthRuntimeConfig>;

  // Core runtime
  private signalBus: SignalBus;
  private workingState: WorkingStateManager;
  private scheduler: Scheduler;

  // Loops
  private inputLoop: InputLoop;
  private executiveLoop: ExecutiveLoop;
  private criticLoop: CriticLoop;
  private monitorLoop: MonitorLoop;
  private outputLoop: OutputLoop;
  private cortexLoop: CortexLoop;

  // Memory
  private coreMemories: CoreMemories;
  private vectorStore: VectorStore;

  // Learning
  private learningCategories: LearningCategories;
  private continuousPretraining: ContinuousPretraining;

  // Autonomy
  private goalAutonomy: GoalAutonomy;
  private executiveControl: ExecutiveControl;
  private metacognition: Metacognition;

  // Error handling
  private errorBoundary: ErrorBoundary;

  private readonly v1Pipeline: ReturnType<typeof createV1PipelineAdapter>;

  // Heartbeat
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private maintenanceInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(config: Partial<SynthRuntimeConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/runtime',
      llm: config.llm ?? new MockLLMProvider(4096),
      enableAutonomy: config.enableAutonomy ?? true,
      enableLearning: config.enableLearning ?? true,
      enableMemory: config.enableMemory ?? true,
      tickRate: config.tickRate ?? 10,
      autonomyLevel: config.autonomyLevel ?? Autonomy.Level1,
      policyPath: config.policyPath ?? join(config.baseDir ?? '.synth/runtime', 'policy.yaml'),
    };

    this.v1Pipeline = createV1PipelineAdapter(this.config.llm);

    // Initialize core components
    this.signalBus = new SignalBus({ baseDir: join(this.config.baseDir, 'signals') });
    this.workingState = new WorkingStateManager({ baseDir: join(this.config.baseDir, 'state') });
    this.scheduler = new Scheduler(
      { ...defaultSchedulerConfig, heartbeatIntervalMs: 1000 / this.config.tickRate },
      this.signalBus,
      this.workingState
    );

    // Initialize error boundary
    this.errorBoundary = new ErrorBoundary({ emitSignals: true }, this.signalBus);

    // Initialize loops
    this.inputLoop = new InputLoop({});

    this.executiveLoop = new ExecutiveLoop({});

    this.criticLoop = new CriticLoop({});

    this.monitorLoop = new MonitorLoop({});

    this.outputLoop = new OutputLoop({
      publisher: (output) => {
        // Default publisher for runtime
      }
    });

    this.cortexLoop = new CortexLoop({
      artifactBaseDir: join(this.config.baseDir, 'artifacts'),
      v1Loop: this.v1Pipeline
    });

    // Initialize memory
    this.coreMemories = new CoreMemories({
      baseDir: join(this.config.baseDir, 'core-memories'),
    });

    this.vectorStore = new VectorStore({
      baseDir: join(this.config.baseDir, 'vectors'),
      dimension: 4096,
    });

    // Initialize learning
    this.learningCategories = new LearningCategories({
      baseDir: join(this.config.baseDir, 'learning'),
    });

    this.continuousPretraining = new ContinuousPretraining({
      baseDir: join(this.config.baseDir, 'pretraining'),
      embeddingDimension: 4096,
      llm: this.config.llm,
    });

    // Initialize autonomy
    this.goalAutonomy = new GoalAutonomy({
      baseDir: join(this.config.baseDir, 'goals'),
    });

    this.executiveControl = new ExecutiveControl({
      baseDir: join(this.config.baseDir, 'executive'),
    });

    this.metacognition = new Metacognition({
      baseDir: join(this.config.baseDir, 'metacognition'),
    });
  }

  /**
   * Initialize all components
   */
  async initialize(): Promise<void> {

    // Create directories
    await mkdir(this.config.baseDir, { recursive: true });

    // Initialize memory
    if (this.config.enableMemory) {
      await this.coreMemories.initialize();
      await this.vectorStore.initialize();
    }

    // Initialize learning
    if (this.config.enableLearning) {
      await this.learningCategories.initialize();
      await this.continuousPretraining.initialize();
    }

    // Initialize autonomy
    if (this.config.enableAutonomy) {
      await this.goalAutonomy.initialize();
      await this.executiveControl.initialize();
      await this.metacognition.initialize();
    }

    // Register loops with scheduler
    this.scheduler.registerLoop(this.inputLoop);
    this.scheduler.registerLoop(this.executiveLoop);
    this.scheduler.registerLoop(this.criticLoop);
    this.scheduler.registerLoop(this.monitorLoop);
    this.scheduler.registerLoop(this.outputLoop);
    this.scheduler.registerLoop(this.cortexLoop);

    // Signal subscriptions for learning (disabled - SignalBus doesn't support subscribe)
    // this.setupSignalSubscriptions();
  }

  /**
   * Start the runtime
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start scheduler
    this.scheduler.start();

    // Start heartbeat (every 1 second)
    this.heartbeatInterval = setInterval(() => {
      this.heartbeat();
    }, 1000);

    // Start maintenance (every 60 seconds)
    this.maintenanceInterval = setInterval(() => {
      this.maintenance();
    }, 60000);

    // Generate initial goals
    if (this.config.enableAutonomy) {
      await this.goalAutonomy.generateGoals({
        knownConcepts: [],
        recentExperiences: [],
        currentCapabilities: ['basic_processing'],
        failedAttempts: [],
        userRequests: [],
      });
    }
  }

  /**
   * Stop the runtime
   */
  stop(): void {
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }

    this.scheduler.stop();
    console.log('Synth Runtime - Stopped');
  }

  /**
   * Process user input
   */
  async processInput(input: string, context?: string[]): Promise<string> {
    const sessionKey = `session-${Date.now()}`;

    // 1. Store in memory
    if (this.config.enableMemory) {
      await this.coreMemories.addFlashEntry({
        type: 'conversation',
        content: input,
        speaker: 'user',
        keywords: this.extractKeywords(input),
        emotionalSalience: 0.5,
        userFlagged: false,
        linkedTo: [],
        sessionKey,
        metadata: { context },
      });
    }

    // 2. Get relevant memories
    let memoryContext: string[] = [];
    if (this.config.enableMemory) {
      const memories = await this.coreMemories.getContextMemories(sessionKey);
      memoryContext = memories.flash.map(m => m.content);
    }

    // 3. Run real pipeline adapter (plan -> policy -> execution -> evaluation)
    const signalCursor = this.signalBus.getTailOffset(sessionKey);

    const pipelineResult = await this.v1Pipeline(
      { content: input, sessionKey, memoryContext },
      {
        artifactBaseDir: join(this.config.baseDir, 'artifacts'),
        autonomyLevel: this.config.autonomyLevel,
        enableMemory: this.config.enableMemory,
        policyPath: this.config.policyPath,
      }
    );

    await this.signalBus.append({
      type: 'INPUT_RECEIVED',
      payload: { content: input, source: 'user' },
      sessionKey,
      sourceLoop: 'external',
      priority: 'palpitation',
      emittedAtMs: Date.now(),
      dedupeKey: `input-${sessionKey}`,
    });

    await this.signalBus.append({
      type: 'OUTPUT_READY',
      payload: {
        chainId: pipelineResult.plan.id,
        content: pipelineResult.evaluation.summary,
        contentType: 'text',
      },
      sessionKey,
      sourceLoop: 'CortexLoop',
      priority: 'event',
      emittedAtMs: Date.now(),
      causedBy: [],
    });

    await this.scheduler.triggerTick(sessionKey);

    const response = (await this.waitForOutputSignal(sessionKey, signalCursor)) ?? pipelineResult.evaluation.summary;

    await this.writeRunManifest(sessionKey, {
      input,
      response,
      planId: pipelineResult.plan.id,
      evaluation: {
        result: pipelineResult.evaluation.result,
        summary: pipelineResult.evaluation.summary,
      },
      policyDecisions: pipelineResult.artifactPaths.policyAuditEvents.map(e => ({
        stepId: e.stepId,
        decision: e.decision,
        reason: e.reason,
      })),
      policyLoadError: pipelineResult.artifactPaths.policyLoadError,
    });

    // 4. Store response
    if (this.config.enableMemory) {
      await this.coreMemories.addFlashEntry({
        type: 'conversation',
        content: response,
        speaker: 'assistant',
        keywords: this.extractKeywords(response),
        emotionalSalience: 0.5,
        userFlagged: false,
        linkedTo: [],
        sessionKey,
        metadata: {
          response: true,
          planId: pipelineResult.plan.id,
          evaluationResult: pipelineResult.evaluation.result,
        },
      });
    }

    // 5. Create embedding and store in vector store
    if (this.config.enableMemory) {
      const embedding = await this.config.llm.embed(input);
      await this.vectorStore.add(`mem-${Date.now()}`, embedding, {
        text: input,
        response,
        sessionKey,
      });
    }

    // 6. Detect learning gaps
    if (this.config.enableLearning) {
      const unknownTerms = await this.detectUnknownTerms(input);
      if (unknownTerms.length > 0) {
        await this.learningCategories.detectGap({
          category: LearningCategory.MEMORY,
          description: `Unknown terms in input: ${unknownTerms.join(', ')}`,
          unknownTerms,
          confidenceDrop: 0.3,
          context: input,
        });
      }
    }

    return response;
  }

  private async waitForOutputSignal(sessionKey: string, fromOffset: number): Promise<string | null> {
    const timeoutMs = 5000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const signals = await this.signalBus.readTail(sessionKey, fromOffset, 200);
      const output = signals.find(s => s.type === 'OUTPUT_READY');
      if (output) {
        const payload = output.payload as { content?: string };
        if (typeof payload.content === 'string') {
          return payload.content;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    return null;
  }

  private async writeRunManifest(sessionKey: string, payload: {
    input: string;
    response: string;
    planId: string;
    evaluation: { result: string; summary: string };
    policyDecisions: Array<{ stepId: string; decision: string; reason: string }>;
    policyLoadError?: string;
  }): Promise<void> {
    const runDir = join(this.config.baseDir, 'artifacts', sessionKey, 'runs');
    await mkdir(runDir, { recursive: true });

    const manifest = {
      runId: `run-${Date.now()}`,
      sessionKey,
      timestampMs: Date.now(),
      ...payload,
    };

    await writeFile(join(runDir, 'latest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  }

  /**
   * Query knowledge
   */
  async queryKnowledge(query: string): Promise<Array<{
    content: string;
    score: number;
  }>> {
    const embedding = await this.config.llm.embed(query);
    const results = this.vectorStore.search(embedding, 5);

    return results.map(r => ({
      content: String(r.metadata.text ?? ''),
      score: r.score,
    }));
  }

  /**
   * Get system status
   */
  getStatus(): {
    running: boolean;
    memoryStats: Awaited<ReturnType<CoreMemories['getStats']>> | null;
    learningStats: Awaited<ReturnType<ContinuousPretraining['getStats']>> | null;
    activeGoals: number;
  } {
    return {
      running: this.isRunning,
      memoryStats: null, // Would need async
      learningStats: null, // Would need async
      activeGoals: this.goalAutonomy.getActiveGoals().length,
    };
  }

  /**
   * Heartbeat - runs every second
   */
  private async heartbeat(): Promise<void> {
    if (!this.isRunning) return;

    await this.errorBoundary.execute(async () => {
      // 1. Process goals
      if (this.config.enableAutonomy) {
        const goal = this.goalAutonomy.selectNextGoal();
        if (goal) {
          this.goalAutonomy.activateGoal(goal.goalId);

          // Pursue goal based on type
          switch (goal.type) {
            case 'knowledge':
              await this.pursueKnowledgeGoal(goal);
              break;
            case 'exploration':
              await this.pursueExplorationGoal(goal);
              break;
          }
        }
      }

      // 2. Metacognitive check (every 5 seconds)
      if (Date.now() % 5000 < 1000 && this.config.enableAutonomy) {
        this.metacognition.monitor({
          recentActions: [],
          recentErrors: [],
          timeOnTask: 0,
          taskComplexity: 0.5,
          currentStrategy: 'default',
        });
      }

      // 3. Update executive control
      this.executiveControl.updateAttention();

    }, { component: 'SynthRuntime', operation: 'heartbeat', timestamp: Date.now() });
  }

  /**
   * Maintenance - runs every 60 seconds
   */
  private async maintenance(): Promise<void> {
    if (!this.isRunning) return;


    await this.errorBoundary.execute(async () => {
      // 1. Memory compression
      if (this.config.enableMemory) {
        const compressed = await this.coreMemories.runMaintenance();
      }

      // Learning cycle happens asynchronously within processExperience
      if (this.config.enableLearning) {
        // no-op, continuous pretraining handles its own training rhythm
      }

    }, { component: 'SynthRuntime', operation: 'maintenance', timestamp: Date.now() });
  }

  /**
   * Setup signal subscriptions for learning
   */
  private setupSignalSubscriptions(): void {
    // Legacy mapping moved to SignalBus
  }

  /**
   * Pursue a knowledge goal
   */
  private async pursueKnowledgeGoal(goal: { goalId: string; description: string }): Promise<void> {

    // Query LLM for knowledge
    const knowledge = await this.config.llm.generate(
      `Explain ${goal.description} in detail`
    );

    // Store in memory
    if (this.config.enableMemory) {
      await this.coreMemories.addFlashEntry({
        type: 'learning',
        content: knowledge,
        speaker: 'assistant',
        keywords: this.extractKeywords(goal.description),
        emotionalSalience: 0.7,
        userFlagged: false,
        linkedTo: [],
        sessionKey: goal.goalId,
        metadata: { goalId: goal.goalId },
      });
    }

    // Report progress
    await this.goalAutonomy.reportProgress(goal.goalId, 1.0, 'Knowledge acquired');
  }

  /**
   * Pursue an exploration goal
   */
  private async pursueExplorationGoal(goal: { goalId: string; description: string }): Promise<void> {

    // Generate exploration
    const exploration = await this.config.llm.generate(
      `Explore the topic: ${goal.description}. What are the key concepts?`
    );

    // Store in memory
    if (this.config.enableMemory) {
      await this.coreMemories.addFlashEntry({
        type: 'observation',
        content: exploration,
        speaker: 'assistant',
        keywords: this.extractKeywords(goal.description),
        emotionalSalience: 0.6,
        userFlagged: false,
        linkedTo: [],
        sessionKey: goal.goalId,
        metadata: { goalId: goal.goalId },
      });
    }

    // Report progress
    await this.goalAutonomy.reportProgress(goal.goalId, 1.0, 'Exploration complete');
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .filter(w => !this.isStopWord(w));
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Detect unknown terms
   */
  private async detectUnknownTerms(text: string): Promise<string[]> {
    // Simple heuristic: words that look technical/domain-specific
    const words = text.split(/\s+/);
    const unknown: string[] = [];

    for (const word of words) {
      const clean = word.toLowerCase().replace(/[^a-z]/g, '');
      if (clean.length > 6 && !this.isCommonWord(clean)) {
        // Check if we have knowledge about it
        const knowledge = await this.coreMemories.searchByKeyword(clean);
        if (knowledge.totalFound === 0) {
          unknown.push(clean);
        }
      }
    }

    return unknown.slice(0, 5);
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'about', 'above', 'after', 'again', 'against', 'all', 'also', 'am', 'an', 'and',
      'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
      'between', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does',
      'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has',
      'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
      'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'let', 'me', 'more',
      'most', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only',
      'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
      'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them',
      'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
      'too', 'under', 'until', 'up', 'very', 'was', 'we', 'were', 'what', 'when',
      'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
      'yours', 'yourself', 'yourselves'
    ]);
    return stopWords.has(word.toLowerCase());
  }

  /**
   * Check if word is common
   */
  private isCommonWord(word: string): boolean {
    const common = new Set([
      'hello', 'thanks', 'please', 'goodbye', 'yes', 'no', 'maybe', 'okay', 'sure',
      'welcome', 'sorry', 'excuse', 'pardon', 'congratulations', 'happy', 'sad',
      'good', 'bad', 'great', 'nice', 'fine', 'well', 'better', 'best', 'worse',
      'worst', 'big', 'small', 'large', 'tiny', 'huge', 'little', 'short', 'tall',
      'long', 'new', 'old', 'young', 'early', 'late', 'first', 'last', 'next',
      'previous', 'same', 'different', 'other', 'another', 'such', 'same', 'like'
    ]);
    return common.has(word.toLowerCase());
  }
}
