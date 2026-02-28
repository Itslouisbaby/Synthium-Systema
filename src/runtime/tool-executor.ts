import { createHash } from 'node:crypto';

import type { LLMProvider } from '../llm/llm-provider.js';

export type SupportedToolName = 'local_reason' | 'external_read_reasoning';

export interface ToolExecutionEnvelope {
  stepId: string;
  toolName: SupportedToolName;
  input: {
    content: string;
    target?: string;
  };
  allowlist: string[];
  maxRetries: number;
  timeoutMs: number;
}

export interface ToolExecutionEvent {
  eventId: string;
  stepId: string;
  toolName: SupportedToolName;
  attempt: number;
  status: 'success' | 'failed' | 'skipped_policy';
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  inputHash: string;
  outputSummary?: string;
  error?: string;
}

export interface ToolExecutionResult {
  outputSummary: string;
  attempts: number;
  events: ToolExecutionEvent[];
}

function hashInput(input: ToolExecutionEnvelope['input']): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

function validateEnvelope(envelope: ToolExecutionEnvelope): void {
  if (!envelope.stepId || !envelope.toolName) {
    throw new Error('invalid_tool_envelope: missing stepId/toolName');
  }

  if (typeof envelope.input.content !== 'string' || envelope.input.content.trim().length === 0) {
    throw new Error('invalid_tool_envelope: missing input content');
  }

  if (envelope.toolName === 'external_read_reasoning') {
    const target = envelope.input.target;
    if (!target) {
      throw new Error('invalid_tool_envelope: external_read_reasoning requires target');
    }
    if (!envelope.allowlist.includes(target)) {
      throw new Error(`tool_scope_violation: target ${target} not allowlisted`);
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`tool_timeout_after_${timeoutMs}ms`)), timeoutMs);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function executeToolWithBoundary(
  llm: LLMProvider,
  envelope: ToolExecutionEnvelope,
  context: string[]
): Promise<ToolExecutionResult> {
  validateEnvelope(envelope);

  const events: ToolExecutionEvent[] = [];
  const inputHash = hashInput(envelope.input);
  const retries = Math.max(0, envelope.maxRetries);

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const startedAtMs = Date.now();

    try {
      const outputSummary = await withTimeout(
        llm.generateWithContext(envelope.input.content, context),
        envelope.timeoutMs
      );

      const endedAtMs = Date.now();
      events.push({
        eventId: `${envelope.stepId}-attempt-${attempt}`,
        stepId: envelope.stepId,
        toolName: envelope.toolName,
        attempt,
        status: 'success',
        startedAtMs,
        endedAtMs,
        durationMs: endedAtMs - startedAtMs,
        inputHash,
        outputSummary,
      });

      return {
        outputSummary,
        attempts: attempt,
        events,
      };
    } catch (error) {
      const endedAtMs = Date.now();
      lastError = error instanceof Error ? error.message : String(error);
      events.push({
        eventId: `${envelope.stepId}-attempt-${attempt}`,
        stepId: envelope.stepId,
        toolName: envelope.toolName,
        attempt,
        status: 'failed',
        startedAtMs,
        endedAtMs,
        durationMs: endedAtMs - startedAtMs,
        inputHash,
        error: lastError,
      });
    }
  }

  throw new Error(lastError ?? 'tool_execution_failed_without_error');
}
