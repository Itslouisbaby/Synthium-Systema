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
export interface PipelineArtifactPaths {
  policyAuditEvents: Array<{
    stepId: string;
    decision: string;
    reason: string;
    timestampMs: number;
  }>;
  toolExecutionEvents: Array<{
    eventId: string;
    stepId: string;
    toolName: string;
    attempt: number;
    status: 'success' | 'failed' | 'skipped_policy';
    startedAtMs: number;
    endedAtMs: number;
    durationMs: number;
    inputHash: string;
    outputSummary?: string;
    error?: string;
  }>;
  replanRequested: boolean;
  replanReason?: string;
  policySource?: string;
  policyVersion?: string;
  policyHash?: string;
  policyLoadError?: string;
}

export type V1LoopFunction = (input: {
  content: string;
  sessionKey: string;
  memoryContext?: string[];
}, config: {
  artifactBaseDir: string;
  autonomyLevel?: number;
  enableMemory?: boolean;
  policyPath?: string;
}) => Promise<{
  plan: Plan;
  evaluation: Evaluation;
  artifactPaths: PipelineArtifactPaths;
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
  /** Runtime policy path passed to v1 adapter */
  readonly policyPath?: string;
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
    const signalsOut: Array<Omit<Signal, 'signalId'> & { signalId?: string }> = [];
    const stateDeltas = [];

    // Process each input signal
    for (const signal of signals) {
      if (signal.type === 'INPUT_RECEIVED') {
        const payload = signal.payload as { content: string; metadata?: Record<string, unknown> };
        const memoryContextRaw = payload.metadata?.memoryContext;
        const memoryContext = Array.isArray(memoryContextRaw)
          ? memoryContextRaw.filter((entry): entry is string => typeof entry === 'string')
          : undefined;

        try {
          // Execute v1 loop
          const result = await this.executeV1Loop(payload.content, sessionKey, memoryContext);

          // Emit PLAN_CREATED signal
          signalsOut.push(signalBuilder.planCreated(
            result.plan.id,
            result.plan.steps,
            { causedBy: [signal.signalId] }
          ));

          const policyByStepId = new Map(
            result.artifactPaths.policyAuditEvents.map(event => [event.stepId, event])
          );

          const stepInputById = new Map(
            result.plan.steps.map(step => [step.stepId, step.toolInput ?? { content: step.intent }])
          );

          for (const toolEvent of result.artifactPaths.toolExecutionEvents) {
            signalsOut.push(SignalBus.createSignal(
              'TOOL_RESULT_RECEIVED',
              {
                toolName: toolEvent.toolName,
                input: stepInputById.get(toolEvent.stepId) ?? {},
                output: {
                  outputSummary: toolEvent.outputSummary,
                  error: toolEvent.error,
                  status: toolEvent.status,
                  attempt: toolEvent.attempt,
                },
                success: toolEvent.status === 'success',
                durationMs: toolEvent.durationMs,
              },
              sessionKey,
              this.name,
              'event',
              { causedBy: [signal.signalId] }
            ));
          }

          // Emit policy decision signals for each step
          for (const step of result.plan.steps) {
            const policyEvent = policyByStepId.get(step.stepId);
            const policyDecision = policyEvent?.decision
              ?? (step.status === 'executed' ? 'allow' : step.status === 'awaiting_approval' ? 'awaiting_approval' : 'block');
            const policyReason = policyEvent?.reason ?? `v1 policy evaluation: ${step.actionClass}`;

            signalsOut.push(signalBuilder.policyDecision(
              step.stepId,
              policyDecision,
              policyReason,
              { causedBy: [signal.signalId] }
            ));

            // Emit step execution signals
            if (step.status === 'executed') {
              signalsOut.push(signalBuilder.stepExecuted(
                step.stepId,
                {
                  output: step.outputSummary,
                  toolName: step.toolName,
                  toolInput: step.toolInput,
                  intent: step.intent,
                  actionClass: step.actionClass,
                },
                { causedBy: [signal.signalId] }
              ));
            } else if (step.status === 'failed') {
              signalsOut.push(signalBuilder.stepFailed(
                step.stepId,
                String(step.outputSummary ?? 'Execution failed'),
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
            section: 'executionLedger' as keyof WorkingState,
            path: '',
            value: {
              entryId: `cortex-${Date.now()}`,
              timestampMs: Date.now(),
              type: 'tool_result',
              description: `v1 loop completed: ${result.evaluation.summary}`,
              chainId: workingState.focus.activeChainId ?? undefined,
            },
            operation: 'push' as const,
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
  private async executeV1Loop(content: string, sessionKey: string, memoryContext?: string[]): Promise<{
    plan: Plan;
    evaluation: Evaluation;
    artifactPaths: PipelineArtifactPaths;
  }> {
    return this.config.v1Loop(
      { content, sessionKey, memoryContext },
      {
        artifactBaseDir: this.config.artifactBaseDir,
        autonomyLevel: this.config.autonomyLevel ?? 1,
        enableMemory: this.config.enableMemory ?? true,
        policyPath: this.config.policyPath,
      }
    );
  }
}
