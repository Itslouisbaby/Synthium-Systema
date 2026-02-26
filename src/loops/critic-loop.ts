/**
 * CriticLoop - Plan evaluation and safety checking
 * Section 5.1: Meta-reasoning for quality/safety/completeness
 */

import type { 
  MicroLoop, 
  TickResult, 
  Signal, 
  SignalType,
  WorkingState,
  SessionKey,
  PlanStep,
  StateDelta
} from '../types.js';
import { SignalBus } from '../runtime/signal-bus.js';

/** Invariant check result */
interface InvariantCheck {
  readonly invariantId: string;
  readonly name: string;
  readonly violated: boolean;
  readonly reason?: string;
}

/** Plan critique result */
interface PlanCritique {
  readonly planId: string;
  shallow: boolean;
  readonly missingSlots: string[];
  readonly risks: string[];
  readonly uncertainties: string[];
  invariantViolations: InvariantCheck[];
  readonly suggestions: string[];
}

/** CriticLoop configuration */
export interface CriticLoopConfig {
  /** Minimum plan depth (number of steps) */
  readonly minPlanDepth?: number;
  /** Invariant checks to apply */
  invariants?: InvariantCheck[];
  /** Risk patterns to detect */
  readonly riskPatterns?: string[];
  /** Uncertainty detectors */
  readonly uncertaintyDetectors?: ((steps: PlanStep[]) => string[])[];
}

/**
 * CriticLoop - Heartbeat + plan-triggered critique
 * 
 * Responsibility: Evaluate the quality/safety/completeness of plans BEFORE execution.
 * - Enforce invariants and uncertainty handling.
 * 
 * Consumes: PLAN_CREATED (+ contextBundle, selfModel, activeConcepts, activeSchemas)
 * Emits: UNCERTAINTY_HIGH, PLAN_TOO_SHALLOW, RISK_HIGH, INVARIANT_VIOLATION, 
 *        SUGGEST_ALTERNATIVE_PLAN, ASK_BEFORE_ACT
 * 
 * Integration: CriticLoop cannot directly block. It emits signals; ExecutiveLoop decides actions.
 */
export class CriticLoop implements MicroLoop {
  readonly name = 'CriticLoop';
  readonly rhythm = 'heartbeat' as const;
  readonly tickBudgetMs = 150;
  readonly maxSignalsOut = 10;
  readonly reads = ['activeConcepts', 'activeSchemas', 'selfModel', 'uncertainties'] as const;
  readonly writes = ['uncertainties'] as const;
  readonly subscriptions: SignalType[] = ['PLAN_CREATED', 'SLOTS_MISSING'];

  private readonly config: CriticLoopConfig;

  constructor(config: CriticLoopConfig = {}) {
    this.config = config;
  }

  tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): TickResult {
    const { signals, workingState, sessionKey } = input;
    const signalsOut: Array<Omit<Signal, 'signalId'> & { signalId?: string }> = [];
    const stateDeltas: import('../types.js').StateDelta[] = [];

    for (const signal of signals) {
      if (signal.type === 'PLAN_CREATED') {
        const payload = signal.payload as { 
          planId: string; 
          steps: PlanStep[];
          contextBundle?: unknown;
        };

        // Perform plan critique
        const critique = this.critiquePlan(payload.planId, payload.steps, workingState);

        // Emit signals based on critique findings
        
        // 1. Plan too shallow
        if (critique.shallow) {
          signalsOut.push(SignalBus.createSignal(
            'PLAN_TOO_SHALLOW',
            {
              planId: critique.planId,
              reason: `Plan has only ${payload.steps.length} steps, minimum is ${this.config.minPlanDepth ?? 2}`,
              suggestion: 'Break down into more detailed steps',
            },
            sessionKey,
            this.name,
            'heartbeat',
            { causedBy: [signal.signalId] }
          ));
        }

        // 2. Missing slots
        if (critique.missingSlots.length > 0) {
          signalsOut.push(SignalBus.createSignal(
            'SLOTS_MISSING',
            {
              planId: critique.planId,
              missingSlots: critique.missingSlots,
              suggestedQuestions: critique.missingSlots.map(slot => 
                `Please provide ${slot}`
              ),
            },
            sessionKey,
            this.name,
            'heartbeat',
            { causedBy: [signal.signalId] }
          ));

          // Also emit uncertainty
          signalsOut.push(SignalBus.createSignal(
            'UNCERTAINTY_HIGH',
            {
              question: `Missing required information: ${critique.missingSlots.join(', ')}`,
              severity: 'high',
              cause: 'incomplete_schema',
            },
            sessionKey,
            this.name,
            'heartbeat',
            { causedBy: [signal.signalId] }
          ));

          // Add to uncertainties
          stateDeltas.push({
            section: 'uncertainties',
            path: '',
            value: {
              id: `unc-${Date.now()}`,
              question: `Missing: ${critique.missingSlots.join(', ')}`,
              severity: 'high',
              cause: 'incomplete_schema',
              createdAtMs: Date.now(),
            },
            operation: 'push',
          });
        }

        // 3. Risks detected
        for (const risk of critique.risks) {
          signalsOut.push(SignalBus.createSignal(
            'RISK_HIGH',
            {
              planId: critique.planId,
              risk,
              mitigation: 'Consider requesting approval',
            },
            sessionKey,
            this.name,
            'heartbeat',
            { causedBy: [signal.signalId] }
          ));
        }

        // 4. Invariant violations
        for (const violation of critique.invariantViolations) {
          if (violation.violated) {
            signalsOut.push(SignalBus.createSignal(
              'INVARIANT_VIOLATION',
              {
                planId: critique.planId,
                invariantId: violation.invariantId,
                invariantName: violation.name,
                reason: violation.reason,
              },
              sessionKey,
              this.name,
              'heartbeat',
              { causedBy: [signal.signalId] }
            ));

            // Suggest alternative plan
            signalsOut.push(SignalBus.createSignal(
              'SUGGEST_ALTERNATIVE_PLAN',
              {
                planId: critique.planId,
                reason: `Invariant violation: ${violation.name}`,
                repairStrategy: 'replan',
              },
              sessionKey,
              this.name,
              'heartbeat',
              { causedBy: [signal.signalId] }
            ));
          }
        }

        // 5. General uncertainties
        for (const uncertainty of critique.uncertainties) {
          signalsOut.push(SignalBus.createSignal(
            'UNCERTAINTY_HIGH',
            {
              question: uncertainty,
              severity: 'medium',
              cause: 'plan_critique',
            },
            sessionKey,
            this.name,
            'heartbeat',
            { causedBy: [signal.signalId] }
          ));

          // Add ask-before-act for critical uncertainties
          if (workingState.selfModel.confidenceState.overall < 0.7) {
            signalsOut.push(SignalBus.createSignal(
              'ASK_BEFORE_ACT',
              {
                question: uncertainty,
                context: 'Low confidence in plan execution',
              },
              sessionKey,
              this.name,
              'heartbeat',
              { causedBy: [signal.signalId] }
            ));
          }
        }
      }

      // Handle missing slots from SchemaFiller
      if (signal.type === 'SLOTS_MISSING') {
        const payload = signal.payload as { 
          missingSlots: string[]; 
          suggestedQuestions: string[];
        };

        signalsOut.push(SignalBus.createSignal(
          'UNCERTAINTY_HIGH',
          {
            question: `Missing required information: ${payload.missingSlots.join(', ')}`,
            severity: 'high',
            cause: 'schema_filling',
            suggestedQuestions: payload.suggestedQuestions,
          },
          sessionKey,
          this.name,
          'heartbeat',
          { causedBy: [signal.signalId] }
        ));

        stateDeltas.push({
          section: 'uncertainties',
          path: '',
          value: {
            id: `unc-${Date.now()}`,
            question: `Missing: ${payload.missingSlots.join(', ')}`,
            severity: 'high',
            cause: 'schema_filling',
            createdAtMs: Date.now(),
          },
          operation: 'push',
        });
      }
    }

    return {
      signalsOut,
      stateDelta: stateDeltas,
      metrics: {
        durationMs: 0,
        signalsProcessed: signals.length,
        signalsEmitted: signalsOut.length,
      },
    };
  }

  /**
   * Critique a plan for quality, safety, and completeness
   */
  private critiquePlan(
    planId: string, 
    steps: PlanStep[], 
    workingState: WorkingState
  ): PlanCritique {
    const critique: PlanCritique = {
      planId,
      shallow: false,
      missingSlots: [],
      risks: [],
      uncertainties: [],
      invariantViolations: [],
      suggestions: [],
    };

    // Check plan depth
    const minDepth = this.config.minPlanDepth ?? 2;
    if (steps.length < minDepth) {
      critique.shallow = true;
      critique.suggestions.push(`Consider expanding plan to at least ${minDepth} steps`);
    }

    // Check for missing slots from active schemas
    for (const schema of workingState.activeSchemas) {
      if (schema.missingSlots.length > 0) {
        critique.missingSlots.push(...schema.missingSlots);
      }
    }

    // Detect risks in steps
    for (const step of steps) {
      // Check for irreversible actions
      if (step.actionClass === 'irreversible') {
        critique.risks.push(`Irreversible action: ${step.intent}`);
      }
      
      // Check for external writes
      if (step.actionClass === 'external_write') {
        critique.risks.push(`External write: ${step.intent}`);
      }
      
      // Check for money movement
      if (step.actionClass === 'money_movement') {
        critique.risks.push(`Money movement: ${step.intent}`);
      }

      // Check for identity security
      if (step.actionClass === 'identity_security_sensitive') {
        critique.risks.push(`Identity/security sensitive: ${step.intent}`);
      }
    }

    // Apply risk patterns
    if (this.config.riskPatterns) {
      for (const pattern of this.config.riskPatterns) {
        for (const step of steps) {
          if (step.intent.toLowerCase().includes(pattern.toLowerCase())) {
            critique.risks.push(`Pattern match '${pattern}': ${step.intent}`);
          }
        }
      }
    }

    // Apply uncertainty detectors
    if (this.config.uncertaintyDetectors) {
      for (const detector of this.config.uncertaintyDetectors) {
        const uncertainties = detector(steps);
        critique.uncertainties.push(...uncertainties);
      }
    }

    // Check invariants
    critique.invariantViolations = this.checkInvariants(steps);

    // Add suggestions based on findings
    if (critique.risks.length > 0) {
      critique.suggestions.push('Consider adding approval gates for risky actions');
    }
    if (critique.uncertainties.length > 0) {
      critique.suggestions.push('Clarify uncertainties before execution');
    }

    return critique;
  }

  /**
   * Check invariants against plan steps
   */
  private checkInvariants(steps: PlanStep[]): InvariantCheck[] {
    const checks: InvariantCheck[] = [];

    // Default invariants
    const invariants = this.config.invariants ?? [
      {
        invariantId: 'inv-1',
        name: 'No irreversible without approval',
        violated: steps.some(s => s.actionClass === 'irreversible' && s.status !== 'awaiting_approval'),
        reason: 'Irreversible action found without approval gate',
      },
      {
        invariantId: 'inv-2',
        name: 'External write requires justification',
        violated: steps.some(s => s.actionClass === 'external_write' && !s.intent.includes('because')),
        reason: 'External write without clear justification',
      },
      {
        invariantId: 'inv-3',
        name: 'All steps have tools assigned',
        violated: steps.some(s => s.actionClass === 'local_only' && !s.toolName),
        reason: 'Local action without assigned tool',
      },
    ];

    return invariants;
  }

  /**
   * Add a custom invariant check
   */
  addInvariant(invariant: InvariantCheck): void {
    this.config.invariants = [...(this.config.invariants ?? []), invariant];
  }

  /**
   * Remove an invariant check
   */
  removeInvariant(invariantId: string): void {
    this.config.invariants = (this.config.invariants ?? []).filter(
      inv => inv.invariantId !== invariantId
    );
  }
}

/** Default uncertainty detector */
export const defaultUncertaintyDetector = (steps: PlanStep[]): string[] => {
  const uncertainties: string[] = [];
  
  for (const step of steps) {
    // Detect vague intents
    const vagueTerms = ['something', 'somehow', 'maybe', 'perhaps', 'possibly'];
    for (const term of vagueTerms) {
      if (step.intent.toLowerCase().includes(term)) {
        uncertainties.push(`Vague term '${term}' in step: ${step.intent}`);
      }
    }
    
    // Detect missing inputs
    if (step.toolInput && Object.keys(step.toolInput).length === 0) {
      uncertainties.push(`No input provided for step: ${step.intent}`);
    }
  }
  
  return uncertainties;
};


