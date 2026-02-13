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
 * Semantic Fact - Extracted from tool results
 * Milestone 8: Consolidator & Loop Integration
 */
export interface SemanticFact {
  /** Unique fact ID */
  readonly id: UUID;
  /** Session this fact belongs to */
  readonly sessionKey: SessionKey;
  /** Natural language statement of the fact */
  readonly statement: string;
  /** Tool that generated this fact */
  readonly toolName: string;
  /** Evidence for this fact */
  readonly evidence: {
    /** Type of evidence */
    readonly type: 'tool_result';
    /** Reference to tool result (step ID, etc.) */
    readonly refId: string;
    /** When evidence was collected */
    readonly timestampMs: TimestampMs;
  };
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Last time this fact was verified */
  readonly lastVerifiedMs: TimestampMs;
  /** When fact was created */
  readonly createdAtMs: TimestampMs;
}

/**
 * Memory context bundle - recalled memories for planning
 * Milestone 4: Local memory integration
 * Milestone 8: Added semanticFacts
 */
export interface ContextBundle {
  /** Recent flash memory entries */
  readonly flash: { id: string; content: string; timestampMs: number }[];
  /** Relevant warm memory hits */
  readonly warmHits: { id: string; content: string; timestampMs: number }[];
  /** Semantic facts from tool execution */
  readonly semanticFacts?: SemanticFact[];
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

/**
 * LLM Planner Configuration - Milestone 7
 */
export interface LLMPlannerConfig {
  /** Enable LLM planner (default: false) */
  readonly enabled: boolean;
  /** LLM provider */
  readonly provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  /** Model name */
  readonly model: string;
  /** API key (or from env) */
  readonly apiKey?: string;
  /** Base URL for custom/ollama */
  readonly baseUrl?: string;
  /** Max steps in plan (default: 10) */
  readonly maxSteps: number;
  /** LLM call timeout (default: 30000) */
  readonly timeoutMs: number;
  /** Max tokens per response (default: 2000) */
  readonly maxTokens: number;
  /** Temperature (default: 0) */
  readonly temperature: number;
  /** Dev mode - logs raw prompts (default: false) */
  readonly devMode?: boolean;
}

/**
 * Planner Audit Record - Milestone 7
 * Hash-only auditing for privacy
 */
export interface PlannerAuditRecord {
  /** Plan ID */
  readonly planId: string;
  /** Which planner ran */
  readonly plannerUsed: 'prompted' | 'heuristic';
  /** SHA-256 hash of prompt */
  readonly promptHash: string;
  /** SHA-256 hash of response (LLM only) */
  readonly responseHash?: string;
  /** Validation passed */
  readonly validationPassed: boolean;
  /** Validation errors if any */
  readonly validationErrors?: string[];
  /** Fallback was triggered */
  readonly fallbackTriggered: boolean;
  /** Timestamp */
  readonly timestampMs: number;
}
