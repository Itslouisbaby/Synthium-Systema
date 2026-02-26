/**
 * Predictions - Make world model testable
 * Section 9.2: Expected outcomes and mismatch detection
 */

import type { 
  Prediction, 
  Signal, 
  SessionKey,
  TimestampMs 
} from '../types.js';
import { deterministicId } from '../runtime/deterministic-id.js';

/** Predictions configuration */
export interface PredictionsConfig {
  /** Minimum confidence threshold for predictions */
  readonly minConfidence?: number;
  /** Whether to auto-detect mismatches */
  readonly autoDetectMismatches?: boolean;
}

/** Prediction check result */
export interface PredictionCheck {
  readonly predictionId: string;
  readonly stepId: string;
  readonly matched: boolean;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly mismatches: string[];
}

/** Observed outcome */
export interface ObservedOutcome {
  readonly stepId: string;
  readonly outcome: unknown;
  readonly stateChanges: Array<{
    readonly path: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }>;
  readonly timestampMs: TimestampMs;
}

/**
 * PredictionsManager - Makes world model testable
 * 
 * Design principles:
 * - Generate predictions before execution
 * - Compare observed vs predicted after execution
 * - Detect mismatches and emit signals
 * - Enable model revision
 */
export class PredictionsManager {
  private readonly config: Required<PredictionsConfig>;
  private readonly predictions: Map<string, Prediction> = new Map();
  private readonly outcomes: Map<string, ObservedOutcome> = new Map();

  constructor(config: PredictionsConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.5,
      autoDetectMismatches: config.autoDetectMismatches ?? true,
    };
  }

  /**
   * Create a prediction before step execution
   */
  createPrediction(
    stepId: string,
    expectedOutcome: unknown,
    expectedStateTransitions: Array<{ path: string; expectedValue: unknown }>,
    sessionKey: SessionKey
  ): Prediction {
    const timestamp = Date.now();
    const predictionId = deterministicId.generateMemoryId('prediction', timestamp, stepId);
    
    const prediction: Prediction = {
      predictionId,
      stepId,
      expectedOutcome,
      expectedStateTransitions,
      createdAtMs: timestamp,
    };

    this.predictions.set(prediction.predictionId, prediction);
    return prediction;
  }

  /**
   * Record observed outcome after step execution
   */
  recordOutcome(outcome: ObservedOutcome): void {
    this.outcomes.set(outcome.stepId, outcome);
  }

  /**
   * Check prediction against observed outcome
   */
  checkPrediction(predictionId: string): PredictionCheck | null {
    const prediction = this.predictions.get(predictionId);
    if (!prediction) return null;

    const outcome = this.outcomes.get(prediction.stepId);
    if (!outcome) {
      return {
        predictionId,
        stepId: prediction.stepId,
        matched: false,
        expected: prediction.expectedOutcome,
        actual: null,
        mismatches: ['No observed outcome recorded'],
      };
    }

    const mismatches: string[] = [];

    // Check outcome match
    const outcomeMatch = this.valuesMatch(prediction.expectedOutcome, outcome.outcome);
    if (!outcomeMatch.matched) {
      mismatches.push(`Outcome mismatch: expected ${outcomeMatch.expected}, got ${outcomeMatch.actual}`);
    }

    // Check state transitions
    for (const expected of prediction.expectedStateTransitions) {
      const actual = outcome.stateChanges.find(c => c.path === expected.path);
      
      if (!actual) {
        mismatches.push(`Missing state change at ${expected.path}`);
      } else {
        const transitionMatch = this.valuesMatch(expected.expectedValue, actual.newValue);
        if (!transitionMatch.matched) {
          mismatches.push(`State transition mismatch at ${expected.path}: expected ${transitionMatch.expected}, got ${transitionMatch.actual}`);
        }
      }
    }

    return {
      predictionId,
      stepId: prediction.stepId,
      matched: mismatches.length === 0,
      expected: prediction.expectedOutcome,
      actual: outcome.outcome,
      mismatches,
    };
  }

  /**
   * Compare two values for equality
   */
  private valuesMatch(expected: unknown, actual: unknown): { matched: boolean; expected: string; actual: string } {
    // Handle null/undefined
    if (expected === null || expected === undefined) {
      return {
        matched: actual === expected,
        expected: String(expected),
        actual: String(actual),
      };
    }

    // Handle primitives
    if (typeof expected !== 'object') {
      return {
        matched: expected === actual,
        expected: String(expected),
        actual: String(actual),
      };
    }

    // Handle objects
    if (typeof actual !== 'object' || actual === null) {
      return {
        matched: false,
        expected: JSON.stringify(expected),
        actual: String(actual),
      };
    }

    // Deep comparison for objects
    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;

    for (const key of Object.keys(expectedObj)) {
      const match = this.valuesMatch(expectedObj[key], actualObj[key]);
      if (!match.matched) {
        return {
          matched: false,
          expected: `${key}: ${match.expected}`,
          actual: `${key}: ${match.actual}`,
        };
      }
    }

    return { matched: true, expected: '', actual: '' };
  }

  /**
   * Check all predictions and emit mismatch signals
   */
  checkAllPredictions(sessionKey: SessionKey): Array<PredictionCheck & { signal?: Omit<Signal, 'signalId'> }> {
    const results: Array<PredictionCheck & { signal?: Omit<Signal, 'signalId'> }> = [];

    for (const prediction of this.predictions.values()) {
      const check = this.checkPrediction(prediction.predictionId);
      
      if (check && !check.matched && this.config.autoDetectMismatches) {
        const signal = this.createMismatchSignal(check, sessionKey);
        results.push({ ...check, signal });
      } else {
        results.push(check!);
      }
    }

    return results;
  }

  /**
   * Create PREDICTION_MISMATCH signal
   */
  createMismatchSignal(
    check: PredictionCheck,
    sessionKey: SessionKey
  ): Omit<Signal, 'signalId'> {
    return {
      sessionKey,
      type: 'PREDICTION_MISMATCH',
      payload: {
        predictionId: check.predictionId,
        stepId: check.stepId,
        expected: check.expected,
        actual: check.actual,
        mismatches: check.mismatches,
      },
      emittedAtMs: Date.now(),
      sourceLoop: 'PredictionsManager',
      priority: 'event',
    };
  }

  /**
   * Create BELIEF_UPDATED signal (for successful predictions)
   */
  createConfirmationSignal(
    prediction: Prediction,
    sessionKey: SessionKey
  ): Omit<Signal, 'signalId'> {
    return {
      sessionKey,
      type: 'BELIEF_UPDATED',
      payload: {
        predictionId: prediction.predictionId,
        stepId: prediction.stepId,
        message: 'Prediction confirmed by observation',
        confidenceIncrease: 0.1,
      },
      emittedAtMs: Date.now(),
      sourceLoop: 'PredictionsManager',
      priority: 'event',
    };
  }

  /**
   * Get prediction by ID
   */
  getPrediction(predictionId: string): Prediction | undefined {
    return this.predictions.get(predictionId);
  }

  /**
   * Get predictions for a step
   */
  getPredictionsForStep(stepId: string): Prediction[] {
    return Array.from(this.predictions.values()).filter(p => p.stepId === stepId);
  }

  /**
   * Get observed outcome for a step
   */
  getOutcome(stepId: string): ObservedOutcome | undefined {
    return this.outcomes.get(stepId);
  }

  /**
   * Clear predictions and outcomes for a step
   */
  clearStep(stepId: string): void {
    for (const [id, pred] of this.predictions) {
      if (pred.stepId === stepId) {
        this.predictions.delete(id);
      }
    }
    this.outcomes.delete(stepId);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.predictions.clear();
    this.outcomes.clear();
  }

  /**
   * Get prediction statistics
   */
  getStats(): {
    totalPredictions: number;
    totalOutcomes: number;
    checkedPredictions: number;
    matchedPredictions: number;
    mismatchedPredictions: number;
  } {
    let matched = 0;
    let mismatched = 0;

    for (const prediction of this.predictions.values()) {
      const check = this.checkPrediction(prediction.predictionId);
      if (check) {
        if (check.matched) {
          matched++;
        } else {
          mismatched++;
        }
      }
    }

    return {
      totalPredictions: this.predictions.size,
      totalOutcomes: this.outcomes.size,
      checkedPredictions: matched + mismatched,
      matchedPredictions: matched,
      mismatchedPredictions: mismatched,
    };
  }

  /**
   * Generate hypothesis for a mismatch
   */
  generateHypothesis(check: PredictionCheck): string[] {
    const hypotheses: string[] = [];

    for (const mismatch of check.mismatches) {
      if (mismatch.includes('outcome')) {
        hypotheses.push('The expected outcome model may be incorrect');
        hypotheses.push('External factors may have influenced the result');
      }
      
      if (mismatch.includes('state transition')) {
        hypotheses.push('The state transition model may be incomplete');
        hypotheses.push('Side effects were not properly accounted for');
      }
      
      if (mismatch.includes('Missing')) {
        hypotheses.push('The prediction did not account for all state changes');
      }
    }

    // Add general hypotheses
    hypotheses.push('The world model may need refinement');
    hypotheses.push('The prediction confidence was too high for the available information');

    return [...new Set(hypotheses)];
  }

  /**
   * Propose safe experiment to test hypothesis
   */
  proposeExperiment(hypothesis: string, stepId: string): {
    type: 'read_only' | 'clarifying_question' | 'small_step';
    description: string;
  } {
    if (hypothesis.includes('model may be incorrect')) {
      return {
        type: 'read_only',
        description: `Perform read-only reconnaissance to verify model before executing ${stepId}`,
      };
    }

    if (hypothesis.includes('incomplete')) {
      return {
        type: 'clarifying_question',
        description: 'Ask clarifying question to gather more information',
      };
    }

    return {
      type: 'small_step',
      description: `Execute a smaller, reversible version of step ${stepId}`,
    };
  }
}
