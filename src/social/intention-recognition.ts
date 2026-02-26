/**
 * Intention Recognition
 * 
 * Infers what an agent intends to do based on:
 * - Their observed actions
 * - Their stated goals
 * - The context/situation
 * - Common patterns of behavior
 */

import type { AgentModel, AgentIntention, InteractionRecord } from './agent-model.js';

/** Observed behavior pattern */
export interface BehaviorPattern {
  readonly patternId: string;
  readonly description: string;
  readonly triggerConditions: string[];
  readonly typicalActions: string[];
  readonly frequency: number;
  readonly confidence: number;
}

/** Recognized intention with reasoning */
export interface RecognizedIntention {
  readonly intention: AgentIntention;
  readonly confidence: number;
  readonly reasoning: string;
  readonly alternativeIntentions: string[];
  readonly supportingEvidence: string[];
}

/** Context for intention recognition */
export interface RecognitionContext {
  readonly currentSituation: string;
  readonly recentEvents: string[];
  readonly availableActions: string[];
  readonly timeConstraint?: number;
}

/**
 * Intention Recognizer
 * 
 * Uses multiple strategies to infer agent intentions:
 * 1. Pattern matching against known behaviors
 * 2. Goal-based inference (what action achieves their goal?)
 * 3. Plan recognition (what sequence are they following?)
 * 4. Contextual reasoning (what makes sense here?)
 */
export class IntentionRecognizer {
  private behaviorPatterns: Map<string, BehaviorPattern> = new Map();

  /**
   * Recognize intention from observation
   */
  recognizeIntention(
    agent: AgentModel,
    observation: string,
    context: RecognitionContext
  ): RecognizedIntention {
    const candidates: Array<{ intention: AgentIntention; score: number; evidence: string[] }> = [];

    // Strategy 1: Direct intention attribution
    const directIntention = this.recognizeDirectIntention(agent, observation);
    if (directIntention) {
      candidates.push(directIntention);
    }

    // Strategy 2: Goal-based inference
    const goalBased = this.inferFromGoals(agent, context);
    candidates.push(...goalBased);

    // Strategy 3: Pattern matching
    const patternBased = this.matchBehaviorPatterns(agent, observation, context);
    candidates.push(...patternBased);

    // Strategy 4: Plan recognition
    const planBased = this.recognizePlanStep(agent, observation, context);
    if (planBased) {
      candidates.push(planBased);
    }

    // Strategy 5: Contextual reasoning
    const contextual = this.reasonFromContext(agent, context);
    candidates.push(...contextual);

    // Rank candidates by score
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return this.createUnknownIntention();
    }

    const best = candidates[0];
    const alternatives = candidates.slice(1).map(c => c.intention.action);

    return {
      intention: best.intention,
      confidence: Math.min(0.95, best.score),
      reasoning: best.evidence.join('; '),
      alternativeIntentions: alternatives,
      supportingEvidence: best.evidence,
    };
  }

  /**
   * Update behavior patterns from observed action
   */
  learnFromObservation(
    agent: AgentModel,
    situation: string,
    action: string,
    outcome: string
  ): void {
    const patternKey = `${situation}→${action}`;
    const existing = this.behaviorPatterns.get(patternKey);

    if (existing) {
      // Strengthen existing pattern
      const updated: BehaviorPattern = {
        ...existing,
        frequency: existing.frequency + 1,
        confidence: Math.min(0.95, existing.confidence + 0.05),
      };
      this.behaviorPatterns.set(patternKey, updated);
    } else {
      // Create new pattern
      const pattern: BehaviorPattern = {
        patternId: `pattern-${Date.now()}`,
        description: `In situation "${situation}", agent does "${action}"`,
        triggerConditions: [situation],
        typicalActions: [action],
        frequency: 1,
        confidence: 0.5,
      };
      this.behaviorPatterns.set(patternKey, pattern);
    }
  }

  /**
   * Predict next action in a sequence
   */
  predictNextAction(
    agent: AgentModel,
    previousActions: string[],
    context: RecognitionContext
  ): {
    predictedAction: string;
    confidence: number;
    reasoning: string;
  } {
    // Look for sequence patterns in history
    const sequences = this.findSequencePatterns(agent, previousActions);
    
    if (sequences.length > 0) {
      const best = sequences[0];
      return {
        predictedAction: best.nextAction,
        confidence: best.confidence,
        reasoning: `Pattern: ${best.pattern}`,
      };
    }

    // Fall back to goal-based prediction
    const goalBased = this.inferFromGoals(agent, context);
    if (goalBased.length > 0) {
      const best = goalBased[0];
      return {
        predictedAction: best.intention.action,
        confidence: best.score * 0.7,
        reasoning: `Goal-based: ${best.evidence[0]}`,
      };
    }

    return {
      predictedAction: 'unknown',
      confidence: 0,
      reasoning: 'No pattern or goal match',
    };
  }

  /**
   * Get all learned patterns
   */
  getPatterns(): BehaviorPattern[] {
    return Array.from(this.behaviorPatterns.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  // Private recognition strategies

  private recognizeDirectIntention(
    agent: AgentModel,
    observation: string
  ): { intention: AgentIntention; score: number; evidence: string[] } | null {
    // Check if agent explicitly stated their intention
    for (const intention of agent.intentions.values()) {
      if (observation.toLowerCase().includes(intention.action.toLowerCase())) {
        return {
          intention,
          score: intention.confidence,
          evidence: [`Agent previously stated intention: ${intention.action}`],
        };
      }
    }
    return null;
  }

  private inferFromGoals(
    agent: AgentModel,
    context: RecognitionContext
  ): Array<{ intention: AgentIntention; score: number; evidence: string[] }> {
    const candidates: Array<{ intention: AgentIntention; score: number; evidence: string[] }> = [];

    const activeGoals = Array.from(agent.goals.values())
      .filter(g => g.status === 'active')
      .sort((a, b) => b.priority - a.priority);

    for (const goal of activeGoals) {
      // Infer action that would achieve this goal
      const inferredAction = this.inferActionForGoal(goal.description, context);
      
      if (inferredAction) {
        const intention: AgentIntention = {
          intentionId: `inferred-${Date.now()}`,
          action: inferredAction,
          expectedOutcome: goal.description,
          confidence: goal.priority * 0.7,
          formedAt: Date.now(),
        };

        candidates.push({
          intention,
          score: goal.priority * 0.7,
          evidence: [`Goal "${goal.description}" requires ${inferredAction}`],
        });
      }
    }

    return candidates;
  }

  private matchBehaviorPatterns(
    agent: AgentModel,
    observation: string,
    context: RecognitionContext
  ): Array<{ intention: AgentIntention; score: number; evidence: string[] }> {
    const candidates: Array<{ intention: AgentIntention; score: number; evidence: string[] }> = [];

    for (const pattern of this.behaviorPatterns.values()) {
      // Check if current situation matches pattern trigger
      const situationMatch = pattern.triggerConditions.some(
        cond => context.currentSituation.toLowerCase().includes(cond.toLowerCase())
      );

      if (situationMatch) {
        for (const action of pattern.typicalActions) {
          const intention: AgentIntention = {
            intentionId: `pattern-${Date.now()}`,
            action,
            expectedOutcome: 'pattern-based outcome',
            confidence: pattern.confidence,
            formedAt: Date.now(),
          };

          candidates.push({
            intention,
            score: pattern.confidence * (pattern.frequency / 10),
            evidence: [`Pattern: ${pattern.description} (freq: ${pattern.frequency})`],
          });
        }
      }
    }

    return candidates;
  }

  private recognizePlanStep(
    agent: AgentModel,
    observation: string,
    context: RecognitionContext
  ): { intention: AgentIntention; score: number; evidence: string[] } | null {
    // Look at recent interaction history for plan patterns
    const recentHistory = agent.interactionHistory.slice(-10);
    
    if (recentHistory.length < 2) return null;

    // Check for common plan sequences
    const actionSequence = recentHistory
      .filter(rec => rec.agentAction)
      .map(rec => rec.agentAction!);

    // Simple plan recognition: if we see A then B, expect C
    const commonSequences: Record<string, string[]> = {
      'read_analyze': ['summarize', 'report'],
      'search_filter': ['sort', 'export'],
      'create_edit': ['save', 'share'],
    };

    const recentKey = actionSequence.slice(-2).join('_');
    const likelyNext = commonSequences[recentKey];

    if (likelyNext) {
      const intention: AgentIntention = {
        intentionId: `plan-${Date.now()}`,
        action: likelyNext[0],
        expectedOutcome: `continue_${recentKey}_workflow`,
        confidence: 0.6,
        formedAt: Date.now(),
      };

      return {
        intention,
        score: 0.6,
        evidence: [`Plan pattern: ${recentKey} → ${likelyNext[0]}`],
      };
    }

    return null;
  }

  private reasonFromContext(
    agent: AgentModel,
    context: RecognitionContext
  ): Array<{ intention: AgentIntention; score: number; evidence: string[] }> {
    const candidates: Array<{ intention: AgentIntention; score: number; evidence: string[] }> = [];

    // Contextual reasoning based on available actions
    for (const action of context.availableActions) {
      // Score based on how well action fits context
      let score = 0.3; // Base score
      
      // Boost if action mentioned in recent events
      if (context.recentEvents.some(e => e.toLowerCase().includes(action.toLowerCase()))) {
        score += 0.2;
      }

      // Boost if action matches agent's knowledge domain
      for (const knowledge of agent.knowledge.values()) {
        if (knowledge.knownConcepts.some(c => action.toLowerCase().includes(c.toLowerCase()))) {
          score += 0.1;
        }
      }

      if (score > 0.4) {
        const intention: AgentIntention = {
          intentionId: `context-${Date.now()}`,
          action,
          expectedOutcome: 'contextually appropriate',
          confidence: score,
          formedAt: Date.now(),
        };

        candidates.push({
          intention,
          score,
          evidence: [`Contextual fit: ${action} matches situation`],
        });
      }
    }

    return candidates;
  }

  private createUnknownIntention(): RecognizedIntention {
    return {
      intention: {
        intentionId: 'unknown',
        action: 'unknown',
        expectedOutcome: 'unknown',
        confidence: 0,
        formedAt: Date.now(),
      },
      confidence: 0,
      reasoning: 'Unable to recognize intention from available information',
      alternativeIntentions: [],
      supportingEvidence: [],
    };
  }

  private inferActionForGoal(goalDescription: string, context: RecognitionContext): string | null {
    // Simple goal-to-action mapping
    const goalActionMap: Record<string, string[]> = {
      'read': ['open_file', 'fetch_data'],
      'write': ['create_file', 'update_record'],
      'analyze': ['run_query', 'compute_statistics'],
      'share': ['send_email', 'publish'],
      'delete': ['remove_file', 'clear_data'],
    };

    for (const [keyword, actions] of Object.entries(goalActionMap)) {
      if (goalDescription.toLowerCase().includes(keyword)) {
        // Return first available action
        return actions.find(a => context.availableActions.includes(a)) ?? actions[0];
      }
    }

    return null;
  }

  private findSequencePatterns(
    agent: AgentModel,
    previousActions: string[]
  ): Array<{ nextAction: string; confidence: number; pattern: string }> {
    const patterns: Array<{ nextAction: string; confidence: number; pattern: string }> = [];
    
    if (previousActions.length === 0) return patterns;

    const lastAction = previousActions[previousActions.length - 1];
    
    // Look for what typically follows lastAction in history
    const history = agent.interactionHistory;
    let followCount = new Map<string, number>();
    
    for (let i = 0; i < history.length - 1; i++) {
      if (history[i].agentAction === lastAction && history[i + 1].agentAction) {
        const next = history[i + 1].agentAction!;
        followCount.set(next, (followCount.get(next) ?? 0) + 1);
      }
    }

    const total = Array.from(followCount.values()).reduce((a, b) => a + b, 0);
    
    for (const [action, count] of followCount) {
      patterns.push({
        nextAction: action,
        confidence: count / total,
        pattern: `${lastAction} → ${action}`,
      });
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }
}
