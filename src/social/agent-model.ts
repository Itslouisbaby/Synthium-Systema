/**
 * Agent Model - Theory of Mind Core
 * 
 * Represents another agent's mental state:
 * - Beliefs (what they think is true)
 * - Goals (what they want to achieve)
 * - Intentions (what they plan to do)
 * - Knowledge (what they know)
 * - Preferences (how they like things done)
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** A belief held by an agent */
export interface AgentBelief {
  readonly beliefId: string;
  readonly proposition: string;
  readonly confidence: number; // 0-1, how sure they are
  readonly source: 'observed' | 'inferred' | 'communicated';
  readonly formedAt: number;
  readonly updatedAtMs: number;
}

/** A goal of an agent */
export interface AgentGoal {
  readonly goalId: string;
  readonly description: string;
  readonly priority: number; // 0-1
  readonly status: 'active' | 'suspended' | 'achieved' | 'abandoned';
  readonly subgoals: string[];
  readonly deadline?: number;
  readonly createdAt: number;
}

/** An intention (planned action) of an agent */
export interface AgentIntention {
  readonly intentionId: string;
  readonly action: string;
  readonly target?: string;
  readonly expectedOutcome: string;
  readonly confidence: number;
  readonly deadline?: number;
  readonly formedAt: number;
}

/** Knowledge state - what an agent knows */
export interface KnowledgeState {
  readonly domain: string;
  readonly level: 'novice' | 'intermediate' | 'expert';
  readonly knownConcepts: string[];
  readonly gaps: string[]; // What they don't know
  readonly lastAssessed: number;
}

/** Preference of an agent */
export interface AgentPreference {
  readonly preferenceId: string;
  readonly category: 'communication' | 'format' | 'depth' | 'style';
  readonly value: string;
  readonly strength: number; // 0-1
}

/** Complete model of an agent */
export interface AgentModel {
  readonly agentId: string;
  readonly agentType: 'human' | 'system' | 'service' | 'unknown';
  readonly name?: string;
  readonly beliefs: Map<string, AgentBelief>;
  readonly goals: Map<string, AgentGoal>;
  readonly intentions: Map<string, AgentIntention>;
  readonly knowledge: Map<string, KnowledgeState>;
  readonly preferences: Map<string, AgentPreference>;
  readonly interactionHistory: InteractionRecord[];
  readonly modelConfidence: number; // 0-1, how well we know this agent
  readonly createdAt: number;
  readonly updatedAtMs: number;
}

/** Record of an interaction with an agent */
export interface InteractionRecord {
  readonly recordId: string;
  readonly timestamp: number;
  readonly type: 'observed' | 'communicated' | 'inferred';
  readonly content: string;
  readonly agentAction?: string;
  readonly ourResponse?: string;
  readonly outcome?: string;
}

/** Configuration for agent modeler */
export interface AgentModelerConfig {
  readonly baseDir: string;
  readonly beliefDecayRate: number;
  readonly maxBeliefsPerAgent: number;
  readonly maxHistoryLength: number;
}

/**
 * Agent Modeler
 * 
 * Maintains models of other agents' mental states.
 * Core component of Theory of Mind.
 */
export class AgentModeler {
  private config: Required<AgentModelerConfig>;
  private agents: Map<string, AgentModel> = new Map();
  private initialized = false;

  constructor(config: Partial<AgentModelerConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/social',
      beliefDecayRate: config.beliefDecayRate ?? 0.01,
      maxBeliefsPerAgent: config.maxBeliefsPerAgent ?? 100,
      maxHistoryLength: config.maxHistoryLength ?? 50,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    this.initialized = true;
  }

  /**
   * Create or get agent model
   */
  getOrCreateAgent(agentId: string, agentType: AgentModel['agentType'] = 'unknown'): AgentModel {
    let agent = this.agents.get(agentId);

    if (!agent) {
      agent = {
        agentId,
        agentType,
        beliefs: new Map(),
        goals: new Map(),
        intentions: new Map(),
        knowledge: new Map(),
        preferences: new Map(),
        interactionHistory: [],
        modelConfidence: 0.1,
        createdAt: Date.now(),
        updatedAtMs: Date.now(),
      };
      this.agents.set(agentId, agent);
    }

    return agent;
  }

  /**
   * Attribute a belief to an agent
   */
  attributeBelief(
    agentId: string,
    proposition: string,
    confidence: number,
    source: AgentBelief['source'] = 'inferred'
  ): AgentBelief {
    const agent = this.getOrCreateAgent(agentId);
    const now = Date.now();

    // Check if belief already exists
    const existingKey = this.findBeliefKey(agent, proposition);

    if (existingKey) {
      // Update existing belief
      const existing = agent.beliefs.get(existingKey)!;
      const updated: AgentBelief = {
        ...existing,
        confidence: this.mergeConfidence(existing.confidence, confidence),
        source,
        updatedAtMs: now,
      };
      agent.beliefs.set(existingKey, updated);
      this.updateAgentTimestamp(agentId);
      return updated;
    }

    // Create new belief
    const belief: AgentBelief = {
      beliefId: `belief-${now}-${Math.random().toString(36).slice(2, 7)}`,
      proposition,
      confidence,
      source,
      formedAt: now,
      updatedAtMs: now,
    };

    // Make room if needed
    if (agent.beliefs.size >= this.config.maxBeliefsPerAgent) {
      this.removeOldestBelief(agent);
    }

    agent.beliefs.set(belief.beliefId, belief);
    this.updateAgentTimestamp(agentId);

    return belief;
  }

  /**
   * Attribute a goal to an agent
   */
  attributeGoal(
    agentId: string,
    description: string,
    priority: number,
    options?: { subgoals?: string[]; deadline?: number }
  ): AgentGoal {
    const agent = this.getOrCreateAgent(agentId);
    const now = Date.now();

    // Check for similar existing goal
    const similarGoal = this.findSimilarGoal(agent, description);
    if (similarGoal) {
      // Update priority
      const updated: AgentGoal = {
        ...similarGoal,
        priority: Math.max(similarGoal.priority, priority),
      } as any;
      agent.goals.set(similarGoal.goalId, updated);
      this.updateAgentTimestamp(agentId);
      return updated;
    }

    const goal: AgentGoal = {
      goalId: `goal-${now}`,
      description,
      priority,
      status: 'active',
      subgoals: options?.subgoals ?? [],
      deadline: options?.deadline,
      createdAt: now,
    };

    agent.goals.set(goal.goalId, goal);
    this.updateAgentTimestamp(agentId);

    return goal;
  }

  /**
   * Attribute an intention to an agent
   */
  attributeIntention(
    agentId: string,
    action: string,
    expectedOutcome: string,
    confidence: number
  ): AgentIntention {
    const agent = this.getOrCreateAgent(agentId);
    const now = Date.now();

    const intention: AgentIntention = {
      intentionId: `intent-${now}`,
      action,
      expectedOutcome,
      confidence,
      formedAt: now,
    };

    agent.intentions.set(intention.intentionId, intention);
    this.updateAgentTimestamp(agentId);

    return intention;
  }

  /**
   * Update knowledge state for an agent
   */
  updateKnowledge(
    agentId: string,
    domain: string,
    update: Partial<KnowledgeState>
  ): KnowledgeState {
    const agent = this.getOrCreateAgent(agentId);
    const now = Date.now();

    const existing = agent.knowledge.get(domain);

    const knowledge: KnowledgeState = {
      domain,
      level: update.level ?? existing?.level ?? 'novice',
      knownConcepts: update.knownConcepts ?? existing?.knownConcepts ?? [],
      gaps: update.gaps ?? existing?.gaps ?? [],
      lastAssessed: now,
    };

    agent.knowledge.set(domain, knowledge);
    this.updateAgentTimestamp(agentId);

    return knowledge;
  }

  /**
   * Record a preference for an agent
   */
  recordPreference(
    agentId: string,
    category: AgentPreference['category'],
    value: string,
    strength: number
  ): AgentPreference {
    const agent = this.getOrCreateAgent(agentId);

    const preference: AgentPreference = {
      preferenceId: `pref-${category}-${value}`,
      category,
      value,
      strength,
    };

    agent.preferences.set(preference.preferenceId, preference);
    this.updateAgentTimestamp(agentId);

    return preference;
  }

  /**
   * Record an interaction with an agent
   */
  recordInteraction(
    agentId: string,
    record: Omit<InteractionRecord, 'recordId'>
  ): InteractionRecord {
    const agent = this.getOrCreateAgent(agentId);

    const fullRecord: InteractionRecord = {
      ...record,
      recordId: `rec-${Date.now()}`,
    };

    agent.interactionHistory.push(fullRecord);

    // Trim history if too long
    if (agent.interactionHistory.length > this.config.maxHistoryLength) {
      (agent as any).interactionHistory = agent.interactionHistory.slice(-this.config.maxHistoryLength);
    }

    this.updateAgentTimestamp(agentId);
    this.increaseModelConfidence(agentId, 0.01);

    return fullRecord;
  }

  /**
   * Infer what an agent believes about a proposition
   */
  inferBelief(agentId: string, proposition: string): {
    believes: boolean;
    confidence: number;
    reasoning: string;
  } {
    const agent = this.agents.get(agentId);

    if (!agent) {
      return {
        believes: false,
        confidence: 0,
        reasoning: 'No model for this agent',
      };
    }

    // Direct belief check
    for (const belief of agent.beliefs.values()) {
      if (this.propositionsMatch(belief.proposition, proposition)) {
        return {
          believes: belief.confidence > 0.5,
          confidence: belief.confidence,
          reasoning: `Direct belief: "${belief.proposition}"`,
        };
      }
    }

    // Infer from goals
    for (const goal of agent.goals.values()) {
      if (goal.description.toLowerCase().includes(proposition.toLowerCase())) {
        return {
          believes: true,
          confidence: 0.6,
          reasoning: `Inferred from goal: "${goal.description}"`,
        };
      }
    }

    // Infer from interaction history
    const relevantInteractions = agent.interactionHistory.filter(
      rec => rec.content.toLowerCase().includes(proposition.toLowerCase())
    );

    if (relevantInteractions.length > 0) {
      return {
        believes: true,
        confidence: 0.5,
        reasoning: `Mentioned in ${relevantInteractions.length} interactions`,
      };
    }

    return {
      believes: false,
      confidence: 0.3,
      reasoning: 'No evidence in model',
    };
  }

  /**
   * Predict what an agent will do next
   */
  predictAction(agentId: string, context: string): {
    predictedAction: string;
    confidence: number;
    alternatives: string[];
  } {
    const agent = this.agents.get(agentId);

    if (!agent) {
      return {
        predictedAction: 'unknown',
        confidence: 0,
        alternatives: [],
      };
    }

    // Check active intentions
    const activeIntentions = Array.from(agent.intentions.values())
      .sort((a, b) => b.confidence - a.confidence);

    if (activeIntentions.length > 0) {
      const top = activeIntentions[0];
      return {
        predictedAction: top.action,
        confidence: top.confidence,
        alternatives: activeIntentions.slice(1).map(i => i.action),
      };
    }

    // Infer from goals
    const activeGoals = Array.from(agent.goals.values())
      .filter(g => g.status === 'active')
      .sort((a, b) => b.priority - a.priority);

    if (activeGoals.length > 0) {
      const topGoal = activeGoals[0];
      return {
        predictedAction: `work_toward_${topGoal.description.slice(0, 20)}`,
        confidence: topGoal.priority * 0.7,
        alternatives: activeGoals.slice(1).map(g => g.description.slice(0, 20)),
      };
    }

    // Default: predict based on interaction patterns
    const recentActions = agent.interactionHistory
      .filter(rec => rec.agentAction)
      .slice(-5);

    if (recentActions.length > 0) {
      const actionCounts = new Map<string, number>();
      for (const rec of recentActions) {
        const action = rec.agentAction!;
        actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
      }

      const mostCommon = Array.from(actionCounts.entries())
        .sort((a, b) => b[1] - a[1])[0];

      return {
        predictedAction: mostCommon[0],
        confidence: mostCommon[1] / recentActions.length * 0.5,
        alternatives: Array.from(actionCounts.keys()).slice(1),
      };
    }

    return {
      predictedAction: 'unknown',
      confidence: 0,
      alternatives: [],
    };
  }

  /**
   * Get agent model
   */
  getAgent(agentId: string): AgentModel | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agent models
   */
  getAllAgents(): AgentModel[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    agentCount: number;
    totalBeliefs: number;
    totalGoals: number;
    totalIntentions: number;
    avgModelConfidence: number;
  } {
    const agents = Array.from(this.agents.values());

    return {
      agentCount: agents.length,
      totalBeliefs: agents.reduce((sum, a) => sum + a.beliefs.size, 0),
      totalGoals: agents.reduce((sum, a) => sum + a.goals.size, 0),
      totalIntentions: agents.reduce((sum, a) => sum + a.intentions.size, 0),
      avgModelConfidence: agents.length > 0
        ? agents.reduce((sum, a) => sum + a.modelConfidence, 0) / agents.length
        : 0,
    };
  }

  /**
   * Decay old beliefs (call periodically)
   */
  async decayBeliefs(): Promise<void> {
    const now = Date.now();

    for (const agent of this.agents.values()) {
      for (const [beliefId, belief] of agent.beliefs) {
        const age = now - belief.updatedAtMs;
        const decayFactor = Math.exp(-this.config.beliefDecayRate * age / 1000);
        const newConfidence = belief.confidence * decayFactor;

        if (newConfidence < 0.1) {
          agent.beliefs.delete(beliefId);
        } else {
          agent.beliefs.set(beliefId, { ...belief, confidence: newConfidence });
        }
      }
    }

    await this.saveState();
  }

  // Private helper methods

  private findBeliefKey(agent: AgentModel, proposition: string): string | undefined {
    for (const [key, belief] of agent.beliefs) {
      if (this.propositionsMatch(belief.proposition, proposition)) {
        return key;
      }
    }
    return undefined;
  }

  private propositionsMatch(a: string, b: string): boolean {
    // Simple string similarity
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalize(a) === normalize(b);
  }

  private findSimilarGoal(agent: AgentModel, description: string): AgentGoal | undefined {
    for (const goal of agent.goals.values()) {
      if (this.propositionsMatch(goal.description, description)) {
        return goal;
      }
    }
    return undefined;
  }

  private mergeConfidence(oldConf: number, newConf: number): number {
    // Bayesian-like update
    return (oldConf + newConf) / 2;
  }

  private removeOldestBelief(agent: AgentModel): void {
    let oldest: AgentBelief | undefined;
    let oldestKey: string | undefined;

    for (const [key, belief] of agent.beliefs) {
      if (!oldest || belief.updatedAtMs < oldest.updatedAtMs) {
        oldest = belief;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      agent.beliefs.delete(oldestKey);
    }
  }

  private updateAgentTimestamp(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.set(agentId, { ...agent, updatedAtMs: Date.now() });
    }
  }

  private increaseModelConfidence(agentId: string, amount: number): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.set(agentId, {
        ...agent,
        modelConfidence: Math.min(1, agent.modelConfidence + amount),
      });
    }
  }

  private async saveState(): Promise<void> {
    const state = {
      agents: Array.from(this.agents.entries()).map(([id, agent]) => [
        id,
        {
          ...agent,
          beliefs: Array.from(agent.beliefs.entries()),
          goals: Array.from(agent.goals.entries()),
          intentions: Array.from(agent.intentions.entries()),
          knowledge: Array.from(agent.knowledge.entries()),
          preferences: Array.from(agent.preferences.entries()),
        },
      ]),
    };

    await writeFile(
      join(this.config.baseDir, 'agent-models.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'agent-models.json'), 'utf-8');
      const state = JSON.parse(data);

      this.agents = new Map(
        state.agents.map(([id, agent]: [string, any]) => [
          id,
          {
            ...agent,
            beliefs: new Map(agent.beliefs),
            goals: new Map(agent.goals),
            intentions: new Map(agent.intentions),
            knowledge: new Map(agent.knowledge),
            preferences: new Map(agent.preferences),
          },
        ])
      );
    } catch {
      // No state to load
    }
  }
}
