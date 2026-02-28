import { createHash } from 'node:crypto';

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

export function resolveCanaryRoute(
  context: CanaryRoutingContext,
  policy: CanaryRoutingPolicy,
  gate?: CanaryGateStatus
): RoutingDecision {
  if (!policy.enabled) {
    return { route: 'v1', reason: 'v2 canary routing disabled', autoAbort: false };
  }

  if (gate && gate.decision !== 'promote') {
    return {
      route: 'v1',
      reason: `auto-abort active from canary gate decision: ${gate.decision}`,
      autoAbort: true,
    };
  }

  if (!inControlledCohort(context, policy)) {
    return { route: 'v1', reason: 'outside controlled tenant/session cohort', autoAbort: false };
  }

  const percent = Math.max(0, Math.min(100, policy.percentToV2));
  if (percent <= 0) {
    return { route: 'v1', reason: 'policy percentToV2 is 0%', autoAbort: false };
  }

  if (percent >= 100) {
    return { route: 'v2', reason: 'policy percentToV2 is 100%', autoAbort: false };
  }

  const seed = `${context.tenantId ?? 'no-tenant'}:${context.sessionId}`;
  const bucket = stablePercent(seed);

  return bucket < percent
    ? { route: 'v2', reason: `bucket ${bucket} < ${percent}`, autoAbort: false }
    : { route: 'v1', reason: `bucket ${bucket} >= ${percent}`, autoAbort: false };
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
