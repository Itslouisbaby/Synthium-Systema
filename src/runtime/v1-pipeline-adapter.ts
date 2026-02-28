import { PolicyGate } from '../policy/gate.js';
import { ActionClass, Autonomy, type ActionClassType } from '../policy/types.js';
import { loadPolicy, simulatePolicyDecision } from '../policy-artifacts/index.js';
import type { LLMProvider } from '../llm/llm-provider.js';
import type { Evaluation, Plan, PlanStep } from '../types.js';
import { executeToolWithBoundary, type ToolExecutionEvent, type SupportedToolName } from './tool-executor.js';

interface PipelineInput {
  content: string;
  sessionKey: string;
  memoryContext?: string[];
}

export interface PlannedAction {
  intent: string;
  actionClass: ActionClassType;
  target?: string;
  dependsOn?: string[];
}

export interface ActionNode {
  nodeId: string;
  intent: string;
  actionClass: ActionClassType;
  target?: string;
  policyTags: string[];
  preconditions: string[];
  inputs: string[];
  outputs: string[];
  dependsOn: string[];
}

export interface ActionGraph {
  version: 'v2';
  nodes: ActionNode[];
}

export interface ExecutionTraceEvent {
  nodeId: string;
  stepId: string;
  status: 'executed' | 'failed' | 'blocked' | 'awaiting_approval';
  startedAtMs: number;
  endedAtMs: number;
  reason?: string;
}

export interface RuntimePlanner {
  plan(input: PipelineInput): PlannedAction[];
}

interface PipelineConfig {
  artifactBaseDir: string;
  autonomyLevel?: number;
  enableMemory?: boolean;
  policyPath?: string;
}

interface PipelineResult {
  plan: Plan;
  evaluation: Evaluation;
  artifactPaths: {
    policyAuditEvents: Array<{
      stepId: string;
      decision: string;
      reason: string;
      timestampMs: number;
    }>;
    toolExecutionEvents: ToolExecutionEvent[];
    replanRequested: boolean;
    replanReason?: string;
    policySource?: string;
    policyVersion?: string;
    policyHash?: string;
    policyLoadError?: string;
    actionGraph: ActionGraph;
    executionTrace: ExecutionTraceEvent[];
  };
}

function detectActionClass(content: string): { actionClass: PlanStep['actionClass']; target?: string } {
  const normalized = content.toLowerCase();

  if (/\b(delete|remove|destroy|wipe)\b/.test(normalized)) {
    return { actionClass: ActionClass.Irreversible };
  }

  const urlMatch = normalized.match(/https?:\/\/([^\s/]+)/);
  if (urlMatch?.[1]) {
    return { actionClass: ActionClass.ExternalRead, target: urlMatch[1] };
  }

  if (/\b(web|http|url|site|fetch|read)\b/.test(normalized)) {
    return { actionClass: ActionClass.ExternalRead, target: 'unknown' };
  }

  return { actionClass: ActionClass.LocalOnly };
}

function normalizeIntent(intent: string): string {
  return intent
    .replace(/^\s*(then|also|next)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitIntoIntents(content: string): string[] {
  return content
    .split(/\b(?:and then|then|and|also|next)\b|;/i)
    .map(normalizeIntent)
    .filter(Boolean);
}


function actionClassToPolicyTags(actionClass: ActionClassType): string[] {
  switch (actionClass) {
    case ActionClass.ExternalRead:
      return ['policy:external_read'];
    case ActionClass.Irreversible:
      return ['policy:irreversible'];
    default:
      return ['policy:local_only'];
  }
}

function buildActionGraph(actions: PlannedAction[]): ActionGraph {
  const nodes: ActionNode[] = actions.map((action, index) => {
    const nodeId = `node-${index + 1}`;
    const dependsOn = (action.dependsOn ?? []).map(item => item.trim()).filter(Boolean);
    return {
      nodeId,
      intent: action.intent,
      actionClass: action.actionClass,
      target: action.target,
      policyTags: actionClassToPolicyTags(action.actionClass),
      preconditions: dependsOn.map(dep => `completed:${dep}`),
      inputs: ['user_input', ...(action.target ? [`target:${action.target}`] : [])],
      outputs: ['step_output_summary'],
      dependsOn,
    };
  });

  return { version: 'v2', nodes };
}

function validateActionGraph(graph: ActionGraph): { valid: boolean; reason?: string } {
  const known = new Set(graph.nodes.map(node => node.nodeId));
  for (const node of graph.nodes) {
    for (const dep of node.dependsOn) {
      if (!known.has(dep)) {
        return { valid: false, reason: `node ${node.nodeId} has unresolved dependency ${dep}` };
      }
    }
  }
  return { valid: true };
}

function defaultPlanner(input: PipelineInput): PlannedAction[] {
  const intents = splitIntoIntents(input.content);
  const pickedIntents = intents.length > 0 ? intents : [normalizeIntent(input.content)];

  return pickedIntents.slice(0, 5).map(intent => ({ intent, ...detectActionClass(intent) }));
}

export function createV1PipelineAdapter(llm: LLMProvider, planner: RuntimePlanner = { plan: defaultPlanner }) {
  return async function runPipeline(input: PipelineInput, config: PipelineConfig): Promise<PipelineResult> {
    const now = Date.now();
    const planId = `plan-${now}`;
    const evalId = `eval-${now}`;

    const plannedActions = planner.plan(input);
    const actionGraph = buildActionGraph(plannedActions);
    const graphValidation = validateActionGraph(actionGraph);
    if (!graphValidation.valid) {
      throw new Error(`invalid_action_graph: ${graphValidation.reason}`);
    }

    let policy: Awaited<ReturnType<typeof loadPolicy>> | null = null;
    let policyLoadError: string | undefined;
    if (config.policyPath) {
      try {
        policy = await loadPolicy({ canonicalPath: config.policyPath, deprecatedFallbackPath: config.policyPath });
      } catch (error) {
        policyLoadError = error instanceof Error ? error.message : String(error);
      }
    }

    const policyGate = new PolicyGate((config.autonomyLevel as 1 | 2 | 3) ?? Autonomy.Level1, {
      baseDir: config.artifactBaseDir,
      allowlist: ['example.com', 'docs.example.com'],
      policyId: policy?.policy.policyId ?? 'runtime-default',
      policyVersion: policy?.policy.version ?? 'phase-a',
      policyEffectiveAt: policy?.policy.effectiveAt ?? new Date(now).toISOString(),
      policyHash: policy?.policyHash ?? 'local-runtime',
    });

    const steps: PlanStep[] = [];
    const policyAuditEvents: PipelineResult['artifactPaths']['policyAuditEvents'] = [];
    const toolExecutionEvents: PipelineResult['artifactPaths']['toolExecutionEvents'] = [];
    let replanRequested = false;
    let replanReason: string | undefined;
    const executionTrace: ExecutionTraceEvent[] = [];

    for (let i = 0; i < plannedActions.length; i++) {
      const action = plannedActions[i];
      const stepId = `step-${now}-${i}`;
      const nodeId = actionGraph.nodes[i]?.nodeId ?? `node-${i + 1}`;
      const startedAtMs = Date.now();

      let decision = policyGate.evaluate({ stepId, actionClass: action.actionClass, target: action.target });

      if (policy && action.actionClass === ActionClass.ExternalRead && action.target) {
        const sim = simulatePolicyDecision(policy.policy, { operation: 'external_read', domain: action.target });
        if (sim.decision === 'deny') {
          decision = {
            decision: 'block',
            reason: `Policy artifact denied domain ${action.target}: ${sim.reason}`,
          };
        }
      }

      const audit = policyGate.createAuditEvent(stepId, decision, Date.now());
      policyAuditEvents.push({
        stepId: audit.stepId,
        decision: audit.decision,
        reason: decision.reason,
        timestampMs: audit.timestampMs,
      });

      if (decision.decision === 'allow') {
        try {
          const toolName: SupportedToolName = action.actionClass === ActionClass.LocalOnly
            ? 'local_reason'
            : 'external_read_reasoning';

          const execution = await executeToolWithBoundary(llm, {
            stepId,
            toolName,
            input: {
              content: action.intent,
              target: action.target,
            },
            allowlist: ['example.com', 'docs.example.com'],
            maxRetries: 1,
            timeoutMs: 2000,
          }, [
            'You are executing a policy-approved reasoning step.',
            ...(input.memoryContext?.slice(-3).map(entry => `Memory: ${entry}`) ?? []),
          ]);

          toolExecutionEvents.push(...execution.events);
          steps.push({
            stepId,
            intent: action.intent,
            actionClass: action.actionClass,
            status: 'executed',
            toolName,
            toolInput: { content: action.intent, target: action.target },
            outputSummary: execution.outputSummary,
          });
          executionTrace.push({
            nodeId,
            stepId,
            status: 'executed',
            startedAtMs,
            endedAtMs: Date.now(),
          });
        } catch (error) {
          replanRequested = true;
          replanReason = error instanceof Error ? error.message : String(error);
          toolExecutionEvents.push({
            eventId: `${stepId}-attempt-final`,
            stepId,
            toolName: action.actionClass === ActionClass.LocalOnly ? 'local_reason' : 'external_read_reasoning',
            attempt: 2,
            status: 'failed',
            startedAtMs: Date.now(),
            endedAtMs: Date.now(),
            durationMs: 0,
            inputHash: stepId,
            error: replanReason,
          });
          steps.push({
            stepId,
            intent: action.intent,
            actionClass: action.actionClass,
            status: 'failed',
            toolInput: { content: action.intent, target: action.target },
            outputSummary: `Execution failed: ${replanReason}`,
          });
          executionTrace.push({
            nodeId,
            stepId,
            status: 'failed',
            startedAtMs,
            endedAtMs: Date.now(),
            reason: replanReason,
          });
        }
        continue;
      }

      if (decision.decision === 'awaiting_approval') {
        toolExecutionEvents.push({
          eventId: `${stepId}-policy-awaiting`,
          stepId,
          toolName: action.actionClass === ActionClass.LocalOnly ? 'local_reason' : 'external_read_reasoning',
          attempt: 0,
          status: 'skipped_policy',
          startedAtMs: Date.now(),
          endedAtMs: Date.now(),
          durationMs: 0,
          inputHash: stepId,
          error: decision.reason,
        });
        steps.push({
          stepId,
          intent: action.intent,
          actionClass: action.actionClass,
          status: 'awaiting_approval',
          toolInput: { content: action.intent, target: action.target },
          outputSummary: `Awaiting approval: ${decision.reason}`,
        });
        executionTrace.push({
          nodeId,
          stepId,
          status: 'awaiting_approval',
          startedAtMs,
          endedAtMs: Date.now(),
          reason: decision.reason,
        });
        continue;
      }

      toolExecutionEvents.push({
        eventId: `${stepId}-policy-block`,
        stepId,
        toolName: action.actionClass === ActionClass.LocalOnly ? 'local_reason' : 'external_read_reasoning',
        attempt: 0,
        status: 'skipped_policy',
        startedAtMs: Date.now(),
        endedAtMs: Date.now(),
        durationMs: 0,
        inputHash: stepId,
        error: decision.reason,
      });
      steps.push({
        stepId,
        intent: action.intent,
        actionClass: action.actionClass,
        status: 'blocked',
        toolInput: { content: action.intent, target: action.target },
        outputSummary: `Blocked by policy: ${decision.reason}`,
      });
      executionTrace.push({
        nodeId,
        stepId,
        status: 'blocked',
        startedAtMs,
        endedAtMs: Date.now(),
        reason: decision.reason,
      });
    }

    const hasFailed = steps.some(s => s.status === 'failed');
    const hasBlocked = steps.some(s => s.status === 'blocked');
    const hasAwaiting = steps.some(s => s.status === 'awaiting_approval');
    const allExecuted = steps.length > 0 && steps.every(s => s.status === 'executed');

    const result: Evaluation['result'] = allExecuted
      ? 'success'
      : hasFailed || hasBlocked
        ? 'failure'
        : hasAwaiting
          ? 'partial'
          : 'partial';

    const summary = steps
      .map(s => String(s.outputSummary ?? s.intent))
      .join(' | ')
      .concat(replanRequested ? '. Replan suggested.' : '')
      .concat(policyLoadError ? ` [Policy load warning: ${policyLoadError}]` : '');

    const plan: Plan = {
      id: planId,
      sessionKey: input.sessionKey,
      createdAtMs: now,
      steps,
    };

    const evaluation: Evaluation = {
      id: evalId,
      planId,
      sessionKey: input.sessionKey,
      result,
      summary,
      evaluatedAtMs: Date.now(),
    };

    return {
      plan,
      evaluation,
      artifactPaths: {
        policyAuditEvents,
        toolExecutionEvents,
        replanRequested,
        ...(replanReason ? { replanReason } : {}),
        ...(policy ? { policySource: policy.source, policyVersion: policy.policy.version, policyHash: policy.policyHash } : {}),
        ...(policyLoadError ? { policyLoadError } : {}),
        actionGraph,
        executionTrace,
      },
    };
  };
}
