import { PolicyGate } from '../policy/gate.js';
import { ActionClass, Autonomy } from '../policy/types.js';
import type { LLMProvider } from '../llm/llm-provider.js';
import type { Evaluation, Plan, PlanStep } from '../types.js';

interface PipelineInput {
  content: string;
  sessionKey: string;
}

interface PipelineConfig {
  artifactBaseDir: string;
  autonomyLevel?: number;
  enableMemory?: boolean;
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

  if (/\b(web|http|url|site)\b/.test(normalized)) {
    return { actionClass: ActionClass.ExternalRead, target: 'unknown' };
  }

  return { actionClass: ActionClass.LocalOnly };
}

export function createV1PipelineAdapter(llm: LLMProvider) {
  return async function runPipeline(input: PipelineInput, config: PipelineConfig): Promise<PipelineResult> {
    const now = Date.now();
    const planId = `plan-${now}`;
    const evalId = `eval-${now}`;

    const { actionClass, target } = detectActionClass(input.content);
    const stepId = `step-${now}`;

    const policyGate = new PolicyGate((config.autonomyLevel as 1 | 2 | 3) ?? Autonomy.Level1, {
      baseDir: config.artifactBaseDir,
      allowlist: ['example.com', 'docs.example.com'],
      policyId: 'runtime-default',
      policyVersion: 'phase-a',
      policyEffectiveAt: new Date(now).toISOString(),
      policyHash: 'local-runtime',
    });

    const decision = policyGate.evaluate({ stepId, actionClass, target });
    const audit = policyGate.createAuditEvent(stepId, decision, now);

    let status: PlanStep['status'];
    let outputSummary: unknown;
    let result: Evaluation['result'];
    let summary: string;

    if (decision.decision === 'allow') {
      try {
        const response = await llm.generateWithContext(input.content, [
          'You are executing a policy-approved local reasoning step.',
        ]);
        status = 'executed';
        outputSummary = response;
        result = 'success';
        summary = response;
      } catch (error) {
        status = 'failed';
        result = 'failure';
        summary = `Execution failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    } else if (decision.decision === 'awaiting_approval') {
      status = 'awaiting_approval';
      result = 'partial';
      summary = `Awaiting approval: ${decision.reason}`;
    } else {
      status = 'blocked';
      result = 'failure';
      summary = `Blocked by policy: ${decision.reason}`;
    }

    const plan: Plan = {
      id: planId,
      sessionKey: input.sessionKey,
      createdAtMs: now,
      steps: [
        {
          stepId,
          intent: input.content,
          actionClass,
          status,
          toolName: actionClass === ActionClass.LocalOnly ? 'local_reason' : undefined,
          toolInput: { content: input.content },
          outputSummary,
        },
      ],
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
        policyAuditEvents: [
          {
            stepId: audit.stepId,
            decision: audit.decision,
            reason: audit.reason,
            timestampMs: audit.timestampMs,
          },
        ],
      },
    };
  };
}
