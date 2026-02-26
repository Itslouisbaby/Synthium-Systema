/**
 * SelfModel - Explicit self-modeling system
 * Section 6: Deterministic self-model updates
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { 
  SelfModel, 
  SessionKey, 
  TimestampMs,
  ToolReliability,
  ConfidenceState
} from '../types.js';

/** SelfModel configuration */
export interface SelfModelConfig {
  /** Base directory for self-model artifacts */
  readonly baseDir: string;
  /** Snapshot interval in milliseconds */
  readonly snapshotIntervalMs?: number;
}

/** SelfModel snapshot */
export interface SelfModelSnapshot {
  readonly selfModel: SelfModel;
  readonly timestampMs: TimestampMs;
  readonly sessionKey: SessionKey;
  readonly version: number;
}

/** Deterministic update rule */
export type UpdateRule = 
  | { type: 'tool_success'; toolName: string }
  | { type: 'tool_failure'; toolName: string; error?: string }
  | { type: 'step_executed'; stepId: string }
  | { type: 'step_failed'; stepId: string; error: string }
  | { type: 'policy_block'; stepId: string; reason: string }
  | { type: 'policy_approval'; stepId: string }
  | { type: 'user_correction'; context: string; correction: string }
  | { type: 'confidence_adjustment'; delta: number; reason: string };

/**
 * SelfModelManager - Manages explicit self-model with deterministic updates
 * 
 * Design principles:
 * - Deterministic updates: Updates derived ONLY from observable outcomes
 * - Observable outcomes: tool success/failure, step executed/failed, policy block/await approval, user correction signals
 * - No "hidden" or "intuition-based" updates
 * - Storage: WorkingState (active), Artifact snapshots, Long-term promotion (distilled statistics)
 */
export class SelfModelManager {
  private readonly config: SelfModelConfig;
  private readonly models: Map<SessionKey, SelfModel> = new Map();
  private readonly versions: Map<SessionKey, number> = new Map();
  private lastSnapshot: Map<SessionKey, TimestampMs> = new Map();

  constructor(config: SelfModelConfig) {
    this.config = config;
  }

  /**
   * Get or create self-model for session
   */
  getModel(sessionKey: SessionKey): SelfModel {
    let model = this.models.get(sessionKey);
    if (!model) {
      model = this.createDefaultModel();
      this.models.set(sessionKey, model);
      this.versions.set(sessionKey, 1);
    }
    return model;
  }

  /**
   * Create default self-model
   */
  private createDefaultModel(): SelfModel {
    return {
      capabilities: {
        tools: [],
        actionClasses: ['local_only'],
        autonomyLevel: 1,
      },
      reliability: [],
      knownFailureModes: [],
      costModel: [],
      confidenceState: {
        overall: 1.0,
        topUncertaintyDrivers: [],
      },
    };
  }

  /**
   * Apply deterministic update rule
   * 
   * @param sessionKey - Session to update
   * @param rule - Update rule to apply
   * @returns Updated self-model
   */
  applyUpdate(sessionKey: SessionKey, rule: UpdateRule): SelfModel {
    const currentModel = this.getModel(sessionKey);
    let updatedModel: SelfModel;

    switch (rule.type) {
      case 'tool_success':
        updatedModel = this.handleToolSuccess(currentModel, rule.toolName);
        break;
      case 'tool_failure':
        updatedModel = this.handleToolFailure(currentModel, rule.toolName, rule.error);
        break;
      case 'step_executed':
        updatedModel = this.handleStepExecuted(currentModel, rule.stepId);
        break;
      case 'step_failed':
        updatedModel = this.handleStepFailed(currentModel, rule.stepId, rule.error);
        break;
      case 'policy_block':
        updatedModel = this.handlePolicyBlock(currentModel, rule.stepId, rule.reason);
        break;
      case 'policy_approval':
        updatedModel = this.handlePolicyApproval(currentModel, rule.stepId);
        break;
      case 'user_correction':
        updatedModel = this.handleUserCorrection(currentModel, rule.context, rule.correction);
        break;
      case 'confidence_adjustment':
        updatedModel = this.handleConfidenceAdjustment(currentModel, rule.delta, rule.reason);
        break;
      default:
        updatedModel = currentModel;
    }

    // Update model and version
    this.models.set(sessionKey, updatedModel);
    const currentVersion = this.versions.get(sessionKey) ?? 1;
    this.versions.set(sessionKey, currentVersion + 1);

    // Check if we should snapshot
    this.maybeSnapshot(sessionKey);

    return updatedModel;
  }

  /**
   * Handle tool success
   */
  private handleToolSuccess(model: SelfModel, toolName: string): SelfModel {
    const reliability = this.updateToolReliability(model, toolName, true);
    
    return {
      ...model,
      reliability,
      confidenceState: this.adjustConfidence(model.confidenceState, 0.02, `Tool ${toolName} succeeded`),
    };
  }

  /**
   * Handle tool failure
   */
  private handleToolFailure(model: SelfModel, toolName: string, error?: string): SelfModel {
    const reliability = this.updateToolReliability(model, toolName, false);
    
    const failureMode = error 
      ? { pattern: `Tool ${toolName} failed: ${error}`, risk: 'Tool may be unreliable', mitigation: 'Consider retry or alternative' }
      : { pattern: `Tool ${toolName} failed`, risk: 'Tool may be unreliable', mitigation: 'Consider retry or alternative' };

    return {
      ...model,
      reliability,
      knownFailureModes: [...model.knownFailureModes, failureMode].slice(-20),
      confidenceState: this.adjustConfidence(model.confidenceState, -0.05, `Tool ${toolName} failed`),
    };
  }

  /**
   * Handle step executed
   */
  private handleStepExecuted(model: SelfModel, stepId: string): SelfModel {
    return {
      ...model,
      confidenceState: this.adjustConfidence(model.confidenceState, 0.01, `Step ${stepId} executed`),
    };
  }

  /**
   * Handle step failed
   */
  private handleStepFailed(model: SelfModel, stepId: string, error: string): SelfModel {
    const failureMode = {
      pattern: `Step ${stepId} failed: ${error}`,
      risk: 'Execution path may be flawed',
      mitigation: 'Review plan or request clarification',
    };

    return {
      ...model,
      knownFailureModes: [...model.knownFailureModes, failureMode].slice(-20),
      confidenceState: this.adjustConfidence(model.confidenceState, -0.03, `Step ${stepId} failed`),
    };
  }

  /**
   * Handle policy block
   */
  private handlePolicyBlock(model: SelfModel, stepId: string, reason: string): SelfModel {
    const failureMode = {
      pattern: `Policy blocked step ${stepId}`,
      risk: 'Action class may need adjustment',
      mitigation: 'Review autonomy level or request explicit approval',
    };

    return {
      ...model,
      knownFailureModes: [...model.knownFailureModes, failureMode].slice(-20),
    };
  }

  /**
   * Handle policy approval
   */
  private handlePolicyApproval(model: SelfModel, stepId: string): SelfModel {
    return {
      ...model,
      confidenceState: this.adjustConfidence(model.confidenceState, 0.01, `Step ${stepId} approved`),
    };
  }

  /**
   * Handle user correction
   */
  private handleUserCorrection(model: SelfModel, context: string, correction: string): SelfModel {
    const failureMode = {
      pattern: `User corrected: ${context}`,
      risk: 'Misunderstanding of user intent',
      mitigation: `Correct approach: ${correction}`,
    };

    return {
      ...model,
      knownFailureModes: [...model.knownFailureModes, failureMode].slice(-20),
      confidenceState: this.adjustConfidence(model.confidenceState, -0.02, 'User correction received'),
    };
  }

  /**
   * Handle confidence adjustment
   */
  private handleConfidenceAdjustment(model: SelfModel, delta: number, reason: string): SelfModel {
    return {
      ...model,
      confidenceState: this.adjustConfidence(model.confidenceState, delta, reason),
    };
  }

  /**
   * Update tool reliability
   */
  private updateToolReliability(
    model: SelfModel, 
    toolName: string, 
    success: boolean
  ): ToolReliability[] {
    const existing = model.reliability.find(r => r.toolName === toolName);
    
    if (existing) {
      const newSuccessCount = existing.successCount + (success ? 1 : 0);
      const newFailureCount = existing.failureCount + (success ? 0 : 1);
      const total = newSuccessCount + newFailureCount;
      const rollingRate = total > 0 ? newSuccessCount / total : 1.0;

      return model.reliability.map(r => 
        r.toolName === toolName
          ? {
              ...r,
              successCount: newSuccessCount,
              failureCount: newFailureCount,
              rollingSuccessRate: rollingRate,
            }
          : r
      );
    } else {
      return [
        ...model.reliability,
        {
          toolName,
          successCount: success ? 1 : 0,
          failureCount: success ? 0 : 1,
          rollingSuccessRate: success ? 1.0 : 0.0,
        },
      ];
    }
  }

  /**
   * Adjust confidence with bounds
   */
  private adjustConfidence(
    current: ConfidenceState, 
    delta: number, 
    reason: string
  ): ConfidenceState {
    const newOverall = Math.min(1, Math.max(0, current.overall + delta));
    
    // Update uncertainty drivers
    const drivers = delta < 0 
      ? [reason, ...current.topUncertaintyDrivers].slice(0, 5)
      : current.topUncertaintyDrivers.filter(d => d !== reason);

    return {
      overall: newOverall,
      topUncertaintyDrivers: drivers,
    };
  }

  /**
   * Maybe snapshot the self-model
   */
  private async maybeSnapshot(sessionKey: SessionKey): Promise<void> {
    const interval = this.config.snapshotIntervalMs ?? 60000;
    const lastSnapshot = this.lastSnapshot.get(sessionKey) ?? 0;
    const now = Date.now();

    if (now - lastSnapshot >= interval) {
      await this.snapshot(sessionKey);
      this.lastSnapshot.set(sessionKey, now);
    }
  }

  /**
   * Create and persist a snapshot
   */
  async snapshot(sessionKey: SessionKey): Promise<SelfModelSnapshot> {
    const model = this.getModel(sessionKey);
    const version = this.versions.get(sessionKey) ?? 1;
    const timestampMs = Date.now();

    const snapshot: SelfModelSnapshot = {
      selfModel: JSON.parse(JSON.stringify(model)),
      timestampMs,
      sessionKey,
      version,
    };

    // Persist to disk
    const sessionDir = join(this.config.baseDir, sessionKey, 'selfmodel');
    await mkdir(sessionDir, { recursive: true });

    const filePath = join(sessionDir, `${timestampMs}.json`);
    await writeFile(filePath, JSON.stringify(snapshot, null, 2));

    return snapshot;
  }

  /**
   * Load a snapshot from disk
   */
  async loadSnapshot(sessionKey: SessionKey, timestampMs?: TimestampMs): Promise<SelfModelSnapshot | null> {
    try {
      const sessionDir = join(this.config.baseDir, sessionKey, 'selfmodel');
      
      if (timestampMs) {
        const filePath = join(sessionDir, `${timestampMs}.json`);
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content);
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get current version for session
   */
  getVersion(sessionKey: SessionKey): number {
    return this.versions.get(sessionKey) ?? 1;
  }

  /**
   * Clear session data
   */
  clearSession(sessionKey: SessionKey): void {
    this.models.delete(sessionKey);
    this.versions.delete(sessionKey);
    this.lastSnapshot.delete(sessionKey);
  }

  /**
   * Add a capability to the self-model
   */
  addCapability(
    sessionKey: SessionKey, 
    type: 'tool' | 'actionClass', 
    value: string
  ): SelfModel {
    const model = this.getModel(sessionKey);
    
    if (type === 'tool') {
      if (!model.capabilities.tools.includes(value)) {
        const updated: SelfModel = {
          ...model,
          capabilities: {
            ...model.capabilities,
            tools: [...model.capabilities.tools, value],
          },
        };
        this.models.set(sessionKey, updated);
        return updated;
      }
    } else {
      if (!model.capabilities.actionClasses.includes(value)) {
        const updated: SelfModel = {
          ...model,
          capabilities: {
            ...model.capabilities,
            actionClasses: [...model.capabilities.actionClasses, value],
          },
        };
        this.models.set(sessionKey, updated);
        return updated;
      }
    }
    
    return model;
  }

  /**
   * Set autonomy level
   */
  setAutonomyLevel(sessionKey: SessionKey, level: number): SelfModel {
    const model = this.getModel(sessionKey);
    const updated: SelfModel = {
      ...model,
      capabilities: {
        ...model.capabilities,
        autonomyLevel: level,
      },
    };
    this.models.set(sessionKey, updated);
    return updated;
  }
}
