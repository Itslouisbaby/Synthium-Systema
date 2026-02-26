/**
 * Social Cognition Integration
 * 
 * Integrates Theory of Mind components into a unified social reasoning system.
 * Provides high-level social reasoning capabilities for the runtime.
 */

import { AgentModeler, type AgentModel, type AgentModelerConfig } from './agent-model.js';
import { IntentionRecognizer, type RecognizedIntention, type RecognitionContext } from './intention-recognition.js';
import { CommunicationPlanner, type CommunicationPlan, type CommunicationContent } from './communication-planner.js';

/** Social reasoning result */
export interface SocialReasoning {
  readonly targetAgentId: string;
  readonly inferredBeliefs: Array<{ proposition: string; confidence: number }>;
  readonly inferredGoals: string[];
  readonly predictedIntention: RecognizedIntention;
  readonly recommendedCommunication?: CommunicationPlan;
  readonly confidence: number;
}

/** Social context for reasoning */
export interface SocialContext {
  readonly situation: string;
  readonly ourRole: 'helper' | 'collaborator' | 'observer' | 'instructor';
  readonly urgency: 'low' | 'medium' | 'high';
  readonly relationship: 'new' | 'familiar' | 'expert';
}

/**
 * Social Cognition System
 * 
 * Unified interface for social reasoning using Theory of Mind.
 */
export class SocialCognition {
  private agentModeler: AgentModeler;
  private intentionRecognizer: IntentionRecognizer;
  private communicationPlanner: CommunicationPlanner;
  private initialized = false;

  constructor(config: {
    agentModeler?: Partial<AgentModelerConfig>;
  } = {}) {
    this.agentModeler = new AgentModeler(config.agentModeler);
    this.intentionRecognizer = new IntentionRecognizer();
    this.communicationPlanner = new CommunicationPlanner();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.agentModeler.initialize();
    this.initialized = true;
  }

  /**
   * Observe an agent's action and update their model
   */
  async observeAction(
    agentId: string,
    action: string,
    context: {
      situation: string;
      outcome?: string;
      ourResponse?: string;
    }
  ): Promise<void> {
    const agent = this.agentModeler.getOrCreateAgent(agentId, 'unknown');

    // Record the interaction
    this.agentModeler.recordInteraction(agentId, {
      timestamp: Date.now(),
      type: 'observed',
      content: context.situation,
      agentAction: action,
      ourResponse: context.ourResponse,
      outcome: context.outcome,
    });

    // Learn behavior pattern
    this.intentionRecognizer.learnFromObservation(
      agent,
      context.situation,
      action,
      context.outcome ?? 'unknown'
    );

    // Infer and attribute intention
    const recognized = this.intentionRecognizer.recognizeIntention(
      agent,
      action,
      {
        currentSituation: context.situation,
        recentEvents: [],
        availableActions: [],
      }
    );

    if (recognized.confidence > 0.5) {
      this.agentModeler.attributeIntention(
        agentId,
        recognized.intention.action,
        recognized.intention.expectedOutcome,
        recognized.confidence
      );
    }
  }

  /**
   * Process communication from an agent
   */
  async processCommunication(
    agentId: string,
    message: string,
    context: SocialContext
  ): Promise<SocialReasoning> {
    const agent = this.agentModeler.getOrCreateAgent(agentId, 'unknown');

    // Record the communication
    this.agentModeler.recordInteraction(agentId, {
      timestamp: Date.now(),
      type: 'communicated',
      content: message,
    });

    // Extract beliefs from message
    const inferredBeliefs = this.extractBeliefsFromMessage(message);
    for (const belief of inferredBeliefs) {
      this.agentModeler.attributeBelief(agentId, belief.proposition, belief.confidence, 'communicated');
    }

    // Extract goals from message
    const inferredGoals = this.extractGoalsFromMessage(message);
    for (const goal of inferredGoals) {
      this.agentModeler.attributeGoal(agentId, goal, 0.7);
    }

    // Recognize intention
    const recognitionContext: RecognitionContext = {
      currentSituation: context.situation,
      recentEvents: agent.interactionHistory.slice(-3).map(r => r.content),
      availableActions: [],
    };

    const predictedIntention = this.intentionRecognizer.recognizeIntention(
      agent,
      message,
      recognitionContext
    );

    // Plan response if we're in helper/instructor role
    let recommendedCommunication: CommunicationPlan | undefined;
    if (context.ourRole === 'helper' || context.ourRole === 'instructor') {
      const content: CommunicationContent = {
        topic: 'Response to ' + message.slice(0, 50),
        keyPoints: this.generateResponsePoints(agent, predictedIntention, context),
      };

      recommendedCommunication = this.communicationPlanner.planCommunication(
        agent,
        content,
        'inform'
      );
    }

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(
      agent,
      inferredBeliefs.length,
      predictedIntention.confidence
    );

    return {
      targetAgentId: agentId,
      inferredBeliefs,
      inferredGoals,
      predictedIntention,
      recommendedCommunication,
      confidence,
    };
  }

  /**
   * Predict what an agent will do next
   */
  predictNextAction(
    agentId: string,
    context: string
  ): {
    action: string;
    confidence: number;
    reasoning: string;
  } {
    const agent = this.agentModeler.getAgent(agentId);

    if (!agent) {
      return {
        action: 'wait',
        confidence: 0,
        reasoning: 'No agents modeled to predict behavior',
      };
    }

    const recentActions = agent.interactionHistory
      .filter(r => r.agentAction)
      .slice(-3)
      .map(r => r.agentAction!);

    const prediction = this.intentionRecognizer.predictNextAction(
      agent,
      recentActions,
      {
        currentSituation: context,
        recentEvents: [],
        availableActions: [],
      }
    );

    return {
      action: prediction.predictedAction,
      confidence: prediction.confidence,
      reasoning: prediction.reasoning,
    };
  }

  /**
   * Plan communication to an agent
   */
  planCommunication(
    agentId: string,
    content: CommunicationContent,
    purpose: 'inform' | 'instruct' | 'warn' | 'ask' | 'confirm'
  ): CommunicationPlan {
    const agent = this.agentModeler.getOrCreateAgent(agentId, 'unknown');
    return this.communicationPlanner.planCommunication(agent, content, purpose);
  }

  /**
   * Check if agent knows a concept
   */
  checkKnowledge(
    agentId: string,
    concept: string
  ): {
    knows: boolean;
    confidence: number;
    reasoning: string;
  } {
    const agent = this.agentModeler.getAgent(agentId);

    if (!agent) {
      return {
        knows: false,
        confidence: 0,
        reasoning: 'No model for this agent',
      };
    }

    return this.communicationPlanner.knowsConcept(agent, concept);
  }

  /**
   * Suggest what to explain vs assume known
   */
  suggestExplanations(
    agentId: string,
    concepts: string[]
  ): {
    explain: string[];
    assumeKnown: string[];
    uncertain: string[];
  } {
    const agent = this.agentModeler.getOrCreateAgent(agentId, 'unknown');
    return this.communicationPlanner.suggestExplanations(agent, concepts);
  }

  /**
   * Get agent model
   */
  getAgentModel(agentId: string): AgentModel | undefined {
    return this.agentModeler.getAgent(agentId);
  }

  /**
   * Get all agent models
   */
  getAllAgents(): AgentModel[] {
    return this.agentModeler.getAllAgents();
  }

  /**
   * Get social cognition statistics
   */
  getStats(): {
    agentCount: number;
    totalBeliefs: number;
    totalGoals: number;
    totalIntentions: number;
    behaviorPatterns: number;
    avgModelConfidence: number;
  } {
    const agentStats = this.agentModeler.getStats();
    const patterns = this.intentionRecognizer.getPatterns();

    return {
      ...agentStats,
      behaviorPatterns: patterns.length,
    };
  }

  /**
   * Periodic maintenance (call periodically)
   */
  async maintenance(): Promise<void> {
    await this.agentModeler.decayBeliefs();
  }

  // Private helper methods

  private extractBeliefsFromMessage(message: string): Array<{ proposition: string; confidence: number }> {
    const beliefs: Array<{ proposition: string; confidence: number }> = [];

    // Look for explicit belief statements
    const beliefPatterns = [
      /I think (that )?(.+?)[.!?]/i,
      /I believe (that )?(.+?)[.!?]/i,
      /It seems (that )?(.+?)[.!?]/i,
      /(.+?) is (true|false|correct|wrong)/i,
    ];

    for (const pattern of beliefPatterns) {
      const match = message.match(pattern);
      if (match) {
        beliefs.push({
          proposition: match[2] || match[1],
          confidence: 0.7,
        });
      }
    }

    return beliefs;
  }

  private extractGoalsFromMessage(message: string): string[] {
    const goals: string[] = [];

    // Look for goal statements
    const goalPatterns = [
      /I want to (.+?)[.!?]/i,
      /I need to (.+?)[.!?]/i,
      /I'm trying to (.+?)[.!?]/i,
      /My goal is to (.+?)[.!?]/i,
      /Can you help me (.+?)[?]?/i,
    ];

    for (const pattern of goalPatterns) {
      const match = message.match(pattern);
      if (match) {
        goals.push(match[1]);
      }
    }

    return goals;
  }

  private generateResponsePoints(
    agent: AgentModel,
    intention: RecognizedIntention,
    context: SocialContext
  ): string[] {
    const points: string[] = [];

    // Acknowledge their intention
    if (intention.confidence > 0.5) {
      points.push(`I understand you're trying to ${intention.intention.action}`);
    }

    // Offer help based on role
    if (context.ourRole === 'helper') {
      points.push('I can help with that');
    } else if (context.ourRole === 'instructor') {
      points.push('Let me guide you through this');
    }

    // Add urgency note if high
    if (context.urgency === 'high') {
      points.push('This seems urgent - let me prioritize');
    }

    return points;
  }

  private calculateOverallConfidence(
    agent: AgentModel,
    beliefCount: number,
    intentionConfidence: number
  ): number {
    const modelConfidence = agent.modelConfidence;
    const beliefFactor = Math.min(1, beliefCount / 5);

    return (modelConfidence * 0.3 + beliefFactor * 0.3 + intentionConfidence * 0.4);
  }
}
