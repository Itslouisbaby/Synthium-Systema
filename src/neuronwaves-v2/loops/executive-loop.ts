/**
 * ExecutiveLoop - Attention arbitration and chain management
 * Section 4.3: Executive coordination
 */

import type {
  MicroLoop,
  TickResult,
  Signal,
  SignalType,
  WorkingState,
  SessionKey,
  ChainId,
  PlanChain,
  StateDelta
} from '../types.js';
import { SignalBus } from '../runtime/signal-bus.js';

/** Executive decision type */
export type ExecutiveDecision =
  | 'continue_primary'
  | 'switch_chain'
  | 'pause_secondary'
  | 'request_clarification'
  | 'replan'
  | 'defer';

/** ExecutiveLoop configuration */
export interface ExecutiveLoopConfig {
  /** Maximum concurrent chains */
  readonly maxConcurrentChains?: number;
  /** Priority threshold for interrupting primary */
  readonly interruptThreshold?: number;
  /** Clarification question generator */
  readonly clarificationGenerator?: (uncertainty: string) => string;
}

/**
 * ExecutiveLoop - Heartbeat + event-triggered executive coordination
 * 
 * Responsibility: Attention arbitration and chain management.
 * - Decide what becomes visible output.
 * - Decide whether to ask, defer, or replan.
 * 
 * Consumes: PLAN_CREATED, critic signals, uncertainties, policy/approval updates, tool outcomes, model errors
 * Emits: FOCUS_SET, CHAIN_PAUSE, CHAIN_RESUME, REQUEST_CLARIFICATION, EXEC_REQUEST_REPLAN, OUTPUT_READY
 * 
 * Rule: ExecutiveLoop does not execute tools; it arbitrates.
 */
export class ExecutiveLoop implements MicroLoop {
  readonly name = 'ExecutiveLoop';
  readonly rhythm = 'heartbeat' as const;
  readonly tickBudgetMs = 100;
  readonly maxSignalsOut = 10;
  readonly reads = ['focus', 'chains', 'pendingApprovals', 'uncertainties', 'selfModel'] as const;
  readonly writes = ['focus', 'chains', 'pendingApprovals', 'uncertainties'] as const;
  readonly subscriptions: SignalType[] = [
    'PLAN_CREATED',
    'UNCERTAINTY_HIGH',
    'RISK_HIGH',
    'INVARIANT_VIOLATION',
    'STEP_EXECUTED',
    'STEP_FAILED',
    'POLICY_DECISION_EMITTED',
    'AWAITING_APPROVAL',
    'MODEL_ERROR_DETECTED',
    'SUGGEST_ALTERNATIVE_PLAN',
    'ASK_BEFORE_ACT',
  ];

  private readonly config: ExecutiveLoopConfig;
  private chainCounter = 0;

  constructor(config: ExecutiveLoopConfig = {}) {
    this.config = config;
  }

  tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): TickResult {
    const { signals, workingState, sessionKey } = input;
    const signalsOut: any[] = [];
    const stateDeltas: import('../types.js').StateDelta[] = [];

    // Track what we need to handle
    let newPlanCreated: { planId: string; steps: unknown[]; signalId: string } | null = null;
    let highUncertainty: { question: string; severity: string; signalId: string } | null = null;
    let riskDetected: { risk: string; signalId: string } | null = null;
    let invariantViolation: { violation: string; signalId: string } | null = null;
    let modelError: { error: string; signalId: string } | null = null;
    let alternativePlan: { reason: string; signalId: string } | null = null;
    let askBeforeAct: { question: string; signalId: string } | null = null;

    // Process incoming signals
    for (const signal of signals) {
      switch (signal.type) {
        case 'PLAN_CREATED': {
          const payload = signal.payload as { planId: string; steps: unknown[] };
          newPlanCreated = { ...payload, signalId: signal.signalId };
          break;
        }
        case 'UNCERTAINTY_HIGH': {
          const payload = signal.payload as { question: string; severity: string };
          highUncertainty = { ...payload, signalId: signal.signalId };
          break;
        }
        case 'RISK_HIGH': {
          const payload = signal.payload as { risk: string };
          riskDetected = { ...payload, signalId: signal.signalId };
          break;
        }
        case 'INVARIANT_VIOLATION': {
          const payload = signal.payload as { violation: string };
          invariantViolation = { ...payload, signalId: signal.signalId };
          break;
        }
        case 'MODEL_ERROR_DETECTED': {
          const payload = signal.payload as { error: string };
          modelError = { ...payload, signalId: signal.signalId };
          break;
        }
        case 'SUGGEST_ALTERNATIVE_PLAN': {
          const payload = signal.payload as { reason: string };
          alternativePlan = { ...payload, signalId: signal.signalId };
          break;
        }
        case 'ASK_BEFORE_ACT': {
          const payload = signal.payload as { question: string };
          askBeforeAct = { ...payload, signalId: signal.signalId };
          break;
        }
      }
    }

    // Executive decision making
    const decision = this.makeDecision({
      newPlanCreated,
      highUncertainty,
      riskDetected,
      invariantViolation,
      modelError,
      alternativePlan,
      askBeforeAct,
      workingState,
    });

    // Execute decision
    switch (decision.type) {
      case 'create_primary_chain': {
        if (newPlanCreated) {
          const chainId = this.generateChainId();
          const newChain: PlanChain = {
            chainId,
            objective: `Execute plan ${newPlanCreated.planId}`,
            priority: 1,
            status: 'active',
            createdAtMs: Date.now(),
          };

          // Set as primary chain
          stateDeltas.push({
            section: 'chains',
            path: 'primary',
            value: newChain,
            operation: 'set',
          });

          // Update focus
          stateDeltas.push({
            section: 'focus',
            path: 'activeChainId',
            value: chainId,
            operation: 'set',
          });

          signalsOut.push(SignalBus.createSignal(
            'FOCUS_SET',
            { chainId, objective: newChain.objective },
            sessionKey,
            this.name,
            'event',
            { causedBy: [newPlanCreated.signalId] }
          ));
        }
        break;
      }

      case 'create_secondary_chain': {
        if (newPlanCreated) {
          const chainId = this.generateChainId();
          const newChain: PlanChain = {
            chainId,
            objective: `Background: ${newPlanCreated.planId}`,
            priority: 0.5,
            status: 'active',
            createdAtMs: Date.now(),
          };

          // Add to secondary chains
          stateDeltas.push({
            section: 'chains',
            path: 'secondary',
            value: newChain,
            operation: 'push',
          });
        }
        break;
      }

      case 'request_clarification': {
        const question = highUncertainty?.question ??
          askBeforeAct?.question ??
          'I need more information to proceed.';

        signalsOut.push(SignalBus.createSignal(
          'REQUEST_CLARIFICATION',
          { question },
          sessionKey,
          this.name,
          'heartbeat',
          { causedBy: [highUncertainty?.signalId ?? askBeforeAct?.signalId ?? ''].filter(Boolean) }
        ));

        // Pause current chain
        if (workingState.focus.activeChainId) {
          signalsOut.push(SignalBus.createSignal(
            'CHAIN_PAUSE',
            {
              chainId: workingState.focus.activeChainId,
              reason: 'Awaiting clarification',
            },
            sessionKey,
            this.name,
            'event',
            {}
          ));
        }
        break;
      }

      case 'replan': {
        const reason = alternativePlan?.reason ??
          invariantViolation?.violation ??
          'Executive decision to replan';
        const signals: any[] = [];
        signals.push(SignalBus.createSignal(
          'EXEC_REQUEST_REPLAN',
          {
            chainId: workingState.focus.activeChainId,
            reason: reason,
          },
          sessionKey,
          this.name,
          'palpitation',
          { emittedAtMs: Date.now() }
        ));
        signalsOut.push(...signals); // Add the signals to the main signalsOut array
        break;
      }

      case 'pause_for_approval': {
        if (workingState.focus.activeChainId) {
          signalsOut.push(SignalBus.createSignal(
            'CHAIN_PAUSE',
            {
              chainId: workingState.focus.activeChainId,
              reason: 'Awaiting approval',
            },
            sessionKey,
            this.name,
            'event',
            {}
          ));
        }
        break;
      }

      case 'handle_model_error': {
        if (modelError) {
          // Request replan with error context
          signalsOut.push(SignalBus.createSignal(
            'EXEC_REQUEST_REPLAN',
            {
              reason: `Model error: ${modelError.error}`,
              currentChainId: workingState.focus.activeChainId,
              degradeMode: true,
            },
            sessionKey,
            this.name,
            'event',
            { causedBy: [modelError.signalId] }
          ));
        }
        break;
      }

      case 'continue': {
        // No action needed - continue current execution
        break;
      }
    }

    // Check for chain completion or failure
    this.checkChainStatus(workingState, stateDeltas, signalsOut, sessionKey);

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
   * Make executive decision based on current state
   */
  private makeDecision(context: {
    newPlanCreated: { planId: string; steps: unknown[]; signalId: string } | null;
    highUncertainty: { question: string; severity: string; signalId: string } | null;
    riskDetected: { risk: string; signalId: string } | null;
    invariantViolation: { violation: string; signalId: string } | null;
    modelError: { error: string; signalId: string } | null;
    alternativePlan: { reason: string; signalId: string } | null;
    askBeforeAct: { question: string; signalId: string } | null;
    workingState: WorkingState;
  }): { type: string } {
    const {
      newPlanCreated,
      highUncertainty,
      riskDetected,
      invariantViolation,
      modelError,
      alternativePlan,
      askBeforeAct,
      workingState
    } = context;

    // Priority 1: Handle model errors
    if (modelError) {
      return { type: 'handle_model_error' };
    }

    // Priority 2: Handle invariant violations
    if (invariantViolation) {
      return { type: 'replan' };
    }

    // Priority 3: Handle high uncertainties or ask-before-act
    if (highUncertainty?.severity === 'critical' || highUncertainty?.severity === 'high' || askBeforeAct) {
      return { type: 'request_clarification' };
    }

    // Priority 4: Handle high risks
    if (riskDetected) {
      return { type: 'pause_for_approval' };
    }

    // Priority 5: Handle alternative plan suggestions
    if (alternativePlan) {
      return { type: 'replan' };
    }

    // Priority 6: Create new chain for plan
    if (newPlanCreated) {
      // If no primary chain, make this primary
      if (!workingState.chains.primary) {
        return { type: 'create_primary_chain' };
      }

      // Otherwise add as secondary
      const maxSecondary = this.config.maxConcurrentChains ?? 3;
      if (workingState.chains.secondary.length < maxSecondary) {
        return { type: 'create_secondary_chain' };
      }

      // Too many chains - need to queue or defer
      return { type: 'defer' };
    }

    return { type: 'continue' };
  }

  /**
   * Check chain status and update as needed
   */
  private checkChainStatus(
    workingState: WorkingState,
    stateDeltas: StateDelta[],
    signalsOut: any[],
    sessionKey: SessionKey
  ): void {
    // Check if primary chain should be completed
    if (workingState.chains.primary?.status === 'completed') {
      // Move a secondary chain to primary if available
      if (workingState.chains.secondary.length > 0) {
        const nextPrimary = workingState.chains.secondary[0];

        stateDeltas.push({
          section: 'chains',
          path: 'primary',
          value: { ...nextPrimary, priority: 1 },
          operation: 'set',
        });

        stateDeltas.push({
          section: 'chains',
          path: 'secondary',
          value: workingState.chains.secondary.slice(1),
          operation: 'set',
        });

        stateDeltas.push({
          section: 'focus',
          path: 'activeChainId',
          value: nextPrimary.chainId,
          operation: 'set',
        });

        signalsOut.push(SignalBus.createSignal(
          'FOCUS_SET',
          { chainId: nextPrimary.chainId, objective: nextPrimary.objective },
          sessionKey,
          this.name,
          'event',
          {}
        ));
      }
    }
  }

  /**
   * Generate unique chain ID
   */
  private generateChainId(): ChainId {
    return `chain-${Date.now()}-${++this.chainCounter}`;
  }

  /**
   * Create a clarification question
   */
  private createClarificationQuestion(uncertainty: string): string {
    if (this.config.clarificationGenerator) {
      return this.config.clarificationGenerator(uncertainty);
    }
    return `I need clarification: ${uncertainty}`;
  }
}
