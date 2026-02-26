/**
 * Intrinsic Motivation - Part 3: Curiosity Drive & Goal Generation
 * 
 * Generates goals based on uncertainty, novelty, and learning progress.
 * Not just responding to user requests, but actively seeking knowledge.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Generated goal */
export interface IntrinsicGoal {
  readonly goalId: string;
  readonly type: 'explore' | 'master' | 'connect' | 'create';
  readonly description: string;
  readonly motivation: string;
  readonly target: string;
  readonly priority: number; // 0-1
  readonly deadline?: number;
  readonly successCriteria: string[];
  readonly progress: number;
  readonly status: 'active' | 'completed' | 'abandoned';
  readonly createdAt: number;
}

/** Curiosity target */
export interface CuriosityTarget {
  readonly targetId: string;
  readonly type: 'concept' | 'skill' | 'relationship' | 'pattern';
  readonly name: string;
  readonly uncertainty: number; // 0-1
  readonly novelty: number; // 0-1
  readonly potentialValue: number; // 0-1
  readonly explorationCount: number;
  readonly lastExplored?: number;
}

/** Learning progress tracker */
export interface LearningProgress {
  readonly topic: string;
  readonly initialUncertainty: number;
  readonly currentUncertainty: number;
  readonly improvement: number;
  readonly timeSpent: number;
  readonly lastActive: number;
}

/** Surprise event */
export interface SurpriseEvent {
  readonly eventId: string;
  readonly timestamp: number;
  readonly description: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly surpriseMagnitude: number; // 0-1
  readonly learningOpportunity: string;
}

/** Configuration for intrinsic drive */
export interface IntrinsicDriveConfig {
  readonly baseDir: string;
  readonly curiosityThreshold: number;
  readonly explorationRate: number; // epsilon-greedy
  readonly noveltyBonus: number;
  readonly progressWeight: number;
}

/**
 * Intrinsic motivation system
 * Generates goals based on what would be most valuable to learn
 */
export class IntrinsicDrive {
  private config: Required<IntrinsicDriveConfig>;
  private goals: Map<string, IntrinsicGoal> = new Map();
  private curiosityTargets: Map<string, CuriosityTarget> = new Map();
  private learningProgress: Map<string, LearningProgress> = new Map();
  private surpriseHistory: SurpriseEvent[] = [];
  private initialized = false;

  constructor(config: Partial<IntrinsicDriveConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/motivation',
      curiosityThreshold: config.curiosityThreshold ?? 0.3,
      explorationRate: config.explorationRate ?? 0.2,
      noveltyBonus: config.noveltyBonus ?? 0.5,
      progressWeight: config.progressWeight ?? 0.3,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    this.initialized = true;
  }

  /**
   * Generate goals based on current knowledge gaps
   */
  async generateGoals(currentContext: {
    knownConcepts: string[];
    recentExperiences: string[];
    uncertainties: string[];
  }): Promise<IntrinsicGoal[]> {
    await this.initialize();

    const newGoals: IntrinsicGoal[] = [];

    // 1. Exploration goals for high-uncertainty areas
    for (const uncertainty of currentContext.uncertainties) {
      const target = this.getOrCreateCuriosityTarget(uncertainty, 'concept');
      if (target.uncertainty > this.config.curiosityThreshold) {
        const goal = await this.createExplorationGoal(target);
        newGoals.push(goal);
      }
    }

    // 2. Mastery goals for concepts with slow learning progress
    for (const [topic, progress] of this.learningProgress) {
      if (progress.improvement < 0.1 && progress.timeSpent > 100) {
        const goal = await this.createMasteryGoal(topic);
        newGoals.push(goal);
      }
    }

    // 3. Connection goals for isolated concepts
    const isolatedConcepts = this.findIsolatedConcepts(currentContext.knownConcepts);
    for (const concept of isolatedConcepts) {
      const goal = await this.createConnectionGoal(concept);
      newGoals.push(goal);
    }

    // 4. Novelty-driven goals
    const novelTargets = this.findNovelTargets();
    for (const target of novelTargets.slice(0, 2)) {
      const goal = await this.createNoveltyGoal(target);
      newGoals.push(goal);
    }

    // Sort by priority and store
    newGoals.sort((a, b) => b.priority - a.priority);
    
    for (const goal of newGoals) {
      this.goals.set(goal.goalId, goal);
    }

    await this.saveState();
    return newGoals;
  }

  /**
   * Report a surprise event (unexpected outcome)
   */
  async reportSurprise(event: Omit<SurpriseEvent, 'eventId'>): Promise<IntrinsicGoal | null> {
    await this.initialize();

    const surpriseEvent: SurpriseEvent = {
      ...event,
      eventId: `surprise-${Date.now()}`,
    };

    this.surpriseHistory.push(surpriseEvent);

    // High surprise creates immediate learning goal
    if (event.surpriseMagnitude > 0.7) {
      const goal: IntrinsicGoal = {
        goalId: `goal-${Date.now()}`,
        type: 'explore',
        description: `Understand why: ${event.description}`,
        motivation: 'High surprise indicates knowledge gap',
        target: event.learningOpportunity,
        priority: event.surpriseMagnitude,
        successCriteria: ['Can predict similar outcomes', 'Can explain causality'],
        progress: 0,
        status: 'active',
        createdAt: Date.now(),
      };
      
      this.goals.set(goal.goalId, goal);
      console.log(`[IntrinsicDrive] Surprise-driven goal created: ${goal.description}`);
      
      return goal;
    }

    return null;
  }

  /**
   * Update learning progress
   */
  async updateProgress(topic: string, metrics: {
    uncertaintyReduction: number;
    timeSpent: number;
  }): Promise<void> {
    await this.initialize();

    const existing = this.learningProgress.get(topic);
    if (existing) {
      const updated: LearningProgress = {
        ...existing,
        currentUncertainty: Math.max(0, existing.currentUncertainty - metrics.uncertaintyReduction),
        improvement: existing.initialUncertainty - (existing.currentUncertainty - metrics.uncertaintyReduction),
        timeSpent: existing.timeSpent + metrics.timeSpent,
        lastActive: Date.now(),
      };
      this.learningProgress.set(topic, updated);

      // Check if goal should be marked complete
      if (updated.currentUncertainty < 0.1) {
        await this.completeGoalForTopic(topic);
      }
    } else {
      const progress: LearningProgress = {
        topic,
        initialUncertainty: 1.0,
        currentUncertainty: 1.0 - metrics.uncertaintyReduction,
        improvement: metrics.uncertaintyReduction,
        timeSpent: metrics.timeSpent,
        lastActive: Date.now(),
      };
      this.learningProgress.set(topic, progress);
    }

    await this.saveState();
  }

  /**
   * Get next recommended action based on intrinsic motivation
   */
  getRecommendedAction(): {
    action: string;
    reason: string;
    expectedLearning: string;
  } | null {
    const activeGoals = Array.from(this.goals.values())
      .filter(g => g.status === 'active')
      .sort((a, b) => b.priority - a.priority);

    if (activeGoals.length === 0) {
      // No active goals - explore randomly with probability epsilon
      if (Math.random() < this.config.explorationRate) {
        const randomTarget = this.getRandomCuriosityTarget();
        if (randomTarget) {
          return {
            action: `explore_${randomTarget.name}`,
            reason: 'Random exploration (epsilon-greedy)',
            expectedLearning: `Discover properties of ${randomTarget.name}`,
          };
        }
      }
      return null;
    }

    const topGoal = activeGoals[0];
    return {
      action: this.goalToAction(topGoal),
      reason: `Pursuing goal: ${topGoal.description}`,
      expectedLearning: `Reduce uncertainty about ${topGoal.target}`,
    };
  }

  /**
   * Get current goals
   */
  getGoals(): IntrinsicGoal[] {
    return Array.from(this.goals.values());
  }

  /**
   * Get curiosity targets
   */
  getCuriosityTargets(): CuriosityTarget[] {
    return Array.from(this.curiosityTargets.values())
      .sort((a, b) => b.uncertainty - a.uncertainty);
  }

  /**
   * Get learning progress
   */
  getLearningProgress(): LearningProgress[] {
    return Array.from(this.learningProgress.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeGoals: number;
    completedGoals: number;
    curiosityTargets: number;
    averageUncertainty: number;
    totalSurprises: number;
  } {
    const goals = Array.from(this.goals.values());
    const targets = Array.from(this.curiosityTargets.values());
    
    return {
      activeGoals: goals.filter(g => g.status === 'active').length,
      completedGoals: goals.filter(g => g.status === 'completed').length,
      curiosityTargets: targets.length,
      averageUncertainty: targets.reduce((sum, t) => sum + t.uncertainty, 0) / (targets.length || 1),
      totalSurprises: this.surpriseHistory.length,
    };
  }

  // Private helper methods
  private getOrCreateCuriosityTarget(name: string, type: CuriosityTarget['type']): CuriosityTarget {
    const targetId = `${type}:${name}`;
    let target = this.curiosityTargets.get(targetId);
    
    if (!target) {
      target = {
        targetId,
        type,
        name,
        uncertainty: 0.8,
        novelty: 1.0,
        potentialValue: 0.5,
        explorationCount: 0,
      };
      this.curiosityTargets.set(targetId, target);
    }
    
    return target;
  }

  private async createExplorationGoal(target: CuriosityTarget): Promise<IntrinsicGoal> {
    const goal: IntrinsicGoal = {
      goalId: `explore-${target.targetId}-${Date.now()}`,
      type: 'explore',
      description: `Explore and understand ${target.name}`,
      motivation: `High uncertainty (${target.uncertainty.toFixed(2)}) about ${target.name}`,
      target: target.name,
      priority: target.uncertainty * (1 + this.config.noveltyBonus * target.novelty),
      successCriteria: [
        `Can explain what ${target.name} is`,
        `Can predict ${target.name} behavior`,
        `Uncertainty < 0.2`,
      ],
      progress: 1 - target.uncertainty,
      status: 'active',
      createdAt: Date.now(),
    };

    return goal;
  }

  private async createMasteryGoal(topic: string): Promise<IntrinsicGoal> {
    const progress = this.learningProgress.get(topic);
    
    const goal: IntrinsicGoal = {
      goalId: `master-${topic}-${Date.now()}`,
      type: 'master',
      description: `Achieve mastery of ${topic}`,
      motivation: `Slow progress detected (${progress?.improvement.toFixed(2)} improvement)`,
      target: topic,
      priority: 0.6,
      successCriteria: [
        'Can apply in novel situations',
        'Can teach to others',
        'Error rate < 5%',
      ],
      progress: progress ? 1 - progress.currentUncertainty : 0,
      status: 'active',
      createdAt: Date.now(),
    };

    return goal;
  }

  private async createConnectionGoal(concept: string): Promise<IntrinsicGoal> {
    const goal: IntrinsicGoal = {
      goalId: `connect-${concept}-${Date.now()}`,
      type: 'connect',
      description: `Find connections for ${concept}`,
      motivation: `${concept} appears isolated from other knowledge`,
      target: concept,
      priority: 0.5,
      successCriteria: [
        `Found 3+ related concepts`,
        'Can explain relationships',
        'Can transfer knowledge between domains',
      ],
      progress: 0,
      status: 'active',
      createdAt: Date.now(),
    };

    return goal;
  }

  private async createNoveltyGoal(target: CuriosityTarget): Promise<IntrinsicGoal> {
    const goal: IntrinsicGoal = {
      goalId: `novel-${target.targetId}-${Date.now()}`,
      type: 'explore',
      description: `Investigate novel concept: ${target.name}`,
      motivation: `High novelty score (${target.novelty.toFixed(2)})`,
      target: target.name,
      priority: target.novelty * this.config.noveltyBonus,
      successCriteria: [
        'Understand basic properties',
        'Determine if useful',
        'Categorize appropriately',
      ],
      progress: 0,
      status: 'active',
      createdAt: Date.now(),
    };

    return goal;
  }

  private findIsolatedConcepts(knownConcepts: string[]): string[] {
    // Concepts that haven't been connected to others
    return knownConcepts.filter(concept => {
      const progress = this.learningProgress.get(concept);
      return !progress || progress.improvement < 0.2;
    });
  }

  private findNovelTargets(): CuriosityTarget[] {
    return Array.from(this.curiosityTargets.values())
      .filter(t => t.novelty > 0.7)
      .sort((a, b) => b.novelty - a.novelty);
  }

  private getRandomCuriosityTarget(): CuriosityTarget | null {
    const targets = Array.from(this.curiosityTargets.values());
    if (targets.length === 0) return null;
    return targets[Math.floor(Math.random() * targets.length)];
  }

  private goalToAction(goal: IntrinsicGoal): string {
    switch (goal.type) {
      case 'explore':
        return `investigate_${goal.target}`;
      case 'master':
        return `practice_${goal.target}`;
      case 'connect':
        return `find_relations_${goal.target}`;
      case 'create':
        return `create_with_${goal.target}`;
      default:
        return `work_on_${goal.target}`;
    }
  }

  private async completeGoalForTopic(topic: string): Promise<void> {
    for (const [goalId, goal] of this.goals) {
      if (goal.target === topic && goal.status === 'active') {
        this.goals.set(goalId, { ...goal, status: 'completed', progress: 1 });
        console.log(`[IntrinsicDrive] Goal completed: ${goal.description}`);
      }
    }
  }

  private async saveState(): Promise<void> {
    const state = {
      goals: Array.from(this.goals.entries()),
      curiosityTargets: Array.from(this.curiosityTargets.entries()),
      learningProgress: Array.from(this.learningProgress.entries()),
      surpriseHistory: this.surpriseHistory,
    };
    await writeFile(
      join(this.config.baseDir, 'motivation-state.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'motivation-state.json'), 'utf-8');
      const state = JSON.parse(data);
      this.goals = new Map(state.goals);
      this.curiosityTargets = new Map(state.curiosityTargets);
      this.learningProgress = new Map(state.learningProgress);
      this.surpriseHistory = state.surpriseHistory || [];
    } catch {
      // No state to load
    }
  }
}
