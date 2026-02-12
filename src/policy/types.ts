/**
 * Policy Module - Types
 * Milestone 2: Safety boundaries and autonomy tiers
 */

/** Autonomy levels as numeric constants */
export const Autonomy = {
  Level1: 1,  // Assist: local_only only
  Level2: 2,  // Delegated: external reads allowed if allowlisted
  Level3: 3,  // Dev: broader permissions
} as const;

export type AutonomyLevel = typeof Autonomy[keyof typeof Autonomy];

/** Action classification for policy enforcement */
export const ActionClass = {
  LocalOnly: 'local_only',
  ExternalRead: 'external_read',
  ExternalWrite: 'external_write',
  Irreversible: 'irreversible',
  MoneyMovement: 'money_movement',
  IdentitySecurity: 'identity_security_sensitive',
} as const;

export type ActionClassType = typeof ActionClass[keyof typeof ActionClass];

/** Hard-blocked action classes regardless of level */
export const HARD_BLOCKED_CLASSES: readonly ActionClassType[] = [
  ActionClass.MoneyMovement,
  ActionClass.IdentitySecurity,
];

/** Policy configuration */
export interface PolicyConfig {
  /** Base directory for artifacts */
  readonly baseDir: string;
  /** Allowed external_read destinations */
  readonly allowlist?: readonly string[];
}

/** Autonomy limits (enforced by policy gate) */
export interface AutonomyLimits {
  /** Max steps per run */
  readonly maxActionsPerRun: number;
  /** Max external reads per run (incl. Level 2+) */
  readonly maxExternalPerRun: number;
  /** Max irreversible actions per run */
  readonly maxIrreversiblePerRun: number;
  /** Max tool calls per run (Milestone 6+) */
  readonly maxToolCallsPerRun?: number;
}

/** Default limits by autonomy level */
export const DefaultLimits: Record<AutonomyLevel, AutonomyLimits> = {
  [Autonomy.Level1]: {
    maxActionsPerRun: 100,
    maxExternalPerRun: 0,
    maxIrreversiblePerRun: 0,
    maxToolCallsPerRun: 0,
  },
  [Autonomy.Level2]: {
    maxActionsPerRun: 100,
    maxExternalPerRun: 50,
    maxIrreversiblePerRun: 0,
    maxToolCallsPerRun: 0,
  },
  [Autonomy.Level3]: {
    maxActionsPerRun: 100,
    maxExternalPerRun: 100,
    maxIrreversiblePerRun: 10,
    maxToolCallsPerRun: 0,
  },
};

/** Policy gate statistics (tracked during execution) */
export interface PolicyGateStats {
  /** Total steps considered */
  actionsConsidered: number;
  /** Steps allowed to execute */
  actionsAllowed: number;
  /** Steps blocked */
  actionsBlocked: number;
  /** Steps awaiting approval */
  actionsAwaitingApproval: number;
  /** External read actions allowed */
  externalCount: number;
  /** Irreversible actions considered/allowed */
  irreversibleCount: number;
}

/** Initial empty stats */
export const initialStats = (): PolicyGateStats => ({
  actionsConsidered: 0,
  actionsAllowed: 0,
  actionsBlocked: 0,
  actionsAwaitingApproval: 0,
  externalCount: 0,
  irreversibleCount: 0,
});

/** Policy decision for a step */
export interface PolicyDecision {
  /** The decision type */
  readonly decision: 'allow' | 'awaiting_approval' | 'block';
  /** Human-readable reason */
  readonly reason: string;
  /** Which limit triggered (if applicable) */
  readonly triggeredLimit?: keyof AutonomyLimits;
}

/** Step status after policy evaluation */
export enum StepStatus {
  Planned = 'planned',
  Allowed = 'allowed',
  AwaitingApproval = 'awaiting_approval',
  Blocked = 'blocked',
}

/** Minimal step for policy evaluation */
export interface PolicyStep {
  readonly stepId: string;
  readonly actionClass: ActionClassType;
  readonly target?: string; // For allowlist checking
}

/** Audit event for policy decisions */
export interface PolicyAuditEvent {
  readonly stepId: string;
  readonly decision: PolicyDecision['decision'];
  readonly reason: string;
  readonly autonomyLevel: AutonomyLevel;
  readonly stats: PolicyGateStats;
  readonly timestampMs: number;
}