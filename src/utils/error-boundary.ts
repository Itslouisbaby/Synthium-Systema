/**
 * Error Boundary & Resilience System
 * 
 * Prevents crashes from individual loop failures
 * Emits recovery signals for monitoring and healing
 */

import { SignalBus } from '../runtime/signal-bus.js';

/** Error severity levels */
export enum ErrorSeverity {
  WARNING = 'warning',     // Non-critical, logged
  ERROR = 'error',         // Component failed, recovered
  CRITICAL = 'critical',   // System may be unstable
  FATAL = 'fatal',         // Requires restart
}

/** Recovery strategy */
export enum RecoveryStrategy {
  RETRY = 'retry',           // Retry operation
  SKIP = 'skip',             // Skip and continue
  RESET = 'reset',           // Reset component state
  CIRCUIT_BREAK = 'circuit_break', // Stop calls temporarily
  ESCALATE = 'escalate',     // Escalate to higher level
}

/** Error context for debugging */
export interface ErrorContext {
  readonly component: string;
  readonly operation: string;
  readonly input?: unknown;
  readonly timestamp: number;
  readonly sessionKey?: string;
}

/** Recovery result */
export interface RecoveryResult {
  readonly success: boolean;
  readonly strategy: RecoveryStrategy;
  readonly attempts: number;
  readonly recoveredAt?: number;
  readonly fallbackValue?: unknown;
}

/** Error boundary configuration */
export interface ErrorBoundaryConfig {
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly circuitBreakerThreshold: number;
  readonly circuitBreakerResetMs: number;
  readonly emitSignals: boolean;
}

/** Circuit breaker state */
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  open: boolean;
}

/**
 * Error Boundary
 * 
 * Wraps operations with retry, circuit breaker, and recovery
 */
export class ErrorBoundary {
  private config: Required<ErrorBoundaryConfig>;
  private signalBus?: SignalBus;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  constructor(config: Partial<ErrorBoundaryConfig> = {}, signalBus?: SignalBus) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      circuitBreakerThreshold: config.circuitBreakerThreshold ?? 5,
      circuitBreakerResetMs: config.circuitBreakerResetMs ?? 30000,
      emitSignals: config.emitSignals ?? true,
    };
    this.signalBus = signalBus;
  }

  /**
   * Execute function with error boundary
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    options?: {
      fallback?: T;
      strategies?: RecoveryStrategy[];
    }
  ): Promise<T> {
    const strategies = options?.strategies ?? [
      RecoveryStrategy.RETRY,
      RecoveryStrategy.RESET,
      RecoveryStrategy.SKIP,
    ];

    let lastError: Error | undefined;

    for (const strategy of strategies) {
      const result = await this.tryStrategy(operation, context, strategy, options?.fallback);

      if (result.success) {
        return result.fallbackValue as T;
      }

      lastError = result as unknown as Error;
    }

    // All strategies failed
    await this.emitFatalError(context, lastError!);
    throw lastError;
  }

  /**
   * Wrap a function with error boundary
   */
  wrap<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    context: Omit<ErrorContext, 'input' | 'timestamp'>,
    options?: { fallback?: TReturn }
  ): (...args: TArgs) => Promise<TReturn> {
    return async (...args: TArgs) => {
      return this.execute(
        () => fn(...args),
        {
          ...context,
          input: args,
          timestamp: Date.now(),
        },
        options
      );
    };
  }

  /**
   * Check if circuit breaker is open for a component
   */
  isCircuitOpen(component: string): boolean {
    const state = this.circuitBreakers.get(component);
    if (!state) return false;

    // Check if we should reset
    if (state.open && Date.now() - state.lastFailure > this.config.circuitBreakerResetMs) {
      this.circuitBreakers.delete(component);
      return false;
    }

    return state.open;
  }

  /**
   * Record success (for circuit breaker)
   */
  recordSuccess(component: string): void {
    this.circuitBreakers.delete(component);
  }

  /**
   * Get circuit breaker stats
   */
  getCircuitStats(): Array<{ component: string; failures: number; open: boolean }> {
    return Array.from(this.circuitBreakers.entries()).map(([component, state]) => ({
      component,
      failures: state.failures,
      open: state.open,
    }));
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuits(): void {
    this.circuitBreakers.clear();
  }

  // Private methods

  private async tryStrategy<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    strategy: RecoveryStrategy,
    fallback?: T
  ): Promise<RecoveryResult> {
    const startTime = Date.now();

    switch (strategy) {
      case RecoveryStrategy.RETRY:
        return this.tryRetry(operation, context);

      case RecoveryStrategy.SKIP:
        return {
          success: true,
          strategy,
          attempts: 0,
          fallbackValue: fallback,
          recoveredAt: Date.now(),
        };

      case RecoveryStrategy.RESET:
        // Reset state and retry once
        return this.tryRetry(operation, context, 1);

      case RecoveryStrategy.CIRCUIT_BREAK:
        if (this.isCircuitOpen(context.component)) {
          return {
            success: false,
            strategy,
            attempts: 0,
          };
        }
        return this.tryRetry(operation, context);

      case RecoveryStrategy.ESCALATE:
        await this.emitEscalation(context);
        return {
          success: false,
          strategy,
          attempts: 0,
        };

      default:
        return {
          success: false,
          strategy,
          attempts: 0,
        };
    }
  }

  private async tryRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    maxAttempts: number = this.config.maxRetries
  ): Promise<RecoveryResult> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await operation();
        this.recordSuccess(context.component);

        if (attempt > 1) {
          await this.emitRecovery(context, attempt);
        }

        return {
          success: true,
          strategy: RecoveryStrategy.RETRY,
          attempts: attempt,
          fallbackValue: result,
          recoveredAt: Date.now(),
        };
      } catch (error) {
        this.recordFailure(context.component);

        await this.emitError(context, error as Error, attempt);

        if (attempt < maxAttempts) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      strategy: RecoveryStrategy.RETRY,
      attempts: maxAttempts,
    };
  }

  private recordFailure(component: string): void {
    let state = this.circuitBreakers.get(component);

    if (!state) {
      state = { failures: 0, lastFailure: 0, open: false };
    }

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= this.config.circuitBreakerThreshold) {
      state.open = true;
      this.emitCircuitBreakerOpen(component);
    }

    this.circuitBreakers.set(component, state);
  }

  private async emitError(context: ErrorContext, error: Error, attempt: number): Promise<void> {
    if (!this.config.emitSignals || !this.signalBus) return;

    // Use dynamic import to avoid circular dependency
    const { SignalBus } = await import('../runtime/signal-bus.js');

    const signal = SignalBus.createSignal(
      'LOOP_ERROR',
      {
        component: context.component,
        operation: context.operation,
        error: error.message,
        stack: error.stack,
        attempt,
        severity: attempt >= this.config.maxRetries ? ErrorSeverity.ERROR : ErrorSeverity.WARNING,
      },
      (context.sessionKey as any) ?? 'system',
      context.component,
      'heartbeat'
    );

    await this.signalBus.append(signal);
  }

  private async emitRecovery(context: ErrorContext, attempts: number): Promise<void> {
    if (!this.config.emitSignals || !this.signalBus) return;

    const { SignalBus } = await import('../runtime/signal-bus.js');

    const signal = SignalBus.createSignal(
      'LOOP_ERROR_RECOVERED',
      {
        component: context.component,
        operation: context.operation,
        attempts,
        recoveredAt: Date.now(),
      },
      (context.sessionKey as any) ?? 'system',
      context.component,
      'palpitation'
    );

    await this.signalBus.append(signal);
  }

  private async emitFatalError(context: ErrorContext, error: Error): Promise<void> {
    if (!this.config.emitSignals || !this.signalBus) return;

    const { SignalBus } = await import('../runtime/signal-bus.js');

    const signal = SignalBus.createSignal(
      'LOOP_FATAL_ERROR',
      {
        component: context.component,
        operation: context.operation,
        error: error.message,
        stack: error.stack,
        severity: ErrorSeverity.FATAL,
        requiresRestart: true,
      },
      (context.sessionKey as any) ?? 'system',
      context.component,
      'event'
    );

    await this.signalBus.append(signal);
  }

  private async emitEscalation(context: ErrorContext): Promise<void> {
    if (!this.config.emitSignals || !this.signalBus) return;

    const { SignalBus } = await import('../runtime/signal-bus.js');

    const signal = SignalBus.createSignal(
      'LOOP_ERROR_ESCALATED',
      {
        component: context.component,
        operation: context.operation,
        reason: 'All recovery strategies failed',
      },
      (context.sessionKey as any) ?? 'system',
      context.component,
      'event'
    );

    await this.signalBus.append(signal);
  }

  private emitCircuitBreakerOpen(component: string): void {
    if (!this.config.emitSignals || !this.signalBus) return;

    // Async to avoid blocking
    import('../runtime/signal-bus.js').then(({ SignalBus }) => {
      const signal = SignalBus.createSignal(
        'CIRCUIT_BREAKER_OPEN',
        {
          component,
          failures: this.config.circuitBreakerThreshold,
          resetAfterMs: this.config.circuitBreakerResetMs,
        },
        'system' as any,
        component,
        'heartbeat'
      );

      this.signalBus!.append(signal).catch(console.error);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Loop error handler mixin
 * 
 * Wraps loop tick() with error boundary
 */
export function withErrorBoundary<T extends { tick: (...args: unknown[]) => Promise<unknown> }>(
  loop: T,
  loopName: string,
  signalBus: SignalBus,
  options?: { fallback?: unknown }
): T {
  const boundary = new ErrorBoundary({ emitSignals: true }, signalBus);

  const originalTick = loop.tick.bind(loop);

  loop.tick = async (...args: unknown[]) => {
    return boundary.execute(
      () => originalTick(...args),
      {
        component: loopName,
        operation: 'tick',
        timestamp: Date.now(),
      },
      options
    );
  };

  return loop;
}
