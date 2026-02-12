/**
 * Planner Interface - Milestone 3
 * Planning subsystem abstraction
 */
import type { PlanGraph, PlannerInput } from '../types.js';
import crypto from 'node:crypto';

/**
 * Planner interface - abstract planning capability
 * Implementations can range from simple heuristic to LLM-based
 */
export interface Planner {
  createPlan(input: PlannerInput): PlanGraph;
}

/**
 * LLM Planner Configuration - Milestone 7
 * Configuration for LLM-based planner (PromptedPlanner)
 */
export interface LLMPlannerConfig {
  enabled: boolean; // default: false
  provider: 'openai' | 'anthropic' | 'ollama' | 'custom';
  model: string;
  apiKey?: string;
  baseUrl?: string;
  maxSteps: number; // default: 10
  timeoutMs: number; // default: 30000
  maxTokens: number; // default: 2000
  temperature: number; // default: 0
  devMode?: boolean; // default: false
}

/**
 * Planner Audit Record - Milestone 7
 * Records planning decisions for observability and debugging
 */
export interface PlannerAuditRecord {
  planId: string;
  plannerUsed: 'prompted' | 'heuristic';
  promptHash: string; // SHA-256
  responseHash?: string; // SHA-256
  validationPassed: boolean;
  validationErrors?: string[];
  fallbackTriggered: boolean;
  timestampMs: number;
}

// Import HeuristicPlanner (always available)
import { HeuristicPlanner } from './heuristic-planner.js';

/**
 * PromptedPlanner type placeholder - Milestone 7
 * This will be implemented in a future milestone
 * Using a type compatible with Planner for now
 */
interface PromptedPlannerConstructor {
  new (config: Omit<LLMPlannerConfig, 'devMode'>): Planner;
}

// Dynamic import for PromptedPlanner (may not exist yet)
let PromptedPlannerClass: PromptedPlannerConstructor | undefined;
try {
  // @ts-ignore - Module may not exist
  const module = await import('./prompted-planner.js');
  PromptedPlannerClass = module.PromptedPlanner;
} catch {
  // PromptedPlanner not implemented yet - will use HeuristicPlanner
}

/**
 * Planner Registry - Milestone 7
 * Instance-based registry for planner selection
 * Allows runtime switching between HeuristicPlanner and PromptedPlanner
 */
export class PlannerRegistry {
  private heuristicPlanner: HeuristicPlanner;
  private promptedPlanner?: Planner;
  private config: Required<LLMPlannerConfig> & { devMode: boolean };

  constructor(config?: Partial<LLMPlannerConfig>) {
    // Default configuration
    this.config = {
      enabled: config?.enabled ?? false,
      provider: config?.provider ?? 'openai',
      model: config?.model ?? 'gpt-4',
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl,
      maxSteps: config?.maxSteps ?? 10,
      timeoutMs: config?.timeoutMs ?? 30000,
      maxTokens: config?.maxTokens ?? 2000,
      temperature: config?.temperature ?? 0,
      devMode: config?.devMode ?? false,
    };

    // Initialize heuristic planner (always available)
    this.heuristicPlanner = new HeuristicPlanner();

    // Initialize prompted planner if enabled and configured
    if (this.config.enabled && this.config.apiKey && PromptedPlannerClass) {
      try {
        this.promptedPlanner = new PromptedPlannerClass(this.config);
      } catch (error) {
        // Failed to initialize PromptedPlanner - will fall back to HeuristicPlanner
        if (this.config.devMode) {
          console.warn('[PlannerRegistry] Failed to initialize PromptedPlanner:', error);
        }
        this.promptedPlanner = undefined;
      }
    }
  }

  /**
   * Select the appropriate planner based on configuration
   * Returns PromptedPlanner if enabled and configured, else HeuristicPlanner
   */
  selectPlanner(): Planner {
    if (this.promptedPlanner && this.config.enabled) {
      return this.promptedPlanner;
    }
    return this.heuristicPlanner;
  }

  /**
   * Create an audit record for a planning decision
   */
  createAuditRecord(
    planId: string,
    plannerUsed: 'prompted' | 'heuristic',
    promptHash: string,
    responseHash?: string,
    validationPassed: boolean = true,
    validationErrors?: string[],
    fallbackTriggered: boolean = false,
  ): PlannerAuditRecord {
    return {
      planId,
      plannerUsed,
      promptHash,
      responseHash,
      validationPassed,
      validationErrors,
      fallbackTriggered,
      timestampMs: Date.now(),
    };
  }

  /**
   * Hash content for audit tracking
   */
  static hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if PromptedPlanner is available
   */
  isPromptedPlannerAvailable(): boolean {
    return this.promptedPlanner !== undefined && this.config.enabled;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<typeof this.config> {
    return { ...this.config };
  }
}
