/**
 * Tool Executor - Milestone 6
 * Executes tools with timeout, limits, and audit trails
 */
import { randomUUID } from 'node:crypto';
import type { PlanStep } from '../types.js';
import { ActionClass } from '../types.js';
import type { Tool, ToolLimits, ExecutorResult, ToolRegistry } from './types.js';
import { DEFAULT_TOOL_LIMITS } from './types.js';

/**
 * Tool execution statistics
 */
export interface ExecutionStats {
  startedAtMs: number;
  endedAtMs: number;
  success: boolean;
  error?: string;
}

/**
 * Execute a tool with timeout
 */
export function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<{ result: T; durationMs: number } | { error: string; durationMs: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const timer = setTimeout(() => {
      resolve({
        error: `Tool execution timed out after ${timeoutMs}ms`,
        durationMs: Date.now() - startTime,
      });
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve({ result, durationMs: Date.now() - startTime });
      })
      .catch((error) => {
        clearTimeout(timer);
        resolve({
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
        });
      });
  });
}

/**
 * ToolExecutor - executes tools with security checks and audit
 */
export class ToolExecutor {
  private registry: ToolRegistry;
  private limits: ToolLimits;
  private callCount: number = 0;

  constructor(registry: ToolRegistry, limits: ToolLimits = DEFAULT_TOOL_LIMITS) {
    this.registry = registry;
    this.limits = limits;
  }

  /**
   * Can this step be executed?
   * Returns { canExecute, reason }
   */
  canExecuteStep(
    step: PlanStep,
    stepToolLimits?: Partial<ToolLimits>
  ): { canExecute: boolean; reason?: string } {
    // Check status
    if (step.status === 'awaiting_approval') {
      return { canExecute: false, reason: 'step_awaiting_approval' };
    }

    if (step.status === 'blocked') {
      return { canExecute: false, reason: 'step_blocked' };
    }

    if (step.status !== 'allowed') {
      return { canExecute: false, reason: `step_status_${step.status}` };
    }

    // Check if step has a toolName
    if (!step.toolName) {
      return { canExecute: false, reason: 'no_tool_name' };
    }

    // Check actionClass
    if (step.actionClass !== ActionClass.LocalOnly) {
      return { canExecute: false, reason: `action_class_${step.actionClass}` };
    }

    // Check tool is registered
    if (!this.registry.has(step.toolName)) {
      return { canExecute: false, reason: 'unknown_tool' };
    }

    // Check maxToolCallsPerRun
    const effectiveLimit = stepToolLimits?.maxToolCallsPerRun ?? this.limits.maxToolCallsPerRun;
    if (this.callCount >= effectiveLimit) {
      return { canExecute: false, reason: 'max_calls_exceeded' };
    }

    return { canExecute: true };
  }

  /**
   * Execute a single step
   * Returns the executed step with updated status
   */
  async executeStep(
    step: PlanStep,
    workspace: string,
    stepToolLimits?: Partial<ToolLimits>
  ): Promise<{ step: PlanStep; result: ExecutorResult }> {
    // Check if can execute
    const { canExecute, reason } = this.canExecuteStep(step, stepToolLimits);
    
    if (!canExecute) {
      // Step is skipped
      const result: ExecutorResult = {
        success: false,
        error: reason,
        durationMs: 0,
      };
      
      const updatedStep: PlanStep = {
        ...step,
        status: 'skipped',
        outputSummary: { skipped: true, reason },
      };
      
      return { step: updatedStep, result };
    }

    // Get the tool
    const tool = this.registry.get(step.toolName!);
    if (!tool) {
      // Shouldn't happen due to canExecuteStep check
      const result: ExecutorResult = {
        success: false,
        error: 'tool_not_found_after_check',
        durationMs: 0,
      };
      const updatedStep: PlanStep = {
        ...step,
        status: 'skipped',
        outputSummary: { skipped: true, reason: 'tool_registry_error' },
      };
      return { step: updatedStep, result };
    }

    // Increment call count
    this.callCount++;

    // Execute with timeout
    const effectiveLimits = { ...this.limits, ...stepToolLimits };
    const timeoutMs = effectiveLimits.toolTimeoutMs;
    const startedAtMs = Date.now();
    const toolCallId = randomUUID();

    const timeoutResult = await executeWithTimeout(
      () => tool.execute(step.toolInput ?? {}, workspace, effectiveLimits),
      timeoutMs
    );

    if ('error' in timeoutResult) {
      // Timeout or error
      const result: ExecutorResult = {
        success: false,
        error: timeoutResult.error,
        durationMs: timeoutResult.durationMs,
      };
      
      const updatedStep: PlanStep = {
        ...step,
        status: 'failed',
        outputSummary: { failed: true, error: timeoutResult.error },
      };
      
      return { step: updatedStep, result };
    }

    // Success
    const execResult = timeoutResult.result as ExecutorResult;
    const endedAtMs = Date.now();

    // Build the result
    const result: ExecutorResult = {
      success: execResult.success,
      output: execResult.output,
      error: execResult.error,
      durationMs: timeoutResult.durationMs,
    };

    // Update step
    const updatedStep: PlanStep = {
      ...step,
      status: execResult.success ? 'executed' : 'failed',
      outputSummary: execResult.success
        ? execResult.output ?? { executed: true }
        : { failed: true, error: execResult.error },
    };

    return { step: updatedStep, result };
  }

  /**
   * Execute all allowed steps in a plan
   * Returns updated steps with execution results
   */
  async executePlanSteps(
    steps: PlanStep[],
    workspace: string
  ): Promise<{ steps: PlanStep[]; results: ExecutorResult[] }> {
    const executedSteps: PlanStep[] = [];
    const results: ExecutorResult[] = [];

    for (const step of steps) {
      const { step: updatedStep, result } = await this.executeStep(step, workspace);
      executedSteps.push(updatedStep);
      results.push(result);
    }

    return { steps: executedSteps, results };
  }

  /**
   * Get current call count
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset call count
   */
  resetCallCount(): void {
    this.callCount = 0;
  }
}
