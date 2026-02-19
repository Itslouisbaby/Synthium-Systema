/**
 * Task Router Implementation
 * 
 * Determines agent assignment for tasks based on intent patterns,
 * capability matching, and load balancing.
 */

import {
  TaskRouter,
  TaskDescription,
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
  AgentProfile,
  AgentRegistry,
  AgentSession,
  ComplexityLevel
} from './types.js';

import { AgentRegistryImpl } from './registry.js';

/**
 * Explicit routing via @mention
 */
export class ExplicitMentionStrategy implements RoutingStrategy {
  readonly name = 'explicit_mention';
  readonly priority = 100; // Highest priority

  constructor(private readonly registry: AgentRegistry) {}

  route(task: TaskDescription, context: RoutingContext): RoutingDecision | undefined {
    if (!task.preferredAgent) return undefined;

    const profile = this.registry.getProfile(task.preferredAgent);
    if (!profile) {
      return {
        agentId: 'orchestrator',
        strategy: this.name,
        confidence: 0.9,
        reasoning: `Requested agent "${task.preferredAgent}" not found, falling back to orchestrator`,
        isHandoff: context.currentAgentSession !== undefined,
        handoffFrom: context.currentAgentSession?.agentId,
        decidedAt: new Date()
      };
    }

    return {
      agentId: profile.id,
      strategy: this.name,
      confidence: 1.0,
      reasoning: `Explicitly requested via @${profile.id}`,
      isHandoff: context.currentAgentSession !== undefined,
      handoffFrom: context.currentAgentSession?.agentId,
      decidedAt: new Date()
    };
  }
}

/**
 * Capability-based matching
 */
export class CapabilityMatchStrategy implements RoutingStrategy {
  readonly name = 'capability_match';
  readonly priority = 80;

  constructor(private readonly registry: AgentRegistry) {}

  route(task: TaskDescription, context: RoutingContext): RoutingDecision | undefined {
    if (task.requiredCapabilities.length === 0) return undefined;

    // Find all agents that match at least one capability
    const candidateAgents: Array<{ profile: AgentProfile; matchScore: number }> = [];
    
    for (const capability of task.requiredCapabilities) {
      const agents = this.registry.findByCapability(capability);
      for (const agent of agents) {
        const existingCandidate = candidateAgents.find(c => c.profile.id === agent.id);
        if (existingCandidate) {
          // Increase match score for multiple capability matches
          existingCandidate.matchScore += 1;
        } else {
          candidateAgents.push({ profile: agent, matchScore: 1 });
        }
      }
    }

    if (candidateAgents.length === 0) return undefined;

    // Sort by match score (descending) and then by routing priority (descending)
    candidateAgents.sort((a, b) => {
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return b.profile.routingPriority - a.profile.routingPriority;
    });

    const bestMatch = candidateAgents[0];
    const confidence = Math.min(0.5 + (bestMatch.matchScore / task.requiredCapabilities.length) * 0.5, 1.0);

    return {
      agentId: bestMatch.profile.id,
      strategy: this.name,
      confidence,
      reasoning: `Best capability match for ${task.requiredCapabilities.join(', ')}`,
      isHandoff: context.currentAgentSession !== undefined,
      handoffFrom: context.currentAgentSession?.agentId,
      decidedAt: new Date()
    };
  }
}

/**
 * Sticky routing (continue with same agent)
 */
export class StickySessionStrategy implements RoutingStrategy {
  readonly name = 'sticky_session';
  readonly priority = 60;

  constructor(private readonly registry: AgentRegistry) {}

  route(task: TaskDescription, context: RoutingContext): RoutingDecision | undefined {
    // Only apply if there's a current agent session
    if (!context.currentAgentSession) return undefined;

    const currentProfile = this.registry.getProfile(context.currentAgentSession.agentId);
    if (!currentProfile) return undefined;

    // Check if current agent can handle the task
    const canHandle = task.requiredCapabilities.every(cap =>
      currentProfile.capabilities.includes(cap)
    );

    if (!canHandle) return undefined;

    return {
      agentId: currentProfile.id,
      strategy: this.name,
      confidence: 0.7,
      reasoning: `Continuing with current agent (${currentProfile.id}) for consistency`,
      isHandoff: false, // Not a handoff, staying with same agent
      handoffFrom: undefined,
      decidedAt: new Date()
    };
  }
}

/**
 * Round-robin for load distribution
 */
export class RoundRobinStrategy implements RoutingStrategy {
  readonly name = 'round_robin';
  readonly priority = 40;
  
  private static agentCounters: Map<string, number> = new Map(); // Global counter for round-robin

  constructor(private readonly registry: AgentRegistry) {}

  route(task: TaskDescription, context: RoutingContext): RoutingDecision | undefined {
    if (task.requiredCapabilities.length === 0) return undefined;

    // Find all agents that match at least one capability
    const matchingAgents: AgentProfile[] = [];
    for (const capability of task.requiredCapabilities) {
      const agents = this.registry.findByCapability(capability);
      for (const agent of agents) {
        if (!matchingAgents.some(a => a.id === agent.id)) {
          matchingAgents.push(agent);
        }
      }
    }

    if (matchingAgents.length === 0) return undefined;

    // Sort by routing priority for consistent ordering
    matchingAgents.sort((a, b) => b.routingPriority - a.routingPriority);

    // Get or initialize counter for this capability set
    const capabilityKey = task.requiredCapabilities.sort().join(',');
    let counter = RoundRobinStrategy.agentCounters.get(capabilityKey) || 0;
    
    // Select agent using round-robin
    const selectedAgent = matchingAgents[counter % matchingAgents.length];
    
    // Update counter for next time
    RoundRobinStrategy.agentCounters.set(capabilityKey, counter + 1);

    return {
      agentId: selectedAgent.id,
      strategy: this.name,
      confidence: 0.6,
      reasoning: `Round-robin selection among ${matchingAgents.length} capable agents`,
      isHandoff: context.currentAgentSession !== undefined,
      handoffFrom: context.currentAgentSession?.agentId,
      decidedAt: new Date()
    };
  }
}

/**
 * Fallback to orchestrator agent
 */
export class OrchestratorFallbackStrategy implements RoutingStrategy {
  readonly name = 'orchestrator_fallback';
  readonly priority = 10; // Lowest priority

  constructor(private readonly registry: AgentRegistry) {}

  route(task: TaskDescription, context: RoutingContext): RoutingDecision {
    return {
      agentId: 'orchestrator',
      strategy: this.name,
      confidence: 0.1,
      reasoning: 'Fallback to orchestrator for complex or ambiguous tasks',
      isHandoff: context.currentAgentSession !== undefined,
      handoffFrom: context.currentAgentSession?.agentId,
      decidedAt: new Date()
    };
  }
}

/**
 * TaskRouter implementation with strategy pattern
 */
export class TaskRouterImpl implements TaskRouter {
  private strategies: RoutingStrategy[] = [];
  private registry: AgentRegistry;

  constructor(registry?: AgentRegistry) {
    // Use provided registry or create default one
    this.registry = registry || new AgentRegistryImpl();
    
    // Register default strategies
    this.addStrategy(new ExplicitMentionStrategy(this.registry));
    this.addStrategy(new CapabilityMatchStrategy(this.registry));
    this.addStrategy(new StickySessionStrategy(this.registry));
    this.addStrategy(new RoundRobinStrategy(this.registry));
    this.addStrategy(new OrchestratorFallbackStrategy(this.registry));
  }

  /**
   * Route a task to the most appropriate agent
   */
  route(task: TaskDescription, context: RoutingContext): RoutingDecision {
    // Try each strategy in priority order
    const sortedStrategies = [...this.strategies].sort((a, b) => b.priority - a.priority);
    
    for (const strategy of sortedStrategies) {
      const decision = strategy.route(task, context);
      if (decision) {
        // Log routing decision for audit
        this.logRoutingDecision(decision, task, context);
        return decision;
      }
    }
    
    // This should never happen due to fallback strategy, but just in case
    const fallbackDecision: RoutingDecision = {
      agentId: 'orchestrator',
      strategy: 'none',
      confidence: 0.0,
      reasoning: 'No strategy matched, using default orchestrator',
      isHandoff: context.currentAgentSession !== undefined,
      handoffFrom: context.currentAgentSession?.agentId,
      decidedAt: new Date()
    };
    
    this.logRoutingDecision(fallbackDecision, task, context);
    return fallbackDecision;
  }

  /**
   * Add a routing strategy
   */
  addStrategy(strategy: RoutingStrategy): void {
    this.strategies.push(strategy);
  }

  /**
   * Get current strategy chain
   */
  getStrategies(): readonly RoutingStrategy[] {
    return [...this.strategies];
  }

  /**
   * Log routing decision for audit purposes
   */
  private logRoutingDecision(decision: RoutingDecision, task: TaskDescription, context: RoutingContext): void {
    // In a real implementation, this would log to a proper audit system
    console.debug(`[ROUTER] Task routed to ${decision.agentId} via ${decision.strategy} (confidence: ${decision.confidence})`);
    console.debug(`[ROUTER] Reason: ${decision.reasoning}`);
    console.debug(`[ROUTER] Task: ${task.intent.substring(0, 100)}...`);
    
    // Additional structured logging could go here
    // For example: writing to a database, sending to a logging service, etc.
  }
}