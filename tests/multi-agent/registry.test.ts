/**
 * Agent Registry Unit Tests
 * 
 * Tests for the AgentRegistry implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRegistryImpl } from '../../src/multi-agent/registry.js';
import type { AgentProfile } from '../../src/multi-agent/types.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistryImpl;

  beforeEach(() => {
    // Create a fresh registry for each test
    registry = new AgentRegistryImpl('config/agents/registry.json');
  });

  afterEach(() => {
    registry.stopWatching();
  });

  describe('getProfile', () => {
    it('should return orchestrator profile by default', () => {
      const profile = registry.getProfile('orchestrator');
      
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('orchestrator');
      expect(profile?.name).toBe('Orchestrator');
    });

    it('should return researcher profile by default', () => {
      const profile = registry.getProfile('researcher');
      
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('researcher');
      expect(profile?.capabilities).toContain('web_search');
    });

    it('should return coder profile by default', () => {
      const profile = registry.getProfile('coder');
      
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('coder');
      expect(profile?.capabilities).toContain('coding');
    });

    it('should return reviewer profile by default', () => {
      const profile = registry.getProfile('reviewer');
      
      expect(profile).toBeDefined();
      expect(profile?.id).toBe('reviewer');
      expect(profile?.capabilities).toContain('code_review');
    });

    it('should return undefined for non-existent profile', () => {
      const profile = registry.getProfile('non_existent_agent');
      
      expect(profile).toBeUndefined();
    });
  });

  describe('hasProfile', () => {
    it('should return true for existing profile', () => {
      expect(registry.hasProfile('orchestrator')).toBe(true);
      expect(registry.hasProfile('researcher')).toBe(true);
      expect(registry.hasProfile('coder')).toBe(true);
      expect(registry.hasProfile('reviewer')).toBe(true);
    });

    it('should return false for non-existent profile', () => {
      expect(registry.hasProfile('ghost_agent')).toBe(false);
      expect(registry.hasProfile('')).toBe(false);
    });
  });

  describe('getAllProfiles', () => {
    it('should return all default profiles', () => {
      const profiles = registry.getAllProfiles();
      
      expect(profiles).toBeInstanceOf(Array);
      expect(profiles.length).toBeGreaterThanOrEqual(4);
      
      const ids = profiles.map(p => p.id);
      expect(ids).toContain('orchestrator');
      expect(ids).toContain('researcher');
      expect(ids).toContain('coder');
      expect(ids).toContain('reviewer');
    });

    it('should return frozen arrays (immutable)', () => {
      const profiles = registry.getAllProfiles();
      
      expect(Object.isFrozen(profiles)).toBe(true);
    });
  });

  describe('findByCapability', () => {
    it('should find agents with web_search capability', () => {
      const agents = registry.findByCapability('web_search');
      
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0]?.capabilities).toContain('web_search');
    });

    it('should find agents with code_review capability', () => {
      const agents = registry.findByCapability('code_review');
      
      expect(agents.length).toBeGreaterThan(0);
      for (const agent of agents) {
        expect(agent.capabilities).toContain('code_review');
      }
    });

    it('should return agents sorted by routing priority', () => {
      const agents = registry.findByCapability('research');
      
      for (let i = 0; i < agents.length - 1; i++) {
        expect(agents[i]?.routingPriority).toBeGreaterThanOrEqual(agents[i + 1]?.routingPriority ?? 0);
      }
    });

    it('should return empty array for non-existent capability', () => {
      const agents = registry.findByCapability('non_existent_capability');
      
      expect(agents).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return valid statistics', () => {
      const stats = registry.getStats();
      
      expect(stats).toHaveProperty('totalProfiles');
      expect(stats).toHaveProperty('totalCapabilities');
      expect(stats).toHaveProperty('standaloneCount');
      expect(stats).toHaveProperty('childOnlyCount');
      expect(stats).toHaveProperty('lastReloadedAt');
      
      expect(stats.totalProfiles).toBeGreaterThanOrEqual(4);
      expect(stats.standaloneCount).toBe(1); // orchestrator
      expect(stats.childOnlyCount).toBeGreaterThanOrEqual(3); // researcher, coder, reviewer
    });

    it('should have at least one orchestrator (standalone)', () => {
      const stats = registry.getStats();
      
      expect(stats.standaloneCount).toBeGreaterThan(0);
    });

    it('should have total capabilities matching sum of all agent capabilities', () => {
      const stats = registry.getStats();
      const profiles = registry.getAllProfiles();
      const totalCapabilities = profiles.reduce((sum, p) => sum + p.capabilities.length, 0);
      
      expect(stats.totalCapabilities).toBe(totalCapabilities);
    });
  });

  describe('validateProfile', () => {
    it('should validate a correct profile', () => {
      const validProfile = {
        id: 'test_agent',
        name: 'Test Agent',
        description: 'A test agent',
        capabilities: ['test_capability'],
        model: 'claude-3-sonnet',
        systemPrompt: 'You are a test agent.',
        maxTokensPerTurn: 4000,
        parentSessionOnly: false,
        badge: {
          displayName: 'test',
          emoji: '🔧',
          color: '#FF6B6B',
          abbreviation: 'TST'
        },
        routingPriority: 50
      };
      
      const result = registry.validateProfile(validProfile);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject null profile', () => {
      const result = registry.validateProfile(null);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject non-object profile', () => {
      const result = registry.validateProfile('not an object');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject profile without id', () => {
      const profile = {
        name: 'Test',
        description: 'Test',
        capabilities: [],
        model: 'test',
        systemPrompt: 'test',
        parentSessionOnly: false,
        badge: { displayName: 'test', emoji: '🔧', color: '#fff', abbreviation: 'TST' }
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: id');
    });

    it('should reject profile without name', () => {
      const profile = {
        id: 'test',
        description: 'Test',
        capabilities: [],
        model: 'test',
        systemPrompt: 'test',
        parentSessionOnly: false,
        badge: { displayName: 'test', emoji: '🔧', color: '#fff', abbreviation: 'TST' }
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: name');
    });

    it('should reject profile without capabilities array', () => {
      const profile = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        capabilities: 'not an array',
        model: 'test',
        systemPrompt: 'test',
        parentSessionOnly: false,
        badge: { displayName: 'test', emoji: '🔧', color: '#fff', abbreviation: 'TST' }
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "capabilities" must be an array');
    });

    it('should reject profile without badge', () => {
      const profile = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        capabilities: [],
        model: 'test',
        systemPrompt: 'test',
        parentSessionOnly: false,
        badge: undefined as any
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: badge');
    });

    it('should reject profile with invalid badge (missing emoji)', () => {
      const profile = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        capabilities: [],
        model: 'test',
        systemPrompt: 'test',
        parentSessionOnly: false,
        badge: {
          displayName: 'test',
          emoji: undefined as any,
          color: '#fff',
          abbreviation: 'TST'
        }
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: badge.emoji');
    });

    it('should reject profile with invalid maxTokensPerTurn', () => {
      const profile = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        capabilities: [],
        model: 'test',
        systemPrompt: 'test',
        maxTokensPerTurn: 'not a number' as any,
        parentSessionOnly: false,
        badge: { displayName: 'test', emoji: '🔧', color: '#fff', abbreviation: 'TST' }
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "maxTokensPerTurn" must be a number');
    });

    it('should reject profile with non-string id', () => {
      const profile = {
        id: 123 as any,
        name: 'Test',
        description: 'Test',
        capabilities: [],
        model: 'test',
        systemPrompt: 'test',
        parentSessionOnly: false,
        badge: { displayName: 'test', emoji: '🔧', color: '#fff', abbreviation: 'TST' }
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "id" must be a string');
    });

    it('should validate allowedTools and forbiddenTools', () => {
      const profile = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        capabilities: [],
        model: 'test',
        systemPrompt: 'test',
        parentSessionOnly: false,
        allowedTools: ['read', 'write'],
        forbiddenTools: ['delete'],
        badge: { displayName: 'test', emoji: '🔧', color: '#fff', abbreviation: 'TST' }
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(true);
    });

    it('should reject invalid allowedTools', () => {
      const profile = {
        id: 'test',
        name: 'Test',
        description: 'Test',
        capabilities: [],
        model: 'test',
        systemPrompt: 'test',
        parentSessionOnly: false,
        allowedTools: 'not an array' as any,
        badge: { displayName: 'test', emoji: '🔧', color: '#fff', abbreviation: 'TST' }
      };
      
      const result = registry.validateProfile(profile);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Field "allowedTools" must be an array');
    });
  });

  describe('reload', () => {
    it('should handle reload without throwing when config file does not exist', async () => {
      // This should not throw, just warn
      await expect(registry.reload()).resolves.not.toThrow();
    });
  });

  describe('AgentProfile Properties', () => {
    it('orchestrator should have routing capability', () => {
      const orchestrator = registry.getProfile('orchestrator');
      
      expect(orchestrator?.capabilities).toContain('routing');
      expect(orchestrator?.parentSessionOnly).toBe(false);
    });

    it('researcher should have web_search and allowedTools', () => {
      const researcher = registry.getProfile('researcher');
      
      expect(researcher?.capabilities).toContain('web_search');
      expect(researcher?.parentSessionOnly).toBe(true);
      expect(researcher?.allowedTools).toBeDefined();
      expect(researcher?.allowedTools).toContain('web_search');
    });

    it('coder should have forbiddenTools (no web_search)', () => {
      const coder = registry.getProfile('coder');
      
      expect(coder?.forbiddenTools).toBeDefined();
      expect(coder?.forbiddenTools).toContain('web_search');
    });

    it('all agents should have valid badges', () => {
      const profiles = registry.getAllProfiles();
      
      for (const profile of profiles) {
        expect(profile.badge).toBeDefined();
        expect(profile.badge.displayName).toBeDefined();
        expect(profile.badge.emoji).toBeDefined();
        expect(profile.badge.color).toBeDefined();
        expect(profile.badge.abbreviation).toBeDefined();
        expect(profile.badge.abbreviation.length).toBeLessThanOrEqual(3);
      }
    });

    it('all agents should have valid systemPrompt', () => {
      const profiles = registry.getAllProfiles();
      
      for (const profile of profiles) {
        expect(profile.systemPrompt).toBeDefined();
        expect(typeof profile.systemPrompt).toBe('string');
        expect(profile.systemPrompt.length).toBeGreaterThan(0);
      }
    });

    it('all agents should have routingPriority', () => {
      const profiles = registry.getAllProfiles();
      
      for (const profile of profiles) {
        expect(typeof profile.routingPriority).toBe('number');
        expect(profile.routingPriority).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

describe('AgentProfile Data Integrity', () => {
  let registry: AgentRegistryImpl;

  beforeEach(() => {
    registry = new AgentRegistryImpl('config/agents/registry.json');
  });

  afterEach(() => {
    registry.stopWatching();
  });

  it('should have unique agent IDs', () => {
    const profiles = registry.getAllProfiles();
    const ids = profiles.map(p => p.id);
    const uniqueIds = new Set(ids);
    
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('orchestrator should be the only standalone agent by default', () => {
    const profiles = registry.getAllProfiles();
    const standaloneAgents = profiles.filter(p => !p.parentSessionOnly);
    
    expect(standaloneAgents.length).toBe(1);
    expect(standaloneAgents[0]?.id).toBe('orchestrator');
  });

  it('should have at least one agent per major capability type', () => {
    const profiles = registry.getAllProfiles();
    const allCapabilities = profiles.flatMap(p => p.capabilities);
    
    // Check for essential capabilities
    expect(allCapabilities).toContain('routing');
    expect(allCapabilities).toContain('web_search');
    expect(allCapabilities).toContain('coding');
    expect(allCapabilities).toContain('code_review');
  });
});

describe('Registry Edge Cases', () => {
  let registry: AgentRegistryImpl;

  beforeEach(() => {
    registry = new AgentRegistryImpl('config/agents/registry.json');
  });

  afterEach(() => {
    registry.stopWatching();
  });

  it('should handle empty capability search gracefully', () => {
    const agents = registry.findByCapability('');
    
    expect(agents).toEqual([]);
  });

  it('should return consistent stats after multiple calls', () => {
    const stats1 = registry.getStats();
    const stats2 = registry.getStats();
    
    expect(stats1).toEqual(stats2);
  });

  it('should return frozen stats object', () => {
    const stats = registry.getStats();
    
    expect(Object.isFrozen(stats)).toBe(true);
  });

  it('should return frozen profile objects', () => {
    const profiles = registry.getAllProfiles();
    
    for (const profile of profiles) {
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.capabilities)).toBe(true);
      expect(Object.isFrozen(profile.badge)).toBe(true);
    }
  });
});