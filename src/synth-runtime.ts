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
import { Consolidator, SemanticStore } from './memory/semantic/index.js';
import { LearningCategories, LearningCategory } from './learning/learning-categories.js';
import { ContinuousPretraining } from './learning/continuous-pretraining.js';
import { GoalAutonomy } from './autonomy/goal-autonomy.js';
import { ExecutiveControl } from './autonomy/executive-control.js';
import { Metacognition } from './cognition/metacognition.js';
import { OllamaProvider, MockLLMProvider, createReliableLLMProvider, type LLMProvider } from './llm/llm-provider.js';
import { VectorStore } from './vector/vector-store.js';
import { ErrorBoundary } from './utils/error-boundary.js';
import { ConfigManager } from './config/system-config.js';
import { createV1PipelineAdapter } from './runtime/v1-pipeline-adapter.js';
import { Autonomy, type AutonomyLevel } from './policy/types.js';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';


interface SessionWorldState {
  facts: string[];
  assumptions: string[];
  openGoals: string[];
  constraints: string[];
  updatedAtMs: number;
}

interface WorldStateDiff {
  stepId: string;
  type: 'fact_add' | 'assumption_add' | 'goal_add' | 'constraint_add' | 'contradiction';
  value: string;
  status: string;
}

interface ContradictionEvent {
  stepId: string;
  expected: string;
  actual: string;
}

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
  private semanticStore: SemanticStore;
  private semanticConsolidator: Consolidator;

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
    const userProvidedLLM = config.llm !== undefined;

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

    // Initialize core components
    this.signalBus = new SignalBus({ baseDir: join(this.config.baseDir, 'signals') });

    this.config.llm = createReliableLLMProvider(this.config.llm, {
      timeoutMs: Number(process.env.SYNTH_LLM_TIMEOUT_MS ?? '5000'),
      maxPromptChars: Number(process.env.SYNTH_LLM_MAX_PROMPT_CHARS ?? '4000'),
      maxContextChars: Number(process.env.SYNTH_LLM_MAX_CONTEXT_CHARS ?? '6000'),
      maxInputTokensApprox: Number(process.env.SYNTH_LLM_MAX_INPUT_TOKENS ?? '3500'),
      fallbackProvider: (process.env.SYNTH_LLM_DISABLE_FALLBACK === '1' || userProvidedLLM)
        ? undefined
        : new MockLLMProvider(4096),
      onDegraded: (event) => {
        void this.signalBus.append({
          type: 'MODEL_ERROR_DETECTED',
          payload: {
            errorType: `llm_${event.type}`,
            description: event.reason,
            affectedChains: ['llm-runtime'],
          },
          sessionKey: 'llm-runtime',
          sourceLoop: 'LLMProvider',
          priority: 'event',
          emittedAtMs: Date.now(),
        }).catch(() => undefined);
      },
    });

    this.v1Pipeline = createV1PipelineAdapter(this.config.llm);
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
      v1Loop: this.v1Pipeline,
      autonomyLevel: this.config.autonomyLevel,
      enableMemory: this.config.enableMemory,
      policyPath: this.config.policyPath,
    });

    // Initialize memory
    this.coreMemories = new CoreMemories({
      baseDir: join(this.config.baseDir, 'core-memories'),
    });

    this.vectorStore = new VectorStore({
      baseDir: join(this.config.baseDir, 'vectors'),
      dimension: 4096,
    });

    this.semanticStore = new SemanticStore({
      baseDir: join(this.config.baseDir, 'semantic-store'),
      maxFacts: 2000,
      recallLimit: 10,
    });
    this.semanticConsolidator = new Consolidator();

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
      await this.semanticStore.init();
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

    // 3. Signal-driven runtime path: queue input, emit INPUT_RECEIVED, and wait for OUTPUT_SENT.
    const signalCursor = this.signalBus.getTailOffset(sessionKey);

    await this.signalBus.append({
      type: 'INPUT_RECEIVED',
      payload: {
        content: input,
        source: 'user',
        metadata: {
          context,
          memoryContext,
        },
      },
      sessionKey,
      sourceLoop: 'external',
      priority: 'palpitation',
      emittedAtMs: Date.now(),
      dedupeKey: `input-${sessionKey}`,
    });

    await this.scheduler.triggerTick(sessionKey);

    const output = await this.waitForOutputSignal(sessionKey, signalCursor);
    const response = output?.content ?? 'No output emitted by runtime.';

    const runSummary = await this.collectRunSummary(sessionKey, signalCursor);
    const policyDecisions = Array.isArray(runSummary.policyDecisions) ? runSummary.policyDecisions : [];
    const stepOutcomes = Array.isArray(runSummary.stepOutcomes) ? runSummary.stepOutcomes : [];
    const toolOutcomes = Array.isArray(runSummary.toolOutcomes) ? runSummary.toolOutcomes : [];
    const executionTrace = Array.isArray(runSummary.executionTrace) ? runSummary.executionTrace : [];
    const actionGraph = runSummary.actionGraph;
    const goalStack = runSummary.goalStack;
    const criticPatch = runSummary.criticPatch;
    const reviseCycleApplied = runSummary.reviseCycleApplied;
    const worldStateBefore = await this.loadSessionWorldState(sessionKey);

    await this.writeRunManifest(sessionKey, {
      input,
      response,
      planId: runSummary.planId,
      evaluation: runSummary.evaluation,
      policyDecisions,
      stepOutcomes,
      toolOutcomes,
      actionGraph,
      executionTrace,
      worldStateBefore,
      worldStateAfter: worldStateBefore,
      worldStateDiffs: [],
      goalStack,
      criticPatch,
      reviseCycleApplied,
      policyLoadError: runSummary.policyLoadError,
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
          planId: runSummary.planId,
          evaluationResult: runSummary.evaluation.result,
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

    // 7. Consolidate semantic memory strictly from successful executed outcomes
    const successfulSteps = stepOutcomes
      .filter(step => step.status === 'executed')
      .map(step => ({
        stepId: step.stepId,
        intent: step.intent,
        actionClass: step.actionClass,
        status: 'executed' as const,
        toolName: step.toolName,
        toolInput: step.toolInput,
        outputSummary: step.outputSummary,
      }));

    const facts = this.semanticConsolidator.extractFacts(successfulSteps as any, sessionKey);
    for (const fact of facts) {
      await this.semanticStore.addFact({
        statement: fact.statement,
        evidence: fact.evidence,
        privacyLevel: fact.privacyLevel,
      });
    }

    const worldStateDiffs = this.buildWorldStateDiffs(stepOutcomes);
    const worldStateAfter = this.applyWorldStateDiffs(worldStateBefore, worldStateDiffs);
    const contradictions = this.detectContradictions(worldStateBefore, worldStateDiffs);
    await this.saveSessionWorldState(sessionKey, worldStateAfter);

    for (const diff of worldStateDiffs) {
      await this.signalBus.append({
        type: 'BELIEF_UPDATED',
        payload: {
          entityId: sessionKey,
          property: diff.type,
          oldValue: undefined,
          newValue: diff.value,
          confidence: diff.status === 'executed' ? 0.85 : 0.4,
        },
        sessionKey,
        sourceLoop: 'SynthRuntime',
        priority: 'event',
        emittedAtMs: Date.now(),
      });
    }

    for (const contradiction of contradictions) {
      await this.signalBus.append({
        type: 'PREDICTION_MISMATCH',
        payload: {
          predictionId: `contradiction-${Date.now()}-${contradiction.stepId}`,
          expected: contradiction.expected,
          actual: contradiction.actual,
          stepId: contradiction.stepId,
        },
        sessionKey,
        sourceLoop: 'SynthRuntime',
        priority: 'event',
        emittedAtMs: Date.now(),
      });
    }

    await this.writeRunManifest(sessionKey, {
      input,
      response,
      planId: runSummary.planId,
      evaluation: runSummary.evaluation,
      policyDecisions,
      stepOutcomes,
      toolOutcomes,
      actionGraph,
      executionTrace,
      worldStateBefore,
      worldStateAfter,
      worldStateDiffs,
      goalStack,
      criticPatch,
      reviseCycleApplied,
      policyLoadError: runSummary.policyLoadError,
    });

    return response;
  }

  private async waitForOutputSignal(
    sessionKey: string,
    fromOffset: number
  ): Promise<{ content: string; chainId: string | null } | null> {
    const timeoutMs = 5000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      await this.scheduler.triggerTick(sessionKey);
      const signals = await this.signalBus.readTail(sessionKey, fromOffset, 500);

      const latestOutputReady = [...signals].reverse().find(s => s.type === 'OUTPUT_READY');
      const latestOutputSent = [...signals].reverse().find(s => s.type === 'OUTPUT_SENT');

      if (latestOutputReady) {
        const payload = latestOutputReady.payload as { content?: string; chainId?: string | null };
        if (latestOutputSent && typeof payload.content === 'string') {
          return {
            content: payload.content,
            chainId: typeof payload.chainId === 'string' ? payload.chainId : null,
          };
        }
      }

      await new Promise(resolve => setTimeout(resolve, 25));
    }

    return null;
  }

  private async collectRunSummary(
    sessionKey: string,
    fromOffset: number
  ): Promise<{
    planId: string;
    evaluation: { result: string; summary: string };
    policyDecisions: Array<{ stepId: string; decision: string; reason: string }>;
    stepOutcomes: Array<{
      stepId: string;
      intent: string;
      actionClass: string;
      status: 'executed' | 'failed';
      toolName?: string;
      toolInput?: Record<string, unknown>;
      outputSummary?: string;
    }>;
    toolOutcomes: Array<{
      toolName: string;
      success: boolean;
      durationMs: number;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }>;
    actionGraph?: {
      version: 'v2';
      nodes: Array<{
        nodeId: string;
        intent: string;
        actionClass: string;
        target?: string;
        policyTags: string[];
        preconditions: string[];
        inputs: string[];
        outputs: string[];
        dependsOn: string[];
      }>;
    };
    executionTrace: Array<{
      nodeId: string;
      stepId: string;
      status: 'executed' | 'failed' | 'blocked' | 'awaiting_approval';
      startedAtMs: number;
      endedAtMs: number;
      reason?: string;
    }>;
    goalStack?: Record<string, unknown>;
    criticPatch?: { issue: string; proposedFix: string; confidence: number; reviseCycle?: number };
    reviseCycleApplied: boolean;
    policyLoadError?: string;
  }> {
    const signals = await this.signalBus.readTail(sessionKey, fromOffset, 1000);

    const planCreated = [...signals].reverse().find(signal => signal.type === 'PLAN_CREATED');
    const evaluationComplete = [...signals].reverse().find(signal => signal.type === 'EVALUATION_COMPLETE');
    const outputReady = [...signals].reverse().find(signal => signal.type === 'OUTPUT_READY');

    const planPayload = planCreated?.payload as { chainId?: string } | undefined;
    const evalPayload = evaluationComplete?.payload as {
      result?: string;
      summary?: string;
      actionGraph?: {
        version?: 'v2';
        nodes?: Array<{
          nodeId?: string;
          intent?: string;
          actionClass?: string;
          target?: string;
          policyTags?: string[];
          preconditions?: string[];
          inputs?: string[];
          outputs?: string[];
          dependsOn?: string[];
        }>;
      };
      executionTrace?: Array<{
        nodeId?: string;
        stepId?: string;
        status?: 'executed' | 'failed' | 'blocked' | 'awaiting_approval';
        startedAtMs?: number;
        endedAtMs?: number;
        reason?: string;
      }>
    } | undefined;
    const outputPayload = outputReady?.payload as { content?: string } | undefined;

    const policyDecisions = signals
      .filter(signal => signal.type === 'POLICY_DECISION_EMITTED')
      .map(signal => {
        const payload = signal.payload as { stepId?: string; decision?: string; reason?: string };
        return {
          stepId: payload.stepId ?? signal.signalId,
          decision: payload.decision ?? 'unknown',
          reason: payload.reason ?? 'No reason provided',
        };
      });

    const stepOutcomes = signals
      .filter(signal => signal.type === 'STEP_EXECUTED' || signal.type === 'STEP_FAILED')
      .map(signal => {
        if (signal.type === 'STEP_EXECUTED') {
          const payload = signal.payload as {
            stepId?: string;
            result?: { output?: unknown; toolName?: string; toolInput?: Record<string, unknown>; intent?: string; actionClass?: string };
          };
          return {
            stepId: payload.stepId ?? signal.signalId,
            intent: String(payload.result?.intent ?? ''),
            actionClass: String(payload.result?.actionClass ?? 'unknown'),
            status: 'executed' as const,
            toolName: payload.result?.toolName,
            toolInput: payload.result?.toolInput,
            outputSummary: typeof payload.result?.output === 'string' ? payload.result.output : JSON.stringify(payload.result?.output ?? ''),
          };
        }

        const failedPayload = signal.payload as { stepId?: string; error?: string };
        return {
          stepId: failedPayload.stepId ?? signal.signalId,
          intent: '',
          actionClass: 'unknown',
          status: 'failed' as const,
          outputSummary: failedPayload.error,
        };
      });

    const toolOutcomes = signals
      .filter(signal => signal.type === 'TOOL_RESULT_RECEIVED')
      .map(signal => {
        const payload = signal.payload as {
          toolName?: string;
          success?: boolean;
          durationMs?: number;
          input?: Record<string, unknown>;
          output?: Record<string, unknown>;
        };
        return {
          toolName: payload.toolName ?? 'unknown',
          success: Boolean(payload.success),
          durationMs: Number(payload.durationMs ?? 0),
          input: payload.input ?? {},
          output: payload.output ?? {},
        };
      });

    const executionTrace = Array.isArray(evalPayload?.executionTrace)
      ? evalPayload.executionTrace
          .filter(item => Boolean(item?.stepId && item?.nodeId))
          .map(item => ({
            nodeId: String(item.nodeId),
            stepId: String(item.stepId),
            status: item.status ?? 'failed',
            startedAtMs: Number(item.startedAtMs ?? 0),
            endedAtMs: Number(item.endedAtMs ?? 0),
            reason: item.reason,
          }))
      : [];

    const actionGraph = (evalPayload?.actionGraph?.version === 'v2' && Array.isArray(evalPayload?.actionGraph?.nodes))
      ? {
          version: 'v2' as const,
          nodes: evalPayload.actionGraph.nodes.map(node => ({
            nodeId: String(node.nodeId ?? ''),
            intent: String(node.intent ?? ''),
            actionClass: String(node.actionClass ?? 'local_only'),
            target: node.target,
            policyTags: Array.isArray(node.policyTags) ? node.policyTags.map(String) : [],
            preconditions: Array.isArray(node.preconditions) ? node.preconditions.map(String) : [],
            inputs: Array.isArray(node.inputs) ? node.inputs.map(String) : [],
            outputs: Array.isArray(node.outputs) ? node.outputs.map(String) : [],
            dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn.map(String) : [],
          })),
        }
      : undefined;

    const memoryWrites = signals
      .filter(signal => signal.type === 'MEMORY_WRITE_SUGGESTED')
      .map(signal => signal.payload as { key?: string; value?: unknown; reason?: string });

    const goalStackPayload = [...memoryWrites].reverse().find(item => String(item.key ?? '').startsWith('goal_stack:'));
    const criticPatchPayload = [...memoryWrites].reverse().find(item => String(item.key ?? '').startsWith('critic_patch:'));

    const replanSignals = signals
      .filter(signal => signal.type === 'EXEC_REQUEST_REPLAN')
      .map(signal => signal.payload as { reviseCycle?: boolean });

    const responseSummary = typeof outputPayload?.content === 'string'
      ? outputPayload.content
      : (typeof evalPayload?.summary === 'string' ? evalPayload.summary : 'No summary available');

    return {
      planId: typeof planPayload?.chainId === 'string' ? planPayload.chainId : `plan-${Date.now()}`,
      evaluation: {
        result: typeof evalPayload?.result === 'string' ? evalPayload.result : 'partial',
        summary: responseSummary,
      },
      policyDecisions,
      stepOutcomes,
      toolOutcomes,
      actionGraph,
      executionTrace,
      goalStack: (goalStackPayload?.value && typeof goalStackPayload.value === 'object') ? goalStackPayload.value as Record<string, unknown> : undefined,
      criticPatch: (criticPatchPayload?.value && typeof criticPatchPayload.value === 'object')
        ? {
            issue: String((criticPatchPayload.value as Record<string, unknown>).issue ?? ''),
            proposedFix: String((criticPatchPayload.value as Record<string, unknown>).proposedFix ?? ''),
            confidence: Number((criticPatchPayload.value as Record<string, unknown>).confidence ?? 0),
            reviseCycle: Number((criticPatchPayload.value as Record<string, unknown>).reviseCycle ?? 0) || undefined,
          }
        : undefined,
      reviseCycleApplied: replanSignals.some(item => Boolean(item.reviseCycle)),
      policyLoadError: responseSummary.includes('[Policy load warning:') ? responseSummary : undefined,
    };
  }

  private async writeRunManifest(sessionKey: string, payload: {
    input: string;
    response: string;
    planId: string;
    evaluation: { result: string; summary: string };
    policyDecisions: Array<{ stepId: string; decision: string; reason: string }>;
    stepOutcomes: Array<{
      stepId: string;
      intent: string;
      actionClass: string;
      status: 'executed' | 'failed';
      toolName?: string;
      toolInput?: Record<string, unknown>;
      outputSummary?: string;
    }>;
    toolOutcomes: Array<{
      toolName: string;
      success: boolean;
      durationMs: number;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }>;
    actionGraph?: {
      version: 'v2';
      nodes: Array<{
        nodeId: string;
        intent: string;
        actionClass: string;
        target?: string;
        policyTags: string[];
        preconditions: string[];
        inputs: string[];
        outputs: string[];
        dependsOn: string[];
      }>;
    };
    executionTrace: Array<{
      nodeId: string;
      stepId: string;
      status: 'executed' | 'failed' | 'blocked' | 'awaiting_approval';
      startedAtMs: number;
      endedAtMs: number;
      reason?: string;
    }>;
    worldStateBefore: SessionWorldState;
    worldStateAfter: SessionWorldState;
    worldStateDiffs: WorldStateDiff[];
    goalStack?: Record<string, unknown>;
    criticPatch?: { issue: string; proposedFix: string; confidence: number; reviseCycle?: number };
    reviseCycleApplied?: boolean;
    policyLoadError?: string;
  }): Promise<void> {
    const runDir = join(this.config.baseDir, 'artifacts', sessionKey, 'runs');
    await mkdir(runDir, { recursive: true });

    const manifestCore = {
      runId: `run-${Date.now()}`,
      sessionKey,
      timestampMs: Date.now(),
      ...payload,
    };

    const integrity = this.computeIntegrityHash(manifestCore);
    const manifest = {
      ...manifestCore,
      integrity,
    };

    await writeFile(join(runDir, 'latest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  }

  private computeIntegrityHash(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
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


  private worldStatePath(sessionKey: string): string {
    return join(this.config.baseDir, 'artifacts', sessionKey, 'world-state.json');
  }

  private async loadSessionWorldState(sessionKey: string): Promise<SessionWorldState> {
    const path = this.worldStatePath(sessionKey);
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as SessionWorldState;
      return {
        facts: Array.isArray(parsed.facts) ? parsed.facts.map(String) : [],
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions.map(String) : [],
        openGoals: Array.isArray(parsed.openGoals) ? parsed.openGoals.map(String) : [],
        constraints: Array.isArray(parsed.constraints) ? parsed.constraints.map(String) : [],
        updatedAtMs: Number(parsed.updatedAtMs ?? Date.now()),
      };
    } catch {
      return { facts: [], assumptions: [], openGoals: [], constraints: [], updatedAtMs: Date.now() };
    }
  }

  private async saveSessionWorldState(sessionKey: string, state: SessionWorldState): Promise<void> {
    const path = this.worldStatePath(sessionKey);
    await mkdir(join(this.config.baseDir, 'artifacts', sessionKey), { recursive: true });
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  private buildWorldStateDiffs(stepOutcomes: Array<{
    stepId: string;
    status: string;
    outputSummary?: string;
    intent?: string;
    actionClass?: string;
  }>): WorldStateDiff[] {
    const diffs: WorldStateDiff[] = [];
    for (const step of stepOutcomes) {
      const summary = String(step.outputSummary ?? '').trim();
      const intent = String(step.intent ?? '').trim();

      if (step.status === 'executed' && summary) {
        diffs.push({ stepId: step.stepId, type: 'fact_add', value: summary, status: step.status });
      }

      if (step.status === 'failed') {
        diffs.push({ stepId: step.stepId, type: 'goal_add', value: `recover:${intent || step.stepId}`, status: step.status });
      }

      if (step.status === 'blocked' || step.status === 'awaiting_approval') {
        diffs.push({ stepId: step.stepId, type: 'constraint_add', value: `policy:${step.actionClass ?? 'unknown'}`, status: step.status });
      }

      if (step.status !== 'executed' && summary) {
        diffs.push({ stepId: step.stepId, type: 'assumption_add', value: summary, status: step.status });
      }
    }

    return diffs;
  }

  private applyWorldStateDiffs(before: SessionWorldState, diffs: WorldStateDiff[]): SessionWorldState {
    const after: SessionWorldState = {
      facts: [...before.facts],
      assumptions: [...before.assumptions],
      openGoals: [...before.openGoals],
      constraints: [...before.constraints],
      updatedAtMs: Date.now(),
    };

    for (const diff of diffs) {
      switch (diff.type) {
        case 'fact_add':
          if (!after.facts.includes(diff.value)) after.facts.push(diff.value);
          break;
        case 'assumption_add':
          if (!after.assumptions.includes(diff.value)) after.assumptions.push(diff.value);
          break;
        case 'goal_add':
          if (!after.openGoals.includes(diff.value)) after.openGoals.push(diff.value);
          break;
        case 'constraint_add':
        case 'contradiction':
          if (!after.constraints.includes(diff.value)) after.constraints.push(diff.value);
          break;
      }
    }

    return after;
  }

  private detectContradictions(before: SessionWorldState, diffs: WorldStateDiff[]): ContradictionEvent[] {
    const contradictions: ContradictionEvent[] = [];
    const knownFacts = new Set(before.facts.map(value => value.toLowerCase().trim()));

    for (const diff of diffs) {
      if (diff.type !== 'fact_add') continue;
      const normalized = diff.value.toLowerCase().trim();
      const alt = normalized.startsWith('not ') ? normalized.slice(4) : `not ${normalized}`;
      if (knownFacts.has(alt)) {
        contradictions.push({ stepId: diff.stepId, expected: alt, actual: normalized });
      }
      knownFacts.add(normalized);
    }

    return contradictions;
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
