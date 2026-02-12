/**
 * Synth NeuronWaves - Core Types
 * Milestone 3: Planner interface
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
 * Action Classes - Milestone 6
 * Classification of action sensitivity
 */
export const ActionClass = {
  LocalOnly: 'local_only',
  ExternalRead: 'external_read',
  ExternalWrite: 'external_write',
  Irreversible: 'irreversible',
  MoneyMovement: 'money_movement',
  IdentitySecurity: 'identity_security_sensitive',
} as const;

export type ActionClassType = typeof ActionClass[keyof typeof ActionClass];

/**
 * PlanStep - Single step in execution plan
 * Milestone 3: Extended to include all policy action classes
 * Milestone 6: Added toolName, toolInput, outputSummary
 */
export interface PlanStep {
  /** Unique step identifier */
  readonly stepId: UUID;
  /** Human-readable intent */
  readonly intent: string;
  /** Action classification - extends policy action classes */
  readonly actionClass: ActionClassType;
  /** Execution status - Milestone 2: policy-based statuses */
  readonly status: 'planned' | 'allowed' | 'awaiting_approval' | 'blocked' | 'executed' | 'failed' | 'skipped';
  /** Tool name for execution (Milestone 6) */
  readonly toolName?: string;
  /** Tool input parameters (Milestone 6) */
  readonly toolInput?: Record<string, unknown>;
  /** Step output summary after execution (Milestone 6) */
  readonly outputSummary?: unknown;
}

/**
 * Plan - Execution plan generated from observation
 * @deprecated Use PlanGraph for new code (Milestone 3+)
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
 * PlanGraph - Execution plan generated from input
 * Milestone 3: Planning subsystem
 */
export interface PlanGraph {
  /** Unique plan ID */
  readonly id: UUID;
  /** Session key */
  readonly sessionKey: SessionKey;
  /** When plan was created */
  readonly createdAtMs: TimestampMs;
  /** Steps in the plan */
  readonly steps: PlanStep[];
}

/**
 * Memory context bundle - recalled memories for planning
 * Milestone 4: Local memory integration
 */
export interface ContextBundle {
  /** Recent flash memory entries */
  readonly flash: { id: string; content: string; timestampMs: number }[];
  /** Relevant warm memory hits */
  readonly warmHits: { id: string; content: string; timestampMs: number }[];
  /** When memories were recalled */
  readonly recalledAtMs: TimestampMs;
}

/**
 * PlannerInput - Input to create a plan
 * Milestone 3: Planning subsystem
 * Milestone 4: Added contextBundle
 */
export interface PlannerInput {
  /** Input text/natural language description */
  readonly text: string;
  /** Session identifier */
  readonly sessionKey: SessionKey;
  /** Working directory for execution context */
  readonly workspaceDir: string;
  /** Autonomy level (1-3) */
  readonly autonomy: number;
  /** Optional memory context */
  readonly contextBundle?: ContextBundle;
}

/**
 * PlannerConfig - Planner configuration (Milestone 3)
 */
export interface PlannerConfig {
  /** Whether planner should be verbose/logging */
  readonly verbose?: boolean;
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
 * Milestone 2: includes policy decision tracking
 */
export interface AuditEvent {
  /** Event ID */
  readonly id: UUID;
  /** Session key */
  readonly sessionKey: SessionKey;
  /** Event type */
  readonly type:
    | 'loop_start'
    | 'loop_complete'
    | 'plan_created'
    | 'evaluation_complete'
    | 'policy_decision';
  /** Related IDs */
  readonly relatedIds: Record<string, UUID>;
  /** When event occurred */
  readonly occurredAtMs: TimestampMs;
  /** Optional details (e.g., policy decision info) */
  readonly details?: {
    readonly decision?: 'allow' | 'awaiting_approval' | 'block';
    readonly reason?: string;
    readonly autonomyLevel?: number;
  };
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
