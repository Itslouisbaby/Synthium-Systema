/**
 * Perception-Action Loop
 * 
 * The core of sensorimotor grounding:
 * 1. Perceive environment through sensors
 * 2. Build internal representation
 * 3. Decide on action
 * 4. Execute through actuators
 * 5. Observe result
 * 6. Learn from feedback
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Sensor, SensorReading, Perception } from './sensor-interface.js';
import type { Actuator, Action, ActionResult } from './actuator-interface.js';
import type { RepresentationBuilder, Representation } from '../perception/index.js';
import type { ScaledEmbeddingNetwork, ScaledExperience } from '../neural-learning/index.js';

/** Perception-Action cycle record */
export interface PACycle {
  readonly cycleId: string;
  readonly timestampMs: number;
  readonly perception: Perception;
  readonly representation?: Representation;
  readonly decision: Decision;
  readonly action: Action;
  readonly result: ActionResult;
  readonly feedback: Feedback;
}

/** Decision made based on perception */
export interface Decision {
  readonly decisionId: string;
  readonly basedOnPerception: string;
  readonly actionType: string;
  readonly confidence: number;
  readonly reasoning: string;
  readonly alternativesConsidered: string[];
}

/** Feedback from action execution */
export interface Feedback {
  readonly expectedOutcome: unknown;
  readonly actualOutcome: unknown;
  readonly match: boolean;
  readonly surprise: number; // 0-1
  readonly reward: number; // -1 to 1
  readonly learnable: boolean;
}

/** Learned affordance - what actions are possible in what situations */
export interface LearnedAffordance {
  readonly affordanceId: string;
  readonly situationPattern: string;
  readonly actionType: string;
  readonly successRate: number;
  readonly avgReward: number;
  readonly executionCount: number;
  readonly lastExecuted: number;
}

/** Configuration for PA loop */
export interface PALoopConfig {
  readonly baseDir: string;
  readonly cycleIntervalMs: number;
  readonly maxCyclesPerSession: number;
  readonly learningEnabled: boolean;
  readonly explorationRate: number;
}

/**
 * Perception-Action Loop
 * 
 * Implements the core sensorimotor cycle with learning.
 */
export class PerceptionActionLoop {
  private config: Required<PALoopConfig>;
  private sensors: Map<string, Sensor> = new Map();
  private actuators: Map<string, Actuator> = new Map();
  private representationBuilder?: RepresentationBuilder;
  private learningNetwork?: ScaledEmbeddingNetwork;
  
  private cycles: PACycle[] = [];
  private affordances: Map<string, LearnedAffordance> = new Map();
  private running = false;
  private cycleInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(
    config: Partial<PALoopConfig> = {}
  ) {
    this.config = {
      baseDir: config.baseDir ?? '.synth/v2/sensorimotor',
      cycleIntervalMs: config.cycleIntervalMs ?? 100,
      maxCyclesPerSession: config.maxCyclesPerSession ?? 1000,
      learningEnabled: config.learningEnabled ?? true,
      explorationRate: config.explorationRate ?? 0.1,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await mkdir(this.config.baseDir, { recursive: true });
    await this.loadState();
    
    // Initialize all sensors and actuators
    await Promise.all([
      ...Array.from(this.sensors.values()).map(s => s.initialize()),
      ...Array.from(this.actuators.values()).map(a => a.initialize()),
    ]);
    
    this.initialized = true;
  }

  /**
   * Register a sensor
   */
  registerSensor(sensor: Sensor): void {
    this.sensors.set(sensor.config.sensorId, sensor);
  }

  /**
   * Register an actuator
   */
  registerActuator(actuator: Actuator): void {
    this.actuators.set(actuator.config.actuatorId, actuator);
  }

  /**
   * Set representation builder
   */
  setRepresentationBuilder(builder: RepresentationBuilder): void {
    this.representationBuilder = builder;
  }

  /**
   * Set learning network
   */
  setLearningNetwork(network: ScaledEmbeddingNetwork): void {
    this.learningNetwork = network;
  }

  /**
   * Start the perception-action loop
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    
    console.log('[PALoop] Starting perception-action loop...');
    
    this.cycleInterval = setInterval(() => {
      this.runCycle().catch(error => {
        console.error('[PALoop] Cycle error:', error);
      });
    }, this.config.cycleIntervalMs);
  }

  /**
   * Stop the loop
   */
  stop(): void {
    this.running = false;
    if (this.cycleInterval) {
      clearInterval(this.cycleInterval);
      this.cycleInterval = null;
    }
    console.log('[PALoop] Stopped');
  }

  /**
   * Run a single perception-action cycle
   */
  async runCycle(): Promise<PACycle | null> {
    if (!this.running) return null;
    if (this.cycles.length >= this.config.maxCyclesPerSession) {
      console.log('[PALoop] Max cycles reached, stopping');
      this.stop();
      return null;
    }

    // 1. PERCEIVE - Read from all available sensors
    const perceptions = await this.perceive();
    if (perceptions.length === 0) {
      return null; // Nothing to perceive
    }

    // Use the most salient perception
    const perception = perceptions.sort((a, b) => b.salience - a.salience)[0];

    // 2. REPRESENT - Build rich representation
    let representation: Representation | undefined;
    if (this.representationBuilder && typeof perception.content === 'string') {
      representation = await this.representationBuilder.buildRepresentation(
        perception.content
      );
    }

    // 3. DECIDE - Choose action based on perception
    const decision = await this.decide(perception, representation);

    // 4. ACT - Execute action
    const action = await this.createAction(decision);
    const result = await this.executeAction(action);

    // 5. FEEDBACK - Compare expected vs actual
    const feedback = this.computeFeedback(decision, result);

    // 6. LEARN - Update from experience
    if (this.config.learningEnabled && this.learningNetwork) {
      await this.learnFromCycle(perception, action, result, feedback);
    }

    // 7. RECORD - Store cycle
    const cycle: PACycle = {
      cycleId: `cycle-${Date.now()}`,
      timestampMs: Date.now(),
      perception,
      representation,
      decision,
      action,
      result,
      feedback,
    };

    this.cycles.push(cycle);
    await this.updateAffordances(cycle);
    await this.saveState();

    return cycle;
  }

  /**
   * Perceive through all sensors
   */
  private async perceive(): Promise<Perception[]> {
    const perceptions: Perception[] = [];

    for (const sensor of this.sensors.values()) {
      if (!sensor.isAvailable()) continue;

      try {
        const reading = await sensor.read();
        if (this.hasContent(reading)) {
          const perception = await sensor.process(reading);
          if (perception.confidence > 0.5) {
            perceptions.push(perception);
          }
        }
      } catch (error) {
        console.error(`[PALoop] Sensor ${sensor.config.sensorId} error:`, error);
      }
    }

    return perceptions;
  }

  /**
   * Decide on action based on perception
   */
  private async decide(
    perception: Perception,
    representation?: Representation
  ): Promise<Decision> {
    // Extract situation pattern
    const situationPattern = this.extractSituationPattern(perception, representation);

    // Find learned affordances for this situation
    const applicableAffordances = this.findApplicableAffordances(situationPattern);

    // Decide: exploit known good actions or explore
    let chosenActionType: string;
    let confidence: number;
    let reasoning: string;

    if (applicableAffordances.length > 0 && Math.random() > this.config.explorationRate) {
      // Exploit: choose best known action
      const best = applicableAffordances.sort((a, b) => b.avgReward - a.avgReward)[0];
      chosenActionType = best.actionType;
      confidence = best.successRate;
      reasoning = `Exploiting known affordance with ${(best.successRate * 100).toFixed(0)}% success rate`;
    } else {
      // Explore: try random available action
      const availableActions = this.getAvailableActionTypes();
      chosenActionType = availableActions[Math.floor(Math.random() * availableActions.length)];
      confidence = 0.3;
      reasoning = 'Exploring: trying random action';
    }

    return {
      decisionId: `dec-${Date.now()}`,
      basedOnPerception: perception.perceptionId,
      actionType: chosenActionType,
      confidence,
      reasoning,
      alternativesConsidered: applicableAffordances.map(a => a.actionType),
    };
  }

  /**
   * Create action from decision
   */
  private async createAction(decision: Decision): Promise<Action> {
    // Build parameters based on action type
    const parameters = this.buildActionParameters(decision);

    return {
      actionId: `act-${Date.now()}`,
      actionType: decision.actionType,
      parameters,
      expectedOutcome: { success: true },
    };
  }

  /**
   * Execute action through appropriate actuator
   */
  private async executeAction(action: Action): Promise<ActionResult> {
    // Find actuator for this action type
    const actuator = this.findActuatorForAction(action.actionType);
    
    if (!actuator) {
      return {
        actionId: action.actionId,
        success: false,
        outcome: { error: `No actuator for action type: ${action.actionType}` },
        durationMs: 0,
        timestampMs: Date.now(),
      };
    }

    // Validate before execute
    if (actuator.config.validateBeforeExecute) {
      const validation = await actuator.validate(action);
      if (!validation.valid) {
        return {
          actionId: action.actionId,
          success: false,
          outcome: { error: `Validation failed: ${validation.reason}` },
          durationMs: 0,
          timestampMs: Date.now(),
        };
      }
    }

    // Execute
    return actuator.execute(action);
  }

  /**
   * Compute feedback from result
   */
  private computeFeedback(decision: Decision, result: ActionResult): Feedback {
    const expected = decision.confidence > 0.5;
    const actual = result.success;
    const match = expected === actual;
    
    // Surprise: how unexpected was the outcome?
    const surprise = match ? 0 : 0.5 + Math.abs(decision.confidence - 0.5);
    
    // Reward: positive for success, negative for failure
    const reward = result.success ? 1 : -1;

    return {
      expectedOutcome: { success: expected },
      actualOutcome: { success: actual, result: result.outcome },
      match,
      surprise,
      reward,
      learnable: surprise > 0.1,
    };
  }

  /**
   * Learn from the cycle
   */
  private async learnFromCycle(
    perception: Perception,
    action: Action,
    result: ActionResult,
    feedback: Feedback
  ): Promise<void> {
    if (!this.learningNetwork) return;

    const experience: ScaledExperience = {
      experienceId: `exp-${Date.now()}`,
      timestampMs: Date.now(),
      input: typeof perception.content === 'string' 
        ? perception.content 
        : JSON.stringify(perception.content),
      context: {
        actionType: action.actionType,
        perceptionId: perception.perceptionId,
      },
      action: action.actionType,
      outcome: {
        success: result.success,
        result: result.outcome,
        reward: feedback.reward,
      },
      metadata: {
        source: 'sensorimotor',
        importance: feedback.surprise,
        tags: [action.actionType, result.success ? 'success' : 'failure'],
      },
    };

    await this.learningNetwork.learn(experience);
  }

  /**
   * Update affordances based on cycle
   */
  private async updateAffordances(cycle: PACycle): Promise<void> {
    const situationPattern = this.extractSituationPattern(
      cycle.perception,
      cycle.representation
    );
    const affordanceId = `${situationPattern}::${cycle.action.actionType}`;
    
    const existing = this.affordances.get(affordanceId);
    
    if (existing) {
      // Update with exponential moving average
      const alpha = 0.2;
      const newSuccessRate = existing.successRate * (1 - alpha) + 
        (cycle.result.success ? 1 : 0) * alpha;
      const newAvgReward = existing.avgReward * (1 - alpha) + 
        cycle.feedback.reward * alpha;
      
      this.affordances.set(affordanceId, {
        ...existing,
        successRate: newSuccessRate,
        avgReward: newAvgReward,
        executionCount: existing.executionCount + 1,
        lastExecuted: Date.now(),
      });
    } else {
      // Create new affordance
      this.affordances.set(affordanceId, {
        affordanceId,
        situationPattern,
        actionType: cycle.action.actionType,
        successRate: cycle.result.success ? 1 : 0,
        avgReward: cycle.feedback.reward,
        executionCount: 1,
        lastExecuted: Date.now(),
      });
    }
  }

  /**
   * Get learned affordances
   */
  getAffordances(options?: {
    minSuccessRate?: number;
    actionType?: string;
  }): LearnedAffordance[] {
    let affordances = Array.from(this.affordances.values());

    if (options?.minSuccessRate !== undefined) {
      affordances = affordances.filter(a => a.successRate >= options.minSuccessRate!);
    }
    if (options?.actionType) {
      affordances = affordances.filter(a => a.actionType === options.actionType);
    }

    return affordances.sort((a, b) => b.avgReward - a.avgReward);
  }

  /**
   * Get cycle history
   */
  getCycles(options?: {
    since?: number;
    actionType?: string;
    success?: boolean;
  }): PACycle[] {
    let cycles = [...this.cycles];

    if (options?.since) {
      cycles = cycles.filter(c => c.timestampMs >= options.since!);
    }
    if (options?.actionType) {
      cycles = cycles.filter(c => c.action.actionType === options.actionType);
    }
    if (options?.success !== undefined) {
      cycles = cycles.filter(c => c.result.success === options.success);
    }

    return cycles;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalCycles: number;
    successRate: number;
    affordanceCount: number;
    sensorCount: number;
    actuatorCount: number;
    avgCycleTimeMs: number;
  } {
    const totalCycles = this.cycles.length;
    const successfulCycles = this.cycles.filter(c => c.result.success).length;
    const successRate = totalCycles > 0 ? successfulCycles / totalCycles : 0;
    
    const avgCycleTime = totalCycles > 0
      ? this.cycles.reduce((sum, c) => sum + c.result.durationMs, 0) / totalCycles
      : 0;

    return {
      totalCycles,
      successRate,
      affordanceCount: this.affordances.size,
      sensorCount: this.sensors.size,
      actuatorCount: this.actuators.size,
      avgCycleTimeMs: avgCycleTime,
    };
  }

  // Private helper methods

  private hasContent(reading: SensorReading): boolean {
    if (reading.rawData === null || reading.rawData === undefined) return false;
    if (typeof reading.rawData === 'string' && reading.rawData.length === 0) return false;
    if (typeof reading.rawData === 'object' && Object.keys(reading.rawData).length === 0) return false;
    return true;
  }

  private extractSituationPattern(
    perception: Perception,
    representation?: Representation
  ): string {
    if (representation) {
      // Use representation entities for pattern
      const entityTypes = representation.entities.map(e => e.type).sort();
      return entityTypes.join('|');
    }
    
    // Fallback: use content type
    const content = perception.content;
    if (typeof content === 'string') {
      return `text:${content.slice(0, 20)}`;
    }
    return `unknown:${typeof content}`;
  }

  private findApplicableAffordances(situationPattern: string): LearnedAffordance[] {
    return Array.from(this.affordances.values())
      .filter(a => a.situationPattern === situationPattern)
      .sort((a, b) => b.avgReward - a.avgReward);
  }

  private getAvailableActionTypes(): string[] {
    return Array.from(this.actuators.values())
      .filter(a => a.isAvailable())
      .map(a => a.config.actuatorType);
  }

  private findActuatorForAction(actionType: string): Actuator | undefined {
    // Direct match
    const direct = this.actuators.get(actionType);
    if (direct) return direct;

    // Find by type
    for (const actuator of this.actuators.values()) {
      if (actuator.config.actuatorType === actionType) {
        return actuator;
      }
    }

    return undefined;
  }

  private buildActionParameters(decision: Decision): Record<string, unknown> {
    // Default parameters based on action type
    switch (decision.actionType) {
      case 'text_output':
        return { content: 'Processing...' };
      case 'api_call':
        return { endpoint: '/api/execute', params: {} };
      case 'file_operation':
        return { operation: 'read', path: '/tmp/test.txt' };
      default:
        return {};
    }
  }

  private async saveState(): Promise<void> {
    const state = {
      affordances: Array.from(this.affordances.entries()),
      cycleCount: this.cycles.length,
    };
    await writeFile(
      join(this.config.baseDir, 'pa-loop-state.json'),
      JSON.stringify(state, null, 2)
    );
  }

  private async loadState(): Promise<void> {
    try {
      const data = await readFile(join(this.config.baseDir, 'pa-loop-state.json'), 'utf-8');
      const state = JSON.parse(data);
      this.affordances = new Map(state.affordances);
    } catch {
      // No state to load
    }
  }
}
