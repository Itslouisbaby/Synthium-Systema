/**
 * Goal Autonomy System
 * 
 * Enables self-directed goal generation and pursuit.
 * The system sets its own objectives based on:
 * - Current knowledge gaps
 * - Long-term developmental goals
 * - Curiosity-driven exploration
 * - Opportunistic learning
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Autonomous goal */
export interface AutonomousGoal {
  readonly goalId: string;
  readonly description: string;
  readonly type: 'knowledge' | 'skill' | 'exploration' | 'optimization' | 'social';
  readonly origin: 'curiosity' | 'gap_analysis' | 'opportunity' | 'reflection' | 'user';
  readonly priority: number; // 0-1
  readonly urgency: number; // 0-1
  readonly estimatedEffort: number; // hours
  readonly expectedValue: number; // 0-1
  readonly dependencies: string[]; // Other goal IDs
  readonly subgoals: string[];
  readonly status: 'proposed' | 'active' | 'blocked' | 'completed' | 'abandoned';
  readonly progress: number; // 0-1
  readonly createdAt: number;
  readonly deadline?: number;
  readonly completionCriteria: string[];
}

/** Goal achievement record */
export interface GoalAchievement {
  readonly goalId: string;
  readonly completedAt: number;
  readonly actualEffort: number;
  readonly actualValue: number;
  readonly lessonsLearned: string[];
}

/** Knowledge gap detected */
export interface KnowledgeGap {
  readonly gapId: string;
  readonly domain: string;
  readonly description: string;
  readonly impact: number; // 0-1
  readonly blockingGoals: string[];
  readonly discoveredAt: number;
}

/** Configuration for goal autonomy */
export interface GoalAutonomyConfig {
  readonly baseDir: string;
  readonly maxActiveGoals: number;
  readonly goalHorizonMs: number;
  readonly curiosityWeight: number;
  readonly explorationRate: number;
}

/**
 * Goal Autonomy System
 * 
 * Manages self-directed goal generation and pursuit.
 */
export class GoalAutonomy {
  private config: Required<GoalAutonomyConfig>;
  private goals: Map<string, AutonomousGoal> = new Map();
  private achievements: Map<string, GoalAchievement> = new Map();
  private knowledgeGaps: Map<string, KnowledgeGap> = new Map();
  private activeGoalIds: string[] = [];
  private initialized = false;

  constructor(config: Partial<GoalAutonomyConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/autonomy',
      maxActiveGoals: config.maxActiveGoals ?? 5,
      goalHorizonMs: config.goalHorizonMs ?? 7 * 24 * 60 * 60 * 1000, // 1 week
      curiosityWeight: config.curiosityWeight ?? 0.3,
      explorationRate: config.explorationRate ?? 0.2,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    this.initialized = true;
  }

  /**
   * Generate goals autonomously based on current state
   */
  async generateGoals(context: {
    knownConcepts: string[];
    recentExperiences: string[];
    currentCapabilities: string[];
    failedAttempts: string[];
    userRequests: string[];
  }): Promise<AutonomousGoal[]> {
    const newGoals: AutonomousGoal[] = [];

    // 1. Curiosity-driven goals
    const curiosityGoals = this.generateCuriosityGoals(context);
    newGoals.push(...curiosityGoals);

    // 2. Gap-filling goals
    const gapGoals = this.generateGapFillingGoals(context);
    newGoals.push(...gapGoals);

    // 3. Capability extension goals
    const extensionGoals = this.generateExtensionGoals(context);
    newGoals.push(...extensionGoals);

    // 4. Opportunistic goals
    const opportunisticGoals = this.generateOpportunisticGoals(context);
    newGoals.push(...opportunisticGoals);

    // 5. Reflection-based goals
    const reflectionGoals = this.generateReflectionGoals(context);
    newGoals.push(...reflectionGoals);

    // Prioritize and filter
    const prioritized = this.prioritizeGoals(newGoals);
    const filtered = this.filterRedundantGoals(prioritized);

    // Store new goals
    for (const goal of filtered) {
      this.goals.set(goal.goalId, goal);
    }

    await this.saveState();
    return filtered;
  }

  /**
   * Select next goal to pursue
   */
  selectNextGoal(): AutonomousGoal | null {
    // Filter to active-possible goals
    const candidates = Array.from(this.goals.values())
      .filter(g => g.status === 'proposed' || g.status === 'active')
      .filter(g => this.dependenciesSatisfied(g));

    if (candidates.length === 0) return null;

    // Score each candidate
    const scored = candidates.map(g => ({
      goal: g,
      score: this.computeGoalScore(g),
    }));

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    // Return best
    return scored[0]?.goal ?? null;
  }

  /**
   * Activate a goal
   */
  activateGoal(goalId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    // Check if we have capacity
    if (this.activeGoalIds.length >= this.config.maxActiveGoals) {
      // Deactivate lowest priority active goal
      this.deactivateLowestPriorityGoal();
    }

    // Activate
    this.goals.set(goalId, { ...goal, status: 'active' });
    if (!this.activeGoalIds.includes(goalId)) {
      this.activeGoalIds.push(goalId);
    }

    return true;
  }

  /**
   * Report progress on a goal
   */
  async reportProgress(goalId: string, progress: number, notes?: string): Promise<void> {
    const goal = this.goals.get(goalId);
    if (!goal) return;

    const updated: AutonomousGoal = {
      ...goal,
      progress: Math.min(1, Math.max(0, progress)),
    };

    // Check for completion
    if (progress >= 1) {
      (updated as any).status = 'completed';
      this.activeGoalIds = this.activeGoalIds.filter(id => id !== goalId);

      // Record achievement
      this.achievements.set(goalId, {
        goalId,
        completedAt: Date.now(),
        actualEffort: 0, // Would track actual time
        actualValue: goal.expectedValue,
        lessonsLearned: notes ? [notes] : [],
      });
    }

    this.goals.set(goalId, updated);
    await this.saveState();
  }

  /**
   * Detect knowledge gaps
   */
  detectKnowledgeGap(domain: string, description: string, impact: number): KnowledgeGap {
    const gap: KnowledgeGap = {
      gapId: `gap-${Date.now()}`,
      domain,
      description,
      impact,
      blockingGoals: this.findBlockedGoals(domain),
      discoveredAt: Date.now(),
    };

    this.knowledgeGaps.set(gap.gapId, gap);
    return gap;
  }

  /**
   * Get active goals
   */
  getActiveGoals(): AutonomousGoal[] {
    return this.activeGoalIds
      .map(id => this.goals.get(id))
      .filter((g): g is AutonomousGoal => g !== undefined);
  }

  /**
   * Get all goals
   */
  getGoals(options?: {
    status?: AutonomousGoal['status'];
    type?: AutonomousGoal['type'];
  }): AutonomousGoal[] {
    let goals = Array.from(this.goals.values());

    if (options?.status) {
      goals = goals.filter(g => g.status === options.status);
    }
    if (options?.type) {
      goals = goals.filter(g => g.type === options.type);
    }

    return goals.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalGoals: number;
    activeGoals: number;
    completedGoals: number;
    knowledgeGaps: number;
    avgGoalValue: number;
  } {
    const goals = Array.from(this.goals.values());
    const completed = Array.from(this.achievements.values());

    return {
      totalGoals: goals.length,
      activeGoals: this.activeGoalIds.length,
      completedGoals: completed.length,
      knowledgeGaps: this.knowledgeGaps.size,
      avgGoalValue: completed.length > 0
        ? completed.reduce((sum, a) => sum + a.actualValue, 0) / completed.length
        : 0,
    };
  }

  // Private goal generation methods

  private generateCuriosityGoals(context: {
    knownConcepts: string[];
    recentExperiences: string[];
  }): AutonomousGoal[] {
    const goals: AutonomousGoal[] = [];

    // Generate curiosity about unknown related concepts
    const curiosityTargets = this.identifyCuriosityTargets(context);

    for (const target of curiosityTargets) {
      goals.push({
        goalId: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        description: `Explore and understand ${target}`,
        type: 'exploration',
        origin: 'curiosity',
        priority: 0.5 + Math.random() * 0.3,
        urgency: 0.2,
        estimatedEffort: 2,
        expectedValue: 0.6,
        dependencies: [],
        subgoals: [],
        status: 'proposed',
        progress: 0,
        createdAt: Date.now(),
        completionCriteria: [`Can explain ${target}`, `Can apply ${target}`],
      });
    }

    return goals;
  }

  private generateGapFillingGoals(context: {
    knownConcepts: string[];
    failedAttempts: string[];
  }): AutonomousGoal[] {
    const goals: AutonomousGoal[] = [];

    // Create goals to fill identified gaps
    for (const [gapId, gap] of this.knowledgeGaps) {
      if (gap.impact > 0.5) {
        goals.push({
          goalId: `goal-gap-${gapId}`,
          description: `Learn ${gap.domain}: ${gap.description}`,
          type: 'knowledge',
          origin: 'gap_analysis',
          priority: gap.impact,
          urgency: gap.blockingGoals.length > 0 ? 0.8 : 0.4,
          estimatedEffort: 4,
          expectedValue: gap.impact * 0.9,
          dependencies: [],
          subgoals: [],
          status: 'proposed',
          progress: 0,
          createdAt: Date.now(),
          completionCriteria: [`Can demonstrate ${gap.domain} knowledge`],
        });
      }
    }

    return goals;
  }

  private generateExtensionGoals(context: {
    currentCapabilities: string[];
  }): AutonomousGoal[] {
    const goals: AutonomousGoal[] = [];

    // Extend existing capabilities
    const extensions = [
      { capability: 'planning', extension: 'multi-step planning with contingencies' },
      { capability: 'learning', extension: 'faster learning from fewer examples' },
      { capability: 'memory', extension: 'long-term memory consolidation' },
    ];

    for (const ext of extensions) {
      if (context.currentCapabilities.includes(ext.capability)) {
        goals.push({
          goalId: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          description: `Extend ${ext.capability}: ${ext.extension}`,
          type: 'skill',
          origin: 'reflection',
          priority: 0.6,
          urgency: 0.3,
          estimatedEffort: 10,
          expectedValue: 0.8,
          dependencies: [],
          subgoals: [],
          status: 'proposed',
          progress: 0,
          createdAt: Date.now(),
          completionCriteria: [`Can demonstrate ${ext.extension}`],
        });
      }
    }

    return goals;
  }

  private generateOpportunisticGoals(context: {
    recentExperiences: string[];
    userRequests: string[];
  }): AutonomousGoal[] {
    const goals: AutonomousGoal[] = [];

    // Convert user requests to autonomous goals
    for (const request of context.userRequests) {
      goals.push({
        goalId: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        description: `Address user request: ${request.slice(0, 50)}`,
        type: 'social',
        origin: 'user',
        priority: 0.8,
        urgency: 0.7,
        estimatedEffort: 3,
        expectedValue: 0.9,
        dependencies: [],
        subgoals: [],
        status: 'proposed',
        progress: 0,
        createdAt: Date.now(),
        completionCriteria: ['User satisfied'],
      });
    }

    return goals;
  }

  private generateReflectionGoals(context: {
    failedAttempts: string[];
  }): AutonomousGoal[] {
    const goals: AutonomousGoal[] = [];

    // Learn from failures
    for (const failure of context.failedAttempts) {
      goals.push({
        goalId: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        description: `Learn from failure: ${failure.slice(0, 50)}`,
        type: 'optimization',
        origin: 'reflection',
        priority: 0.7,
        urgency: 0.5,
        estimatedEffort: 2,
        expectedValue: 0.7,
        dependencies: [],
        subgoals: [],
        status: 'proposed',
        progress: 0,
        createdAt: Date.now(),
        completionCriteria: ['Can avoid similar failure', 'Can explain what went wrong'],
      });
    }

    return goals;
  }

  // Private helper methods

  private identifyCuriosityTargets(context: {
    knownConcepts: string[];
    recentExperiences: string[];
  }): string[] {
    // Identify concepts mentioned but not well understood
    const targets: string[] = [];

    // Simple heuristic: look for unknown terms in experiences
    const commonConcepts = new Set(context.knownConcepts);

    for (const exp of context.recentExperiences) {
      const words = exp.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 5 && !commonConcepts.has(word)) {
          targets.push(word);
        }
      }
    }

    return [...new Set(targets)].slice(0, 5);
  }

  private findBlockedGoals(domain: string): string[] {
    return Array.from(this.goals.values())
      .filter(g => g.status === 'blocked')
      .filter(g => g.description.toLowerCase().includes(domain.toLowerCase()))
      .map(g => g.goalId);
  }

  private dependenciesSatisfied(goal: AutonomousGoal): boolean {
    for (const depId of goal.dependencies) {
      const dep = this.goals.get(depId);
      if (!dep || dep.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  private computeGoalScore(goal: AutonomousGoal): number {
    // Value density: value per effort
    const valueDensity = goal.expectedValue / Math.max(1, goal.estimatedEffort);

    // Urgency factor
    const urgencyFactor = goal.urgency;

    // Progress factor (prefer goals already started)
    const progressFactor = goal.progress > 0 ? 1.2 : 1.0;

    // Age factor (prefer newer goals slightly)
    const age = Date.now() - goal.createdAt;
    const ageFactor = Math.max(0.8, 1 - age / this.config.goalHorizonMs);

    return valueDensity * urgencyFactor * progressFactor * ageFactor;
  }

  private prioritizeGoals(goals: AutonomousGoal[]): AutonomousGoal[] {
    return goals.sort((a, b) => {
      const scoreA = this.computeGoalScore(a);
      const scoreB = this.computeGoalScore(b);
      return scoreB - scoreA;
    });
  }

  private filterRedundantGoals(goals: AutonomousGoal[]): AutonomousGoal[] {
    const filtered: AutonomousGoal[] = [];

    for (const goal of goals) {
      // Check if similar goal already exists
      const isRedundant = Array.from(this.goals.values()).some(existing =>
        existing.description.toLowerCase() === goal.description.toLowerCase() &&
        existing.status !== 'abandoned'
      );

      if (!isRedundant) {
        filtered.push(goal);
      }
    }

    return filtered;
  }

  private deactivateLowestPriorityGoal(): void {
    const activeGoals = this.getActiveGoals();
    if (activeGoals.length === 0) return;

    const lowest = activeGoals.sort((a, b) => a.priority - b.priority)[0];

    this.goals.set(lowest.goalId, { ...lowest, status: 'proposed' });
    this.activeGoalIds = this.activeGoalIds.filter(id => id !== lowest.goalId);
  }

  private async saveState(): Promise<void> {
    const state = {
      goals: Array.from(this.goals.entries()),
      achievements: Array.from(this.achievements.entries()),
      knowledgeGaps: Array.from(this.knowledgeGaps.entries()),
      activeGoalIds: this.activeGoalIds,
    };
    await writeFile(
      join(this.config.baseDir, 'goal-autonomy.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'goal-autonomy.json'), 'utf-8');
      const state = JSON.parse(data);
      this.goals = new Map(state.goals);
      this.achievements = new Map(state.achievements);
      this.knowledgeGaps = new Map(state.knowledgeGaps);
      this.activeGoalIds = state.activeGoalIds ?? [];
    } catch {
      // No state to load
    }
  }
}
