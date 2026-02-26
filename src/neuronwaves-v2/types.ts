/**
 * NeuronWaves v2 - Core Types
 * Signal-driven cognitive runtime system
 */

// ============================================================================
// Primitive Types
// ============================================================================

/** Timestamp in milliseconds since epoch */
export type TimestampMs = number;

/** Unique identifier (UUID v4) */
export type UUID = string;

/** Session identifier */
export type SessionKey = string;

/** Signal identifier */
export type SignalId = string;

/** Loop identifier */
export type LoopName = string;

/** Chain identifier for plan chains */
export type ChainId = string;

/** Hash string for integrity verification */
export type Hash = string;

// ============================================================================
// Signal System (Section 1.1)
// ============================================================================

/** Signal priority levels */
export type SignalPriority = 'palpitation' | 'heartbeat' | 'event';

/** Signal types emitted by the runtime */
export type SignalType =
  // Input signals
  | 'INPUT_RECEIVED'
  | 'STREAM_CHUNK_RECEIVED'
  // Planning signals
  | 'PLAN_CREATED'
  | 'PLAN_TOO_SHALLOW'
  | 'SUGGEST_ALTERNATIVE_PLAN'
  // Policy signals
  | 'POLICY_DECISION_EMITTED'
  | 'AWAITING_APPROVAL'
  | 'INVARIANT_VIOLATION'
  // Execution signals
  | 'STEP_EXECUTED'
  | 'STEP_FAILED'
  | 'TOOL_RESULT_RECEIVED'
  // Output signals
  | 'OUTPUT_READY'
  | 'OUTPUT_SENT'
  | 'OUTPUT_INTERRUPTED'
  // Executive signals
  | 'FOCUS_SET'
  | 'CHAIN_PAUSE'
  | 'CHAIN_RESUME'
  | 'REQUEST_CLARIFICATION'
  | 'EXEC_REQUEST_REPLAN'
  // Critic signals
  | 'UNCERTAINTY_HIGH'
  | 'RISK_HIGH'
  | 'ASK_BEFORE_ACT'
  // Monitor signals
  | 'CONFIDENCE_RISE'
  | 'CONFIDENCE_DROP'
  | 'TOOL_RELIABILITY_UPDATE'
  | 'MODEL_ERROR_DETECTED'
  | 'SCHEDULE_EXPERIMENT'
  | 'ESCALATE_APPROVAL_SUGGESTED'
  // Concept/Schema signals
  | 'CONCEPTS_DETECTED'
  | 'SLOTS_FILLED'
  | 'SLOTS_MISSING'
  // World model signals
  | 'BELIEF_UPDATED'
  | 'PREDICTION_MISMATCH'
  // Cold-start signals
  | 'NOVEL_DOMAIN_DETECTED'
  // Memory signals
  | 'MEMORY_WRITE_SUGGESTED'
  | 'SKILL_ACTIVATED'
  // v1 compatibility signals
  | 'EVALUATION_COMPLETE'
  | 'APPROVAL_DECISION_RECEIVED';

/** Signal payload schemas - canonical contract for each signal type */
export interface SignalPayloadMap {
  // Input signals
  'INPUT_RECEIVED': {
    content: string;
    source: 'user' | 'system' | 'api';
    metadata?: Record<string, unknown>;
  };
  'STREAM_CHUNK_RECEIVED': {
    chunk: string;
    sequence: number;
    isFinal: boolean;
  };

  // Planning signals
  'PLAN_CREATED': {
    chainId: string;
    steps: PlanStep[];
    estimatedDurationMs?: number;
  };
  'PLAN_TOO_SHALLOW': {
    chainId: string;
    actualDepth: number;
    requiredDepth: number;
  };
  'SUGGEST_ALTERNATIVE_PLAN': {
    originalChainId: string;
    alternativeSteps: PlanStep[];
    reason: string;
  };

  // Policy signals
  'POLICY_DECISION_EMITTED': {
    decision: 'allow' | 'deny' | 'escalate';
    reason: string;
    ruleId: string;
  };
  'AWAITING_APPROVAL': {
    stepId: string;
    chainId: string;
    intent: string;
    actionClass: string;
    deadlineMs?: number;
  };
  'INVARIANT_VIOLATION': {
    invariantId: string;
    description: string;
    violatedBy: string;
    severity: 'warning' | 'error' | 'critical';
  };

  // Execution signals
  'STEP_EXECUTED': {
    stepId: string;
    chainId: string;
    result: {
      success: boolean;
      output?: unknown;
      toolName?: string;
    };
    durationMs: number;
  };
  'STEP_FAILED': {
    stepId: string;
    chainId: string;
    error: string;
    errorType: 'timeout' | 'exception' | 'validation' | 'unknown';
    recoverable: boolean;
  };
  'TOOL_RESULT_RECEIVED': {
    toolName: string;
    input: unknown;
    output: unknown;
    success: boolean;
    durationMs: number;
  };

  // Output signals
  'OUTPUT_READY': {
    chainId: string;
    content: string;
    contentType: 'text' | 'json' | 'markdown';
  };
  'OUTPUT_SENT': {
    chainId: string;
    contentLength: number;
    publishedAtMs: number;
  };
  'OUTPUT_INTERRUPTED': {
    chainId: string;
    reason: string;
    originalContent?: string;
  };

  // Executive signals
  'FOCUS_SET': {
    chainId: string;
    objective: string;
    previousChainId?: string;
  };
  'CHAIN_PAUSE': {
    chainId: string;
    reason: string;
    canResume: boolean;
  };
  'CHAIN_RESUME': {
    chainId: string;
    resumedAtMs: number;
  };
  'REQUEST_CLARIFICATION': {
    question: string;
    context: string;
    requiredForStepId?: string;
  };
  'EXEC_REQUEST_REPLAN': {
    chainId: string;
    reason: string;
    failedStepId?: string;
  };

  // Critic signals
  'UNCERTAINTY_HIGH': {
    chainId: string;
    uncertaintyType: 'plan' | 'outcome' | 'context';
    confidence: number;
    suggestion?: string;
  };
  'RISK_HIGH': {
    chainId: string;
    riskType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    mitigation?: string;
  };
  'ASK_BEFORE_ACT': {
    stepId: string;
    action: string;
    justification: string;
  };

  // Monitor signals
  'CONFIDENCE_RISE': {
    chainId: string;
    metric: string;
    previousValue: number;
    currentValue: number;
  };
  'CONFIDENCE_DROP': {
    chainId: string;
    metric: string;
    previousValue: number;
    currentValue: number;
    reason?: string;
  };
  'TOOL_RELIABILITY_UPDATE': {
    toolName: string;
    successRate: number;
    sampleSize: number;
  };
  'MODEL_ERROR_DETECTED': {
    errorType: string;
    description: string;
    affectedChains: string[];
  };
  'SCHEDULE_EXPERIMENT': {
    hypothesis: string;
    experimentId: string;
    priority: number;
  };
  'ESCALATE_APPROVAL_SUGGESTED': {
    chainId: string;
    reason: string;
    currentApprover?: string;
  };

  // Concept/Schema signals
  'CONCEPTS_DETECTED': {
    concepts: string[];
    confidence: number;
    source: string;
  };
  'SLOTS_FILLED': {
    schemaId: string;
    filledSlots: Record<string, unknown>;
    confidence: number;
  };
  'SLOTS_MISSING': {
    schemaId: string;
    missingSlots: string[];
    context: string;
  };

  // World model signals
  'BELIEF_UPDATED': {
    entityId: string;
    property: string;
    oldValue?: unknown;
    newValue: unknown;
    confidence: number;
  };
  'PREDICTION_MISMATCH': {
    predictionId: string;
    expected: unknown;
    actual: unknown;
    stepId: string;
  };

  // Cold-start signals
  'NOVEL_DOMAIN_DETECTED': {
    domainSignature: string;
    similarityToKnown: number;
    suggestedApproach: string;
  };

  // Memory signals
  'MEMORY_WRITE_SUGGESTED': {
    key: string;
    value: unknown;
    ttl?: number;
    reason: string;
  };
  'SKILL_ACTIVATED': {
    skillId: string;
    version: string;
    planTemplate?: unknown;
    confidence: number;
  };

  // v1 compatibility signals
  'EVALUATION_COMPLETE': {
    chainId: string;
    result: 'success' | 'partial' | 'failure';
    summary: string;
  };
  'APPROVAL_DECISION_RECEIVED': {
    stepId: string;
    decision: 'approved' | 'rejected';
    approver: string;
    reason?: string;
  };
}

/** Typed signal with known payload */
export type TypedSignal<T extends SignalType> = Signal & {
  type: T;
  payload: SignalPayloadMap[T];
};

/** Core Signal structure (append-only deterministic event) */
export interface Signal {
  /** Unique signal identifier */
  readonly signalId: SignalId;
  /** Session this signal belongs to */
  readonly sessionKey: SessionKey;
  /** Signal type */
  readonly type: SignalType;
  /** Typed payload */
  readonly payload: unknown;
  /** When signal was emitted */
  readonly emittedAtMs: TimestampMs;
  /** Upstream signal IDs that caused this signal */
  readonly causedBy?: SignalId[];
  /** Source loop that emitted this signal */
  readonly sourceLoop: LoopName;
  /** Signal priority */
  readonly priority: SignalPriority;
  /** Optional deduplication key */
  readonly dedupeKey?: string;
}

/** Signal with sequence number for deterministic ordering */
export interface SequencedSignal extends Signal {
  /** Sequence number within session */
  readonly sequence: number;
}

// ============================================================================
// WorkingState (Section 1.2)
// ============================================================================

/** Plan chain status */
export type ChainStatus = 'active' | 'paused' | 'completed' | 'failed';

/** Plan chain for multi-chain cognition */
export interface PlanChain {
  readonly chainId: ChainId;
  readonly objective: string;
  readonly priority: number;
  readonly status: ChainStatus;
  readonly createdAtMs: TimestampMs;
  readonly parentChainId?: ChainId;
}

/** Pending approval record */
export interface PendingApproval {
  readonly stepId: string;
  readonly chainId: ChainId;
  readonly intent: string;
  readonly actionClass: string;
  readonly requestedAtMs: TimestampMs;
}

/** Uncertainty record */
export interface Uncertainty {
  readonly id: string;
  readonly question: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly cause: string;
  readonly createdAtMs: TimestampMs;
}

/** Self-model confidence state */
export interface ConfidenceState {
  readonly overall: number;
  readonly topUncertaintyDrivers: string[];
}

/** Tool reliability tracking */
export interface ToolReliability {
  readonly toolName: string;
  readonly successCount: number;
  readonly failureCount: number;
  readonly rollingSuccessRate: number;
}

/** Self-model (Section 6.1) */
export interface SelfModel {
  /** Available capabilities */
  readonly capabilities: {
    readonly tools: string[];
    readonly actionClasses: string[];
    readonly autonomyLevel: number;
  };
  /** Reliability tracking per tool */
  readonly reliability: ToolReliability[];
  /** Known failure modes */
  readonly knownFailureModes: {
    readonly pattern: string;
    readonly risk: string;
    readonly mitigation: string;
  }[];
  /** Cost model estimates */
  readonly costModel: {
    readonly toolName: string;
    readonly estimatedCost: number;
    readonly estimatedLatencyMs: number;
  }[];
  /** Current confidence state */
  readonly confidenceState: ConfidenceState;
}

/** Active schema with slot filling */
export interface ActiveSchema {
  readonly schemaId: string;
  readonly concept: string;
  readonly filledSlots: Record<string, unknown>;
  readonly missingSlots: string[];
  readonly confidence: number;
}

/** Execution ledger entry */
export interface ExecutionLedgerEntry {
  readonly entryId: string;
  readonly timestampMs: TimestampMs;
  readonly type: 'tool_call' | 'tool_result' | 'error' | 'output';
  readonly description: string;
  readonly chainId?: ChainId;
}

/** Session budgets */
export interface SessionBudgets {
  readonly toolCallsRemaining: number;
  readonly memoryWritesRemaining: number;
  readonly reflectionPassesRemaining: number;
}

/** WorkingState - Bounded short-term consciousness */
export interface WorkingState {
  /** Focus section */
  readonly focus: {
    readonly activeChainId: ChainId | null;
    readonly currentObjective: string | null;
    readonly salienceStack: string[];
  };
  /** Plan chains */
  readonly chains: {
    readonly primary: PlanChain | null;
    readonly secondary: PlanChain[];
    readonly background: PlanChain[];
  };
  /** Pending approvals */
  readonly pendingApprovals: PendingApproval[];
  /** Uncertainties */
  readonly uncertainties: Uncertainty[];
  /** Self-model */
  readonly selfModel: SelfModel;
  /** Reference to world model */
  readonly beliefGraphRef: Hash | null;
  /** Active concepts */
  readonly activeConcepts: string[];
  /** Active schemas */
  readonly activeSchemas: ActiveSchema[];
  /** Execution ledger (bounded window) */
  readonly executionLedger: ExecutionLedgerEntry[];
  /** Session budgets */
  readonly budgets: SessionBudgets;
  /** Cold-start mode flag */
  readonly coldStart: boolean;
}

/** State delta for partial updates */
export interface StateDelta {
  readonly section: keyof WorkingState;
  readonly path: string;
  readonly value: unknown;
  readonly operation: 'set' | 'push' | 'remove' | 'merge';
}

// ============================================================================
// MicroLoop Interface (Section 1.3)
// ============================================================================

/** Loop rhythm type */
export type LoopRhythm = 'palpitation' | 'heartbeat' | 'event';

/** Micro-loop tick result */
export interface TickResult {
  /** Signals emitted by this tick */
  readonly signalsOut: Array<Omit<Signal, 'signalId'> & { signalId?: string }>;
  /** State deltas to apply */
  readonly stateDelta: StateDelta[];
  /** Tick metrics */
  readonly metrics: {
    readonly durationMs: number;
    readonly signalsProcessed: number;
    readonly signalsEmitted: number;
  };
}

/** Micro-loop interface contract */
export interface MicroLoop {
  /** Loop name */
  readonly name: LoopName;
  /** Execution rhythm */
  readonly rhythm: LoopRhythm;
  /** Tick budget in milliseconds */
  readonly tickBudgetMs: number;
  /** Maximum signals emitted per tick */
  readonly maxSignalsOut: number;
  /** WorkingState sections allowed to read */
  readonly reads: readonly (keyof WorkingState)[];
  /** WorkingState sections allowed to write */
  readonly writes: readonly (keyof WorkingState)[];
  /** Signal types this loop subscribes to */
  readonly subscriptions: SignalType[];
  /** Execute tick */
  tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): Promise<TickResult> | TickResult;
}

// ============================================================================
// Scheduler (Section 2)
// ============================================================================

/** TickRecord for deterministic replay */
export interface TickRecord {
  /** Tick identifier */
  readonly tickId: string;
  /** Tick sequence number */
  readonly tickIndex: number;
  /** Session key */
  readonly sessionKey: SessionKey;
  /** Signals consumed in this tick */
  readonly signalsConsumed: SignalId[];
  /** Loops run in this tick (ordered) */
  readonly loopsRun: LoopName[];
  /** Signals emitted in this tick */
  readonly signalsEmitted: SignalId[];
  /** WorkingState hash before tick */
  readonly workingStateBeforeHash: Hash;
  /** WorkingState hash after tick */
  readonly workingStateAfterHash: Hash;
  /** State delta hash */
  readonly stateDeltaHash?: Hash;
  /** Timing metrics */
  readonly timingMetrics: {
    readonly startedAtMs: TimestampMs;
    readonly completedAtMs: TimestampMs;
    readonly totalDurationMs: number;
  };
  /** Budget usage */
  readonly budgetUsage: {
    readonly toolCallsUsed: number;
    readonly memoryWritesUsed: number;
  };
  /** Errors and recovery actions */
  readonly errors: {
    readonly loopName: LoopName;
    readonly error: string;
    readonly recoveryAction: string;
  }[];
}

/** Scheduler configuration */
export interface SchedulerConfig {
  /** Heartbeat interval in milliseconds */
  readonly heartbeatIntervalMs: number;
  /** Default tick budget per loop */
  readonly defaultTickBudgetMs: number;
  /** Maximum signals per loop per tick */
  readonly maxSignalsPerTick: number;
  /** Session quotas */
  readonly sessionQuotas: {
    readonly maxToolCallsPerRun: number;
    readonly maxToolCallsPerMinute: number;
    readonly maxMemoryWritesPerMinute: number;
    readonly maxReflectionPassesPerHour: number;
  };
}

// ============================================================================
// World Model (Section 9)
// ============================================================================

/** Entity in belief graph */
export interface BeliefEntity {
  readonly entityId: string;
  readonly type: string;
  readonly properties: Record<string, unknown>;
  readonly confidence: number;
}

/** Relation in belief graph */
export interface BeliefRelation {
  readonly relationId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly type: string;
  readonly confidence: number;
}

/** Belief with provenance */
export interface Belief {
  readonly beliefId: string;
  readonly statement: string;
  readonly confidence: number;
  readonly provenance: {
    readonly source: 'signal' | 'tool' | 'user' | 'inference';
    readonly refId: string;
  };
  readonly createdAtMs: TimestampMs;
  readonly version: number;
}

/** BeliefGraph - explicit world model */
export interface BeliefGraph {
  readonly version: number;
  readonly versionHash: Hash;
  readonly sessionKey: SessionKey;
  readonly entities: BeliefEntity[];
  readonly relations: BeliefRelation[];
  readonly beliefs: Belief[];
  readonly contradictions: {
    readonly beliefId1: string;
    readonly beliefId2: string;
    readonly detectedAtMs: TimestampMs;
  }[];
  readonly createdAtMs: TimestampMs;
}

/** Prediction for testable world model */
export interface Prediction {
  readonly predictionId: string;
  readonly stepId: string;
  readonly expectedOutcome: unknown;
  readonly expectedStateTransitions: {
    readonly path: string;
    readonly expectedValue: unknown;
  }[];
  readonly createdAtMs: TimestampMs;
}

// ============================================================================
// Transfer Learning (Section 7)
// ============================================================================

/** Task trace for case-based reasoning */
export interface TaskTrace {
  readonly traceId: string;
  readonly sessionKey: SessionKey;
  readonly taskSignature: string;
  readonly detectedConcepts: string[];
  readonly filledSlots: Record<string, unknown>;
  readonly missingSlots: string[];
  readonly planSteps: {
    readonly stepId: string;
    readonly intent: string;
    readonly actionClass: string;
    readonly status: string;
  }[];
  readonly policyDecisions: {
    readonly stepId: string;
    readonly decision: string;
    readonly reason: string;
  }[];
  readonly toolCalls: {
    readonly toolName: string;
    readonly success: boolean;
    readonly timestampMs: TimestampMs;
  }[];
  readonly evaluation: {
    readonly result: 'success' | 'partial' | 'failure';
    readonly summary: string;
  };
  readonly chainLinkage: {
    readonly parentTraceId?: string;
    readonly childTraceIds: string[];
  };
  readonly createdAtMs: TimestampMs;
  readonly completedAtMs: TimestampMs;
}

/** Skill - versioned plan template */
export interface Skill {
  readonly skillId: string;
  readonly version: string;
  readonly trigger: {
    readonly concepts: string[];
    readonly schemaReadiness: string[];
  };
  readonly planTemplate: {
    readonly steps: {
      readonly intent: string;
      readonly actionClass: string;
      readonly toolName?: string;
      readonly placeholders: Record<string, string>;
    }[];
  };
  readonly invariants: string[];
  readonly approvals: string[];
  readonly evaluationChecks: string[];
  readonly status: 'draft' | 'evaluating' | 'active' | 'deprecated';
  readonly createdAtMs: TimestampMs;
  readonly activatedAtMs?: TimestampMs;
}

// ============================================================================
// Abstractions (Section 8)
// ============================================================================

/** Concept definition */
export interface Concept {
  readonly conceptId: string;
  readonly name: string;
  readonly detectors: {
    readonly type: 'rule' | 'classifier';
    readonly config: unknown;
  }[];
  readonly confidenceThreshold: number;
  readonly positiveExemplars: string[]; // trace IDs
  readonly negativeExemplars: string[]; // trace IDs
}

/** Schema definition */
export interface Schema {
  readonly schemaId: string;
  readonly concept: string;
  readonly requiredSlots: string[];
  readonly optionalSlots: string[];
  readonly validationRules: {
    readonly slot: string;
    readonly rule: string;
  }[];
  readonly clarifyingQuestions: Record<string, string>;
}

/** Invariant definition */
export interface Invariant {
  readonly invariantId: string;
  readonly name: string;
  readonly rule: string;
  readonly appliesTo: {
    readonly actionClasses: string[];
    readonly concepts: string[];
  };
  readonly repairStrategies: {
    readonly type: 'ask' | 'replan' | 'request_approval';
    readonly template: string;
  }[];
}

// ============================================================================
// v1 Compatibility Types
// ============================================================================

/** Action classes from v1 */
export const ActionClass = {
  LocalOnly: 'local_only',
  ExternalRead: 'external_read',
  ExternalWrite: 'external_write',
  Irreversible: 'irreversible',
  MoneyMovement: 'money_movement',
  IdentitySecurity: 'identity_security_sensitive',
} as const;

export type ActionClassType = typeof ActionClass[keyof typeof ActionClass];

/** Plan step from v1 */
export interface PlanStep {
  readonly stepId: string;
  readonly intent: string;
  readonly actionClass: ActionClassType;
  readonly status: 'planned' | 'allowed' | 'awaiting_approval' | 'blocked' | 'executed' | 'failed' | 'skipped';
  readonly toolName?: string;
  readonly toolInput?: Record<string, unknown>;
  readonly outputSummary?: unknown;
}

/** Plan from v1 */
export interface Plan {
  readonly id: string;
  readonly sessionKey: string;
  readonly createdAtMs: TimestampMs;
  readonly steps: PlanStep[];
}

/** Observation from v1 */
export interface Observation {
  readonly id: string;
  readonly sessionKey: string;
  readonly content: string;
  readonly source: 'user' | 'system' | 'external';
  readonly observedAtMs: TimestampMs;
}

/** Evaluation from v1 */
export interface Evaluation {
  readonly id: string;
  readonly planId: string;
  readonly sessionKey: string;
  readonly result: 'success' | 'partial' | 'failure';
  readonly summary: string;
  readonly evaluatedAtMs: TimestampMs;
}
