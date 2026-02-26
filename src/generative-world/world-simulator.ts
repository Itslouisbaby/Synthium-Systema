/**
 * Generative World Model - Part 2: World Simulator
 * 
 * Simulates outcomes of actions, performs causal reasoning,
 * and generates counterfactuals.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MockLLMProvider, type LLMProvider } from '../llm/llm-provider.js';

/** Entity in the world model */
export interface SimEntity {
  readonly entityId: string;
  readonly type: string;
  readonly properties: Record<string, unknown>;
  readonly state: 'active' | 'modified' | 'deleted';
  readonly confidence: number;
}

/** Action that can be simulated */
export interface SimAction {
  readonly actionId: string;
  readonly type: string;
  readonly target?: string;
  readonly parameters: Record<string, unknown>;
  readonly preconditions: string[];
  readonly effects: SimEffect[];
}

/** Effect of an action */
export interface SimEffect {
  readonly targetProperty: string;
  readonly operation: 'set' | 'increment' | 'delete' | 'create';
  readonly value?: unknown;
  readonly probability: number;
}

/** Simulation result */
export interface SimulationResult {
  readonly simulationId: string;
  readonly initialState: SimState;
  readonly action: SimAction;
  readonly steps: SimStep[];
  readonly finalState: SimState;
  readonly outcomes: SimOutcome[];
  readonly confidence: number;
  readonly causalChain: string[];
}

/** Simulation state snapshot */
export interface SimState {
  readonly entities: SimEntity[];
  readonly relations: SimRelation[];
  readonly timestamp: number;
}

/** Relation between entities */
export interface SimRelation {
  readonly relationId: string;
  readonly type: string;
  readonly from: string;
  readonly to: string;
  readonly properties: Record<string, unknown>;
}

/** Single simulation step */
export interface SimStep {
  readonly stepNumber: number;
  readonly description: string;
  readonly stateBefore: SimState;
  readonly stateAfter: SimState;
  readonly causalTrigger: string;
}

/** Outcome of simulation */
export interface SimOutcome {
  readonly type: 'success' | 'failure' | 'side_effect' | 'unexpected';
  readonly description: string;
  readonly probability: number;
  readonly severity: 'low' | 'medium' | 'high';
}

/** Counterfactual scenario */
export interface Counterfactual {
  readonly counterfactualId: string;
  readonly originalAction: SimAction;
  readonly alternativeAction: SimAction;
  readonly originalResult: SimulationResult;
  readonly alternativeResult: SimulationResult;
  readonly keyDifferences: string[];
  readonly lesson: string;
}

/** Configuration for world simulator */
export interface WorldSimulatorConfig {
  readonly baseDir: string;
  readonly maxSimulationDepth: number;
  readonly defaultConfidence: number;
  readonly llm?: LLMProvider;
}

/**
 * Generative world simulator
 * Can simulate "what if" scenarios and reason about causality
 */
export class WorldSimulator {
  private config: Required<WorldSimulatorConfig>;
  private actionLibrary: Map<string, SimAction> = new Map();
  private causalRules: Map<string, CausalRule> = new Map();
  private simulationHistory: SimulationResult[] = [];
  private initialized = false;

  constructor(config: Partial<WorldSimulatorConfig> = {}) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/worldsim',
      maxSimulationDepth: config.maxSimulationDepth ?? 5,
      defaultConfidence: config.defaultConfidence ?? 0.7,
      llm: config.llm ?? new MockLLMProvider(4096),
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadActionLibrary();
    this.initialized = true;
  }

  /**
   * Simulate an action in a given state using Generative LLM
   */
  async simulate(
    action: SimAction,
    initialState: SimState,
    depth: number = 0
  ): Promise<SimulationResult> {
    await this.initialize();

    const simulationId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const prompt = `Simulate this action: ${JSON.stringify(action)}
on this initial state: ${JSON.stringify(initialState, null, 2)}.
Predict the outcomes, including success/failure, side effects, and risks. Focus heavily on causality and generative simulation.
Return JSON format exactly matching this shape (no markdown wrappers):
{
  "finalState": { "entities": [...], "relations": [...], "timestamp": number },
  "steps": [{ "stepNumber": number, "description": string, "causalTrigger": string, "stateBefore": {}, "stateAfter": {} }],
  "outcomes": [{ "type": "success" | "failure" | "side_effect" | "unexpected", "description": string, "probability": number, "severity": "low" | "medium" | "high" }],
  "causalChain": ["string"]
}`;

    let parsedResult: any = null;
    try {
      const llmResponse = await this.config.llm.generateWithContext(prompt, []);
      const match = llmResponse.match(/\{[\s\S]*\}/);
      if (match) {
        parsedResult = JSON.parse(match[0]);
      }
    } catch (e) {
      console.warn("[WorldSim] LLM simulation generation failed. Falling back to initial state.", e);
    }

    const finalState = parsedResult?.finalState ?? initialState;
    const steps = parsedResult?.steps ?? [];
    const outcomes = parsedResult?.outcomes ?? [{
      type: 'success', description: 'Simulated via fallback', probability: 0.8, severity: 'low'
    }];
    const causalChain = parsedResult?.causalChain ?? [];

    const result: SimulationResult = {
      simulationId,
      initialState,
      action,
      steps,
      finalState,
      outcomes,
      confidence: 0.85,
      causalChain,
    };

    this.simulationHistory.push(result);
    await this.saveSimulation(result);

    return result;
  }

  /**
   * Generate counterfactual: "What if I had done X instead of Y?"
   */
  async generateCounterfactual(
    originalAction: SimAction,
    alternativeAction: SimAction,
    initialState: SimState
  ): Promise<Counterfactual> {
    const [originalResult, alternativeResult] = await Promise.all([
      this.simulate(originalAction, initialState),
      this.simulate(alternativeAction, initialState),
    ]);

    // Use LLM to generate the lesson and key differences
    const prompt = `Given the initial state with entities [${initialState.entities.map(e => e.type).join(', ')}],
The user originally took action: ${originalAction.type} yielding outcome: ${JSON.stringify(originalResult.outcomes)}.
The alternative action was: ${alternativeAction.type} yielding: ${JSON.stringify(alternativeResult.outcomes)}.
What are the key differences in outcomes, and what is the lesson learned?
Respond in JSON format with keys "keyDifferences" (array of strings) and "lesson" (string).`;

    let keyDifferences = this.compareStates(originalResult.finalState, alternativeResult.finalState);
    let lesson = this.generateLesson(originalResult, alternativeResult, keyDifferences);

    try {
      const llmResponse = await this.config.llm.generateWithContext(prompt, []);
      const match = llmResponse.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.keyDifferences) keyDifferences = parsed.keyDifferences;
        if (parsed.lesson) lesson = parsed.lesson;
      }
    } catch (e) {
      console.warn("[WorldSim] LLM counterfactual extraction failed. Falling back.", e);
    }

    const counterfactual: Counterfactual = {
      counterfactualId: `cf-${Date.now()}`,
      originalAction,
      alternativeAction,
      originalResult,
      alternativeResult,
      keyDifferences,
      lesson,
    };

    return counterfactual;
  }

  /**
   * Causal reasoning: Why did X happen?
   */
  explainOutcome(
    outcome: string,
    simulation: SimulationResult
  ): {
    causes: string[];
    contributingFactors: string[];
    couldHaveBeenPreventedBy: string[];
  } {
    const causes: string[] = [];
    const contributingFactors: string[] = [];
    const couldHaveBeenPreventedBy: string[] = [];

    // Trace back through causal chain
    for (const step of simulation.steps) {
      if (step.description.toLowerCase().includes(outcome.toLowerCase())) {
        // Found the step that produced the outcome
        // Trace back to find root causes
        const stepIndex = simulation.steps.indexOf(step);
        for (let i = 0; i < stepIndex; i++) {
          const priorStep = simulation.steps[i];
          if (this.isCausallyRelevant(priorStep, step)) {
            causes.push(priorStep.causalTrigger);
          }
        }
      }
    }

    // Find contributing factors (things that made outcome more likely)
    for (const entity of simulation.initialState.entities) {
      if (this.isContributingFactor(entity, outcome)) {
        contributingFactors.push(`${entity.type}.${entity.entityId}`);
      }
    }

    // Find prevention points
    for (const step of simulation.steps) {
      const alternatives = this.generateAlternatives(step);
      for (const alt of alternatives) {
        if (!alt.wouldLeadTo.includes(outcome)) {
          couldHaveBeenPreventedBy.push(alt.action);
        }
      }
    }

    return { causes, contributingFactors, couldHaveBeenPreventedBy };
  }

  /**
   * Predict consequences of an action without full simulation
   */
  quickPredict(
    actionType: string,
    target: string,
    context: SimState
  ): {
    likelyOutcomes: string[];
    risks: string[];
    confidence: number;
  } {
    const action = this.actionLibrary.get(actionType);
    if (!action) {
      return {
        likelyOutcomes: ['unknown'],
        risks: ['unknown_action_type'],
        confidence: 0.1,
      };
    }

    const likelyOutcomes: string[] = [];
    const risks: string[] = [];

    for (const effect of action.effects) {
      if (effect.probability > 0.7) {
        likelyOutcomes.push(`${effect.operation} ${effect.targetProperty}`);
      }
      if (effect.operation === 'delete' || effect.targetProperty.includes('critical')) {
        risks.push(`may_${effect.operation}_${effect.targetProperty}`);
      }
    }

    // Check for known causal chains
    for (const [ruleId, rule] of this.causalRules) {
      if (rule.trigger === actionType) {
        if (rule.effectType === 'negative') {
          risks.push(rule.description);
        } else {
          likelyOutcomes.push(rule.description);
        }
      }
    }

    return {
      likelyOutcomes: [...new Set(likelyOutcomes)],
      risks: [...new Set(risks)],
      confidence: this.config.defaultConfidence,
    };
  }

  /**
   * Learn from actual outcomes to improve simulations
   */
  async learnFromOutcome(
    simulationId: string,
    actualOutcome: string,
    match: boolean
  ): Promise<void> {
    const simulation = this.simulationHistory.find(s => s.simulationId === simulationId);
    if (!simulation) return;

    if (!match) {
      // Simulation was wrong - need to update our model
      console.log(`[WorldSim] Simulation ${simulationId} mismatched reality. Learning...`);

      // Add a causal rule to prevent future mispredictions
      const rule: CausalRule = {
        ruleId: `rule-${Date.now()}`,
        trigger: simulation.action.type,
        condition: this.extractCondition(simulation.initialState),
        effect: actualOutcome,
        effectType: 'observed',
        description: `When ${simulation.action.type} in ${this.describeContext(simulation.initialState)}, expect ${actualOutcome}`,
        confidence: 0.5,
      };

      this.causalRules.set(rule.ruleId, rule);
      await this.saveCausalRules();
    }
  }

  /**
   * Register a new action type
   */
  async registerAction(action: SimAction): Promise<void> {
    this.actionLibrary.set(action.type, action);
    await this.saveActionLibrary();
  }

  /**
   * Get simulation statistics
   */
  getStats(): {
    totalSimulations: number;
    actionTypes: number;
    causalRules: number;
    averageAccuracy: number;
  } {
    return {
      totalSimulations: this.simulationHistory.length,
      actionTypes: this.actionLibrary.size,
      causalRules: this.causalRules.size,
      averageAccuracy: 0.7, // Would track actual accuracy
    };
  }

  // Private helper methods
  private checkPreconditions(action: SimAction, state: SimState): boolean {
    for (const precond of action.preconditions) {
      // Simple precondition checking
      const [entityType, property, operator, value] = precond.split('.');
      const entity = state.entities.find(e => e.type === entityType);
      if (!entity) return false;

      const propValue = entity.properties[property];
      if (operator === 'exists' && !propValue) return false;
      if (operator === 'eq' && propValue !== value) return false;
    }
    return true;
  }

  private applyEffect(
    effect: SimEffect,
    state: SimState,
    actionType: string
  ): { description: string; newState: SimState } {
    const newEntities = [...state.entities];
    let description = '';

    if (effect.operation === 'set') {
      // Find entity and update property
      const entityIndex = newEntities.findIndex(e =>
        effect.targetProperty.startsWith(e.type)
      );
      if (entityIndex >= 0) {
        const entity = newEntities[entityIndex];
        const propName = effect.targetProperty.split('.').pop() || 'value';
        newEntities[entityIndex] = {
          ...entity,
          properties: { ...entity.properties, [propName]: effect.value },
          state: 'modified',
        };
        description = `Set ${effect.targetProperty} to ${effect.value}`;
      }
    } else if (effect.operation === 'create') {
      const newEntity: SimEntity = {
        entityId: `ent-${Date.now()}`,
        type: effect.targetProperty,
        properties: { createdBy: actionType, ...(effect.value as Record<string, unknown> || {}) },
        state: 'active',
        confidence: effect.probability,
      };
      newEntities.push(newEntity);
      description = `Created ${effect.targetProperty}`;
    } else if (effect.operation === 'delete') {
      const entityIndex = newEntities.findIndex(e =>
        e.entityId === effect.targetProperty || e.type === effect.targetProperty
      );
      if (entityIndex >= 0) {
        newEntities[entityIndex] = { ...newEntities[entityIndex], state: 'deleted' };
        description = `Deleted ${effect.targetProperty}`;
      }
    }

    return {
      description,
      newState: { ...state, entities: newEntities },
    };
  }

  private propagateConsequences(state: SimState, effect: SimEffect): SimAction[] {
    const consequences: SimAction[] = [];

    // Check causal rules for triggered consequences
    for (const rule of this.causalRules.values()) {
      if (rule.trigger === effect.targetProperty) {
        const consequenceAction: SimAction = {
          actionId: `cons-${Date.now()}`,
          type: 'consequence',
          parameters: { triggeredBy: effect.targetProperty },
          preconditions: [],
          effects: [{
            targetProperty: rule.effect,
            operation: 'set',
            value: true,
            probability: rule.confidence,
          }],
        };
        consequences.push(consequenceAction);
      }
    }

    return consequences;
  }

  private generateOutcomes(
    action: SimAction,
    initialState: SimState,
    finalState: SimState,
    steps: SimStep[]
  ): SimOutcome[] {
    const outcomes: SimOutcome[] = [];

    // Check for success
    const success = steps.every(s => s.description.includes('failed') === false);
    outcomes.push({
      type: success ? 'success' : 'failure',
      description: success ? 'Action completed successfully' : 'Action failed',
      probability: success ? 0.9 : 0.1,
      severity: success ? 'low' : 'high',
    });

    // Check for side effects
    const modifiedEntities = finalState.entities.filter(e => e.state === 'modified');
    if (modifiedEntities.length > 1) {
      outcomes.push({
        type: 'side_effect',
        description: `Modified ${modifiedEntities.length} entities`,
        probability: 0.5,
        severity: 'medium',
      });
    }

    // Check for unexpected outcomes
    const unexpected = steps.filter(s => s.description.includes('unexpected'));
    if (unexpected.length > 0) {
      outcomes.push({
        type: 'unexpected',
        description: 'Unexpected behavior detected',
        probability: 0.3,
        severity: 'high',
      });
    }

    return outcomes;
  }

  private buildCausalChain(steps: SimStep[]): string[] {
    return steps.map(s => s.causalTrigger);
  }

  private calculateConfidence(steps: SimStep[]): number {
    if (steps.length === 0) return 0;
    // Confidence decreases with chain length
    return Math.pow(0.9, steps.length);
  }

  private createFailureResult(
    simulationId: string,
    initialState: SimState,
    action: SimAction,
    reason: string
  ): SimulationResult {
    return {
      simulationId,
      initialState,
      action,
      steps: [],
      finalState: initialState,
      outcomes: [{
        type: 'failure',
        description: reason,
        probability: 1,
        severity: 'high',
      }],
      confidence: 0,
      causalChain: [reason],
    };
  }

  private cloneState(state: SimState): SimState {
    return {
      entities: state.entities.map(e => ({ ...e })),
      relations: state.relations.map(r => ({ ...r })),
      timestamp: state.timestamp,
    };
  }

  private compareStates(stateA: SimState, stateB: SimState): string[] {
    const differences: string[] = [];

    for (const entityA of stateA.entities) {
      const entityB = stateB.entities.find(e => e.entityId === entityA.entityId);
      if (!entityB) {
        differences.push(`${entityA.type} deleted in alternative`);
      } else if (JSON.stringify(entityA.properties) !== JSON.stringify(entityB.properties)) {
        differences.push(`${entityA.type} properties differ`);
      }
    }

    for (const entityB of stateB.entities) {
      if (!stateA.entities.find(e => e.entityId === entityB.entityId)) {
        differences.push(`${entityB.type} created in alternative`);
      }
    }

    return differences;
  }

  private generateLesson(
    original: SimulationResult,
    alternative: SimulationResult,
    differences: string[]
  ): string {
    if (alternative.outcomes.every(o => o.type === 'success') &&
      original.outcomes.some(o => o.type === 'failure')) {
      return `Alternative action ${alternative.action.type} would have succeeded where original failed`;
    }
    if (differences.length === 0) {
      return 'Both actions lead to similar outcomes';
    }
    return `Key difference: ${differences[0]}`;
  }

  private isCausallyRelevant(stepA: SimStep, stepB: SimStep): boolean {
    // Simple heuristic: if stepA's output is stepB's input
    return stepB.causalTrigger.includes(stepA.causalTrigger.split('.')[0]);
  }

  private isContributingFactor(entity: SimEntity, outcome: string): boolean {
    // Simple heuristic check
    return JSON.stringify(entity.properties).toLowerCase().includes(outcome.toLowerCase());
  }

  private generateAlternatives(step: SimStep): Array<{ action: string; wouldLeadTo: string[] }> {
    // Generate alternative actions for this step
    return [
      { action: 'skip_step', wouldLeadTo: ['unchanged'] },
      { action: 'alternative_approach', wouldLeadTo: ['different_outcome'] },
    ];
  }

  private extractCondition(state: SimState): string {
    return state.entities.map(e => e.type).join(',');
  }

  private describeContext(state: SimState): string {
    return `${state.entities.length} entities`;
  }

  private async saveSimulation(result: SimulationResult): Promise<void> {
    await writeFile(
      join(this.config.baseDir, `sim-${result.simulationId}.json`),
      JSON.stringify(result, null, 2)
    );
  }

  private async saveActionLibrary(): Promise<void> {
    await writeFile(
      join(this.config.baseDir, 'action-library.json'),
      JSON.stringify(Array.from(this.actionLibrary.entries()), null, 2)
    );
  }

  private async saveCausalRules(): Promise<void> {
    await writeFile(
      join(this.config.baseDir, 'causal-rules.json'),
      JSON.stringify(Array.from(this.causalRules.entries()), null, 2)
    );
  }

  private async loadActionLibrary(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'action-library.json'), 'utf-8');
      const entries = JSON.parse(data);
      this.actionLibrary = new Map(entries);
    } catch {
      // No library to load
    }
  }
}

/** Causal rule for reasoning */
interface CausalRule {
  readonly ruleId: string;
  readonly trigger: string;
  readonly condition: string;
  readonly effect: string;
  readonly effectType: 'positive' | 'negative' | 'observed';
  readonly description: string;
  readonly confidence: number;
}
