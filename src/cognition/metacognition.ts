/**
 * Metacognition System
 * 
 * "Thinking about thinking" - monitors and regulates own cognitive processes.
 * Enables self-awareness of mental state, strategy selection, and cognitive control.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Cognitive state at a point in time */
export interface CognitiveState {
  readonly timestamp: number;
  readonly focusLevel: number; // 0-1, current attention intensity
  readonly cognitiveLoad: number; // 0-1, working memory utilization
  readonly mentalFatigue: number; // 0-1, accumulated effort
  readonly confidenceLevel: number; // 0-1, certainty in current reasoning
  readonly strategyEffectiveness: number; // 0-1, how well current approach is working
}

/** Strategy being employed */
export interface CognitiveStrategy {
  readonly strategyId: string;
  readonly name: string;
  readonly description: string;
  readonly applicableDomains: string[];
  readonly effectiveness: number; // 0-1, historical success rate
  readonly cost: number; // 0-1, cognitive resources required
  readonly lastUsed: number;
  readonly useCount: number;
}

/** Metacognitive monitoring result */
export interface MonitoringResult {
  readonly timestamp: number;
  readonly state: CognitiveState;
  readonly assessment: {
    readonly understandingLevel: number; // 0-1
    readonly progressRate: number; // tasks per minute
    readonly errorRate: number; // 0-1
    readonly needHelp: boolean;
    readonly shouldChangeStrategy: boolean;
    readonly shouldTakeBreak: boolean;
  };
  readonly recommendation: {
    readonly action: 'continue' | 'adjust' | 'pause' | 'escalate' | 'switch_strategy';
    readonly reason: string;
    readonly suggestedStrategy?: string;
  };
}

/** Learning strategy effectiveness record */
export interface StrategyEffectiveness {
  readonly strategyId: string;
  readonly domain: string;
  readonly attempts: number;
  readonly successes: number;
  readonly avgTimeToSuccess: number;
  readonly lastUpdated: number;
}

/** Configuration for metacognition */
export interface MetacognitionConfig {
  readonly baseDir: string;
  readonly monitoringIntervalMs: number;
  readonly fatigueThreshold: number;
  readonly errorRateThreshold: number;
  readonly adaptationRate: number;
}

/**
 * Metacognition System
 * 
 * Monitors and regulates cognitive processes for optimal performance.
 */
export class Metacognition {
  private config: Required<MetacognitionConfig>;
  private stateHistory: CognitiveState[] = [];
  private strategies: Map<string, CognitiveStrategy> = new Map();
  private effectiveness: Map<string, StrategyEffectiveness> = new Map();
  private monitoringResults: MonitoringResult[] = [];
  private currentStrategyId: string | null = null;
  private initialized = false;

  constructor(config: Partial<MetacognitionConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/cognition',
      monitoringIntervalMs: config.monitoringIntervalMs ?? 5000,
      fatigueThreshold: config.fatigueThreshold ?? 0.8,
      errorRateThreshold: config.errorRateThreshold ?? 0.3,
      adaptationRate: config.adaptationRate ?? 0.1,
    };
    this.initializeStrategies();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    this.initialized = true;
  }

  /**
   * Monitor current cognitive state
   */
  monitor(context: {
    recentActions: string[];
    recentErrors: string[];
    timeOnTask: number;
    taskComplexity: number;
    currentStrategy: string;
  }): MonitoringResult {
    // Compute current cognitive state
    const state = this.computeCognitiveState(context);
    this.stateHistory.push(state);

    // Keep history bounded
    if (this.stateHistory.length > 1000) {
      this.stateHistory = this.stateHistory.slice(-500);
    }

    // Assess situation
    const assessment = this.assessSituation(state, context);

    // Generate recommendation
    const recommendation = this.generateRecommendation(state, assessment, context);

    const result: MonitoringResult = {
      timestamp: Date.now(),
      state,
      assessment,
      recommendation,
    };

    this.monitoringResults.push(result);
    return result;
  }

  /**
   * Select best strategy for a task
   */
  selectStrategy(task: {
    domain: string;
    complexity: number;
    timeConstraint?: number;
    accuracyRequirement?: number;
  }): CognitiveStrategy | null {
    const candidates = Array.from(this.strategies.values())
      .filter(s => s.applicableDomains.includes(task.domain));

    if (candidates.length === 0) return null;

    // Score each strategy
    const scored = candidates.map(strategy => {
      const effectiveness = this.getEffectiveness(strategy.strategyId, task.domain);

      // Score based on effectiveness, cost, and fit
      const effectivenessScore = effectiveness
        ? effectiveness.successes / Math.max(1, effectiveness.attempts)
        : 0.5;

      const costScore = 1 - strategy.cost; // Lower cost is better
      const complexityFit = task.complexity < 0.5
        ? 1 - strategy.cost // Simple tasks: prefer cheap strategies
        : strategy.cost; // Complex tasks: prefer thorough strategies

      const score = effectivenessScore * 0.5 + costScore * 0.25 + complexityFit * 0.25;

      return { strategy, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.strategy ?? null;
  }

  /**
   * Report strategy outcome for learning
   */
  async reportOutcome(strategyId: string, domain: string, outcome: {
    success: boolean;
    timeSpent: number;
    errorCount: number;
  }): Promise<void> {
    const key = `${strategyId}:${domain}`;
    let record = this.effectiveness.get(key);

    if (!record) {
      record = {
        strategyId,
        domain,
        attempts: 0,
        successes: 0,
        avgTimeToSuccess: 0,
        lastUpdated: Date.now(),
      };
    }

    (record as any).attempts++;
    if (outcome.success) {
      (record as any).successes++;
    }

    // Update average time
    (record as any).avgTimeToSuccess =
      (record.avgTimeToSuccess * (record.attempts - 1) + outcome.timeSpent) /
      record.attempts;
    (record as any).lastUpdated = Date.now();

    this.effectiveness.set(key, record);

    // Update strategy stats
    const strategy = this.strategies.get(strategyId);
    if (strategy) {
      this.strategies.set(strategyId, {
        ...strategy,
        effectiveness: record.successes / record.attempts,
        lastUsed: Date.now(),
        useCount: strategy.useCount + 1,
      });
    }

    await this.saveState();
  }

  /**
   * Get self-assessment of current capabilities
   */
  selfAssess(): {
    overallConfidence: number;
    strongestDomains: string[];
    weakestDomains: string[];
    recommendedFocus: string[];
  } {
    const domainStats = new Map<string, { attempts: number; successes: number }>();

    for (const [key, record] of this.effectiveness) {
      const domain = record.domain;
      const stats = domainStats.get(domain) ?? { attempts: 0, successes: 0 };
      stats.attempts += record.attempts;
      stats.successes += record.successes;
      domainStats.set(domain, stats);
    }

    const domainScores = Array.from(domainStats.entries())
      .map(([domain, stats]) => ({
        domain,
        score: stats.successes / Math.max(1, stats.attempts),
        attempts: stats.attempts,
      }))
      .filter(d => d.attempts >= 3); // Need minimum data

    domainScores.sort((a, b) => b.score - a.score);

    return {
      overallConfidence: domainScores.length > 0
        ? domainScores.reduce((sum, d) => sum + d.score, 0) / domainScores.length
        : 0.5,
      strongestDomains: domainScores.slice(0, 3).map(d => d.domain),
      weakestDomains: domainScores.slice(-3).map(d => d.domain),
      recommendedFocus: domainScores
        .filter(d => d.score < 0.6 && d.attempts > 5)
        .map(d => d.domain),
    };
  }

  /**
   * Get current cognitive state
   */
  getCurrentState(): CognitiveState | null {
    return this.stateHistory[this.stateHistory.length - 1] ?? null;
  }

  /**
   * Get state history
   */
  getStateHistory(durationMs?: number): CognitiveState[] {
    if (!durationMs) return [...this.stateHistory];

    const cutoff = Date.now() - durationMs;
    return this.stateHistory.filter(s => s.timestamp >= cutoff);
  }

  /**
   * Check if system needs a break
   */
  needsBreak(): boolean {
    const state = this.getCurrentState();
    if (!state) return false;

    return state.mentalFatigue > this.config.fatigueThreshold ||
      state.cognitiveLoad > 0.9;
  }

  /**
   * Get recommended next action based on metacognitive assessment
   */
  getRecommendation(): string {
    const recent = this.monitoringResults.slice(-5);
    if (recent.length === 0) return 'No monitoring data available';

    const avgConfidence = recent.reduce((sum, r) => sum + r.state.confidenceLevel, 0) / recent.length;
    const avgLoad = recent.reduce((sum, r) => sum + r.state.cognitiveLoad, 0) / recent.length;

    if (avgLoad > 0.8) {
      return 'Cognitive overload detected. Simplify task or take a break.';
    }
    if (avgConfidence < 0.3) {
      return 'Low confidence in current approach. Consider alternative strategy.';
    }
    if (this.needsBreak()) {
      return 'Mental fatigue high. Recommend pause for recovery.';
    }

    return 'Current approach appears effective. Continue monitoring.';
  }

  // Private methods

  private computeCognitiveState(context: {
    recentActions: string[];
    recentErrors: string[];
    timeOnTask: number;
    taskComplexity: number;
  }): CognitiveState {
    // Compute cognitive load from recent activity
    const actionRate = context.recentActions.length / Math.max(1, context.timeOnTask / 60000);
    const errorRate = context.recentErrors.length / Math.max(1, context.recentActions.length);

    // Cognitive load increases with action rate and task complexity
    const cognitiveLoad = Math.min(1,
      context.taskComplexity * 0.4 +
      Math.min(1, actionRate / 10) * 0.4 +
      errorRate * 0.2
    );

    // Mental fatigue accumulates over time
    const mentalFatigue = Math.min(1, context.timeOnTask / (30 * 60 * 1000)); // 30 min threshold

    // Focus decreases with fatigue and errors
    const focusLevel = Math.max(0, 1 - mentalFatigue * 0.3 - errorRate * 0.5);

    // Confidence based on error rate and task familiarity
    const confidenceLevel = Math.max(0, 1 - errorRate * 2 - context.taskComplexity * 0.2);

    // Strategy effectiveness from recent outcomes
    const recentResults = this.monitoringResults.slice(-10);
    const strategyEffectiveness = recentResults.length > 0
      ? recentResults.filter(r => r.recommendation.action === 'continue').length / recentResults.length
      : 0.5;

    return {
      timestamp: Date.now(),
      focusLevel,
      cognitiveLoad,
      mentalFatigue,
      confidenceLevel,
      strategyEffectiveness,
    };
  }

  private assessSituation(
    state: CognitiveState,
    context: {
      recentErrors: string[];
      timeOnTask: number;
    }
  ): MonitoringResult['assessment'] {
    const errorRate = context.recentErrors.length / Math.max(1, context.recentErrors.length + 10);
    const progressRate = context.timeOnTask > 0
      ? 1 / (context.timeOnTask / 60000) // tasks per minute
      : 0;

    // Understanding level based on confidence and errors
    const understandingLevel = state.confidenceLevel * (1 - errorRate);

    // Determine needs
    const needHelp = state.confidenceLevel < 0.3 || errorRate > this.config.errorRateThreshold;
    const shouldChangeStrategy = state.strategyEffectiveness < 0.4 && state.cognitiveLoad > 0.6;
    const shouldTakeBreak = state.mentalFatigue > this.config.fatigueThreshold;

    return {
      understandingLevel,
      progressRate,
      errorRate,
      needHelp,
      shouldChangeStrategy,
      shouldTakeBreak,
    };
  }

  private generateRecommendation(
    state: CognitiveState,
    assessment: MonitoringResult['assessment'],
    context: { currentStrategy: string }
  ): MonitoringResult['recommendation'] {
    if (assessment.shouldTakeBreak) {
      return {
        action: 'pause',
        reason: 'Mental fatigue threshold exceeded',
      };
    }

    if (assessment.needHelp) {
      return {
        action: 'escalate',
        reason: 'Low confidence and high error rate suggest need for assistance',
      };
    }

    if (assessment.shouldChangeStrategy) {
      const alternative = this.findAlternativeStrategy(context.currentStrategy);
      return {
        action: 'switch_strategy',
        reason: 'Current strategy showing low effectiveness',
        suggestedStrategy: alternative?.strategyId,
      };
    }

    if (state.cognitiveLoad > 0.7) {
      return {
        action: 'adjust',
        reason: 'High cognitive load - simplify or decompose task',
      };
    }

    return {
      action: 'continue',
      reason: 'Current approach appears effective',
    };
  }

  private findAlternativeStrategy(currentId: string): CognitiveStrategy | null {
    const current = this.strategies.get(currentId);
    if (!current) return null;

    const alternatives = Array.from(this.strategies.values())
      .filter(s => s.strategyId !== currentId)
      .filter(s => s.applicableDomains.some(d => current.applicableDomains.includes(d)));

    if (alternatives.length === 0) return null;

    // Return most effective alternative
    alternatives.sort((a, b) => b.effectiveness - a.effectiveness);
    return alternatives[0];
  }

  private getEffectiveness(strategyId: string, domain: string): StrategyEffectiveness | undefined {
    return this.effectiveness.get(`${strategyId}:${domain}`);
  }

  private initializeStrategies(): void {
    const defaultStrategies: CognitiveStrategy[] = [
      {
        strategyId: 'systematic',
        name: 'Systematic Approach',
        description: 'Step-by-step methodical processing',
        applicableDomains: ['problem_solving', 'planning', 'analysis'],
        effectiveness: 0.7,
        cost: 0.6,
        lastUsed: 0,
        useCount: 0,
      },
      {
        strategyId: 'heuristic',
        name: 'Heuristic Approach',
        description: 'Rule-of-thumb based quick decisions',
        applicableDomains: ['problem_solving', 'decision_making'],
        effectiveness: 0.6,
        cost: 0.3,
        lastUsed: 0,
        useCount: 0,
      },
      {
        strategyId: 'analogical',
        name: 'Analogical Reasoning',
        description: 'Solve by analogy to known problems',
        applicableDomains: ['problem_solving', 'learning', 'creativity'],
        effectiveness: 0.65,
        cost: 0.5,
        lastUsed: 0,
        useCount: 0,
      },
      {
        strategyId: 'decomposition',
        name: 'Problem Decomposition',
        description: 'Break problem into sub-problems',
        applicableDomains: ['problem_solving', 'planning', 'analysis'],
        effectiveness: 0.75,
        cost: 0.7,
        lastUsed: 0,
        useCount: 0,
      },
      {
        strategyId: 'pattern_matching',
        name: 'Pattern Matching',
        description: 'Recognize and apply known patterns',
        applicableDomains: ['learning', 'recognition', 'prediction'],
        effectiveness: 0.8,
        cost: 0.4,
        lastUsed: 0,
        useCount: 0,
      },
    ];

    for (const strategy of defaultStrategies) {
      this.strategies.set(strategy.strategyId, strategy);
    }
  }

  private async saveState(): Promise<void> {
    const state = {
      stateHistory: this.stateHistory.slice(-100),
      strategies: Array.from(this.strategies.entries()),
      effectiveness: Array.from(this.effectiveness.entries()),
      currentStrategyId: this.currentStrategyId,
    };
    await writeFile(
      join(this.config.baseDir, 'metacognition.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'metacognition.json'), 'utf-8');
      const state = JSON.parse(data);
      this.stateHistory = state.stateHistory ?? [];
      this.strategies = new Map(state.strategies);
      this.effectiveness = new Map(state.effectiveness);
      this.currentStrategyId = state.currentStrategyId ?? null;
    } catch {
      // No state to load
    }
  }
}
