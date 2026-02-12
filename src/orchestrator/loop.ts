/**
 * Orchestrator Loop - Milestone 1
 * Deterministic loop that writes artifacts every run
 */

import { randomUUID } from 'node:crypto';
import type {
  Observation,
  Plan,
  PlanStep,
  Evaluation,
  AuditEvent,
  LoopState,
  LoopInput,
  LoopOutput,
  SessionKey,
} from '../types.js';
import { ArtifactStore, type StoreConfig } from '../artifacts/store.js';

/** Loop configuration */
export interface LoopConfig {
  /** Base directory for artifacts */
  readonly artifactBaseDir: string;
}

/**
 * runNeuronWavesLoop - Main execution loop
 * Milestone 1: Minimal plan, no tools, writes artifacts
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

  // Generate minimal plan (Milestone 1: one step, local_only)
  const step: PlanStep = {
    stepId: randomUUID(),
    intent: `Process: ${input.content.slice(0, 50)}`,
    actionClass: 'local_only',
    status: 'planned',
  };

  const plan: Plan = {
    id: randomUUID(),
    sessionKey: input.sessionKey,
    createdAtMs: now,
    steps: [step],
  };

  // Produce evaluation (Milestone 1: always success for local_only)
  const evaluation: Evaluation = {
    id: randomUUID(),
    planId: plan.id,
    sessionKey: input.sessionKey,
    result: 'success',
    summary: `Successfully processed: ${input.content.slice(0, 50)}`,
    evaluatedAtMs: now,
  };

  // Create audit events
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
      relatedIds: { planId: plan.id },
      occurredAtMs: now,
    },
    {
      id: randomUUID(),
      sessionKey: input.sessionKey,
      type: 'evaluation_complete',
      relatedIds: {
        planId: plan.id,
        evaluationId: evaluation.id,
      },
      occurredAtMs: now,
    },
    {
      id: randomUUID(),
      sessionKey: input.sessionKey,
      type: 'loop_complete',
      relatedIds: {
        observationId: observation.id,
        planId: plan.id,
        evaluationId: evaluation.id,
      },
      occurredAtMs: now,
    },
  ];

  // Create state snapshot
  const state: LoopState = {
    sessionKey: input.sessionKey,
    latestObservationId: observation.id,
    latestPlanId: plan.id,
    latestEvaluationId: evaluation.id,
    updatedAtMs: now,
    runCount: 1, // Will be incremented on subsequent runs
  };

  // Write all artifacts
  const artifactPaths = await store.writeLoopArtifacts({
    observation,
    plan,
    evaluation,
    auditEvents,
    state,
  });

  return {
    plan,
    evaluation,
    artifactPaths,
  };
}