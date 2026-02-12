/**
 * PromptedPlanner - LLM-powered planning
 * Milestone 7: Optional, gated, fail-safe
 */

import type { Planner, PlannerInput, PlanGraph, LLMPlannerConfig } from '../types.js';
import { ActionClass } from '../types.js';
import { SYSTEM_PROMPT, buildUserPrompt, extractJsonFromResponse, hashText } from './prompts.js';
import { validatePlanGraph, createFallbackPlan, type ValidationResult } from './validation.js';
import { HeuristicPlanner } from './heuristic-planner.js';

/**
 * Planner selection result with audit info
 */
export interface PlanResult {
  plan: PlanGraph;
  audit: {
    plannerUsed: 'prompted' | 'heuristic' | 'fallback';
    promptHash?: string;
    responseHash?: string;
    validationPassed: boolean;
    validationErrors?: string[];
    error?: string;
    durationMs: number;
  };
}

/**
 * PromptedPlanner - LLM-powered planner with deterministic fallback
 */
export class PromptedPlanner implements Planner {
  private config: Required<LLMPlannerConfig>;
  private heuristicPlanner: HeuristicPlanner;
  private lastError?: string;

  constructor(config: LLMPlannerConfig) {
    this.config = {
      enabled: config.enabled ?? false,
      provider: config.provider ?? 'openai',
      model: config.model ?? 'gpt-4o-mini',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      maxSteps: config.maxSteps ?? 10,
      timeoutMs: config.timeoutMs ?? 30000,
      maxTokens: config.maxTokens ?? 2000,
      temperature: config.temperature ?? 0,
      devMode: config.devMode ?? false,
    };
    this.heuristicPlanner = new HeuristicPlanner();
  }

  /**
   * Create plan using LLM with fallback to heuristic
   */
  createPlan(input: PlannerInput): PlanGraph {
    const startTime = Date.now();

    try {
      // Try LLM if enabled
      if (this.config.enabled) {
        const result = this.createLLMPlan(input);
        if (result) {
          return result;
        }
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      if (this.config.devMode) {
        console.error('LLM planner failed:', this.lastError);
      }
    }

    // Fallback to heuristic
    const durationMs = Date.now() - startTime;
    if (this.config.devMode) {
      console.log(`Falling back to HeuristicPlanner (${durationMs}ms elapsed)`);
    }

    return this.heuristicPlanner.createPlan(input);
  }

  /**
   * Create plan using LLM
   * Returns null on failure (caller falls back)
   */
  private createLLMPlan(input: PlannerInput): PlanGraph | null {
    // Stub implementation - returns null to trigger fallback
    // Full implementation would call LLM APIs
    
    if (process.env.CI || process.env.NODE_ENV === 'test') {
      // CI/testing stub: always return null to trigger fallback
      return null;
    }

    // Build prompt
    const prompt = buildUserPrompt(input, this.config.maxSteps);
    const systemPrompt = SYSTEM_PROMPT.replace('{{maxSteps}}', String(this.config.maxSteps));

    // This would call actual LLM in production
    // For now, stub implementation returns null
    // const response = await this.callLLM(systemPrompt, prompt);
    // const json = extractJsonFromResponse(response);
    // if (!json) return null;
    // const raw = JSON.parse(json);
    // const validation = validatePlanGraph(raw, this.config.maxSteps);
    // if (!validation.valid) return null;
    // return validation.plan!;

    return null;
  }

  /**
   * Create plan with full audit trail
   */
  async createPlanWithAudit(input: PlannerInput): Promise<PlanResult> {
    const startTime = Date.now();
    
    // Check if LLM is configured
    if (!this.config.enabled) {
      const plan = this.heuristicPlanner.createPlan(input);
      return {
        plan,
        audit: {
          plannerUsed: 'heuristic',
          validationPassed: true,
          durationMs: Date.now() - startTime,
        },
      };
    }

    // Try LLM
    try {
      const prompt = buildUserPrompt(input, this.config.maxSteps);
      const promptHash = await hashText(prompt);

      // In production, this would call actual LLM
      // For now, always fallback
      const plan = this.heuristicPlanner.createPlan(input);
      
      return {
        plan,
        audit: {
          plannerUsed: 'heuristic',
          promptHash,
          validationPassed: true,
          durationMs: Date.now() - startTime,
          error: 'LLM not implemented - stub fallback',
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const plan = this.heuristicPlanner.createPlan(input);
      
      return {
        plan,
        audit: {
          plannerUsed: 'fallback',
          validationPassed: false,
          validationErrors: [errorMsg],
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Check if LLM is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get last error if any
   */
  getLastError(): string | undefined {
    return this.lastError;
  }
}
