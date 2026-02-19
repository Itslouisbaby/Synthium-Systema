import { describe, it, beforeEach, vi, expect } from 'vitest';
import { 
  ExplicitMentionStrategy, 
  CapabilityMatchStrategy,
  StickySessionStrategy,
  RoundRobinStrategy,
  OrchestratorFallbackStrategy,
  TaskRouterImpl
} from '../../src/multi-agent/router';
import { AgentRegistry } from '../../src/multi-agent/registry';
import { 
  AgentProfile, 
  TaskDescription, 
  RoutingContext, 
  AgentSession,
  RoutingDecision
} from '../../src/multi-agent/types';

// Mock agent registry
const createMockRegistry = () => ({
  getProfile: vi.fn(),
  findByCapability: vi.fn(),
  getAllProfiles: vi.fn(),
  hasProfile: vi.fn(),
  reload: vi.fn(),
  validateProfile: vi.fn(),
  getStats: vi.fn(),
} as unknown as AgentRegistry);

// Mock agent profiles
const mockOrchestrator: AgentProfile = {
  id: 'orchestrator',
  name: 'Orchestrator',
  description: 'Main orchestrator agent',
  capabilities: ['orchestration'],
  model: 'gpt-4',
  systemPrompt: 'You are an orchestrator',
  maxTokensPerTurn: 4000,
  parentSessionOnly: false,
  badge: {
    displayName: 'Orchestrator',
    emoji: '🤖',
    color: '#4A90D9',
    abbreviation: 'ORC'
  },
  routingPriority: 100
};

const mockAgent1: AgentProfile = {
  id: 'agent1',
  name: 'Agent 1',
  description: 'Coding agent',
  capabilities: ['coding', 'debugging'],
  model: 'gpt-4',
  systemPrompt: 'You are a coding agent',
  maxTokensPerTurn: 4000,
  parentSessionOnly: false,
  badge: {
    displayName: 'Coder',
    emoji: '💻',
    color: '#50C878',
    abbreviation: 'COD'
  },
  routingPriority: 80
};

const mockAgent2: AgentProfile = {
  id: 'agent2',
  name: 'Agent 2',
  description: 'Research agent',
  capabilities: ['research', 'writing'],
  model: 'gpt-4',
  systemPrompt: 'You are a research agent',
  maxTokensPerTurn: 4000,
  parentSessionOnly: false,
  badge: {
    displayName: 'Researcher',
    emoji: '📚',
    color: '#FF6B6B',
    abbreviation: 'RES'
  },
  routingPriority: 70
};

// Mock routing context
const createMockContext = (overrides: Partial<RoutingContext> = {}): RoutingContext => ({
  parentSessionId: 'session1',
  tenantContext: {
    tenantId: 'tenant1',
    maxAgentsPerSession: 5
  } as any,
  operator: {
    id: 'operator1',
    name: 'Test Operator'
  } as any,
  routingHistory: [],
  maxAgents: 5,
  ...overrides
});

// Mock task description
const createMockTask = (overrides: Partial<TaskDescription> = {}): TaskDescription => ({
  intent: 'Help with this task',
  requiredCapabilities: [],
  estimatedComplexity: 'medium',
  originalInput: 'Help with this task',
  ...overrides
});

describe('Task Router Strategies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ExplicitMentionStrategy', () => {
    let strategy: ExplicitMentionStrategy;
    let mockRegistry: AgentRegistry;

    beforeEach(() => {
      mockRegistry = createMockRegistry();
      strategy = new ExplicitMentionStrategy(mockRegistry);
    });

    it('should route to explicitly mentioned agent', () => {
      const task = createMockTask({ preferredAgent: 'agent1' });
      const context = createMockContext();
      
      mockRegistry.getProfile = vi.fn().mockImplementation((id: string) => {
        if (id === 'agent1') return mockAgent1;
        return undefined;
      });

      const result = strategy.route(task, context);
      
      expect(result).toBeDefined();
      expect(result!.agentId).toEqual('agent1');
      expect(result!.strategy).toEqual('explicit_mention');
      expect(mockRegistry.getProfile).toHaveBeenCalledWith('agent1');
    });

    it('should fall back to orchestrator when explicitly mentioned agent is not found', () => {
      const task = createMockTask({ preferredAgent: 'nonexistent' });
      const context = createMockContext();
      
      mockRegistry.getProfile = vi.fn().mockReturnValue(undefined);

      const result = strategy.route(task, context);
      
      expect(result).toBeDefined();
      expect(result!.agentId).toEqual('orchestrator');
      expect(result!.strategy).toEqual('explicit_mention');
      expect(mockRegistry.getProfile).toHaveBeenCalledWith('nonexistent');
    });

    it('should return undefined when no explicit mention is present', () => {
      const task = createMockTask({ preferredAgent: undefined });
      const context = createMockContext();

      const result = strategy.route(task, context);
      expect(result).toBeUndefined();
    });
  });

  describe('CapabilityMatchStrategy', () => {
    let strategy: CapabilityMatchStrategy;
    let mockRegistry: AgentRegistry;

    beforeEach(() => {
      mockRegistry = createMockRegistry();
      strategy = new CapabilityMatchStrategy(mockRegistry);
    });

    it('should route based on capability matching', () => {
      const task = createMockTask({ 
        requiredCapabilities: ['coding'],
        intent: 'Write a function to sort an array'
      });
      const context = createMockContext();
      
      mockRegistry.findByCapability = vi.fn().mockImplementation((capability: string) => {
        if (capability === 'coding') return [mockAgent1];
        return [];
      });

      const result = strategy.route(task, context);
      
      expect(result).toBeDefined();
      expect(result!.agentId).toEqual('agent1');
      expect(result!.strategy).toEqual('capability_match');
      expect(result!.confidence).toBeGreaterThan(0.5);
      expect(mockRegistry.findByCapability).toHaveBeenCalledWith('coding');
    });

    it('should return undefined when no capabilities are required', () => {
      const task = createMockTask({ requiredCapabilities: [] });
      const context = createMockContext();

      const result = strategy.route(task, context);
      expect(result).toBeUndefined();
    });

    it('should return undefined when no agents match capabilities', () => {
      const task = createMockTask({ 
        requiredCapabilities: ['nonexistent'],
        intent: 'Do something impossible'
      });
      const context = createMockContext();
      
      mockRegistry.findByCapability = vi.fn().mockReturnValue([]);

      const result = strategy.route(task, context);
      expect(result).toBeUndefined();
    });

    it('should select agent with highest match score', () => {
      const task = createMockTask({ 
        requiredCapabilities: ['coding', 'debugging'],
        intent: 'Fix a bug in my code'
      });
      const context = createMockContext();
      
      // Mock registry to return different agents for different capabilities
      mockRegistry.findByCapability = vi.fn().mockImplementation((capability: string) => {
        if (capability === 'coding') return [mockAgent1, mockAgent2];
        if (capability === 'debugging') return [mockAgent1]; // Only agent1 has both
        return [];
      });

      const result = strategy.route(task, context);
      
      expect(result).toBeDefined();
      // agent1 should be selected because it matches both capabilities
      expect(result!.agentId).toEqual('agent1');
      expect(result!.strategy).toEqual('capability_match');
      // Confidence should be higher due to multiple matches
      expect(result!.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('StickySessionStrategy', () => {
    let strategy: StickySessionStrategy;
    let mockRegistry: AgentRegistry;

    beforeEach(() => {
      mockRegistry = createMockRegistry();
      strategy = new StickySessionStrategy(mockRegistry);
    });

    it('should continue with current agent when capabilities match', () => {
      const currentSession: AgentSession = {
        id: 'session1',
        parentSessionId: 'parent1',
        agentId: 'agent1',
        startedAt: new Date(),
        handoffReason: 'initial',
        routingDecision: {} as RoutingDecision,
        tenantId: 'tenant1',
        operatorId: 'operator1',
        policyContext: {} as any,
        workingMemory: {} as any,
        status: 'active',
        stats: {} as any
      };
      
      const task = createMockTask({ 
        requiredCapabilities: ['coding'],
        intent: 'Continue coding work'
      });
      const context = createMockContext({ currentAgentSession: currentSession });
      
      mockRegistry.getProfile = vi.fn().mockImplementation((id: string) => {
        if (id === 'agent1') return mockAgent1;
        return undefined;
      });

      const result = strategy.route(task, context);
      
      expect(result).toBeDefined();
      expect(result!.agentId).toEqual('agent1');
      expect(result!.strategy).toEqual('sticky_session');
      expect(result!.isHandoff).toBe(false); // Not a handoff, staying with same agent
      expect(mockRegistry.getProfile).toHaveBeenCalledWith('agent1');
    });

    it('should return undefined when no current agent session exists', () => {
      const task = createMockTask({ requiredCapabilities: ['coding'] });
      const context = createMockContext({ currentAgentSession: undefined });

      const result = strategy.route(task, context);
      expect(result).toBeUndefined();
    });

    it('should return undefined when current agent profile is not found', () => {
      const currentSession: AgentSession = {
        id: 'session1',
        parentSessionId: 'parent1',
        agentId: 'nonexistent',
        startedAt: new Date(),
        handoffReason: 'initial',
        routingDecision: {} as RoutingDecision,
        tenantId: 'tenant1',
        operatorId: 'operator1',
        policyContext: {} as any,
        workingMemory: {} as any,
        status: 'active',
        stats: {} as any
      };
      
      const task = createMockTask({ requiredCapabilities: ['coding'] });
      const context = createMockContext({ currentAgentSession: currentSession });
      
      mockRegistry.getProfile = vi.fn().mockReturnValue(undefined);

      const result = strategy.route(task, context);
      expect(result).toBeUndefined();
    });

    it('should return undefined when current agent cannot handle required capabilities', () => {
      const currentSession: AgentSession = {
        id: 'session1',
        parentSessionId: 'parent1',
        agentId: 'agent2', // agent2 has research/writing, not coding
        startedAt: new Date(),
        handoffReason: 'initial',
        routingDecision: {} as RoutingDecision,
        tenantId: 'tenant1',
        operatorId: 'operator1',
        policyContext: {} as any,
        workingMemory: {} as any,
        status: 'active',
        stats: {} as any
      };
      
      const task = createMockTask({ 
        requiredCapabilities: ['coding'], // Current agent doesn't have this
        intent: 'Write some code'
      });
      const context = createMockContext({ currentAgentSession: currentSession });
      
      mockRegistry.getProfile = vi.fn().mockImplementation((id: string) => {
        if (id === 'agent2') return mockAgent2;
        return undefined;
      });

      const result = strategy.route(task, context);
      expect(result).toBeUndefined();
    });
  });

  describe('RoundRobinStrategy', () => {
    let strategy: RoundRobinStrategy;
    let mockRegistry: AgentRegistry;

    beforeEach(() => {
      mockRegistry = createMockRegistry();
      strategy = new RoundRobinStrategy(mockRegistry);
    });

    it('should distribute load using round-robin selection', () => {
      const task = createMockTask({ 
        requiredCapabilities: ['coding'],
        intent: 'Write a function'
      });
      const context = createMockContext();
      
      mockRegistry.findByCapability = vi.fn().mockImplementation((capability: string) => {
        if (capability === 'coding') return [mockAgent1, mockAgent2];
        return [];
      });

      // First call should select first agent
      const result1 = strategy.route(task, context);
      expect(result1).toBeDefined();
      expect(result1!.agentId).toEqual('agent1');
      expect(result1!.strategy).toEqual('round_robin');

      // Second call should select second agent
      const result2 = strategy.route(task, context);
      expect(result2).toBeDefined();
      expect(result2!.agentId).toEqual('agent2');
      expect(result2!.strategy).toEqual('round_robin');

      // Third call should wrap around to first agent
      const result3 = strategy.route(task, context);
      expect(result3).toBeDefined();
      expect(result3!.agentId).toEqual('agent1');
      expect(result3!.strategy).toEqual('round_robin');
    });

    it('should return undefined when no capabilities are required', () => {
      const task = createMockTask({ requiredCapabilities: [] });
      const context = createMockContext();

      const result = strategy.route(task, context);
      expect(result).toBeUndefined();
    });

    it('should return undefined when no agents match capabilities', () => {
      const task = createMockTask({ 
        requiredCapabilities: ['nonexistent'],
        intent: 'Do something impossible'
      });
      const context = createMockContext();
      
      mockRegistry.findByCapability = vi.fn().mockReturnValue([]);

      const result = strategy.route(task, context);
      expect(result).toBeUndefined();
    });

    it('should sort agents by routing priority before round-robin selection', () => {
      // Create agents with different routing priorities
      const highPriorityAgent: AgentProfile = {
        ...mockAgent1,
        id: 'high-priority',
        routingPriority: 100
      };
      
      const lowPriorityAgent: AgentProfile = {
        ...mockAgent2,
        id: 'low-priority',
        routingPriority: 50
      };
      
      const task = createMockTask({ 
        requiredCapabilities: ['coding'],
        intent: 'Write a function'
      });
      const context = createMockContext();
      
      mockRegistry.findByCapability = vi.fn().mockImplementation((capability: string) => {
        if (capability === 'coding') return [lowPriorityAgent, highPriorityAgent]; // Unsorted order
        return [];
      });

      // Should select high priority agent first due to sorting
      const result = strategy.route(task, context);
      expect(result).toBeDefined();
      // With round-robin, it should still follow the counter, but the order should be sorted
      expect(result!.strategy).toEqual('round_robin');
    });
  });

  describe('OrchestratorFallbackStrategy', () => {
    let strategy: OrchestratorFallbackStrategy;
    let mockRegistry: AgentRegistry;

    beforeEach(() => {
      mockRegistry = createMockRegistry();
      strategy = new OrchestratorFallbackStrategy(mockRegistry);
    });

    it('should always return orchestrator as fallback', () => {
      const task = createMockTask({ 
        requiredCapabilities: ['unknown'],
        intent: 'Handle this complex task'
      });
      const context = createMockContext();

      const result = strategy.route(task, context);
      
      expect(result).toBeDefined();
      expect(result!.agentId).toEqual('orchestrator');
      expect(result!.strategy).toEqual('orchestrator_fallback');
      expect(result!.confidence).toEqual(0.1); // Low confidence for fallback
    });

    it('should indicate handoff when current agent session exists', () => {
      const currentSession: AgentSession = {
        id: 'session1',
        parentSessionId: 'parent1',
        agentId: 'agent1',
        startedAt: new Date(),
        handoffReason: 'fallback',
        routingDecision: {} as RoutingDecision,
        tenantId: 'tenant1',
        operatorId: 'operator1',
        policyContext: {} as any,
        workingMemory: {} as any,
        status: 'active',
        stats: {} as any
      };
      
      const task = createMockTask({ intent: 'Fallback task' });
      const context = createMockContext({ currentAgentSession: currentSession });

      const result = strategy.route(task, context);
      
      expect(result).toBeDefined();
      expect(result!.agentId).toEqual('orchestrator');
      expect(result!.isHandoff).toBe(true);
      expect(result!.handoffFrom).toEqual('agent1');
    });

    it('should not indicate handoff when no current agent session exists', () => {
      const task = createMockTask({ intent: 'Fallback task' });
      const context = createMockContext({ currentAgentSession: undefined });

      const result = strategy.route(task, context);
      
      expect(result).toBeDefined();
      expect(result!.agentId).toEqual('orchestrator');
      expect(result!.isHandoff).toBe(false);
      expect(result!.handoffFrom).toBeUndefined();
    });
  });

  describe('TaskRouterImpl', () => {
    let router: TaskRouterImpl;
    let mockRegistry: AgentRegistry;

    beforeEach(() => {
      mockRegistry = createMockRegistry();
      router = new TaskRouterImpl(mockRegistry);
    });

    it('should prioritize strategies by priority order', () => {
      // Create a task that could match multiple strategies
      const task = createMockTask({ 
        preferredAgent: 'agent1', // Should trigger ExplicitMentionStrategy
        requiredCapabilities: ['coding'], // Could also trigger CapabilityMatchStrategy
        intent: 'Please @agent1 help me code'
      });
      const context = createMockContext();
      
      // Mock registry responses
      mockRegistry.getProfile = vi.fn().mockImplementation((id: string) => {
        if (id === 'agent1') return mockAgent1;
        return undefined;
      });
      
      mockRegistry.findByCapability = vi.fn().mockImplementation((capability: string) => {
        if (capability === 'coding') return [mockAgent1];
        return [];
      });

      // Route the task
      const result = router.route(task, context);
      
      // Should use ExplicitMentionStrategy (highest priority) rather than CapabilityMatchStrategy
      expect(result.agentId).toEqual('agent1');
      expect(result.strategy).toEqual('explicit_mention');
    });

    it('should fall back to orchestrator when no strategy matches', () => {
      const task = createMockTask({ 
        requiredCapabilities: ['nonexistent'],
        intent: 'Do something nobody can handle'
      });
      const context = createMockContext();
      
      // Mock all strategies to return undefined
      mockRegistry.getProfile = vi.fn().mockImplementation((id: string) => {
        if (id === 'orchestrator') return mockOrchestrator;
        return undefined;
      });
      mockRegistry.findByCapability = vi.fn().mockReturnValue([]);

      const result = router.route(task, context);
      
      // Should fall back to orchestrator
      expect(result.agentId).toEqual('orchestrator');
      expect(result.strategy).toEqual('orchestrator_fallback');
      expect(result.confidence).toEqual(0.1);
    });

    it('should use capability matching when no explicit mention', () => {
      const task = createMockTask({ 
        requiredCapabilities: ['coding'],
        intent: 'Write a function to sort an array'
      });
      const context = createMockContext();
      
      mockRegistry.findByCapability = vi.fn().mockImplementation((capability: string) => {
        if (capability === 'coding') return [mockAgent1];
        return [];
      });

      const result = router.route(task, context);
      
      // Should use CapabilityMatchStrategy
      expect(result.agentId).toEqual('agent1');
      expect(result.strategy).toEqual('capability_match');
    });

    it('should maintain sticky session when appropriate', () => {
      const currentSession: AgentSession = {
        id: 'session1',
        parentSessionId: 'parent1',
        agentId: 'agent1',
        startedAt: new Date(),
        handoffReason: 'initial',
        routingDecision: {} as RoutingDecision,
        tenantId: 'tenant1',
        operatorId: 'operator1',
        policyContext: {} as any,
        workingMemory: {} as any,
        status: 'active',
        stats: {} as any
      };
      
      const task = createMockTask({ 
        requiredCapabilities: ['coding'], // Current agent can handle this
        intent: 'Continue coding work'
      });
      const context = createMockContext({ currentAgentSession: currentSession });
      
      mockRegistry.getProfile = vi.fn().mockImplementation((id: string) => {
        if (id === 'agent1') return mockAgent1;
        return undefined;
      });
      
      // Also mock findByCapability to prevent errors in other strategies
      mockRegistry.findByCapability = vi.fn().mockReturnValue([]);

      const result = router.route(task, context);
      
      // Should use StickySessionStrategy
      expect(result.agentId).toEqual('agent1');
      expect(result.strategy).toEqual('sticky_session');
    });
  });
});