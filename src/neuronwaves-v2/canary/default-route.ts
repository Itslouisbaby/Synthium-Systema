import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export interface CanaryRoutingContext {
  tenantId?: string;
  sessionId: string;
}

export interface CanaryRoutingPolicy {
  enabled: boolean;
  percentToV2: number;
  controlledTenants: string[];
  controlledSessions: string[];
}

export interface CanaryGateStatus {
  decision: 'promote' | 'hold' | 'rollback';
  failedChecks: string[];
}

export interface RoutingDecision {
  route: 'v1' | 'v2';
  reason: string;
  autoAbort: boolean;
  effectivePercentToV2: number;
}

function stablePercent(seed: string): number {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 8);
  const bucket = Number.parseInt(digest, 16) % 100;
  return bucket;
}

function inControlledCohort(context: CanaryRoutingContext, policy: CanaryRoutingPolicy): boolean {
  if (context.tenantId && policy.controlledTenants.includes(context.tenantId)) {
    return true;
  }

  return policy.controlledSessions.includes(context.sessionId);
}

export function applyGateDecisionToPercent(percentToV2: number, gate?: CanaryGateStatus): number {
  const bounded = Math.max(0, Math.min(100, percentToV2));
  if (!gate) return bounded;

  if (gate.decision === 'rollback') {
    return 0;
  }

  if (gate.decision === 'hold') {
    return Math.min(bounded, 5);
  }

  return bounded;
}

export function resolveCanaryRoute(
  context: CanaryRoutingContext,
  policy: CanaryRoutingPolicy,
  gate?: CanaryGateStatus
): RoutingDecision {
  if (!policy.enabled) {
    return { route: 'v1', reason: 'v2 canary routing disabled', autoAbort: false, effectivePercentToV2: 0 };
  }

  const effectivePercentToV2 = applyGateDecisionToPercent(policy.percentToV2, gate);

  if (gate?.decision === 'rollback') {
    return {
      route: 'v1',
      reason: `auto-abort active from canary gate decision: ${gate.decision}`,
      autoAbort: true,
      effectivePercentToV2,
    };
  }

  if (!inControlledCohort(context, policy)) {
    return { route: 'v1', reason: 'outside controlled tenant/session cohort', autoAbort: false, effectivePercentToV2 };
  }

  if (effectivePercentToV2 <= 0) {
    return {
      route: 'v1',
      reason: gate?.decision === 'hold'
        ? 'gate hold throttled v2 route to 0%-5% envelope'
        : 'policy percentToV2 is 0%',
      autoAbort: false,
      effectivePercentToV2,
    };
  }

  if (effectivePercentToV2 >= 100) {
    return { route: 'v2', reason: 'policy percentToV2 is 100%', autoAbort: false, effectivePercentToV2 };
  }

  const seed = `${context.tenantId ?? 'no-tenant'}:${context.sessionId}`;
  const bucket = stablePercent(seed);

  return bucket < effectivePercentToV2
    ? { route: 'v2', reason: `bucket ${bucket} < ${effectivePercentToV2}`, autoAbort: false, effectivePercentToV2 }
    : { route: 'v1', reason: `bucket ${bucket} >= ${effectivePercentToV2}`, autoAbort: false, effectivePercentToV2 };
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

export function parseRoutingPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): CanaryRoutingPolicy {
  return {
    enabled: env.SYNTH_V2_DEFAULT_ROUTE_ENABLED === '1',
    percentToV2: Number.parseInt(env.SYNTH_V2_DEFAULT_ROUTE_PERCENT ?? '0', 10),
    controlledTenants: parseList(env.SYNTH_V2_CONTROLLED_TENANTS),
    controlledSessions: parseList(env.SYNTH_V2_CONTROLLED_SESSIONS),
  };
}

export function parseGateStatusFromEnv(env: NodeJS.ProcessEnv = process.env): CanaryGateStatus | undefined {
  const decision = env.SYNTH_V2_GATE_DECISION;
  if (decision !== 'promote' && decision !== 'hold' && decision !== 'rollback') {
    return undefined;
  }

  return {
    decision,
    failedChecks: parseList(env.SYNTH_V2_GATE_FAILED_CHECKS),
  };
}

export async function loadGateStatusFromMachineReport(path: string): Promise<CanaryGateStatus | undefined> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { decision?: string; report?: { failedChecks?: string[] } };
    if (parsed.decision !== 'promote' && parsed.decision !== 'hold' && parsed.decision !== 'rollback') {
      return undefined;
    }

    return {
      decision: parsed.decision,
      failedChecks: parsed.report?.failedChecks ?? [],
    };
  } catch {
    return undefined;
  }
}

export async function resolveGateStatusFromEnvOrReport(env: NodeJS.ProcessEnv = process.env): Promise<CanaryGateStatus | undefined> {
  const envGate = parseGateStatusFromEnv(env);
  if (envGate) return envGate;

  const reportPath = env.SYNTH_V2_GATE_REPORT_PATH ?? '.synth/canary/promotion-gate-report.json';
  return loadGateStatusFromMachineReport(reportPath);
}
