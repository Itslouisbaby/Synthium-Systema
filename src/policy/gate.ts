/**
 * Policy Gate - Safety boundary enforcement
 * Milestone 2: Hard boundaries before tools/memory/LLM
 */

import type {
  AutonomyLevel,
  AutonomyLimits,
  PolicyConfig,
  PolicyDecision,
  PolicyGateStats,
  PolicyStep,
  PolicyAuditEvent,
  ActionClassType,
} from './types.js';
import {
  Autonomy,
  DefaultLimits,
  HARD_BLOCKED_CLASSES,
  initialStats,
  ActionClass,
} from './types.js';

/**
 * Policy Gate - Decides whether steps are allowed, await approval, or blocked
 */
export class PolicyGate {
  private readonly autonomy: AutonomyLevel;
  private readonly limits: AutonomyLimits;
  private readonly config: PolicyConfig;
  private stats: PolicyGateStats;

  constructor(autonomy: AutonomyLevel, config: PolicyConfig) {
    this.autonomy = autonomy;
    this.config = config;
    this.limits = DefaultLimits[autonomy];
    this.stats = initialStats();
  }

  /**
   * Evaluate a step against policy
   * @param step - The step to evaluate
   * @returns Policy decision
   */
  evaluate(step: PolicyStep): PolicyDecision {
    this.stats.actionsConsidered++;

    // Check hard blocks first (regardless of level)
    if (HARD_BLOCKED_CLASSES.includes(step.actionClass)) {
      this.stats.actionsBlocked++;
      return {
        decision: 'block',
        reason: `Hard block: ${step.actionClass} is never allowed`,
      };
    }

    // Check limits
    const limitCheck = this.checkLimits(step);
    if (limitCheck) {
      this.stats.actionsBlocked++;
      return limitCheck;
    }

    // Level-based evaluation
    switch (this.autonomy) {
      case Autonomy.Level1:
        return this.evaluateLevel1(step);
      case Autonomy.Level2:
        return this.evaluateLevel2(step);
      case Autonomy.Level3:
        return this.evaluateLevel3(step);
      default:
        return {
          decision: 'block',
          reason: 'Unknown autonomy level',
        };
    }
  }

  /**
   * Check if any limits are exceeded
   */
  private checkLimits(step: PolicyStep): PolicyDecision | null {
    // Max actions
    if (this.stats.actionsAllowed >= this.limits.maxActionsPerRun) {
      return {
        decision: 'block',
        reason: `Action limit exceeded: ${this.limits.maxActionsPerRun}`,
        triggeredLimit: 'maxActionsPerRun',
      };
    }

    // External reads
    if (step.actionClass === ActionClass.ExternalRead) {
      if (this.stats.externalCount >= this.limits.maxExternalPerRun) {
        return {
          decision: 'block',
          reason: `External read limit exceeded: ${this.limits.maxExternalPerRun}`,
          triggeredLimit: 'maxExternalPerRun',
        };
      }
    }

    // Irreversible
    if (step.actionClass === ActionClass.Irreversible) {
      if (this.stats.irreversibleCount >= this.limits.maxIrreversiblePerRun) {
        return {
          decision: 'block',
          reason: `Irreversible action limit exceeded: ${this.limits.maxIrreversiblePerRun}`,
          triggeredLimit: 'maxIrreversiblePerRun',
        };
      }
    }

    return null;
  }

  /**
   * Level 1: Assist mode
   * - Only local_only allowed
   * - Everything else blocked
   */
  private evaluateLevel1(step: PolicyStep): PolicyDecision {
    if (step.actionClass === ActionClass.LocalOnly) {
      this.stats.actionsAllowed++;
      return {
        decision: 'allow',
        reason: 'Level 1: local_only allowed',
      };
    }

    this.stats.actionsBlocked++;
    return {
      decision: 'block',
      reason: `Level 1: ${step.actionClass} not allowed`,
    };
  }

  /**
   * Level 2: Delegated mode
   * - local_only allowed
   * - external_read allowed if target in allowlist
   * - irreversible requires approval (awaiting_approval)
   * - external_write blocked
   */
  private evaluateLevel2(step: PolicyStep): PolicyDecision {
    if (step.actionClass === ActionClass.LocalOnly) {
      this.stats.actionsAllowed++;
      return {
        decision: 'allow',
        reason: 'Level 2: local_only allowed',
      };
    }

    if (step.actionClass === ActionClass.ExternalRead) {
      // Check allowlist
      if (this.isAllowlisted(step.target)) {
        this.stats.actionsAllowed++;
        this.stats.externalCount++;
        return {
          decision: 'allow',
          reason: 'Level 2: external_read allowlisted',
        };
      }

      this.stats.actionsBlocked++;
      return {
        decision: 'block',
        reason: 'Level 2: external_read not in allowlist',
      };
    }

    if (step.actionClass === ActionClass.Irreversible) {
      this.stats.actionsAwaitingApproval++;
      this.stats.irreversibleCount++;
      return {
        decision: 'awaiting_approval',
        reason: 'Level 2: irreversible action requires approval',
      };
    }

    if (step.actionClass === ActionClass.ExternalWrite) {
      this.stats.actionsBlocked++;
      return {
        decision: 'block',
        reason: 'Level 2: external_write blocked',
      };
    }

    this.stats.actionsBlocked++;
    return {
      decision: 'block',
      reason: `Level 2: ${step.actionClass} not allowed`,
    };
  }

  /**
   * Level 3: Dev mode
   * - local_only allowed
   * - external_read allowed
   * - external_write allowed
   * - irreversible requires approval (awaiting_approval)
   */
  private evaluateLevel3(step: PolicyStep): PolicyDecision {
    if (step.actionClass === ActionClass.LocalOnly) {
      this.stats.actionsAllowed++;
      return {
        decision: 'allow',
        reason: 'Level 3: local_only allowed',
      };
    }

    if (step.actionClass === ActionClass.ExternalRead) {
      this.stats.actionsAllowed++;
      this.stats.externalCount++;
      return {
        decision: 'allow',
        reason: 'Level 3: external_read allowed',
      };
    }

    if (step.actionClass === ActionClass.ExternalWrite) {
      this.stats.actionsAllowed++;
      return {
        decision: 'allow',
        reason: 'Level 3: external_write allowed',
      };
    }

    if (step.actionClass === ActionClass.Irreversible) {
      this.stats.actionsAwaitingApproval++;
      this.stats.irreversibleCount++;
      return {
        decision: 'awaiting_approval',
        reason: 'Level 3: irreversible action requires approval',
      };
    }

    this.stats.actionsBlocked++;
    return {
      decision: 'block',
      reason: `Level 3: ${step.actionClass} not allowed`,
    };
  }

  /**
   * Check if a target is in the allowlist
   */
  private isAllowlisted(target: string | undefined): boolean {
    if (!target) return false;
    if (!this.config.allowlist) return false;
    return this.config.allowlist.includes(target);
  }

  /**
   * Get current stats
   */
  getStats(): PolicyGateStats {
    return { ...this.stats };
  }

  /**
   * Create audit event for a decision
   */
  createAuditEvent(
    stepId: string,
    decision: PolicyDecision,
    timestampMs: number
  ): PolicyAuditEvent {
    return {
      stepId,
      decision: decision.decision,
      reason: decision.reason,
      autonomyLevel: this.autonomy,
      stats: this.getStats(),
      timestampMs,
    };
  }
}