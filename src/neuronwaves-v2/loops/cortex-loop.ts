/**
 * CortexLoop - v1 Loop Wrapper
 * Section 3: Wraps the existing NeuronWaves v1 loop unchanged
 */

import type { 
  MicroLoop, 
  TickResult, 
  Signal, 
  SignalType,
  WorkingState,
  SessionKey,
  Plan,
  PlanStep,
  Observation,
  Evaluation
} from '../types.js';
import { SignalBus, SignalBuilder } from '../runtime/signal-bus.js';

/** v1 Loop function type */
export type V1LoopFunction = (input: {
  content: string;
  sessionKey: string;
}, config: {
  artifactBaseDir: string;
  autonomyLevel?: number;
  enableMemory?: boolean;
}) => Promise<{
  plan: Plan;
  evaluation: Evaluation;
  artifactPaths: unknown;
}>;

/** CortexLoop configuration */
export interface CortexLoopConfig {
  /** v1 loop function to wrap */
  readonly v1Loop: V1LoopFunction;
  /** Base directory for artifacts */
  readonly artifactBaseDir: string;
  /** Default autonomy level */
  readonly autonomyLevel?: number;
  /** Whether to enable memory */
  readonly enableMemory?: boolean;
}

/**
 * CortexLoop - Event-driven wrapper for v1 loop
 * 
 * This loop runs the existing NeuronWaves v1 loop unchanged,
 * but invokes it by the v2 runtime scheduler.
 * 
 * Rhythm: event/palpitation
 * Triggers: INPUT_RECEIVED, TOOL_RESULT_RECEIVED, APPROVAL_DECISION_RECEIVED, EXEC_REQUEST_REPLAN
 */
export class CortexLoop implements MicroLoop {
  readonly name = 'CortexLoop';
  readonly rhythm = 'event' as const;
  readonly tickBudgetMs = 5000; // v1 loops can take longer
  readonly maxSignalsOut = 10;
  readonly reads = ['focus', 'chains', 'activeConcepts', 'activeSchemas', 'selfModel', 'beliefGraphRef'] as const;
  readonly writes = ['chains', 'executionLedger'] as const;
  readonly subscriptions: SignalType[] = [
    'INPUT_RECEIVED',
    'TOOL_RESULT_RECEIVED',
    'APPROVAL_DECISION_RECEIVED',
    'EXEC_REQUEST_REPLAN',
  ];

  private readonly config: CortexLoopConfig;
  private readonly pendingExecutions: Map<string, {
    resolve: (value: TickResult) => void;
    reject: (reason: Error) => void;
  }> = new Map();

  constructor(config: CortexLoopConfig) {
    this.config = config;
  }

  async tick(input: {
    signals: Signal[];
    workingState: WorkingState;
    sessionKey: SessionKey;
  }): Promise<TickResult> {
    const { signals, workingState, sessionKey } = input;
    const signalBuilder = new SignalBuilder(sessionKey, this.name);
    const signalsOut: Signal[] = [];
    const stateDeltas = [];

    // Process each input signal
    for (const signal of signals) {
      if (signal.type === 'INPUT_RECEIVED') {
        const payload = signal.payload as { content: string };
        
        try {
          // Execute v1 loop
          const result = await this.executeV1Loop(payload.content, sessionKey);

          // Emit PLAN_CREATED signal
          signalsOut.push(signalBuilder.planCreated(
            result.plan.id,
            result.plan.steps,
            { causedBy: [signal.signalId] }
          ));

          // Emit policy decision signals for each step
          for (const step of result.plan.steps) {
            signalsOut.push(signalBuilder.policyDecision(
              step.stepId,
              step.status === 'allowed' ? 'allow' : step.status,
              `v1 policy evaluation: ${step.actionClass}`,
              { causedBy: [signal.signalId] }
            ));

            // Emit step execution signals
            if (step.status === 'executed') {
              signalsOut.push(signalBuilder.stepExecuted(
                step.stepId,
                step.outputSummary,
                { causedBy: [signal.signalId] }
              ));
            } else if (step.status === 'failed') {
              signalsOut.push(signalBuilder.stepFailed(
                step.stepId,
                'Execution failed',
                { causedBy: [signal.signalId] }
              ));
            } else if (step.status === 'awaiting_approval') {
              signalsOut.push({
                ...signalBuilder.policyDecision(
                  step.stepId,
                  'awaiting_approval',
                  'Step requires approval',
                  { causedBy: [signal.signalId] }
                ),
                type: 'AWAITING_APPROVAL',
              });
            }
          }

          // Emit evaluation complete signal
          signalsOut.push(SignalBus.createSignal(
            'EVALUATION_COMPLETE',
            {
              evaluationId: result.evaluation.id,
              result: result.evaluation.result,
              summary: result.evaluation.summary,
            },
            sessionKey,
            this.name,
            'event',
            { causedBy: [signal.signalId] }
          ));

          // Add execution ledger entry
          stateDeltas.push({
            section: 'executionLedger',
            path: '',
            value: {
              entryId: `cortex-${Date.now()}`,
              timestampMs: Date.now(),
              type: 'tool_result',
              description: `v1 loop completed: ${result.evaluation.summary}`,
              chainId: workingState.focus.activeChainId ?? undefined,
            },
            operation: 'push',
          });

          // Emit OUTPUT_CANDIDATE_READY if there's output
          if (result.evaluation.summary) {
            signalsOut.push(SignalBus.createSignal(
              'OUTPUT_READY',
              {
                content: result.evaluation.summary,
                chainId: workingState.focus.activeChainId,
                planId: result.plan.id,
              },
              sessionKey,
              this.name,
              'palpitation',
              { causedBy: [signal.signalId] }
            ));
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          signalsOut.push(signalBuilder.stepFailed(
            'v1-loop',
            errorMessage,
            { causedBy: [signal.signalId] }
          ));

          signalsOut.push(signalBuilder.modelErrorDetected(
            errorMessage,
            { signalType: signal.type },
            { causedBy: [signal.signalId] }
          ));
        }
      }

      // Handle replan requests
      if (signal.type === 'EXEC_REQUEST_REPLAN') {
        const payload = signal.payload as { content: string; reason: string };
        
        // Re-execute v1 loop with the replan content
        try {
          const result = await this.executeV1Loop(payload.content, sessionKey);
          
          signalsOut.push(signalBuilder.planCreated(
            result.plan.id,
            result.plan.steps,
            { causedBy: [signal.signalId] }
          ));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          signalsOut.push(signalBuilder.modelErrorDetected(
            `Replan failed: ${errorMessage}`,
            { originalSignal: signal },
            { causedBy: [signal.signalId] }
          ));
        }
      }
    }

    return {
      signalsOut,
      stateDelta: stateDeltas,
      metrics: {
        durationMs: 0, // Would track actual duration
        signalsProcessed: signals.length,
        signalsEmitted: signalsOut.length,
      },
    };
  }

  /**
   * Execute the v1 loop
   */
  private async executeV1Loop(content: string, sessionKey: string): Promise<{
    plan: Plan;
    evaluation: Evaluation;
    artifactPaths: unknown;
  }> {
    return this.config.v1Loop(
      { content, sessionKey },
      {
        artifactBaseDir: this.config.artifactBaseDir,
        autonomyLevel: this.config.autonomyLevel ?? 1,
        enableMemory: this.config.enableMemory ?? true,
      }
    );
  }
}
