/**
 * Orchestrator Loop - Milestone 4
 * Deterministic loop with Policy Gate integration and Memory
 */
import { randomUUID } from 'node:crypto';
import type {
  Observation,
  Plan,
  PlanGraph,
  PlannerInput,
  PlannerConfig,
  PlanStep,
  Evaluation,
  AuditEvent,
  LoopState,
  LoopInput,
  LoopOutput,
  SessionKey,
} from '../types.js';
import { ArtifactStore, type StoreConfig } from '../artifacts/store.js';
import { PolicyGate } from '../policy/gate.js';
import type { AutonomyLevel, PolicyAuditEvent } from '../policy/types.js';
import type { Planner } from '../planning/planner.js';
import { HeuristicPlanner } from '../planning/heuristic-planner.js';
import { LocalMemoryAdapter } from '../memory/adapter-local.js';
import type { ContextBundle } from '../memory/types.js';

/** Loop configuration */
export interface LoopConfig {
  /** Base directory for artifacts */
  readonly artifactBaseDir: string;
  /** Autonomy level (1=assist, 2=delegated, 3=dev) - defaults to Level 1 */
  readonly autonomyLevel?: AutonomyLevel;
  /** Optional planner instance (defaults to HeuristicPlanner) */
  readonly planner?: Planner;
  /** Optional planner configuration */
  readonly plannerConfig?: PlannerConfig;
  /** Optional memory adapter (defaults to LocalMemoryAdapter) */
  readonly memoryAdapter?: LocalMemoryAdapter;
  /** Whether to enable memory (default true) */
  readonly enableMemory?: boolean;
}

/**
 * runNeuronWavesLoop - Main execution loop
 * Milestone 4: Memory integration
 */
export async function runNeuronWavesLoop(
  input: LoopInput,
  config: LoopConfig
): Promise<LoopOutput> {
  const store = new ArtifactStore({ baseDir: config.artifactBaseDir });
  const now = Date.now();

  // Create observation
  const observation: Observation = {
    id: randomUUID(),
    sessionKey: input.sessionKey,
    content: input.content,
    source: 'user',
    observedAtMs: now,
  };

  // Determine configuration values
  const autonomyLevel = config.autonomyLevel ?? 1;
  const workspaceDir = config.artifactBaseDir;
  const enableMemory = config.enableMemory ?? true;

  // Initialize memory (Milestone 4)
  let contextBundle: ContextBundle | undefined;
  if (enableMemory) {
    const memoryAdapter = config.memoryAdapter ?? new LocalMemoryAdapter({ 
      baseDir: `${config.artifactBaseDir}/memory` 
    });
    
    // Write observation to flash memory
    await memoryAdapter.writeObservation(input.sessionKey, observation);
    
    // Generate keywords from content for recall
    const keywords = input.content.toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t: string) => t.length > 2);
    
    // Build context bundle
    contextBundle = await memoryAdapter.buildContextBundle(input.sessionKey, keywords);
  }

  // Create planner instance (use provided planner or default to HeuristicPlanner)
  const planner = config.planner ?? new HeuristicPlanner();

  // Plan using the planner (Milestone 3/4)
  const plannerInput: PlannerInput = {
    text: input.content,
    sessionKey: input.sessionKey,
    workspaceDir,
    autonomy: autonomyLevel,
    contextBundle,
  };
  const planGraph: PlanGraph = planner.createPlan(plannerInput);

  // Convert PlanGraph to Plan for compatibility
  const plan: Plan = {
    id: planGraph.id,
    sessionKey: planGraph.sessionKey,
    createdAtMs: planGraph.createdAtMs,
    steps: planGraph.steps,
  };

  // Create Policy Gate instance (default to Level 1 for safety)
  const gate = new PolicyGate(autonomyLevel, {
    baseDir: config.artifactBaseDir,
    allowlist: [],
  });

  // Policy audit events
  const policyAuditEvents: PolicyAuditEvent[] = [];

  // Evaluate each step with the gate
  const evaluatedSteps: PlanStep[] = plan.steps.map((step) => {
    const decision = gate.evaluate({
      stepId: step.stepId,
      actionClass: step.actionClass,
    });

    // Map decision to step status
    let status: PlanStep['status'];
    switch (decision.decision) {
      case 'allow':
        status = 'allowed';
        break;
      case 'awaiting_approval':
        status = 'awaiting_approval';
        break;
      case 'block':
        status = 'blocked';
        break;
    }

    // Create audit event for this decision
    const auditEvent = gate.createAuditEvent(step.stepId, decision, now);
    policyAuditEvents.push(auditEvent);

    return {
      ...step,
      status,
    };
  });

  // Build updated plan with evaluated steps
  const evaluatedPlan: Plan = {
    ...plan,
    steps: evaluatedSteps,
  };

  // Only execute allowed steps; skip awaiting_approval and blocked
  const stepsToExecute = evaluatedSteps.filter((s) => s.status === 'allowed');
  const awaitingSteps = evaluatedSteps.filter((s) => s.status === 'awaiting_approval');
  const blockedSteps = evaluatedSteps.filter((s) => s.status === 'blocked');

  let evaluationResult: Evaluation['result'];
  let evaluationSummary: string;

  if (awaitingSteps.length > 0) {
    evaluationResult = 'partial';
    evaluationSummary = `${stepsToExecute.length} step(s) allowed, ${awaitingSteps.length} awaiting approval, ${blockedSteps.length} blocked`;
  } else if (blockedSteps.length > 0) {
    evaluationResult = 'failure';
    evaluationSummary = `${stepsToExecute.length} step(s) allowed, ${blockedSteps.length} blocked by policy`;
  } else if (stepsToExecute.length === 0) {
    evaluationResult = 'failure';
    evaluationSummary = 'No steps allowed by policy';
  } else {
    evaluationResult = 'success';
    evaluationSummary = `Successfully processed: ${input.content.slice(0, 50)}`;
  }

  // Produce evaluation
  const evaluation: Evaluation = {
    id: randomUUID(),
    planId: evaluatedPlan.id,
    sessionKey: input.sessionKey,
    result: evaluationResult,
    summary: evaluationSummary,
    evaluatedAtMs: now,
  };

  // Create audit events (including policy decisions)
  const auditEvents: AuditEvent[] = [
    {
      id: randomUUID(),
      sessionKey: input.sessionKey,
      type: 'loop_start',
      relatedIds: { observationId: observation.id },
      occurredAtMs: now,
    },
    {
      id: randomUUID(),
      sessionKey: input.sessionKey,
      type: 'plan_created',
      relatedIds: { planId: evaluatedPlan.id },
      occurredAtMs: now,
    },
    ...policyAuditEvents.map((pe) => ({
      id: randomUUID(),
      sessionKey: input.sessionKey,
      type: 'policy_decision' as const,
      relatedIds: { planId: evaluatedPlan.id, stepId: pe.stepId },
      occurredAtMs: pe.timestampMs,
      details: {
        decision: pe.decision,
        reason: pe.reason,
        autonomyLevel: pe.autonomyLevel,
      },
    })),
    {
      id: randomUUID(),
      sessionKey: input.sessionKey,
      type: 'evaluation_complete',
      relatedIds: { planId: evaluatedPlan.id, evaluationId: evaluation.id },
      occurredAtMs: now,
    },
    {
      id: randomUUID(),
      sessionKey: input.sessionKey,
      type: 'loop_complete',
      relatedIds: {
        observationId: observation.id,
        planId: evaluatedPlan.id,
        evaluationId: evaluation.id,
      },
      occurredAtMs: now,
    },
  ];

  // Create state snapshot
  const state: LoopState = {
    sessionKey: input.sessionKey,
    latestObservationId: observation.id,
    latestPlanId: evaluatedPlan.id,
    latestEvaluationId: evaluation.id,
    updatedAtMs: now,
    runCount: 1, // Will be incremented on subsequent runs
  };

  // Write all artifacts
  const artifactPaths = await store.writeLoopArtifacts({
    observation,
    plan: evaluatedPlan,
    evaluation,
    auditEvents,
    state,
  });

  return {
    plan: evaluatedPlan,
    evaluation,
    artifactPaths,
  };
}
