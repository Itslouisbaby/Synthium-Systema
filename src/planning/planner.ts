/**
 * Planner Interface - Milestone 3
 * Planning subsystem abstraction
 */
import type { PlanGraph, PlannerInput } from '../types.js';

/**
 * Planner interface - abstract planning capability
 * Implementations can range from simple heuristic to LLM-based
 */
export interface Planner {
  createPlan(input: PlannerInput): PlanGraph;
}

/**
 * Planner registry for future planner selection
 * Allows runtime switching between planning strategies
 */
export class PlannerRegistry {
  private static planners = new Map<string, Planner>();
  private static defaultPlanner: Planner | undefined;

  /**
   * Register a planner with a name
   */
  static register(name: string, planner: Planner): void {
    this.planners.set(name, planner);
  }

  /**
   * Get a registered planner by name
   */
  static get(name: string): Planner | undefined {
    return this.planners.get(name);
  }

  /**
   * Set the default planner
   */
  static setDefault(planner: Planner): void {
    this.defaultPlanner = planner;
  }

  /**
   * Get the default planner
   * Throws if no default is set
   */
  static getDefault(): Planner {
    if (!this.defaultPlanner) {
      throw new Error('No default planner set. Call setDefault() first.');
    }
    return this.defaultPlanner;
  }

  /**
   * Clear all registrations
   */
  static clear(): void {
    this.planners.clear();
    this.defaultPlanner = undefined;
  }
}
