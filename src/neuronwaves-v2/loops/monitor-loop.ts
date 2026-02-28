/**
 * MonitorLoop - Track execution outcomes and update self-model
 * Section 5.2: Execution monitoring and self-model updates
 */

import type { 
  MicroLoop, 
  TickResult, 
  Signal, 
  SignalType,
  WorkingState,
  SessionKey,
  StateDelta,
  ToolReliability
} from '../types.js';
import { SignalBus } from '../runtime/signal-bus.js';

/** MonitorLoop configuration */
export interface MonitorLoopConfig {
  /** Confidence threshold for escalation */
  readonly confidenceThreshold?: number;
  /** Success rate window size for reliability tracking */
  readonly reliabilityWindowSize?: number;
  /** Enable experiment scheduling */
  readonly enableExperiments?: boolean;
}

/** Tool execution outcome */
interface ToolOutcome {
  readonly toolName: string;
  readonly success: boolean;
  readonly timestampMs: number;
  readonly error?: string;
}

/**
 * MonitorLoop - Palpitation + event-driven monitoring
 * 
 * Responsibility: Track execution outcomes, update selfModel, trigger world-model revision.
 * 
 * Consumes: TOOL_RESULT_RECEIVED, STEP_EXECUTED, STEP_FAILED, POLICY_DECISION, USER_CORRECTION
 * Emits: CONFIDENCE_RISE, CONFIDENCE_DROP, TOOL_RELIABILITY_UPDATE, MODEL_ERROR_DETECTED,
 *        SCHEDULE_EXPERIMENT, ESCALATE_APPROVAL_SUGGESTED
 * 
 * WorkingState writes: executionLedger, selfModel deltas, uncertainties
 */
export class MonitorLoop implements MicroLoop {
  readonly name = 'MonitorLoop';
  readonly rhythm = 'palpitation' as const;
  readonly tickBudgetMs = 100;
  readonly maxSignalsOut = 10;
  readonly reads = ['selfModel', 'executionLedger', 'uncertainties'] as const;
  readonly writes = ['selfModel', 'executionLedger', 'uncertainties'] as const;
  readonly subscriptions: SignalType[] = [
    'TOOL_RESULT_RECEIVED',
    'STEP_EXECUTED',
    'STEP_FAILED',
    'POLICY_DECISION_EMITTED',
    'PREDICTION_MISMATCH',
    'MODEL_ERROR_DETECTED',
  ];

  private readonly config: MonitorLoopConfig;
  private toolOutcomes: Map<string, ToolOutcome[]> = new Map();

  constructor(config: MonitorLoopConfig = {}) {
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

    // Track outcomes for self-model updates
    const outcomes: ToolOutcome[] = [];
    let policyBlocks = 0;
    let policyApprovals = 0;

    for (const signal of signals) {
      switch (signal.type) {
        case 'STEP_EXECUTED': {
          const payload = signal.payload as { stepId: string; result: unknown };
          
          // Extract tool name from result if available
          const toolName = this.extractToolName(payload.result);
          
          outcomes.push({
            toolName: toolName ?? 'unknown',
            success: true,
            timestampMs: Date.now(),
          });

          // Add to execution ledger
          stateDeltas.push({
            section: 'executionLedger',
            path: '',
            value: {
              entryId: `monitor-${Date.now()}`,
              timestampMs: Date.now(),
              type: 'tool_result',
              description: `Step executed: ${payload.stepId}`,
            },
            operation: 'push',
          });
          break;
        }

        case 'STEP_FAILED': {
          const payload = signal.payload as { stepId: string; chainId?: string; error: string; errorType?: string };
          
          outcomes.push({
            toolName: 'unknown',
            success: false,
            timestampMs: Date.now(),
            error: payload.error,
          });

          // Emit confidence drop
          const chainId = payload.chainId ?? workingState.focus.activeChainId ?? 'unknown-chain';
          signalsOut.push(SignalBus.createSignal(
            'CONFIDENCE_DROP',
            {
              chainId,
              metric: 'execution_success_rate',
              previousValue: Math.max(0, workingState.selfModel.confidenceState.overall),
              currentValue: Math.max(0, workingState.selfModel.confidenceState.overall - 0.1),
              reason: `Step failed: ${payload.error}`,
            },
            sessionKey,
            this.name,
            'event',
            { causedBy: [signal.signalId] }
          ));

          // Check for model error pattern
          if (this.isModelError(payload.error)) {
            signalsOut.push(SignalBus.createSignal(
              'MODEL_ERROR_DETECTED',
              {
                errorType: payload.errorType ?? 'runtime_step_failure',
                description: payload.error,
                affectedChains: [chainId],
              },
              sessionKey,
              this.name,
              'event',
              { causedBy: [signal.signalId] }
            ));
          }
          break;
        }

        case 'POLICY_DECISION_EMITTED': {
          const payload = signal.payload as { stepId: string; decision: string; reason: string };
          
          if (payload.decision === 'block') {
            policyBlocks++;
          } else if (payload.decision === 'awaiting_approval') {
            policyApprovals++;
          }
          break;
        }

        case 'PREDICTION_MISMATCH': {
          const payload = signal.payload as {
            predictionId: string;
            expected: unknown;
            actual: unknown;
            stepId: string;
          };

          signalsOut.push(SignalBus.createSignal(
            'MODEL_ERROR_DETECTED',
            {
              errorType: 'prediction_mismatch',
              description: 'Prediction mismatch detected',
              affectedChains: [payload.stepId],
            },
            sessionKey,
            this.name,
            'event',
            { causedBy: [signal.signalId] }
          ));

          // Schedule experiment if enabled
          if (this.config.enableExperiments) {
            signalsOut.push(SignalBus.createSignal(
              'SCHEDULE_EXPERIMENT',
              {
                hypothesis: `Investigate prediction mismatch for step ${payload.stepId}`,
                experimentType: 'read_only_reconnaissance',
                priority: 'medium',
              },
              sessionKey,
              this.name,
              'heartbeat',
              { causedBy: [signal.signalId] }
            ));
          }
          break;
        }

        case 'MODEL_ERROR_DETECTED': {
          const payload = signal.payload as { description?: string; error?: string; errorType?: string; affectedChains?: string[] };

          // Update self-model confidence
          const confidenceDrop = payload.errorType === 'prediction_mismatch' ? 0.2 : 0.1;
          const newConfidence = Math.max(0, workingState.selfModel.confidenceState.overall - confidenceDrop);

          stateDeltas.push({
            section: 'selfModel',
            path: 'confidenceState',
            value: {
              overall: newConfidence,
              topUncertaintyDrivers: [
                ...workingState.selfModel.confidenceState.topUncertaintyDrivers,
                payload.description ?? payload.error ?? payload.errorType ?? 'model_error',
              ].slice(0, 5),
            },
            operation: 'set',
          });

          // Suggest escalation if confidence too low
          const threshold = this.config.confidenceThreshold ?? 0.5;
          if (newConfidence < threshold) {
            signalsOut.push(SignalBus.createSignal(
              'ESCALATE_APPROVAL_SUGGESTED',
              {
                chainId: workingState.focus.activeChainId ?? 'unknown-chain',
                reason: `Confidence dropped to ${newConfidence.toFixed(2)} below threshold ${threshold}`,
                currentApprover: 'runtime-ops',
              },
              sessionKey,
              this.name,
              'event',
              { causedBy: [signal.signalId] }
            ));
          }
          break;
        }
      }
    }

    // Update self-model based on outcomes
    if (outcomes.length > 0) {
      const reliabilityUpdates = this.updateReliability(workingState, outcomes);
      
      for (const update of reliabilityUpdates) {
        stateDeltas.push({
          section: 'selfModel',
          path: 'reliability',
          value: update,
          operation: 'set',
        });

        // Emit reliability update signal
        signalsOut.push(SignalBus.createSignal(
          'TOOL_RELIABILITY_UPDATE',
          {
            toolName: update.toolName,
            successRate: update.rollingSuccessRate,
            totalCalls: update.successCount + update.failureCount,
          },
          sessionKey,
          this.name,
          'event',
          {}
        ));
      }

      // Update overall confidence
      const successRate = outcomes.filter(o => o.success).length / outcomes.length;
      const confidenceChange = successRate > 0.8 ? 0.05 : successRate < 0.5 ? -0.1 : 0;
      const newConfidence = Math.min(1, Math.max(0, 
        workingState.selfModel.confidenceState.overall + confidenceChange
      ));

      if (confidenceChange > 0) {
        signalsOut.push(SignalBus.createSignal(
          'CONFIDENCE_RISE',
          {
            newConfidence,
            reason: `Successful executions: ${successRate.toFixed(2)}`,
          },
          sessionKey,
          this.name,
          'event',
          {}
        ));
      }

      stateDeltas.push({
        section: 'selfModel',
        path: 'confidenceState',
        value: {
          ...workingState.selfModel.confidenceState,
          overall: newConfidence,
        },
        operation: 'set',
      });
    }

    // Track policy outcomes
    if (policyBlocks > 0) {
      // Add known failure mode for blocked actions
      stateDeltas.push({
        section: 'selfModel',
        path: 'knownFailureModes',
        value: {
          pattern: 'Policy blocked action',
          risk: 'Action class may be too restrictive',
          mitigation: 'Review autonomy level or request explicit approval',
        },
        operation: 'push',
      });
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
   * Extract tool name from result
   */
  private extractToolName(result: unknown): string | null {
    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      if (typeof obj.toolName === 'string') {
        return obj.toolName;
      }
      if (typeof obj.tool === 'string') {
        return obj.tool;
      }
    }
    return null;
  }

  /**
   * Check if error indicates a model error
   */
  private isModelError(error: string): boolean {
    const modelErrorPatterns = [
      'prediction mismatch',
      'unexpected outcome',
      'state inconsistency',
      'belief contradiction',
      'invalid assumption',
    ];
    
    const lowerError = error.toLowerCase();
    return modelErrorPatterns.some(pattern => lowerError.includes(pattern));
  }

  /**
   * Update tool reliability based on outcomes
   */
  private updateReliability(
    workingState: WorkingState,
    outcomes: ToolOutcome[]
  ): ToolReliability[] {
    const windowSize = this.config.reliabilityWindowSize ?? 10;
    const updates: ToolReliability[] = [];

    // Group outcomes by tool
    const byTool = new Map<string, ToolOutcome[]>();
    for (const outcome of outcomes) {
      const existing = byTool.get(outcome.toolName) ?? [];
      existing.push(outcome);
      byTool.set(outcome.toolName, existing);
    }

    // Update reliability for each tool
    for (const [toolName, toolOutcomes] of byTool) {
      // Get existing reliability or create new
      const existing = workingState.selfModel.reliability.find(
        r => r.toolName === toolName
      );

      // Get historical outcomes for this tool
      const historical = this.toolOutcomes.get(toolName) ?? [];
      const allOutcomes = [...historical, ...toolOutcomes];
      
      // Keep only window size
      const windowed = allOutcomes.slice(-windowSize);
      this.toolOutcomes.set(toolName, windowed);

      // Calculate rolling success rate
      const successes = windowed.filter(o => o.success).length;
      const total = windowed.length;
      const rollingRate = total > 0 ? successes / total : 1.0;

      updates.push({
        toolName,
        successCount: (existing?.successCount ?? 0) + toolOutcomes.filter(o => o.success).length,
        failureCount: (existing?.failureCount ?? 0) + toolOutcomes.filter(o => !o.success).length,
        rollingSuccessRate: rollingRate,
      });
    }

    return updates;
  }

  /**
   * Get tool outcomes for a specific tool
   */
  getToolOutcomes(toolName: string): ToolOutcome[] {
    return [...(this.toolOutcomes.get(toolName) ?? [])];
  }

  /**
   * Clear tool outcomes
   */
  clearToolOutcomes(toolName?: string): void {
    if (toolName) {
      this.toolOutcomes.delete(toolName);
    } else {
      this.toolOutcomes.clear();
    }
  }
}
