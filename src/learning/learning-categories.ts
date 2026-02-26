/**
 * Learning Categories & Governance System
 * 
 * Routes learning through appropriate channels based on impact:
 * - MEMORY: Immediate (facts, preferences)
 * - SKILLS: Deferred (capabilities, validated after task)
 * - BEHAVIOR: Sandbox (response patterns, A/B tested)
 * - CORE: Approval (personality changes, human gate)
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Learning impact categories */
export enum LearningCategory {
  MEMORY = 'memory',      // IMMEDIATE - facts, preferences
  SKILLS = 'skills',      // DEFERRED - capabilities, validated
  BEHAVIOR = 'behavior',  // SANDBOX - response patterns, A/B tested
  CORE = 'core',          // APPROVAL - personality changes, human gate
}

/** Learning proposal status */
export enum LearningStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IN_PROGRESS = 'in_progress',
  VALIDATING = 'validating',
  DEPLOYED = 'deployed',
  ROLLED_BACK = 'rolled_back',
}

/** Versioned learning resource */
export interface VersionedResource {
  readonly id: string;
  readonly version: string;           // semver (1.0.0)
  readonly previousVersion?: string;  // parent version
  readonly rollbackTo?: string;       // snapshot ID
  readonly category: LearningCategory;
  readonly confidence: number;        // 0-1
  readonly source: 'immediate' | 'deferred' | 'sandbox' | 'approval';
  readonly createdAt: number;
  readonly deployedAt?: number;
  readonly status: LearningStatus;
  readonly metadata: Record<string, unknown>;
}

/** Learning proposal */
export interface LearningProposal {
  readonly proposalId: string;
  readonly timestamp: number;
  readonly category: LearningCategory;
  readonly type: string;
  readonly description: string;
  readonly content: unknown;
  readonly confidence: number;
  readonly rationale: string;
  readonly status: LearningStatus;
  readonly approvedBy?: string;
  readonly approvedAt?: number;
  readonly validationResults?: ValidationResult;
}

/** Validation result for deferred/sandbox learning */
export interface ValidationResult {
  readonly passed: boolean;
  readonly score: number;
  readonly testCases: number;
  readonly passedCases: number;
  readonly metrics: Record<string, number>;
  readonly baselineComparison?: {
    readonly baselineScore: number;
    readonly improvement: number;
  };
}

/** Learning gap detected */
export interface LearningGap {
  readonly gapId: string;
  readonly timestamp: number;
  readonly description: string;
  readonly category: LearningCategory;
  readonly unknownTerms: string[];
  readonly confidenceDrop: number;
  readonly context: string;
  readonly proposedSolution?: string;
}

/** Deferred learning queue entry */
export interface DeferredLearningEntry {
  readonly entryId: string;
  readonly timestamp: number;
  readonly category: LearningCategory.SKILLS;
  readonly traces: string[];
  readonly proposedAbstraction: unknown;
  readonly validationQueue: string[];
  readonly status: LearningStatus;
}

/** Sandbox test for behavior learning */
export interface SandboxTest {
  readonly testId: string;
  readonly timestamp: number;
  readonly behaviorId: string;
  readonly baseline: unknown;
  readonly variant: unknown;
  readonly testCases: Array<{
    readonly input: unknown;
    readonly expectedOutput?: unknown;
  }>;
  readonly results?: {
    readonly baselineScore: number;
    readonly variantScore: number;
    readonly improvement: number;
    readonly passed: boolean;
  };
}

/** Rollback record */
export interface RollbackRecord {
  readonly rollbackId: string;
  readonly timestamp: number;
  readonly resourceId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly reason: string;
  readonly triggeredBy: 'user' | 'auto' | 'degradation';
  readonly success: boolean;
}

/** Degradation detection config */
export interface DegradationConfig {
  readonly checkIntervalMs: number;
  readonly successRateThreshold: number;  // e.g., 0.9 (90% of baseline)
  readonly minSamples: number;
  readonly autoRollback: boolean;
}

/** Learning categories configuration */
export interface LearningCategoriesConfig {
  readonly baseDir: string;
  readonly degradation: DegradationConfig;
  readonly sandboxTestCount: number;
  readonly sandboxImprovementThreshold: number;
  readonly skillTraceThreshold: number;
}

/**
 * Learning Categories & Governance System
 */
export class LearningCategories {
  private config: Required<LearningCategoriesConfig>;
  private proposals: Map<string, LearningProposal> = new Map();
  private deferredQueue: Map<string, DeferredLearningEntry> = new Map();
  private sandboxTests: Map<string, SandboxTest> = new Map();
  private versions: Map<string, VersionedResource[]> = new Map();
  private rollbacks: RollbackRecord[] = [];
  private skillSuccessRates: Map<string, Array<{ timestamp: number; success: boolean }>> = new Map();
  private initialized = false;

  constructor(config: Partial<LearningCategoriesConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/learning-categories',
      degradation: config.degradation ?? {
        checkIntervalMs: 60000,  // 1 minute
        successRateThreshold: 0.9,
        minSamples: 10,
        autoRollback: true,
      },
      sandboxTestCount: config.sandboxTestCount ?? 10,
      sandboxImprovementThreshold: config.sandboxImprovementThreshold ?? 0.1,
      skillTraceThreshold: config.skillTraceThreshold ?? 3,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await mkdir(this.config.baseDir, { recursive: true });
    await mkdir(join(this.config.baseDir, 'proposals'), { recursive: true });
    await mkdir(join(this.config.baseDir, 'deferred'), { recursive: true });
    await mkdir(join(this.config.baseDir, 'sandbox'), { recursive: true });
    await mkdir(join(this.config.baseDir, 'versions'), { recursive: true });
    await mkdir(join(this.config.baseDir, 'snapshots'), { recursive: true });

    await this.loadState();
    this.startDegradationMonitoring();

    this.initialized = true;
    console.log('[LearningCategories] Initialized');
  }

  /**
   * Submit a learning proposal
   */
  async submitProposal(proposal: Omit<LearningProposal, 'proposalId' | 'timestamp' | 'status'>): Promise<LearningProposal> {
    const fullProposal: LearningProposal = {
      ...proposal,
      proposalId: `prop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      status: LearningStatus.PENDING,
    };

    this.proposals.set(fullProposal.proposalId, fullProposal);

    // Route based on category
    switch (fullProposal.category) {
      case LearningCategory.MEMORY:
        return this.handleMemoryProposal(fullProposal);
      case LearningCategory.SKILLS:
        return this.handleSkillsProposal(fullProposal);
      case LearningCategory.BEHAVIOR:
        return this.handleBehaviorProposal(fullProposal);
      case LearningCategory.CORE:
        return this.handleCoreProposal(fullProposal);
    }

    return fullProposal;
  }

  /**
   * Detect learning gap and create proposal
   */
  async detectGap(gap: Omit<LearningGap, 'gapId' | 'timestamp'>): Promise<LearningProposal> {
    const fullGap: LearningGap = {
      ...gap,
      gapId: `gap-${Date.now()}`,
      timestamp: Date.now(),
    };

    // Categorize the gap
    const category = this.categorizeGap(fullGap);

    return this.submitProposal({
      category,
      type: 'gap_filling',
      description: fullGap.description,
      content: fullGap,
      confidence: 1 - fullGap.confidenceDrop,
      rationale: `Detected knowledge gap: ${fullGap.unknownTerms.join(', ')}`,
    });
  }

  /**
   * Approve a pending proposal (for CORE category)
   */
  async approveProposal(proposalId: string, approver: string): Promise<LearningProposal | null> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.category !== LearningCategory.CORE) return null;

    const approved: LearningProposal = {
      ...proposal,
      status: LearningStatus.APPROVED,
      approvedBy: approver,
      approvedAt: Date.now(),
    };

    this.proposals.set(proposalId, approved);
    await this.saveState();

    // Deploy the approved change
    await this.deployApproved(approved);

    return approved;
  }

  /**
   * Reject a proposal
   */
  async rejectProposal(proposalId: string, reason: string): Promise<LearningProposal | null> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    const rejected: LearningProposal = {
      ...proposal,
      status: LearningStatus.REJECTED,
      rationale: `${proposal.rationale} | Rejected: ${reason}`,
    };

    this.proposals.set(proposalId, rejected);
    await this.saveState();

    return rejected;
  }

  /**
   * Record skill execution result for degradation monitoring
   */
  recordSkillResult(skillId: string, success: boolean): void {
    const history = this.skillSuccessRates.get(skillId) ?? [];
    history.push({ timestamp: Date.now(), success });
    
    // Keep last 100 results
    if (history.length > 100) {
      history.shift();
    }
    
    this.skillSuccessRates.set(skillId, history);
  }

  /**
   * Rollback to previous version
   */
  async rollback(resourceId: string, options?: { 
    toVersion?: string; 
    reason?: string;
    triggeredBy?: 'user' | 'auto' | 'degradation';
  }): Promise<RollbackRecord> {
    const versions = this.versions.get(resourceId) ?? [];
    if (versions.length < 2) {
      throw new Error('No previous version to rollback to');
    }

    const current = versions[versions.length - 1];
    const targetVersion = options?.toVersion ?? versions[versions.length - 2].version;
    const target = versions.find(v => v.version === targetVersion);

    if (!target) {
      throw new Error(`Version ${targetVersion} not found`);
    }

    const rollback: RollbackRecord = {
      rollbackId: `rb-${Date.now()}`,
      timestamp: Date.now(),
      resourceId,
      fromVersion: current.version,
      toVersion: target.version,
      reason: options?.reason ?? 'Rollback requested',
      triggeredBy: options?.triggeredBy ?? 'user',
      success: true,
    };

    this.rollbacks.push(rollback);

    // Update current version status
    const updatedCurrent: VersionedResource = {
      ...current,
      status: LearningStatus.ROLLED_BACK,
    };
    versions[versions.length - 1] = updatedCurrent;
    this.versions.set(resourceId, versions);

    await this.saveState();

    console.log(`[LearningCategories] Rolled back ${resourceId} from ${current.version} to ${target.version}`);

    return rollback;
  }

  /**
   * Rollback last change in a category
   */
  async rollbackLast(category: LearningCategory, reason?: string): Promise<RollbackRecord | null> {
    // Find most recent deployed resource in category
    let mostRecent: VersionedResource | null = null;
    let resourceId: string | null = null;

    for (const [id, versions] of this.versions) {
      const deployed = versions.filter(v => v.category === category && v.status === LearningStatus.DEPLOYED);
      if (deployed.length > 0) {
        const latest = deployed[deployed.length - 1];
        if (!mostRecent || latest.deployedAt! > mostRecent.deployedAt!) {
          mostRecent = latest;
          resourceId = id;
        }
      }
    }

    if (!resourceId || !mostRecent) return null;

    return this.rollback(resourceId, { 
      reason: reason ?? `Rollback last ${category} change`,
      triggeredBy: 'user',
    });
  }

  /**
   * Rollback to date
   */
  async rollbackToDate(date: string, options?: { keepMemories?: boolean }): Promise<RollbackRecord[]> {
    const targetDate = new Date(date).getTime();
    const rollbacks: RollbackRecord[] = [];

    for (const [resourceId, versions] of this.versions) {
      // Find version at or before target date
      const targetVersion = versions
        .filter(v => v.createdAt <= targetDate)
        .pop();

      if (targetVersion && versions[versions.length - 1].version !== targetVersion.version) {
        // Skip memories if keepMemories is true
        if (options?.keepMemories && targetVersion.category === LearningCategory.MEMORY) {
          continue;
        }

        const rb = await this.rollback(resourceId, {
          toVersion: targetVersion.version,
          reason: `Rollback to ${date}`,
          triggeredBy: 'user',
        });
        rollbacks.push(rb);
      }
    }

    return rollbacks;
  }

  /**
   * Factory reset
   */
  async factoryReset(options?: { keepMemories?: boolean }): Promise<number> {
    let resetCount = 0;

    for (const [resourceId, versions] of this.versions) {
      const current = versions[versions.length - 1];
      
      // Skip memories if keepMemories is true
      if (options?.keepMemories && current.category === LearningCategory.MEMORY) {
        continue;
      }

      // Rollback to first version (initial state)
      if (versions.length > 1) {
        await this.rollback(resourceId, {
          toVersion: versions[0].version,
          reason: 'Factory reset',
          triggeredBy: 'user',
        });
        resetCount++;
      }
    }

    return resetCount;
  }

  /**
   * Get pending proposals
   */
  getPendingProposals(category?: LearningCategory): LearningProposal[] {
    const all = Array.from(this.proposals.values());
    if (category) {
      return all.filter(p => p.category === category && p.status === LearningStatus.PENDING);
    }
    return all.filter(p => p.status === LearningStatus.PENDING);
  }

  /**
   * Get version history for a resource
   */
  getVersionHistory(resourceId: string): VersionedResource[] {
    return this.versions.get(resourceId) ?? [];
  }

  /**
   * Get rollback history
   */
  getRollbackHistory(resourceId?: string): RollbackRecord[] {
    if (resourceId) {
      return this.rollbacks.filter(r => r.resourceId === resourceId);
    }
    return [...this.rollbacks];
  }

  /**
   * Get skill success rate
   */
  getSkillSuccessRate(skillId: string, windowMs: number = 3600000): number {
    const history = this.skillSuccessRates.get(skillId) ?? [];
    const cutoff = Date.now() - windowMs;
    const recent = history.filter(h => h.timestamp > cutoff);
    
    if (recent.length === 0) return 1; // Assume success if no data
    
    const successes = recent.filter(h => h.success).length;
    return successes / recent.length;
  }

  // Private methods

  private categorizeGap(gap: LearningGap): LearningCategory {
    // Simple categorization based on gap characteristics
    if (gap.unknownTerms.length > 0 && gap.confidenceDrop < 0.5) {
      return LearningCategory.MEMORY; // Simple fact gap
    }
    if (gap.context.includes('skill') || gap.context.includes('capability')) {
      return LearningCategory.SKILLS;
    }
    if (gap.context.includes('behavior') || gap.context.includes('response')) {
      return LearningCategory.BEHAVIOR;
    }
    if (gap.confidenceDrop > 0.7) {
      return LearningCategory.CORE; // Major gap
    }
    return LearningCategory.MEMORY;
  }

  private async handleMemoryProposal(proposal: LearningProposal): Promise<LearningProposal> {
    // MEMORY: Immediate deployment
    const deployed: LearningProposal = {
      ...proposal,
      status: LearningStatus.DEPLOYED,
    };

    this.proposals.set(proposal.proposalId, deployed);
    await this.createVersion(deployed);
    await this.saveState();

    console.log(`[LearningCategories] MEMORY deployed: ${proposal.description.slice(0, 50)}`);

    return deployed;
  }

  private async handleSkillsProposal(proposal: LearningProposal): Promise<LearningProposal> {
    // SKILLS: Deferred validation
    const validating: LearningProposal = {
      ...proposal,
      status: LearningStatus.VALIDATING,
    };

    this.proposals.set(proposal.proposalId, validating);

    // Add to deferred queue
    const deferred: DeferredLearningEntry = {
      entryId: `def-${Date.now()}`,
      timestamp: Date.now(),
      category: LearningCategory.SKILLS,
      traces: [], // Would be populated from traces
      proposedAbstraction: proposal.content,
      validationQueue: [],
      status: LearningStatus.VALIDATING,
    };

    this.deferredQueue.set(deferred.entryId, deferred);
    await this.saveState();

    console.log(`[LearningCategories] SKILLS queued for validation: ${proposal.description.slice(0, 50)}`);

    return validating;
  }

  private async handleBehaviorProposal(proposal: LearningProposal): Promise<LearningProposal> {
    // BEHAVIOR: Sandbox A/B test
    const validating: LearningProposal = {
      ...proposal,
      status: LearningStatus.VALIDATING,
    };

    this.proposals.set(proposal.proposalId, validating);

    // Create sandbox test
    const test: SandboxTest = {
      testId: `test-${Date.now()}`,
      timestamp: Date.now(),
      behaviorId: proposal.proposalId,
      baseline: {}, // Current behavior
      variant: proposal.content,
      testCases: [], // Would be populated
    };

    this.sandboxTests.set(test.testId, test);
    await this.saveState();

    console.log(`[LearningCategories] BEHAVIOR sandbox test created: ${proposal.description.slice(0, 50)}`);

    return validating;
  }

  private async handleCoreProposal(proposal: LearningProposal): Promise<LearningProposal> {
    // CORE: Requires approval
    console.log(`[LearningCategories] CORE proposal pending approval: ${proposal.description.slice(0, 50)}`);
    console.log(`  Proposal ID: ${proposal.proposalId}`);

    await this.saveState();
    return proposal;
  }

  private async deployApproved(proposal: LearningProposal): Promise<void> {
    const deployed: LearningProposal = {
      ...proposal,
      status: LearningStatus.DEPLOYED,
    };

    this.proposals.set(proposal.proposalId, deployed);
    await this.createVersion(deployed);
    await this.saveState();

    console.log(`[LearningCategories] CORE deployed after approval: ${proposal.description.slice(0, 50)}`);
  }

  private async createVersion(proposal: LearningProposal): Promise<VersionedResource> {
    const resourceId = `${proposal.category}-${proposal.type}`;
    const versions = this.versions.get(resourceId) ?? [];

    const versionNumber = versions.length + 1;
    const version: VersionedResource = {
      id: resourceId,
      version: `${versionNumber}.0.0`,
      previousVersion: versions.length > 0 ? versions[versions.length - 1].version : undefined,
      category: proposal.category,
      confidence: proposal.confidence,
      source: proposal.category === LearningCategory.MEMORY ? 'immediate' : 
              proposal.category === LearningCategory.SKILLS ? 'deferred' : 'sandbox',
      createdAt: Date.now(),
      deployedAt: Date.now(),
      status: LearningStatus.DEPLOYED,
      metadata: { proposalId: proposal.proposalId },
    };

    versions.push(version);
    this.versions.set(resourceId, versions);

    return version;
  }

  private startDegradationMonitoring(): void {
    setInterval(() => {
      this.checkForDegradation();
    }, this.config.degradation.checkIntervalMs);
  }

  private async checkForDegradation(): Promise<void> {
    for (const [skillId, history] of this.skillSuccessRates) {
      if (history.length < this.config.degradation.minSamples) continue;

      const recent = history.slice(-this.config.degradation.minSamples);
      const successRate = recent.filter(h => h.success).length / recent.length;

      // Compare to baseline (first half of history)
      const baselineHistory = history.slice(0, Math.floor(history.length / 2));
      if (baselineHistory.length < this.config.degradation.minSamples) continue;

      const baselineRate = baselineHistory.filter(h => h.success).length / baselineHistory.length;

      if (successRate < baselineRate * this.config.degradation.successRateThreshold) {
        console.log(`[LearningCategories] DEGRADATION DETECTED: ${skillId}`);
        console.log(`  Current: ${(successRate * 100).toFixed(1)}%`);
        console.log(`  Baseline: ${(baselineRate * 100).toFixed(1)}%`);

        if (this.config.degradation.autoRollback) {
          await this.rollback(skillId, {
            reason: 'Auto-rollback due to performance degradation',
            triggeredBy: 'degradation',
          });
        }
      }
    }
  }

  private async saveState(): Promise<void> {
    const state = {
      proposals: Array.from(this.proposals.entries()),
      deferredQueue: Array.from(this.deferredQueue.entries()),
      sandboxTests: Array.from(this.sandboxTests.entries()),
      versions: Array.from(this.versions.entries()),
      rollbacks: this.rollbacks,
    };

    await writeFile(
      join(this.config.baseDir, 'state.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'state.json'), 'utf-8');
      const state = JSON.parse(data);

      this.proposals = new Map(state.proposals);
      this.deferredQueue = new Map(state.deferredQueue);
      this.sandboxTests = new Map(state.sandboxTests);
      this.versions = new Map(state.versions);
      this.rollbacks = state.rollbacks ?? [];
    } catch {
      // No state to load
    }
  }
}
