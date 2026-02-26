/**
 * Invariant Registry + Checker - Safety constraints
 * Section 8.3: Must-hold constraints
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Invariant, PlanStep, Signal, SessionKey } from '../types.js';
import { deterministicId } from '../runtime/deterministic-id.js';

/** Invariant registry configuration */
export interface InvariantRegistryConfig {
  /** Base directory for invariant storage */
  readonly baseDir: string;
}

/** Invariant check result */
export interface InvariantCheckResult {
  readonly invariantId: string;
  readonly name: string;
  readonly violated: boolean;
  readonly reason?: string;
  readonly repairStrategy?: string;
}

/** Invariant checker input */
export interface InvariantCheckerInput {
  readonly steps: PlanStep[];
  readonly concepts: string[];
  readonly sessionKey: SessionKey;
}

/**
 * InvariantRegistry - Manages must-hold constraints
 */
export class InvariantRegistry {
  private readonly config: InvariantRegistryConfig;
  private readonly invariants: Map<string, Invariant> = new Map();
  private loaded = false;

  constructor(config: InvariantRegistryConfig) {
    this.config = config;
  }

  /**
   * Get registry file path
   */
  private getRegistryPath(): string {
    return join(this.config.baseDir, 'invariants', 'registry.json');
  }

  /**
   * Ensure directory exists
   */
  private async ensureDir(): Promise<void> {
    await mkdir(join(this.config.baseDir, 'invariants'), { recursive: true });
  }

  /**
   * Load registry from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    try {
      const registryPath = this.getRegistryPath();
      const content = await readFile(registryPath, 'utf-8');
      const invariants: Invariant[] = JSON.parse(content);
      
      for (const invariant of invariants) {
        this.invariants.set(invariant.invariantId, invariant);
      }
    } catch {
      // Registry doesn't exist yet
    }

    this.loaded = true;
  }

  /**
   * Save registry to disk
   */
  async save(): Promise<void> {
    await this.ensureDir();
    const registryPath = this.getRegistryPath();
    const invariants = Array.from(this.invariants.values());
    await writeFile(registryPath, JSON.stringify(invariants, null, 2));
  }

  /**
   * Register a new invariant
   */
  async registerInvariant(invariant: Omit<Invariant, 'invariantId'>): Promise<Invariant> {
    await this.load();

    const timestamp = Date.now();
    const invariantId = deterministicId.generateConceptId(timestamp, invariant.name);
    
    const newInvariant: Invariant = {
      ...invariant,
      invariantId,
    };

    this.invariants.set(newInvariant.invariantId, newInvariant);
    await this.save();

    return newInvariant;
  }

  /**
   * Get an invariant by ID
   */
  getInvariant(invariantId: string): Invariant | undefined {
    return this.invariants.get(invariantId);
  }

  /**
   * Get invariants applicable to action classes
   */
  getInvariantsForActionClasses(actionClasses: string[]): Invariant[] {
    return Array.from(this.invariants.values()).filter(
      inv => inv.appliesTo.actionClasses.some(ac => actionClasses.includes(ac))
    );
  }

  /**
   * Get invariants applicable to concepts
   */
  getInvariantsForConcepts(concepts: string[]): Invariant[] {
    const lowerConcepts = concepts.map(c => c.toLowerCase());
    return Array.from(this.invariants.values()).filter(
      inv => inv.appliesTo.concepts.some(c => 
        lowerConcepts.includes(c.toLowerCase())
      )
    );
  }

  /**
   * Get all invariants
   */
  getAllInvariants(): Invariant[] {
    return Array.from(this.invariants.values());
  }

  /**
   * Remove an invariant
   */
  async removeInvariant(invariantId: string): Promise<boolean> {
    await this.load();
    const removed = this.invariants.delete(invariantId);
    if (removed) await this.save();
    return removed;
  }
}

/**
 * InvariantChecker - Checks plans against invariants
 */
export class InvariantChecker {
  private readonly registry: InvariantRegistry;

  constructor(registry: InvariantRegistry) {
    this.registry = registry;
  }

  /**
   * Check all invariants against a plan
   */
  async checkInvariants(input: InvariantCheckerInput): Promise<InvariantCheckResult[]> {
    await this.registry.load();

    // Get applicable invariants
    const actionClasses = [...new Set(input.steps.map(s => s.actionClass))];
    const invariants = [
      ...this.registry.getInvariantsForActionClasses(actionClasses),
      ...this.registry.getInvariantsForConcepts(input.concepts),
    ];

    // Remove duplicates
    const uniqueInvariants = [...new Map(invariants.map(i => [i.invariantId, i])).values()];

    const results: InvariantCheckResult[] = [];

    for (const invariant of uniqueInvariants) {
      const result = this.checkInvariant(invariant, input.steps);
      results.push(result);
    }

    return results;
  }

  /**
   * Check a single invariant
   */
  private checkInvariant(invariant: Invariant, steps: PlanStep[]): InvariantCheckResult {
    // Parse the rule
    const rule = invariant.rule;

    // Check based on rule type
    if (rule.includes('irreversible') && rule.includes('approval')) {
      return this.checkIrreversibleApproval(invariant, steps);
    }

    if (rule.includes('external_write') && rule.includes('justification')) {
      return this.checkExternalWriteJustification(invariant, steps);
    }

    if (rule.includes('tool') && rule.includes('assigned')) {
      return this.checkToolAssigned(invariant, steps);
    }

    if (rule.includes('order') && rule.includes('before')) {
      return this.checkStepOrder(invariant, steps);
    }

    if (rule.includes('no') && rule.includes('concurrent')) {
      return this.checkNoConcurrent(invariant, steps);
    }

    // Default: pass
    return {
      invariantId: invariant.invariantId,
      name: invariant.name,
      violated: false,
    };
  }

  /**
   * Check: No irreversible without approval
   */
  private checkIrreversibleApproval(
    invariant: Invariant,
    steps: PlanStep[]
  ): InvariantCheckResult {
    for (const step of steps) {
      if (step.actionClass === 'irreversible' && step.status !== 'awaiting_approval') {
        return {
          invariantId: invariant.invariantId,
          name: invariant.name,
          violated: true,
          reason: `Irreversible step "${step.intent}" does not have approval gate`,
          repairStrategy: this.getRepairStrategy(invariant, 'ask'),
        };
      }
    }

    return {
      invariantId: invariant.invariantId,
      name: invariant.name,
      violated: false,
    };
  }

  /**
   * Check: External write requires justification
   */
  private checkExternalWriteJustification(
    invariant: Invariant,
    steps: PlanStep[]
  ): InvariantCheckResult {
    for (const step of steps) {
      if (step.actionClass === 'external_write') {
        const hasJustification = 
          step.intent.toLowerCase().includes('because') ||
          step.intent.toLowerCase().includes('to') ||
          step.intent.toLowerCase().includes('for');

        if (!hasJustification) {
          return {
            invariantId: invariant.invariantId,
            name: invariant.name,
            violated: true,
            reason: `External write "${step.intent}" lacks clear justification`,
            repairStrategy: this.getRepairStrategy(invariant, 'ask'),
          };
        }
      }
    }

    return {
      invariantId: invariant.invariantId,
      name: invariant.name,
      violated: false,
    };
  }

  /**
   * Check: All local steps have tools assigned
   */
  private checkToolAssigned(
    invariant: Invariant,
    steps: PlanStep[]
  ): InvariantCheckResult {
    for (const step of steps) {
      if (step.actionClass === 'local_only' && !step.toolName) {
        return {
          invariantId: invariant.invariantId,
          name: invariant.name,
          violated: true,
          reason: `Local step "${step.intent}" has no tool assigned`,
          repairStrategy: this.getRepairStrategy(invariant, 'replan'),
        };
      }
    }

    return {
      invariantId: invariant.invariantId,
      name: invariant.name,
      violated: false,
    };
  }

  /**
   * Check: Step ordering constraints
   */
  private checkStepOrder(
    invariant: Invariant,
    steps: PlanStep[]
  ): InvariantCheckResult {
    // Parse rule for step order
    // Format: "step A must come before step B"
    const match = invariant.rule.match(/(\w+)\s+.*before\s+(\w+)/i);
    
    if (match) {
      const [, stepA, stepB] = match;
      const indexA = steps.findIndex(s => 
        s.intent.toLowerCase().includes(stepA.toLowerCase())
      );
      const indexB = steps.findIndex(s => 
        s.intent.toLowerCase().includes(stepB.toLowerCase())
      );

      if (indexA !== -1 && indexB !== -1 && indexA > indexB) {
        return {
          invariantId: invariant.invariantId,
          name: invariant.name,
          violated: true,
          reason: `Step order violated: ${stepA} must come before ${stepB}`,
          repairStrategy: this.getRepairStrategy(invariant, 'replan'),
        };
      }
    }

    return {
      invariantId: invariant.invariantId,
      name: invariant.name,
      violated: false,
    };
  }

  /**
   * Check: No concurrent operations
   */
  private checkNoConcurrent(
    invariant: Invariant,
    steps: PlanStep[]
  ): InvariantCheckResult {
    // Parse rule for operation type
    const match = invariant.rule.match(/no\s+concurrent\s+(\w+)/i);
    
    if (match) {
      const [, operationType] = match;
      const concurrent = steps.filter(s => 
        s.intent.toLowerCase().includes(operationType.toLowerCase()) &&
        s.status === 'allowed'
      );

      if (concurrent.length > 1) {
        return {
          invariantId: invariant.invariantId,
          name: invariant.name,
          violated: true,
          reason: `Multiple concurrent ${operationType} operations detected`,
          repairStrategy: this.getRepairStrategy(invariant, 'request_approval'),
        };
      }
    }

    return {
      invariantId: invariant.invariantId,
      name: invariant.name,
      violated: false,
    };
  }

  /**
   * Get repair strategy from invariant
   */
  private getRepairStrategy(
    invariant: Invariant,
    defaultType: 'ask' | 'replan' | 'request_approval'
  ): string {
    const strategy = invariant.repairStrategies.find(s => s.type === defaultType);
    return strategy?.template ?? `Repair needed: ${defaultType}`;
  }

  /**
   * Create INVARIANT_VIOLATION signal
   */
  createViolationSignal(
    result: InvariantCheckResult,
    sessionKey: SessionKey
  ): Omit<Signal, 'signalId'> {
    return {
      sessionKey,
      type: 'INVARIANT_VIOLATION',
      payload: {
        invariantId: result.invariantId,
        invariantName: result.name,
        reason: result.reason,
        repairStrategy: result.repairStrategy,
      },
      emittedAtMs: Date.now(),
      sourceLoop: 'InvariantChecker',
      priority: 'heartbeat',
    };
  }

  /**
   * Create REPAIR_PLAN_SUGGESTED signal
   */
  createRepairSignal(
    result: InvariantCheckResult,
    sessionKey: SessionKey
  ): Omit<Signal, 'signalId'> {
    return {
      sessionKey,
      type: 'SUGGEST_ALTERNATIVE_PLAN',
      payload: {
        reason: `Invariant violation: ${result.name}`,
        details: result.reason,
        repairStrategy: result.repairStrategy,
      },
      emittedAtMs: Date.now(),
      sourceLoop: 'InvariantChecker',
      priority: 'heartbeat',
    };
  }
}

/** Predefined common invariants */
export const CommonInvariants = {
  IrreversibleRequiresApproval: {
    name: 'No irreversible without approval',
    rule: 'irreversible action requires approval',
    appliesTo: {
      actionClasses: ['irreversible'],
      concepts: [],
    },
    repairStrategies: [
      { type: 'request_approval' as const, template: 'This action is irreversible. Please confirm before proceeding.' },
    ],
  },

  ExternalWriteJustification: {
    name: 'External write requires justification',
    rule: 'external_write action requires clear justification',
    appliesTo: {
      actionClasses: ['external_write'],
      concepts: [],
    },
    repairStrategies: [
      { type: 'ask' as const, template: 'Please explain why this external write is necessary.' },
    ],
  },

  ToolMustBeAssigned: {
    name: 'All local actions must have tools assigned',
    rule: 'local_only action must have tool assigned',
    appliesTo: {
      actionClasses: ['local_only'],
      concepts: [],
    },
    repairStrategies: [
      { type: 'replan' as const, template: 'Replanning needed: assign appropriate tool to each action.' },
    ],
  },

  NoConcurrentDeletes: {
    name: 'No concurrent delete operations',
    rule: 'no concurrent delete operations',
    appliesTo: {
      actionClasses: ['irreversible'],
      concepts: ['file_operation'],
    },
    repairStrategies: [
      { type: 'request_approval' as const, template: 'Multiple delete operations detected. Please review carefully.' },
    ],
  },
};
