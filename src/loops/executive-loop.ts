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
  StateDelta,
  PlanStep,
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
  /** Maximum number of replan attempts per chain before escalation */
  readonly maxReplanAttempts?: number;
  /** Maximum number of automatic critic revise cycles per session */
  readonly maxAutoReviseCycles?: number;
}

interface GoalNode {
  goalId: string;
  parentGoalId?: string;
  stepId?: string;
  title: string;
  completionCriteria: string;
  budget: number;
  spent: number;
  status: 'open' | 'in_progress' | 'completed' | 'failed';
  children: string[];
}

interface GoalStackSnapshot {
  rootGoalId: string;
  nodes: Record<string, GoalNode>;
  openGoals: string[];
  progress: number;
  updatedAtMs: number;
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
    'EVALUATION_COMPLETE',
  ];

  private readonly config: ExecutiveLoopConfig;
  private chainCounter = 0;
  private readonly replanAttemptsByChain = new Map<string, number>();
  private readonly reviseAttemptsBySession = new Map<string, number>();
  private readonly goalStacksBySession = new Map<string, GoalStackSnapshot>();

  constructor(config: ExecutiveLoopConfig = {}) {
    this.config = config;
  }

  tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): TickResult {
    const { signals, workingState, sessionKey } = input;
    const signalsOut: (Omit<Signal, 'signalId'> & { signalId?: string })[] = [];
    const stateDeltas: StateDelta[] = [];

    // Track what we need to handle
    let newPlanCreated: { planId: string; steps: PlanStep[]; signalId: string } | null = null;
    let highUncertainty: { question: string; severity: string; signalId: string } | null = null;
    let riskDetected: { risk: string; signalId: string } | null = null;
    let invariantViolation: { violation: string; signalId: string } | null = null;
    let modelError: { error: string; signalId: string } | null = null;
    let alternativePlan: { reason: string; signalId: string; issue?: string; proposedFix?: string; confidence?: number; patchId?: string } | null = null;
    let askBeforeAct: { question: string; signalId: string } | null = null;
    const stepSignals: Array<{ stepId: string; status: 'executed' | 'failed'; signalId: string }> = [];

    // Process incoming signals
    for (const signal of signals) {
      switch (signal.type) {
        case 'PLAN_CREATED': {
          const payload = signal.payload as { planId: string; steps: PlanStep[] };
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
          const payload = signal.payload as {
            description?: string;
            error?: string;
            errorType?: string;
            affectedChains?: string[];
          };
          modelError = {
            error: payload.description ?? payload.error ?? payload.errorType ?? 'model_error_detected',
            signalId: signal.signalId,
          };
          break;
        }
        case 'SUGGEST_ALTERNATIVE_PLAN': {
          const payload = signal.payload as { reason: string; issue?: string; proposedFix?: string; confidence?: number; patchId?: string };
          alternativePlan = { ...payload, signalId: signal.signalId };
          break;
        }
        case 'ASK_BEFORE_ACT': {
          const payload = signal.payload as { question: string };
          askBeforeAct = { ...payload, signalId: signal.signalId };
          break;
        }
        case 'STEP_EXECUTED': {
          const payload = signal.payload as { stepId?: string };
          if (payload.stepId) {
            stepSignals.push({ stepId: payload.stepId, status: 'executed', signalId: signal.signalId });
          }
          break;
        }
        case 'STEP_FAILED': {
          const payload = signal.payload as { stepId?: string };
          if (payload.stepId) {
            stepSignals.push({ stepId: payload.stepId, status: 'failed', signalId: signal.signalId });
          }
          break;
        }
      }
    }

    if (newPlanCreated) {
      const snapshot = this.createGoalStack(newPlanCreated.planId, newPlanCreated.steps, sessionKey);
      this.goalStacksBySession.set(sessionKey, snapshot);
      signalsOut.push(SignalBus.createSignal(
        'MEMORY_WRITE_SUGGESTED',
        {
          key: `goal_stack:${sessionKey}`,
          value: snapshot,
          reason: 'Goal stack initialized from plan decomposition',
        },
        sessionKey,
        this.name,
        'event',
        { causedBy: [newPlanCreated.signalId] }
      ));
    }

    if (stepSignals.length > 0) {
      const updated = this.updateGoalStackProgress(sessionKey, stepSignals);
      if (updated) {
        signalsOut.push(SignalBus.createSignal(
          'MEMORY_WRITE_SUGGESTED',
          {
            key: `goal_stack:${sessionKey}`,
            value: updated,
            reason: 'Goal stack progress updated from step outcomes',
          },
          sessionKey,
          this.name,
          'event',
          { causedBy: stepSignals.map(item => item.signalId) }
        ));
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
      sessionKey,
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

      case 'auto_revise': {
        const previous = this.reviseAttemptsBySession.get(sessionKey) ?? 0;
        this.reviseAttemptsBySession.set(sessionKey, previous + 1);
        const reason = alternativePlan?.issue ?? alternativePlan?.reason ?? 'critic_proposed_revision';
        const proposedFix = alternativePlan?.proposedFix ?? 'Apply critic patch and regenerate output.';

        signalsOut.push(SignalBus.createSignal(
          'EXEC_REQUEST_REPLAN',
          {
            reason,
            currentChainId: workingState.focus.activeChainId,
            reviseCycle: true,
            patchId: alternativePlan?.patchId,
            proposedFix,
            confidence: Number(alternativePlan?.confidence ?? 0),
          },
          sessionKey,
          this.name,
          'event',
          { causedBy: [alternativePlan?.signalId ?? ''].filter(Boolean) }
        ));

        signalsOut.push(SignalBus.createSignal(
          'MEMORY_WRITE_SUGGESTED',
          {
            key: `critic_patch:${sessionKey}`,
            value: {
              issue: reason,
              proposedFix,
              confidence: Number(alternativePlan?.confidence ?? 0),
              reviseCycle: previous + 1,
            },
            reason: 'Automatic revise cycle scheduled by executive',
          },
          sessionKey,
          this.name,
          'event',
          { causedBy: [alternativePlan?.signalId ?? ''].filter(Boolean) }
        ));
        break;
      }

      case 'replan': {
        const reason = alternativePlan?.reason ??
          invariantViolation?.violation ??
          'Executive decision to replan';

        signalsOut.push(SignalBus.createSignal(
          'EXEC_REQUEST_REPLAN',
          {
            reason,
            currentChainId: workingState.focus.activeChainId,
          },
          sessionKey,
          this.name,
          'event',
          { causedBy: [alternativePlan?.signalId ?? invariantViolation?.signalId ?? ''].filter(Boolean) }
        ));
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
          const activeChainId = workingState.focus.activeChainId ?? 'global';
          const previousAttempts = this.replanAttemptsByChain.get(activeChainId) ?? 0;
          const nextAttempt = previousAttempts + 1;
          const maxAttempts = this.config.maxReplanAttempts ?? 2;

          if (nextAttempt <= maxAttempts) {
            this.replanAttemptsByChain.set(activeChainId, nextAttempt);
            signalsOut.push(SignalBus.createSignal(
              'EXEC_REQUEST_REPLAN',
              {
                reason: `Model error: ${modelError.error} (attempt ${nextAttempt}/${maxAttempts})`,
                currentChainId: workingState.focus.activeChainId,
                degradeMode: true,
                attempt: nextAttempt,
              },
              sessionKey,
              this.name,
              'event',
              { causedBy: [modelError.signalId] }
            ));
          } else {
            signalsOut.push(SignalBus.createSignal(
              'ESCALATE_APPROVAL_SUGGESTED',
              {
                chainId: activeChainId,
                reason: `Replan budget exceeded after ${previousAttempts} attempts: ${modelError.error}`,
                currentApprover: 'runtime-ops',
              },
              sessionKey,
              this.name,
              'event',
              { causedBy: [modelError.signalId] }
            ));

            signalsOut.push(SignalBus.createSignal(
              'CHAIN_PAUSE',
              {
                chainId: activeChainId,
                reason: 'Replan budget exhausted; manual intervention required',
                canResume: false,
              },
              sessionKey,
              this.name,
              'event',
              { causedBy: [modelError.signalId] }
            ));
          }
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
    newPlanCreated: { planId: string; steps: PlanStep[]; signalId: string } | null;
    highUncertainty: { question: string; severity: string; signalId: string } | null;
    riskDetected: { risk: string; signalId: string } | null;
    invariantViolation: { violation: string; signalId: string } | null;
    modelError: { error: string; signalId: string } | null;
    alternativePlan: { reason: string; signalId: string; issue?: string; proposedFix?: string; confidence?: number; patchId?: string } | null;
    askBeforeAct: { question: string; signalId: string } | null;
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): { type: string } {
    const {
      newPlanCreated,
      highUncertainty,
      riskDetected,
      invariantViolation,
      modelError,
      alternativePlan,
      askBeforeAct,
      workingState,
      sessionKey
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
      const confidence = Number(alternativePlan.confidence ?? 0);
      const reviseAttempts = this.reviseAttemptsBySession.get(sessionKey) ?? 0;
      const maxRevise = this.config.maxAutoReviseCycles ?? 1;
      if (alternativePlan.proposedFix && confidence >= 0.6 && reviseAttempts < maxRevise) {
        return { type: 'auto_revise' };
      }
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


  private createGoalStack(planId: string, steps: PlanStep[], sessionKey: SessionKey): GoalStackSnapshot {
    const now = Date.now();
    const previous = this.goalStacksBySession.get(sessionKey);
    const rootGoalId = previous?.rootGoalId ?? `goal-root-${planId}`;

    const nodes: Record<string, GoalNode> = previous?.nodes
      ? JSON.parse(JSON.stringify(previous.nodes))
      : {
          [rootGoalId]: {
            goalId: rootGoalId,
            title: `Complete plan ${planId}`,
            completionCriteria: 'All child goals completed',
            budget: Math.max(1, steps.length * 2),
            spent: 0,
            status: 'in_progress',
            children: [],
          },
        };

    const root = nodes[rootGoalId];
    root.title = `Complete plan ${planId}`;
    root.budget = Math.max(root.budget, root.children.length + steps.length + 1);

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const existing = Object.values(nodes).find(node => node.stepId === step.stepId);
      if (existing) continue;

      const childId = `goal-${planId}-${index + 1}`;
      nodes[childId] = {
        goalId: childId,
        parentGoalId: rootGoalId,
        stepId: step.stepId,
        title: step.intent,
        completionCriteria: `Step ${step.stepId} reaches executed status`,
        budget: 1,
        spent: 0,
        status: 'open',
        children: [],
      };
      root.children.push(childId);
    }

    const childNodes = root.children.map(id => nodes[id]).filter(Boolean);
    const completed = childNodes.filter(node => node.status === 'completed').length;
    root.status = completed === childNodes.length && childNodes.length > 0 ? 'completed' : 'in_progress';

    return {
      rootGoalId,
      nodes,
      openGoals: childNodes.filter(node => node.status !== 'completed').map(node => node.goalId),
      progress: childNodes.length === 0 ? 0 : completed / childNodes.length,
      updatedAtMs: now,
    };
  }

  private updateGoalStackProgress(
    sessionKey: SessionKey,
    stepSignals: Array<{ stepId: string; status: 'executed' | 'failed'; signalId: string }>
  ): GoalStackSnapshot | null {
    const snapshot = this.goalStacksBySession.get(sessionKey);
    if (!snapshot) return null;

    const nodes: Record<string, GoalNode> = JSON.parse(JSON.stringify(snapshot.nodes));
    for (const stepSignal of stepSignals) {
      const node = Object.values(nodes).find(item => item.stepId === stepSignal.stepId);
      if (!node) continue;
      node.spent = Math.min(node.budget, node.spent + 1);
      node.status = stepSignal.status === 'executed' ? 'completed' : 'failed';
    }

    const root = nodes[snapshot.rootGoalId];
    const childNodes = root.children.map(id => nodes[id]);
    const completed = childNodes.filter(node => node.status === 'completed').length;
    const failed = childNodes.filter(node => node.status === 'failed').length;
    root.status = completed === childNodes.length
      ? 'completed'
      : failed > 0
        ? 'in_progress'
        : 'in_progress';
    root.spent = childNodes.reduce((acc, node) => acc + node.spent, 0);

    const next: GoalStackSnapshot = {
      ...snapshot,
      nodes,
      openGoals: childNodes.filter(node => node.status !== 'completed').map(node => node.goalId),
      progress: childNodes.length === 0 ? 1 : completed / childNodes.length,
      updatedAtMs: Date.now(),
    };

    this.goalStacksBySession.set(sessionKey, next);
    return next;
  }

  /**
   * Check chain status and update as needed
   */
  private checkChainStatus(
    workingState: WorkingState,
    stateDeltas: StateDelta[],
    signalsOut: (Omit<Signal, 'signalId'> & { signalId?: string })[],
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
