/**
 * SynthRuntime - NeuronWaves v2 integrated with Synthium-Systema
 *
 * This is the main runtime for the Synth platform.
 * It wires the v2 cognitive architecture (SignalBus, Scheduler, MicroLoops)
 * to the existing repo systems: HeuristicPlanner, PolicyGate, ToolExecutor,
 * LocalMemoryAdapter, ArtifactStore, and Consolidator.
 *
 * The CortexLoop runs the full v1 execution pipeline on every INPUT_RECEIVED
 * signal, emitting PLAN_CREATED, STEP_EXECUTED, EVALUATION_COMPLETE, and
 * OUTPUT_READY signals into the v2 bus.
 */

import { IntegratedNeuronWavesRuntime } from '../neuronwaves-v2/integrated-runtime.js';
import type { IntegratedRuntimeConfig } from '../neuronwaves-v2/integrated-runtime.js';
import { CortexLoop } from '../neuronwaves-v2/loops/cortex-loop.js';
import type { V1LoopFunction } from '../neuronwaves-v2/loops/cortex-loop.js';
import type { SessionKey, LoopOutput } from '../types.js';

// Import the full v1 execution pipeline
import { HeuristicPlanner } from '../planning/heuristic-planner.js';
import { PromptedPlanner } from '../planning/prompted-planner.js';
import { PolicyGate } from '../policy/gate.js';
import type { AutonomyLevel } from '../policy/types.js';
import { LocalMemoryAdapter } from '../memory/adapter-local.js';
import { ToolExecutor, createDefaultRegistry } from '../tools/index.js';
import { ArtifactStore } from '../artifacts/store.js';
import { Consolidator } from '../memory/semantic/consolidator.js';
import { loadPolicy } from '../policy-artifacts/load.js';
import { PolicyError } from '../policy-artifacts/errors.js';
import { randomUUID } from 'node:crypto';
import type {
  Observation,
  Plan,
  PlanGraph,
  PlannerInput,
  Evaluation,
  AuditEvent,
  LoopState,
  LoopInput,
} from '../types.js';
import type { ContextBundle } from '../memory/types.js';
import { readFileSync, existsSync } from 'node:fs';
import type { LLMPlannerConfig } from '../types.js';

/** Approval record read from disk */
interface ApprovalRecord {
  readonly stepId: string;
  readonly decision: 'approved' | 'denied';
  readonly decidedAtMs: number;
}

function loadApprovals(artifactBaseDir: string): Map<string, ApprovalRecord> | undefined {
  const path = `${artifactBaseDir}/state/approvals.json`;
  if (!existsSync(path)) return undefined;
  try {
    const content = readFileSync(path, 'utf-8');
    const approvals: ApprovalRecord[] = JSON.parse(content);
    return new Map(approvals.map((a) => [a.stepId, a]));
  } catch {
    return undefined;
  }
}

/** SynthRuntime configuration */
export interface SynthRuntimeConfig extends IntegratedRuntimeConfig {
  /** Default autonomy level for the v1 execution pipeline (default: 1) */
  readonly autonomyLevel?: AutonomyLevel;
  /** Whether to enable memory (default: true) */
  readonly enableMemory?: boolean;
  /** Optional LLM planner config for PromptedPlanner */
  readonly llmPlanner?: LLMPlannerConfig;
  /** Optional custom planner instance (overrides llmPlanner and default HeuristicPlanner) */
  readonly planner?: import('../planning/planner.js').Planner;
}

/** Result returned from submitInput — mirrors v1 LoopOutput for CLI/TUI compatibility */
export interface SynthResult {
  readonly sessionKey: SessionKey;
  readonly planId: string;
  readonly steps: {
    readonly stepId: string;
    readonly intent: string;
    readonly actionClass: string;
    readonly status: string;
    readonly toolName?: string;
    readonly outputSummary?: unknown;
  }[];
  readonly evaluation: {
    readonly result: 'success' | 'partial' | 'failure';
    readonly summary: string;
  };
  readonly contextBundle?: ContextBundle;
}

/**
 * SynthRuntime
 *
 * Extends IntegratedNeuronWavesRuntime and registers CortexLoop,
 * wired to the repo's existing execution pipeline.
 *
 * Usage:
 *   const runtime = new SynthRuntime({ artifactBaseDir: '.synth/neuronwaves' });
 *   runtime.start();
 *   const result = await runtime.submitInput('session-1', 'Read the logs');
 */
export class SynthRuntime extends IntegratedNeuronWavesRuntime {
  private readonly synthConfig: Required<SynthRuntimeConfig>;
  // Pending result callbacks keyed by sessionKey.
  // Set before calling v1Loop so the callback fires synchronously when the loop completes.
  private readonly resultCallbacks: Map<
    SessionKey,
    (result: SynthResult) => void
  > = new Map();

  constructor(config: SynthRuntimeConfig) {
    // Disable all optional v2 features — SynthRuntime only uses the CortexLoop
    // These features involve async file I/O in constructors (unawaited) which causes test failures
    super({
      ...config,
      outputPublisher: () => {},
      enableTransferLearning: false,
      enableAbstractions: false,
      enableWorldModel: false,
      enableColdStart: false,
      enableReplay: false,
    });

    this.synthConfig = {
      artifactBaseDir: config.artifactBaseDir,
      schedulerConfig: config.schedulerConfig ?? {},
      enabledLoops: config.enabledLoops ?? {},
      outputPublisher: () => {},
      enableTransferLearning: config.enableTransferLearning ?? false,
      enableAbstractions: config.enableAbstractions ?? false,
      enableWorldModel: config.enableWorldModel ?? false,
      enableColdStart: config.enableColdStart ?? false,
      enableReplay: config.enableReplay ?? false,
      noveltyThreshold: config.noveltyThreshold ?? 0.3,
      autonomyLevel: (config.autonomyLevel ?? 1) as AutonomyLevel,
      enableMemory: config.enableMemory ?? true,
      llmPlanner: config.llmPlanner as LLMPlannerConfig,
      planner: config.planner,
    };

    // Build the v1 execution function and register CortexLoop
    const v1Loop = this.buildV1Loop();
    const cortexLoop = new CortexLoop({
      v1Loop,
      artifactBaseDir: this.synthConfig.artifactBaseDir,
      autonomyLevel: this.synthConfig.autonomyLevel,
      enableMemory: this.synthConfig.enableMemory,
    });
    this.registerLoop(cortexLoop, 0);
  }

  /**
   * Submit user input and wait for the v1 execution pipeline to complete.
   * The v1Loop runs synchronously inside CortexLoop's tick — we intercept
   * the result via resultCallbacks rather than waiting on signal propagation.
   */
  async submitInput(sessionKey: SessionKey, content: string): Promise<SynthResult> {
    return new Promise((resolve, reject) => {
      // Register callback — will be called by buildV1Loop when execution completes
      this.resultCallbacks.set(sessionKey, resolve);

      // Trigger the scheduler tick via the parent runtime
      super.submitInput(sessionKey, content).catch((err) => {
        this.resultCallbacks.delete(sessionKey);
        reject(err);
      });

      // Safety timeout — 30 seconds
      setTimeout(() => {
        if (this.resultCallbacks.has(sessionKey)) {
          this.resultCallbacks.delete(sessionKey);
          reject(new Error(`SynthRuntime: submitInput timed out for session ${sessionKey}`));
        }
      }, 30_000);
    });
  }

  /**
   * Build the v1 execution pipeline as a single callable function.
   * This is the function CortexLoop invokes on each INPUT_RECEIVED signal.
   */
  private buildV1Loop(): V1LoopFunction {
    return async (input, config) => {
      const store = new ArtifactStore({ baseDir: config.artifactBaseDir });
      const now = Date.now();
      const autonomyLevel = (config.autonomyLevel ?? 1) as AutonomyLevel;
      const enableMemory = config.enableMemory ?? true;

      // Observation
      const observation: Observation = {
        id: randomUUID(),
        sessionKey: input.sessionKey,
        content: input.content,
        source: 'user',
        observedAtMs: now,
      };

      // Memory
      let contextBundle: ContextBundle | undefined;
      if (enableMemory) {
        const memoryAdapter = new LocalMemoryAdapter({
          baseDir: `${config.artifactBaseDir}/memory`,
        });
        await memoryAdapter.writeObservation(input.sessionKey, observation);
        const keywords = input.content
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t: string) => t.length > 2);
        contextBundle = await memoryAdapter.buildContextBundle(input.sessionKey, keywords);
        const semanticFacts = await store.readFacts(input.sessionKey);
        if (semanticFacts.length > 0) {
          contextBundle = { ...contextBundle, semanticFacts };
        }
      }

      // Planning — use injected planner, LLM planner, or default heuristic
      const planner = this.synthConfig.planner
        ?? (this.synthConfig.llmPlanner?.enabled
          ? new PromptedPlanner(this.synthConfig.llmPlanner)
          : new HeuristicPlanner());

      const plannerInput: PlannerInput = {
        text: input.content,
        sessionKey: input.sessionKey,
        workspaceDir: config.artifactBaseDir,
        autonomy: autonomyLevel,
        contextBundle,
      };
      const planGraph: PlanGraph = planner.createPlan(plannerInput);
      const plan: Plan = {
        id: planGraph.id,
        sessionKey: planGraph.sessionKey,
        createdAtMs: planGraph.createdAtMs,
        steps: planGraph.steps,
      };

      // Approvals
      const approvalsMap = loadApprovals(config.artifactBaseDir);

      // Policy metadata
      let policyMetadata: {
        policyId?: string;
        policyVersion?: string;
        policyEffectiveAt?: string;
        policyHash?: string;
      } = {};
      try {
        const loaded = await loadPolicy();
        policyMetadata = {
          policyId: loaded.policy.policyId,
          policyVersion: loaded.policy.version,
          policyEffectiveAt: loaded.policy.effectiveAt,
          policyHash: loaded.policyHash,
        };
      } catch (error) {
        if (!(error instanceof PolicyError) || error.code !== 'POLICY_NOT_FOUND') {
          throw error;
        }
      }

      // Policy gate
      const gate = new PolicyGate(autonomyLevel, {
        baseDir: config.artifactBaseDir,
        allowlist: [],
        ...policyMetadata,
      });

      const policyAuditEvents: import('../policy/types.js').PolicyAuditEvent[] = [];

      const evaluatedSteps = plan.steps.map((step) => {
        let status: typeof step.status;
        let skipPolicy = false;

        if (step.status === 'awaiting_approval' && approvalsMap) {
          const approval = approvalsMap.get(step.stepId);
          if (approval) {
            status = approval.decision === 'approved' ? 'allowed' : 'blocked';
            skipPolicy = true;
            policyAuditEvents.push(
              gate.createAuditEvent(
                step.stepId,
                {
                  decision: status === 'allowed' ? 'allow' : 'block',
                  reason: `Pre-approved via approvals.json`,
                },
                approval.decidedAtMs
              )
            );
          }
        }

        if (!skipPolicy) {
          const decision = gate.evaluate({
            stepId: step.stepId,
            actionClass: step.actionClass,
          });
          switch (decision.decision) {
            case 'allow': status = 'allowed'; break;
            case 'awaiting_approval': status = 'awaiting_approval'; break;
            case 'block': status = 'blocked'; break;
          }
          policyAuditEvents.push(gate.createAuditEvent(step.stepId, decision, now));
        }

        return { ...step, status };
      });

      // Tool execution
      const toolExecutor = new ToolExecutor(createDefaultRegistry(), { maxToolCallsPerRun: 10 });
      const stepsToExecute = evaluatedSteps.filter((s) => s.status === 'allowed');
      const awaitingSteps = evaluatedSteps.filter((s) => s.status === 'awaiting_approval');
      const blockedSteps = evaluatedSteps.filter((s) => s.status === 'blocked');

      const executedSteps = await Promise.all(
        stepsToExecute.map(async (step) => {
          if (step.toolName && step.actionClass === 'local_only') {
            const { step: executed } = await toolExecutor.executeStep(step, config.artifactBaseDir);
            return executed;
          }
          return step;
        })
      );

      const finalSteps = [...executedSteps, ...awaitingSteps, ...blockedSteps];
      const finalPlan: Plan = { ...plan, steps: finalSteps };

      // Evaluation
      const successful = executedSteps.filter((s) => s.status === 'executed').length;
      const failed = executedSteps.filter((s) => s.status === 'failed').length;
      const pending = executedSteps.filter((s) => s.status === 'allowed').length;

      let evaluationResult: Evaluation['result'];
      let evaluationSummary: string;

      if (awaitingSteps.length > 0) {
        evaluationResult = 'partial';
        evaluationSummary = `${successful} executed, ${failed} failed, ${pending} pending, ${awaitingSteps.length} awaiting approval, ${blockedSteps.length} blocked`;
      } else if (blockedSteps.length > 0) {
        evaluationResult = 'failure';
        evaluationSummary = `${successful} executed, ${blockedSteps.length} blocked by policy`;
      } else if (failed > 0) {
        evaluationResult = 'partial';
        evaluationSummary = `${successful} executed, ${failed} failed`;
      } else if (executedSteps.length === 0) {
        evaluationResult = 'failure';
        evaluationSummary = 'No steps allowed by policy';
      } else {
        evaluationResult = 'success';
        evaluationSummary = `Successfully processed: ${input.content.slice(0, 50)}`;
      }

      const evaluation: Evaluation = {
        id: randomUUID(),
        planId: finalPlan.id,
        sessionKey: input.sessionKey,
        result: evaluationResult,
        summary: evaluationSummary,
        evaluatedAtMs: now,
      };

      // Semantic consolidation
      const consolidator = new Consolidator();
      const semanticFacts = consolidator.extractFacts(finalSteps, input.sessionKey);
      if (semanticFacts.length > 0) {
        await store.writeFacts(input.sessionKey, semanticFacts);
      }

      // Artifacts
      const auditEvents: AuditEvent[] = [
        { id: randomUUID(), sessionKey: input.sessionKey, type: 'loop_start', relatedIds: { observationId: observation.id }, occurredAtMs: now },
        { id: randomUUID(), sessionKey: input.sessionKey, type: 'plan_created', relatedIds: { planId: finalPlan.id }, occurredAtMs: now },
        ...policyAuditEvents.map((pe) => ({
          id: randomUUID(),
          sessionKey: input.sessionKey,
          type: 'policy_decision' as const,
          relatedIds: { planId: finalPlan.id, stepId: pe.stepId },
          occurredAtMs: pe.timestampMs,
          details: {
            decision: pe.decision,
            reason: pe.reason,
            autonomyLevel: pe.autonomyLevel,
            policyId: pe.policyId,
            policyVersion: pe.policyVersion,
            policyEffectiveAt: pe.policyEffectiveAt,
            policyHash: pe.policyHash,
          },
        })),
        { id: randomUUID(), sessionKey: input.sessionKey, type: 'evaluation_complete', relatedIds: { planId: finalPlan.id, evaluationId: evaluation.id }, occurredAtMs: now },
        { id: randomUUID(), sessionKey: input.sessionKey, type: 'loop_complete', relatedIds: { observationId: observation.id, planId: finalPlan.id, evaluationId: evaluation.id }, occurredAtMs: now },
      ];

      const state: LoopState = {
        sessionKey: input.sessionKey,
        latestObservationId: observation.id,
        latestPlanId: finalPlan.id,
        latestEvaluationId: evaluation.id,
        updatedAtMs: now,
        runCount: 1,
      };

      const artifactPaths = await store.writeLoopArtifacts({
        observation,
        plan: finalPlan,
        evaluation,
        auditEvents,
        state,
      });

      // Fire result callback so submitInput() promise resolves immediately
      const callback = this.resultCallbacks.get(input.sessionKey);
      if (callback) {
        this.resultCallbacks.delete(input.sessionKey);
        callback({
          sessionKey: input.sessionKey,
          planId: finalPlan.id,
          steps: finalPlan.steps.map((s) => ({
            stepId: s.stepId,
            intent: s.intent,
            actionClass: s.actionClass,
            status: s.status,
            toolName: s.toolName,
            outputSummary: s.outputSummary,
          })),
          evaluation: {
            result: evaluation.result,
            summary: evaluation.summary,
          },
          contextBundle,
        });
      }

      return { plan: { ...finalPlan, contextBundle } as Plan & { contextBundle?: ContextBundle }, evaluation, artifactPaths };
    };
  }
}

/**
 * Create and start a SynthRuntime instance.
 * Convenience factory used by CLI and TUI.
 */
export function createSynthRuntime(config: SynthRuntimeConfig): SynthRuntime {
  const runtime = new SynthRuntime(config);
  runtime.start();
  return runtime;
}
