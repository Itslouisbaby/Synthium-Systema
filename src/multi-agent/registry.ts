/**
 * Agent Registry Implementation
 * 
 * Manages loading, validation, and lookup of agent profiles.
 */

import { AgentProfile, AgentRegistry, RegistryStats, ValidationResult } from './types.js';
import { readFile, watch } from 'fs/promises';
import { join } from 'path';

// Default agent profiles
const DEFAULT_AGENT_PROFILES: AgentProfile[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    description: 'Main coordinator that routes tasks to specialized agents',
    capabilities: ['routing', 'coordination', 'synthesis'],
    model: 'claude-3-sonnet',
    systemPrompt: 'You are the orchestrator agent. Your job is to understand user requests and route them to the appropriate specialized agent. You can also synthesize results from multiple agents.',
    maxTokensPerTurn: 4000,
    parentSessionOnly: false,
    badge: {
      displayName: 'orchestrator',
      emoji: '🎯',
      color: '#9B59B6',
      abbreviation: 'ORC'
    },
    routingPriority: 10
  },
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Specializes in finding information from web searches and documentation',
    capabilities: ['web_search', 'documentation', 'research', 'analysis'],
    model: 'claude-3-haiku',
    systemPrompt: 'You are a research specialist. Your job is to find accurate, up-to-date information. Always cite your sources.',
    maxTokensPerTurn: 4000,
    allowedTools: ['web_search', 'web_fetch', 'read'],
    parentSessionOnly: true,
    badge: {
      displayName: 'researcher',
      emoji: '🔍',
      color: '#3498DB',
      abbreviation: 'RES'
    },
    routingPriority: 80
  },
  {
    id: 'coder',
    name: 'Coder',
    description: 'Writes, reviews, and modifies code',
    capabilities: ['coding', 'code_review', 'debugging', 'refactoring'],
    model: 'claude-3-sonnet',
    systemPrompt: 'You are a coding specialist. Write clean, well-documented code. Follow best practices for the language you\'re using.',
    maxTokensPerTurn: 4000,
    forbiddenTools: ['web_search'],
    parentSessionOnly: true,
    badge: {
      displayName: 'coder',
      emoji: '⌨️',
      color: '#2ECC71',
      abbreviation: 'COD'
    },
    routingPriority: 80
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews code and outputs for quality, security, and correctness',
    capabilities: ['code_review', 'security_audit', 'quality_check'],
    model: 'claude-3-opus',
    systemPrompt: 'You are a code reviewer. Be thorough and critical. Look for bugs, security issues, and areas for improvement.',
    maxTokensPerTurn: 4000,
    parentSessionOnly: true,
    badge: {
      displayName: 'reviewer',
      emoji: '👁️',
      color: '#E74C3C',
      abbreviation: 'REV'
    },
    routingPriority: 70
  }
];

export class AgentRegistryImpl implements AgentRegistry {
  private profiles: Map<string, AgentProfile> = new Map();
  private stats: RegistryStats = {
    totalProfiles: 0,
    totalCapabilities: 0,
    standaloneCount: 0,
    childOnlyCount: 0,
    lastReloadedAt: new Date()
  };
  private watchers: Array<() => void> = [];
  private configPath: string;

  constructor(configPath: string = 'config/agents/registry.json') {
    this.configPath = configPath;
    // Initialize with default profiles
    this.loadDefaultProfiles();
  }

  /**
   * Load default agent profiles
   */
  private loadDefaultProfiles(): void {
    for (const profile of DEFAULT_AGENT_PROFILES) {
      this.profiles.set(profile.id, this.deepFreeze(profile));
    }
    this.updateStats();
  }

  /**
   * Get a profile by ID
   */
  getProfile(agentId: string): AgentProfile | undefined {
    return this.profiles.get(agentId);
  }

  /**
   * Get all profiles matching a capability
   */
  findByCapability(capability: string): AgentProfile[] {
    const result: AgentProfile[] = [];
    for (const profile of this.profiles.values()) {
      if (profile.capabilities.includes(capability)) {
        result.push(profile);
      }
    }
    // Sort by routing priority (highest first)
    return result.sort((a, b) => b.routingPriority - a.routingPriority);
  }

  /**
   * Deep freeze an object
   */
  private deepFreeze<T>(obj: T): T {
    Object.freeze(obj);
    if (obj && typeof obj === 'object') {
      for (const value of Object.values(obj as Record<string, unknown>)) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
          this.deepFreeze(value);
        }
      }
    }
    return obj;
  }

  /**
   * Get all registered profiles
   */
  getAllProfiles(): readonly AgentProfile[] {
    return this.deepFreeze(Array.from(this.profiles.values()));
  }

  /**
   * Check if profile exists
   */
  hasProfile(agentId: string): boolean {
    return this.profiles.has(agentId);
  }

  /**
   * Reload profiles from disk (hot-reload support)
   */
  async reload(): Promise<void> {
    try {
      const configData = await readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      if (config.agents && Array.isArray(config.agents)) {
        // Clear existing profiles except defaults
        this.profiles.clear();
        this.loadDefaultProfiles();
        
        // Load custom profiles from config
        for (const profileData of config.agents) {
          const validationResult = this.validateProfile(profileData);
          if (validationResult.valid) {
            // Convert to AgentProfile (assuming the JSON structure matches)
            const profile: AgentProfile = {
              id: profileData.id,
              name: profileData.name,
              description: profileData.description,
              capabilities: [...profileData.capabilities],
              model: profileData.model,
              systemPrompt: profileData.systemPrompt,
              maxTokensPerTurn: profileData.maxTokensPerTurn || 4000,
              parentSessionOnly: profileData.parentSessionOnly,
              badge: { ...profileData.badge },
              routingPriority: profileData.routingPriority || 50,
              ...(profileData.allowedTools ? { allowedTools: [...profileData.allowedTools] } : {}),
              ...(profileData.forbiddenTools ? { forbiddenTools: [...profileData.forbiddenTools] } : {})
            };
            
            // Don't override default profiles
            if (!DEFAULT_AGENT_PROFILES.some(p => p.id === profile.id)) {
              this.profiles.set(profile.id, this.deepFreeze(profile));
            }
          }
        }
        
        this.updateStats();
      }
    } catch (error) {
      // Missing config is expected in many local/test environments.
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      // If config file is invalid or unreadable, continue with defaults.
      console.warn(`Failed to load agent registry from ${this.configPath}:`, error);
    }
  }

  /**
   * Validate a profile without registering it
   */
  validateProfile(profile: any): ValidationResult {
    const errors: string[] = [];
    
    if (!profile) {
      return { valid: false, errors: ['Profile is null or undefined'] };
    }
    
    if (typeof profile !== 'object') {
      return { valid: false, errors: ['Profile must be an object'] };
    }
    
    // Required fields
    if (!profile.id) {
      errors.push('Missing required field: id');
    } else if (typeof profile.id !== 'string') {
      errors.push('Field "id" must be a string');
    }
    
    if (!profile.name) {
      errors.push('Missing required field: name');
    } else if (typeof profile.name !== 'string') {
      errors.push('Field "name" must be a string');
    }
    
    if (!profile.description) {
      errors.push('Missing required field: description');
    } else if (typeof profile.description !== 'string') {
      errors.push('Field "description" must be a string');
    }
    
    if (!profile.capabilities) {
      errors.push('Missing required field: capabilities');
    } else if (!Array.isArray(profile.capabilities)) {
      errors.push('Field "capabilities" must be an array');
    }
    
    if (!profile.model) {
      errors.push('Missing required field: model');
    } else if (typeof profile.model !== 'string') {
      errors.push('Field "model" must be a string');
    }
    
    if (!profile.systemPrompt) {
      errors.push('Missing required field: systemPrompt');
    } else if (typeof profile.systemPrompt !== 'string') {
      errors.push('Field "systemPrompt" must be a string');
    }
    
    if (profile.maxTokensPerTurn !== undefined && typeof profile.maxTokensPerTurn !== 'number') {
      errors.push('Field "maxTokensPerTurn" must be a number');
    }
    
    if (profile.parentSessionOnly !== undefined && typeof profile.parentSessionOnly !== 'boolean') {
      errors.push('Field "parentSessionOnly" must be a boolean');
    }
    
    if (!profile.badge) {
      errors.push('Missing required field: badge');
    } else if (typeof profile.badge !== 'object') {
      errors.push('Field "badge" must be an object');
    } else {
      if (!profile.badge.displayName) {
        errors.push('Missing required field: badge.displayName');
      }
      if (!profile.badge.emoji) {
        errors.push('Missing required field: badge.emoji');
      }
      if (!profile.badge.color) {
        errors.push('Missing required field: badge.color');
      }
      if (!profile.badge.abbreviation) {
        errors.push('Missing required field: badge.abbreviation');
      }
    }
    
    if (profile.routingPriority !== undefined && typeof profile.routingPriority !== 'number') {
      errors.push('Field "routingPriority" must be a number');
    }
    
    // Validate allowedTools if present
    if (profile.allowedTools !== undefined && !Array.isArray(profile.allowedTools)) {
      errors.push('Field "allowedTools" must be an array');
    }
    
    // Validate forbiddenTools if present
    if (profile.forbiddenTools !== undefined && !Array.isArray(profile.forbiddenTools)) {
      errors.push('Field "forbiddenTools" must be an array');
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    return this.deepFreeze({ ...this.stats });
  }

  /**
   * Update internal statistics
   */
  private updateStats(): void {
    let totalCapabilities = 0;
    let standaloneCount = 0;
    let childOnlyCount = 0;
    
    for (const profile of this.profiles.values()) {
      totalCapabilities += profile.capabilities.length;
      if (profile.parentSessionOnly) {
        childOnlyCount++;
      } else {
        standaloneCount++;
      }
    }
    
    Object.assign(this.stats, {
      totalProfiles: this.profiles.size,
      totalCapabilities,
      standaloneCount,
      childOnlyCount,
      lastReloadedAt: this.stats.lastReloadedAt
    });
  }

  /**
   * Watch for config file changes
   */
  async watchConfig(): Promise<void> {
    try {
      const { watch } = await import('fs/promises');
      
      const watcher = watch(this.configPath);
      
      const watchLoop = async () => {
        try {
          for await (const event of watcher) {
            if (event.eventType === 'change') {
              await this.reload();
            }
          }
        } catch {
          // Watcher closed or error
        }
      };
      
      watchLoop().catch(() => {
        // Ignore watcher errors
      });
      
      this.watchers.push(() => {
        // No-op for now - AsyncIterator doesn't have close method
      });
    } catch (error) {
      console.warn(`Failed to watch agent registry config:`, error);
    }
  }

  /**
   * Stop watching config file
   */
  stopWatching(): void {
    for (const cleanup of this.watchers) {
      cleanup();
    }
    this.watchers = [];
  }
}