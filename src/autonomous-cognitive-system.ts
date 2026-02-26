/**
 * Autonomous Cognitive System
 * 
 * Integrated system combining:
 * - Goal Autonomy (self-directed goal generation)
 * - Executive Control (attention and resource management)
 * - Metacognition (thinking about thinking)
 * - Autonomous Learning (self-directed learning with LLM)
 * 
 * This creates a system capable of autonomous self-direction and
 * human-level cognition through continuous learning and adaptation.
 */

import { GoalAutonomy, AutonomousGoal } from './autonomy/goal-autonomy.js';
import { ExecutiveControl, AttentionFocus } from './autonomy/executive-control.js';
import { Metacognition } from './cognition/metacognition.js';
import { AutonomousLearningLoop, LLMInterface } from './autonomy/autonomous-learning-loop.js';

/** System configuration */
export interface AutonomousCognitiveConfig {
  readonly baseDir: string;
  readonly llm: LLMInterface;
  readonly enableMetacognition: boolean;
  readonly enableAutonomousGoals: boolean;
  readonly enableLearning: boolean;
  readonly autonomyLevel: 'assisted' | 'semi-autonomous' | 'fully-autonomous';
}

/** System state snapshot */
export interface SystemSnapshot {
  readonly timestamp: number;
  readonly activeGoals: AutonomousGoal[];
  readonly currentFocus: AttentionFocus | null;
  readonly cognitiveState: {
    focusLevel: number;
    cognitiveLoad: number;
    mentalFatigue: number;
    confidenceLevel: number;
  } | null;
  readonly knowledgeStats: {
    totalKnowledge: number;
    pendingObjectives: number;
    avgConfidence: number;
  };
  readonly autonomyMode: string;
}

/** Action taken by the system */
export interface AutonomousAction {
  readonly actionId: string;
  readonly timestamp: number;
  readonly type: 'learn' | 'explore' | 'plan' | 'reflect' | 'request_help';
  readonly description: string;
  readonly triggeredBy: string;
  readonly expectedOutcome: string;
}

/**
 * Autonomous Cognitive System
 * 
 * Main integration point for all autonomous capabilities.
 */
export class AutonomousCognitiveSystem {
  private config: Required<AutonomousCognitiveConfig>;
  private goalAutonomy: GoalAutonomy;
  private executiveControl: ExecutiveControl;
  private metacognition: Metacognition;
  private learning: AutonomousLearningLoop;
  
  private isRunning = false;
  private lastMetacognitiveCheck = 0;
  private actionHistory: AutonomousAction[] = [];
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: AutonomousCognitiveConfig) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/autonomous',
      llm: config.llm,
      enableMetacognition: config.enableMetacognition ?? true,
      enableAutonomousGoals: config.enableAutonomousGoals ?? true,
      enableLearning: config.enableLearning ?? true,
      autonomyLevel: config.autonomyLevel ?? 'semi-autonomous',
    };

    // Initialize components
    this.goalAutonomy = new GoalAutonomy({ baseDir: `${this.config.baseDir}/goals` });
    this.executiveControl = new ExecutiveControl({ baseDir: `${this.config.baseDir}/executive` });
    this.metacognition = new Metacognition({ baseDir: `${this.config.baseDir}/metacognition` });
    this.learning = new AutonomousLearningLoop({
      baseDir: `${this.config.baseDir}/learning`,
      llm: this.config.llm,
      maxConcurrentObjectives: 3,
      learningBatchSize: 5,
      minConfidenceThreshold: 0.7,
      reviewIntervalMs: 24 * 60 * 60 * 1000,
    });
  }

  async initialize(): Promise<void> {
    // Initialize all subsystems
    await this.goalAutonomy.initialize();
    await this.executiveControl.initialize();
    await this.metacognition.initialize();
    await this.learning.initialize();
  }

  /**
   * Start autonomous operation
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;

    // Start monitoring loop
    this.monitoringInterval = setInterval(() => {
      this.autonomousCycle();
    }, 1000);

    // Initial goal generation if enabled
    if (this.config.enableAutonomousGoals) {
      await this.generateInitialGoals();
    }
  }

  /**
   * Stop autonomous operation
   */
  stop(): void {
    this.isRunning = false;
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Process external input (from user or environment)
   */
  async processInput(input: {
    type: 'user_request' | 'observation' | 'feedback' | 'task';
    content: string;
    priority?: number;
  }): Promise<void> {
    // Request attention
    this.executiveControl.requestAttention({
      targetType: input.type === 'user_request' ? 'external' : 'stimulus',
      targetId: `input-${Date.now()}`,
      priority: input.priority ?? 0.7,
      intensity: 0.8,
      duration: 30000,
      expectedValue: input.priority ?? 0.7,
    });

    // Handle based on type
    switch (input.type) {
      case 'user_request':
        await this.handleUserRequest(input.content);
        break;
      case 'observation':
        await this.handleObservation(input.content);
        break;
      case 'feedback':
        await this.handleFeedback(input.content);
        break;
      case 'task':
        await this.handleTask(input.content);
        break;
    }

    // Update metacognition
    if (this.config.enableMetacognition) {
      this.metacognition.monitor({
        recentActions: [input.content],
        recentErrors: [],
        timeOnTask: 0,
        taskComplexity: 0.5,
        currentStrategy: 'process_input',
      });
    }
  }

  /**
   * Get current system snapshot
   */
  getSnapshot(): SystemSnapshot {
    const cognitiveState = this.metacognition.getCurrentState();
    const knowledgeStats = this.learning.getStats();

    return {
      timestamp: Date.now(),
      activeGoals: this.goalAutonomy.getActiveGoals(),
      currentFocus: this.executiveControl.getCurrentFocus(),
      cognitiveState: cognitiveState ? {
        focusLevel: cognitiveState.focusLevel,
        cognitiveLoad: cognitiveState.cognitiveLoad,
        mentalFatigue: cognitiveState.mentalFatigue,
        confidenceLevel: cognitiveState.confidenceLevel,
      } : null,
      knowledgeStats: {
        totalKnowledge: knowledgeStats.totalKnowledge,
        pendingObjectives: knowledgeStats.pendingObjectives,
        avgConfidence: knowledgeStats.avgKnowledgeConfidence,
      },
      autonomyMode: this.config.autonomyLevel,
    };
  }

  /**
   * Query the system's knowledge
   */
  async queryKnowledge(query: string): Promise<{
    answer: string;
    confidence: number;
    sources: string[];
  }> {
    const knowledge = await this.learning.retrieveKnowledge(query, {
      maxResults: 3,
      includeRelated: true,
    });

    if (knowledge.length === 0) {
      // No knowledge - trigger learning
      if (this.config.enableLearning) {
        this.learning.createObjective({
          topic: query,
          question: query,
          motivation: 'Direct query without existing knowledge',
          priority: 0.8,
          depth: 'deep',
          relatedConcepts: [],
        });
      }

      return {
        answer: 'I don\'t have knowledge on this topic yet. I\'ve queued it for learning.',
        confidence: 0,
        sources: [],
      };
    }

    // Combine knowledge
    const answer = knowledge.map(k => k.content).join('\n\n');
    const avgConfidence = knowledge.reduce((sum, k) => sum + k.confidence, 0) / knowledge.length;

    return {
      answer,
      confidence: avgConfidence,
      sources: knowledge.map(k => k.topic),
    };
  }

  /**
   * Get action history
   */
  getActionHistory(limit: number = 50): AutonomousAction[] {
    return this.actionHistory.slice(-limit);
  }

  /**
   * Request system to focus on specific area
   */
  requestFocus(area: string, priority: number = 0.8): boolean {
    return this.executiveControl.requestAttention({
      targetType: 'goal',
      targetId: area,
      priority,
      intensity: 0.9,
      duration: 60000,
      expectedValue: priority,
    });
  }

  // Private methods

  private async autonomousCycle(): Promise<void> {
    if (!this.isRunning) return;

    // 1. Update executive control
    this.executiveControl.updateAttention();

    // 2. Metacognitive monitoring (every 5 seconds)
    const now = Date.now();
    if (this.config.enableMetacognition && now - this.lastMetacognitiveCheck > 5000) {
      await this.performMetacognitiveCheck();
      this.lastMetacognitiveCheck = now;
    }

    // 3. Process active goals
    if (this.config.enableAutonomousGoals) {
      await this.processGoals();
    }

    // 4. Learning cycle (if enabled and resources available)
    if (this.config.enableLearning && this.hasAvailableResources()) {
      await this.learningCycle();
    }

    // 5. Knowledge review (periodic)
    if (now % 60000 < 1000) { // Every minute
      await this.learning.review();
    }
  }

  private async performMetacognitiveCheck(): Promise<void> {
    const focus = this.executiveControl.getCurrentFocus();

    const result = this.metacognition.monitor({
      recentActions: this.actionHistory.slice(-5).map(a => a.description),
      recentErrors: [],
      timeOnTask: focus ? Date.now() - focus.startedAt : 0,
      taskComplexity: 0.5,
      currentStrategy: focus ? `focus_${focus.targetType}` : 'idle',
    });

    // Act on recommendation
    switch (result.recommendation.action) {
      case 'pause':
        // Mental fatigue detected
        break;
      case 'switch_strategy':
        if (result.recommendation.suggestedStrategy) {
          // Strategy switch suggested
        }
        break;
      case 'escalate':
        this.executiveControl.escalate({
          description: result.recommendation.reason,
          severity: 0.7,
          context: 'metacognitive_assessment',
        });
        break;
    }
  }

  private async processGoals(): Promise<void> {
    // Get next goal
    const goal = this.goalAutonomy.selectNextGoal();
    if (!goal) return;

    // Activate goal
    this.goalAutonomy.activateGoal(goal.goalId);

    // Request attention
    this.executiveControl.requestAttention({
      targetType: 'goal',
      targetId: goal.goalId,
      priority: goal.priority,
      intensity: 0.8,
      duration: goal.estimatedEffort * 60 * 60 * 1000,
      expectedValue: goal.expectedValue,
    });

    // Log action
    this.logAction({
      type: 'plan',
      description: `Activated goal: ${goal.description}`,
      triggeredBy: 'goal_selection',
      expectedOutcome: 'Progress toward goal completion',
    });

    // Progress the goal based on type
    switch (goal.type) {
      case 'knowledge':
        await this.pursueKnowledgeGoal(goal);
        break;
      case 'skill':
        await this.pursueSkillGoal(goal);
        break;
      case 'exploration':
        await this.pursueExplorationGoal(goal);
        break;
    }
  }

  private async pursueKnowledgeGoal(goal: AutonomousGoal): Promise<void> {
    // Create learning objective
    this.learning.createObjective({
      topic: goal.description,
      question: `What do I need to know about ${goal.description}?`,
      motivation: goal.description,
      priority: goal.priority,
      depth: 'deep',
      relatedConcepts: [],
    });

    // Report progress
    await this.goalAutonomy.reportProgress(goal.goalId, 0.3, 'Learning objective created');
  }

  private async pursueSkillGoal(goal: AutonomousGoal): Promise<void> {
    // Skill goals require practice - for now, just log
    this.logAction({
      type: 'explore',
      description: `Pursuing skill goal: ${goal.description}`,
      triggeredBy: goal.goalId,
      expectedOutcome: 'Improved capability',
    });

    await this.goalAutonomy.reportProgress(goal.goalId, 0.1, 'Skill development started');
  }

  private async pursueExplorationGoal(goal: AutonomousGoal): Promise<void> {
    // Exploration goals are curiosity-driven
    this.logAction({
      type: 'explore',
      description: `Exploring: ${goal.description}`,
      triggeredBy: 'curiosity',
      expectedOutcome: 'New knowledge or patterns discovered',
    });

    // Create learning objective for exploration
    this.learning.createObjective({
      topic: goal.description,
      question: goal.description,
      motivation: 'Curiosity-driven exploration',
      priority: goal.priority,
      depth: 'surface',
      relatedConcepts: [],
    });

    await this.goalAutonomy.reportProgress(goal.goalId, 0.2, 'Exploration initiated');
  }

  private async learningCycle(): Promise<void> {
    const result = await this.learning.learn();

    if (result.knowledgeAcquired > 0) {
      // Learning occurred
      for (const _insight of result.insights) {
        // Process insights
      }
    }
  }

  private async generateInitialGoals(): Promise<void> {
    await this.goalAutonomy.generateGoals({
      knownConcepts: [],
      recentExperiences: [],
      currentCapabilities: ['basic_processing'],
      failedAttempts: [],
      userRequests: [],
    });
  }

  private async handleUserRequest(content: string): Promise<void> {
    // Create goal from user request
    await this.goalAutonomy.generateGoals({
      knownConcepts: [],
      recentExperiences: [],
      currentCapabilities: [],
      failedAttempts: [],
      userRequests: [content],
    });

    this.logAction({
      type: 'plan',
      description: `Processing user request: ${content.slice(0, 50)}`,
      triggeredBy: 'user_input',
      expectedOutcome: 'User request addressed',
    });
  }

  private async handleObservation(content: string): Promise<void> {
    // Check for knowledge gaps
    const unknownTerms = await this.extractUnknownTerms(content);
    
    if (unknownTerms.length > 0) {
      this.learning.detectGap({
        situation: content,
        unknownTerms,
        failedReasoning: '',
        confidenceDrop: 0.3,
      });
    }

    this.logAction({
      type: 'reflect',
      description: `Processed observation: ${content.slice(0, 50)}`,
      triggeredBy: 'environment',
      expectedOutcome: 'Updated world model',
    });
  }

  private async handleFeedback(content: string): Promise<void> {
    // Learn from feedback
    this.learning.createObjective({
      topic: 'feedback_integration',
      question: `How should I adjust based on: ${content}?`,
      motivation: 'Learning from feedback',
      priority: 0.8,
      depth: 'deep',
      relatedConcepts: [],
    });

    this.logAction({
      type: 'reflect',
      description: 'Integrating feedback',
      triggeredBy: 'feedback',
      expectedOutcome: 'Improved performance',
    });
  }

  private async handleTask(content: string): Promise<void> {
    // Create task goal
    await this.goalAutonomy.generateGoals({
      knownConcepts: [],
      recentExperiences: [],
      currentCapabilities: [],
      failedAttempts: [],
      userRequests: [content],
    });

    this.logAction({
      type: 'plan',
      description: `Handling task: ${content.slice(0, 50)}`,
      triggeredBy: 'task_assignment',
      expectedOutcome: 'Task completed',
    });
  }

  private hasAvailableResources(): boolean {
    const resources = this.executiveControl.getResources();
    return resources.learning > 0.2 && resources.processing > 0.3;
  }

  private async extractUnknownTerms(content: string): Promise<string[]> {
    // Query LLM to identify unknown concepts
    const prompt = `Extract 3-5 technical or domain-specific terms from this text that might need explanation. Return as comma-separated list only:\n\n${content.slice(0, 500)}`;
    
    const response = await this.config.llm.query(prompt);
    
    return response
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 3);
  }

  private logAction(action: Omit<AutonomousAction, 'actionId' | 'timestamp'>): void {
    const fullAction: AutonomousAction = {
      ...action,
      actionId: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };

    this.actionHistory.push(fullAction);

    // Keep bounded
    if (this.actionHistory.length > 10000) {
      this.actionHistory = this.actionHistory.slice(-5000);
    }
  }
}
