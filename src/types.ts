/**
 * Synth NeuronWaves - Core Types
 * Milestone 1: Loop Artifacts
 */

/** Timestamp in milliseconds since epoch */
export type TimestampMs = number;

/** Unique identifier */
export type UUID = string;

/** Session identifier */
export type SessionKey = string;

/**
 * Observation - Input to the planning system
 * Records what the system observed (user input, events, etc.)
 */
export interface Observation {
  /** Unique observation ID */
  readonly id: UUID;
  /** Session this observation belongs to */
  readonly sessionKey: SessionKey;
  /** Natural language description */
  readonly content: string;
  /** Source of observation (user, system, external) */
  readonly source: 'user' | 'system' | 'external';
  /** When observed */
  readonly observedAtMs: TimestampMs;
}

/**
 * PlanStep - Single step in execution plan
 * Milestone 1: simplified - one step, local_only action class
 */
export interface PlanStep {
  /** Unique step identifier */
  readonly stepId: UUID;
  /** Human-readable intent */
  readonly intent: string;
  /** Action classification */
  readonly actionClass: 'local_only' | 'external_read' | 'external_write' | 'irreversible';
  /** Execution status - Milestone 2: policy-based statuses */
  readonly status: 'planned' | 'allowed' | 'awaiting_approval' | 'blocked' | 'executing' | 'completed' | 'failed';
}

/**
 * Plan - Execution plan generated from observation
 */
export interface Plan {
  /** Unique plan ID */
  readonly id: UUID;
  /** Session key */
  readonly sessionKey: SessionKey;
  /** When plan was created */
  readonly createdAtMs: TimestampMs;
  /** Steps in the plan */
  readonly steps: readonly PlanStep[];
}

/**
 * Evaluation - Result of executing a plan
 */
export interface Evaluation {
  /** Unique evaluation ID */
  readonly id: UUID;
  /** Plan being evaluated */
  readonly planId: UUID;
  /** Session key */
  readonly sessionKey: SessionKey;
  /** Overall result */
  readonly result: 'success' | 'partial' | 'failure';
  /** Human-readable summary */
  readonly summary: string;
  /** When evaluated */
  readonly evaluatedAtMs: TimestampMs;
}

/**
 * AuditEvent - Record of significant actions
 * Milestone 1: minimal - just tracks that loop ran
 */
export interface AuditEvent {
  /** Event ID */
  readonly id: UUID;
  /** Session key */
  readonly sessionKey: SessionKey;
  /** Event type */
  readonly type: 'loop_start' | 'loop_complete' | 'plan_created' | 'evaluation_complete';
  /** Related IDs */
  readonly relatedIds: Record<string, UUID>;
  /** When event occurred */
  readonly occurredAtMs: TimestampMs;
}

/**
 * LoopState - Current state snapshot
 * Last-write-wins file that captures latest run
 */
export interface LoopState {
  /** Session key */
  readonly sessionKey: SessionKey;
  /** Latest observation ID */
  readonly latestObservationId: UUID;
  /** Latest plan ID */
  readonly latestPlanId: UUID;
  /** Latest evaluation ID */
  readonly latestEvaluationId: UUID;
  /** When state was last updated */
  readonly updatedAtMs: TimestampMs;
  /** Run counter */
  readonly runCount: number;
}

/**
 * LoopInput - Input to runNeuronWavesLoop
 */
export interface LoopInput {
  /** Input content/text */
  readonly content: string;
  /** Session identifier */
  readonly sessionKey: SessionKey;
}

/**
 * LoopOutput - Output from runNeuronWavesLoop
 */
export interface LoopOutput {
  /** Generated plan */
  readonly plan: Plan;
  /** Evaluation result */
  readonly evaluation: Evaluation;
  /** Paths to written artifacts */
  readonly artifactPaths: {
    readonly observations: string;
    readonly plans: string;
    readonly evaluations: string;
    readonly audit: string;
    readonly state: string;
  };
}