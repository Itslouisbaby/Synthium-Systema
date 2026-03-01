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

export interface ToolDagNode {
  nodeId: string;
  stepId: string;
  toolName: SupportedToolName;
  dependsOn: string[];
  execute: () => Promise<ToolExecutionResult>;
}

export interface NormalizedToolResult {
  nodeId: string;
  stepId: string;
  toolName: SupportedToolName;
  status: 'success' | 'failed' | 'blocked_dependency';
  summary: string;
  payload: Record<string, unknown>;
  dependencyFailures?: string[];
}

export interface ToolDagExecutionArtifact {
  executionOrder: string[];
  executionLevels: string[][];
  results: Record<string, NormalizedToolResult>;
  aggregated: {
    totalNodes: number;
    succeeded: number;
    failed: number;
    blockedDependency: number;
  };
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

export async function executeToolDag(
  nodes: ToolDagNode[],
  normalizeResult: (node: ToolDagNode, result: ToolExecutionResult) => NormalizedToolResult,
): Promise<ToolDagExecutionArtifact> {
  const pending = new Map(nodes.map(node => [node.nodeId, node]));
  const results = new Map<string, NormalizedToolResult>();
  const executionOrder: string[] = [];
  const executionLevels: string[][] = [];

  while (pending.size > 0) {
    const ready = [...pending.values()]
      .filter(node => node.dependsOn.every(dep => results.has(dep)))
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId));

    if (ready.length === 0) {
      const unresolved = [...pending.values()].map(node => node.nodeId).join(', ');
      throw new Error(`tool_dag_invalid_or_cyclic: unresolved nodes ${unresolved}`);
    }

    const levelIds = ready.map(node => node.nodeId);
    executionLevels.push(levelIds);

    const settled = await Promise.all(ready.map(async node => {
      const failedDeps = node.dependsOn.filter(dep => {
        const depResult = results.get(dep);
        return depResult ? depResult.status !== 'success' : false;
      });

      if (failedDeps.length > 0) {
        const blocked: NormalizedToolResult = {
          nodeId: node.nodeId,
          stepId: node.stepId,
          toolName: node.toolName,
          status: 'blocked_dependency',
          summary: `Blocked by failed dependencies: ${failedDeps.join(', ')}`,
          dependencyFailures: failedDeps,
          payload: {},
        };
        return { node, normalized: blocked };
      }

      try {
        const result = await node.execute();
        return { node, normalized: normalizeResult(node, result) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          node,
          normalized: {
            nodeId: node.nodeId,
            stepId: node.stepId,
            toolName: node.toolName,
            status: 'failed' as const,
            summary: message,
            payload: { error: message },
          },
        };
      }
    }));

    for (const item of settled) {
      pending.delete(item.node.nodeId);
      results.set(item.node.nodeId, item.normalized);
      executionOrder.push(item.node.nodeId);
    }
  }

  const normalized = Object.fromEntries(results.entries());
  const values = [...results.values()];
  return {
    executionOrder,
    executionLevels,
    results: normalized,
    aggregated: {
      totalNodes: values.length,
      succeeded: values.filter(item => item.status === 'success').length,
      failed: values.filter(item => item.status === 'failed').length,
      blockedDependency: values.filter(item => item.status === 'blocked_dependency').length,
    },
  };
}
