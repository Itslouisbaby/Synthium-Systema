/**
 * Self-Modification - Part 4: System improves its own components
 * 
 * The system can modify its own loops, heuristics, and strategies
 * based on performance feedback.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Modification proposal */
export interface ModificationProposal {
  readonly proposalId: string;
  readonly targetComponent: string;
  readonly targetProperty: string;
  readonly currentValue: unknown;
  readonly proposedValue: unknown;
  readonly reason: string;
  readonly expectedImprovement: number;
  readonly confidence: number;
  readonly rollbackData: unknown;
}

/** Applied modification */
export interface AppliedModification {
  readonly modificationId: string;
  readonly proposal: ModificationProposal;
  readonly appliedAt: number;
  readonly outcome: {
    success: boolean;
    measuredImprovement: number;
    sideEffects: string[];
  };
  readonly status: 'active' | 'rolled_back' | 'superseded';
}

/** Performance metric */
export interface PerformanceMetric {
  readonly metricId: string;
  readonly component: string;
  readonly metricName: string;
  readonly value: number;
  readonly timestamp: number;
  readonly context: string;
}

/** Optimization strategy */
export interface OptimizationStrategy {
  readonly strategyId: string;
  readonly name: string;
  readonly appliesTo: string[];
  readonly condition: (metrics: PerformanceMetric[]) => boolean;
  readonly action: (component: string) => ModificationProposal;
}

/** Configuration for self-modifier */
export interface SelfModifierConfig {
  readonly baseDir: string;
  readonly modificationThreshold: number;
  readonly rollbackThreshold: number;
  readonly maxActiveModifications: number;
  readonly requireApproval: boolean;
}

/**
 * Self-modification system
 * Monitors performance and proposes/improves modifications
 */
export class SelfModifier {
  private config: Required<SelfModifierConfig>;
  private metrics: PerformanceMetric[] = [];
  private proposals: Map<string, ModificationProposal> = new Map();
  private appliedModifications: Map<string, AppliedModification> = new Map();
  private strategies: Map<string, OptimizationStrategy> = new Map();
  private componentState: Map<string, unknown> = new Map();
  private initialized = false;

  constructor(config: Partial<SelfModifierConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/metalearning',
      modificationThreshold: config.modificationThreshold ?? 0.1,
      rollbackThreshold: config.rollbackThreshold ?? -0.2,
      maxActiveModifications: config.maxActiveModifications ?? 5,
      requireApproval: config.requireApproval ?? true,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    await this.registerDefaultStrategies();
    this.initialized = true;
  }

  /**
   * Record a performance metric
   */
  async recordMetric(metric: Omit<PerformanceMetric, 'metricId'>): Promise<void> {
    await this.initialize();

    const fullMetric: PerformanceMetric = {
      ...metric,
      metricId: `metric-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    this.metrics.push(fullMetric);

    // Keep only recent metrics
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-500);
    }

    // Check if any strategy should trigger
    await this.evaluateStrategies(fullMetric.component);
    await this.saveState();
  }

  /**
   * Propose a modification based on performance analysis
   */
  async proposeModification(
    component: string,
    property: string,
    analysis: {
      issue: string;
      suggestedChange: unknown;
      expectedImprovement: number;
    }
  ): Promise<ModificationProposal | null> {
    await this.initialize();

    const currentValue = this.componentState.get(`${component}.${property}`);

    const proposal: ModificationProposal = {
      proposalId: `prop-${Date.now()}`,
      targetComponent: component,
      targetProperty: property,
      currentValue,
      proposedValue: analysis.suggestedChange,
      reason: analysis.issue,
      expectedImprovement: analysis.expectedImprovement,
      confidence: this.calculateConfidence(component, analysis.expectedImprovement),
      rollbackData: currentValue,
    };

    this.proposals.set(proposal.proposalId, proposal);
    
    console.log(`[SelfModifier] Proposed modification for ${component}.${property}: ${analysis.issue}`);
    
    return proposal;
  }

  /**
   * Apply a modification (with optional approval)
   */
  async applyModification(
    proposalId: string,
    approved: boolean = !this.config.requireApproval
  ): Promise<AppliedModification | null> {
    await this.initialize();

    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    if (!approved) {
      console.log(`[SelfModifier] Proposal ${proposalId} awaiting approval`);
      return null;
    }

    // Check if we have too many active modifications
    const activeCount = Array.from(this.appliedModifications.values())
      .filter(m => m.status === 'active').length;
    
    if (activeCount >= this.config.maxActiveModifications) {
      console.log(`[SelfModifier] Max modifications reached, cannot apply ${proposalId}`);
      return null;
    }

    // Apply the modification
    const key = `${proposal.targetComponent}.${proposal.targetProperty}`;
    this.componentState.set(key, proposal.proposedValue);

    const applied: AppliedModification = {
      modificationId: `mod-${Date.now()}`,
      proposal,
      appliedAt: Date.now(),
      outcome: {
        success: true,
        measuredImprovement: 0, // Will be updated after measurement
        sideEffects: [],
      },
      status: 'active',
    };

    this.appliedModifications.set(applied.modificationId, applied);
    
    console.log(`[SelfModifier] Applied modification ${applied.modificationId}: ${proposal.reason}`);

    await this.saveState();
    return applied;
  }

  /**
   * Measure the outcome of a modification
   */
  async measureOutcome(
    modificationId: string,
    duration: number = 60000 // 1 minute default
  ): Promise<void> {
    const modification = this.appliedModifications.get(modificationId);
    if (!modification) return;

    // Wait for duration
    await new Promise(resolve => setTimeout(resolve, duration));

    // Get metrics before and after
    const component = modification.proposal.targetComponent;
    const beforeMetrics = this.getMetricsBefore(modification.appliedAt, component);
    const afterMetrics = this.getMetricsAfter(modification.appliedAt, component);

    // Calculate improvement
    const beforeAvg = this.averageMetric(beforeMetrics);
    const afterAvg = this.averageMetric(afterMetrics);
    const improvement = afterAvg - beforeAvg;

    // Update modification outcome
    const updated: AppliedModification = {
      ...modification,
      outcome: {
        success: improvement > this.config.modificationThreshold,
        measuredImprovement: improvement,
        sideEffects: this.detectSideEffects(modification, beforeMetrics, afterMetrics),
      },
    };

    this.appliedModifications.set(modificationId, updated);

    // Rollback if negative
    if (improvement < this.config.rollbackThreshold) {
      await this.rollbackModification(modificationId);
    }

    await this.saveState();
  }

  /**
   * Rollback a modification
   */
  async rollbackModification(modificationId: string): Promise<boolean> {
    const modification = this.appliedModifications.get(modificationId);
    if (!modification) return false;

    // Restore original value
    const key = `${modification.proposal.targetComponent}.${modification.proposal.targetProperty}`;
    this.componentState.set(key, modification.proposal.rollbackData);

    // Mark as rolled back
    const updated: AppliedModification = {
      ...modification,
      status: 'rolled_back',
    };
    this.appliedModifications.set(modificationId, updated);

    console.log(`[SelfModifier] Rolled back modification ${modificationId}`);
    
    await this.saveState();
    return true;
  }

  /**
   * Register an optimization strategy
   */
  registerStrategy(strategy: OptimizationStrategy): void {
    this.strategies.set(strategy.strategyId, strategy);
  }

  /**
   * Get modification history
   */
  getModificationHistory(): AppliedModification[] {
    return Array.from(this.appliedModifications.values())
      .sort((a, b) => b.appliedAt - a.appliedAt);
  }

  /**
   * Get pending proposals
   */
  getPendingProposals(): ModificationProposal[] {
    return Array.from(this.proposals.values());
  }

  /**
   * Get component state
   */
  getComponentState(component: string, property: string): unknown {
    return this.componentState.get(`${component}.${property}`);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalModifications: number;
    activeModifications: number;
    rolledBackModifications: number;
    pendingProposals: number;
    averageImprovement: number;
  } {
    const mods = Array.from(this.appliedModifications.values());
    const successful = mods.filter(m => m.outcome.success);
    
    return {
      totalModifications: mods.length,
      activeModifications: mods.filter(m => m.status === 'active').length,
      rolledBackModifications: mods.filter(m => m.status === 'rolled_back').length,
      pendingProposals: this.proposals.size,
      averageImprovement: successful.length > 0
        ? successful.reduce((sum, m) => sum + m.outcome.measuredImprovement, 0) / successful.length
        : 0,
    };
  }

  // Private helper methods
  private async registerDefaultStrategies(): Promise<void> {
    // Strategy 1: If error rate is high, increase validation
    this.registerStrategy({
      strategyId: 'reduce-errors',
      name: 'Reduce Error Rate',
      appliesTo: ['ExecutiveLoop', 'CriticLoop'],
      condition: (metrics) => {
        const errorMetrics = metrics.filter(m => m.metricName === 'error_rate');
        if (errorMetrics.length < 5) return false;
        const avg = errorMetrics.reduce((s, m) => s + m.value, 0) / errorMetrics.length;
        return avg > 0.2;
      },
      action: (component) => ({
        proposalId: '', // Will be set later
        targetComponent: component,
        targetProperty: 'validationLevel',
        currentValue: 'normal',
        proposedValue: 'strict',
        reason: 'High error rate detected',
        expectedImprovement: 0.3,
        confidence: 0.7,
        rollbackData: 'normal',
      }),
    });

    // Strategy 2: If planning is slow, simplify plans
    this.registerStrategy({
      strategyId: 'speed-up-planning',
      name: 'Speed Up Planning',
      appliesTo: ['ExecutiveLoop'],
      condition: (metrics) => {
        const timeMetrics = metrics.filter(m => m.metricName === 'planning_time_ms');
        if (timeMetrics.length < 5) return false;
        const avg = timeMetrics.reduce((s, m) => s + m.value, 0) / timeMetrics.length;
        return avg > 1000;
      },
      action: (component) => ({
        proposalId: '',
        targetComponent: component,
        targetProperty: 'maxPlanDepth',
        currentValue: 5,
        proposedValue: 3,
        reason: 'Planning is too slow',
        expectedImprovement: 0.4,
        confidence: 0.6,
        rollbackData: 5,
      }),
    });

    // Strategy 3: If uncertainty is high, increase monitoring
    this.registerStrategy({
      strategyId: 'increase-monitoring',
      name: 'Increase Monitoring',
      appliesTo: ['MonitorLoop'],
      condition: (metrics) => {
        const uncertaintyMetrics = metrics.filter(m => m.metricName === 'uncertainty_level');
        if (uncertaintyMetrics.length < 3) return false;
        const avg = uncertaintyMetrics.reduce((s, m) => s + m.value, 0) / uncertaintyMetrics.length;
        return avg > 0.5;
      },
      action: (component) => ({
        proposalId: '',
        targetComponent: component,
        targetProperty: 'checkFrequency',
        currentValue: 'normal',
        proposedValue: 'high',
        reason: 'High uncertainty detected',
        expectedImprovement: 0.25,
        confidence: 0.65,
        rollbackData: 'normal',
      }),
    });

    // Strategy 4: If similar tasks fail, improve transfer learning
    this.registerStrategy({
      strategyId: 'improve-transfer',
      name: 'Improve Transfer Learning',
      appliesTo: ['TransferLearningLoop'],
      condition: (metrics) => {
        const transferMetrics = metrics.filter(m => m.metricName === 'transfer_success_rate');
        if (transferMetrics.length < 5) return false;
        const avg = transferMetrics.reduce((s, m) => s + m.value, 0) / transferMetrics.length;
        return avg < 0.5;
      },
      action: (component) => ({
        proposalId: '',
        targetComponent: component,
        targetProperty: 'similarityThreshold',
        currentValue: 0.7,
        proposedValue: 0.5,
        reason: 'Transfer learning not effective',
        expectedImprovement: 0.2,
        confidence: 0.5,
        rollbackData: 0.7,
      }),
    });
  }

  private async evaluateStrategies(component: string): Promise<void> {
    const componentMetrics = this.metrics.filter(m => m.component === component);
    
    for (const strategy of this.strategies.values()) {
      if (!strategy.appliesTo.includes(component)) continue;
      
      try {
        if (strategy.condition(componentMetrics)) {
          const proposal = strategy.action(component);
          await this.proposeModification(component, proposal.targetProperty, {
            issue: proposal.reason,
            suggestedChange: proposal.proposedValue,
            expectedImprovement: proposal.expectedImprovement,
          });
        }
      } catch (error) {
        console.error(`[SelfModifier] Strategy ${strategy.strategyId} failed:`, error);
      }
    }
  }

  private calculateConfidence(component: string, expectedImprovement: number): number {
    // Confidence based on past success with this component
    const componentMods = Array.from(this.appliedModifications.values())
      .filter(m => m.proposal.targetComponent === component && m.outcome.success);
    
    if (componentMods.length === 0) return 0.5;
    
    const successRate = componentMods.length / 
      Array.from(this.appliedModifications.values())
        .filter(m => m.proposal.targetComponent === component).length;
    
    return Math.min(0.9, successRate * expectedImprovement * 2);
  }

  private getMetricsBefore(timestamp: number, component: string): PerformanceMetric[] {
    return this.metrics.filter(m => 
      m.timestamp < timestamp && 
      m.component === component
    ).slice(-10);
  }

  private getMetricsAfter(timestamp: number, component: string): PerformanceMetric[] {
    return this.metrics.filter(m => 
      m.timestamp >= timestamp && 
      m.component === component
    ).slice(0, 10);
  }

  private averageMetric(metrics: PerformanceMetric[]): number {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
  }

  private detectSideEffects(
    modification: AppliedModification,
    before: PerformanceMetric[],
    after: PerformanceMetric[]
  ): string[] {
    const sideEffects: string[] = [];
    
    // Check for degraded metrics
    const metricNames = new Set([...before, ...after].map(m => m.metricName));
    
    for (const metricName of metricNames) {
      const beforeAvg = this.averageMetric(before.filter(m => m.metricName === metricName));
      const afterAvg = this.averageMetric(after.filter(m => m.metricName === metricName));
      
      if (afterAvg < beforeAvg * 0.8) {
        sideEffects.push(`${metricName} degraded: ${beforeAvg.toFixed(2)} → ${afterAvg.toFixed(2)}`);
      }
    }
    
    return sideEffects;
  }

  private async saveState(): Promise<void> {
    const state = {
      metrics: this.metrics,
      proposals: Array.from(this.proposals.entries()),
      modifications: Array.from(this.appliedModifications.entries()),
      componentState: Array.from(this.componentState.entries()),
    };
    await writeFile(
      join(this.config.baseDir, 'modifier-state.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'modifier-state.json'), 'utf-8');
      const state = JSON.parse(data);
      this.metrics = state.metrics || [];
      this.proposals = new Map(state.proposals);
      this.appliedModifications = new Map(state.modifications);
      this.componentState = new Map(state.componentState);
    } catch {
      // No state to load
    }
  }
}
