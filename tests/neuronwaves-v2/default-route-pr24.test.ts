import { describe, expect, it } from 'vitest';

import { parseGateStatusFromEnv, parseRoutingPolicyFromEnv, resolveCanaryRoute } from '../../src/neuronwaves-v2/canary/default-route';

describe('PR24 default-route canary policy', () => {
  it('routes to v2 for controlled tenant when bucket falls inside configured percent', () => {
    const decision = resolveCanaryRoute(
      {
        tenantId: 'tenant-alpha',
        sessionId: 'session-1',
      },
      {
        enabled: true,
        percentToV2: 100,
        controlledTenants: ['tenant-alpha'],
        controlledSessions: [],
      }
    );

    expect(decision.route).toBe('v2');
    expect(decision.autoAbort).toBe(false);
  });

  it('keeps traffic on v1 outside controlled cohort', () => {
    const decision = resolveCanaryRoute(
      {
        tenantId: 'tenant-unlisted',
        sessionId: 'session-1',
      },
      {
        enabled: true,
        percentToV2: 100,
        controlledTenants: ['tenant-alpha'],
        controlledSessions: [],
      }
    );

    expect(decision.route).toBe('v1');
    expect(decision.reason).toContain('outside controlled');
  });

  it('auto-aborts to v1 when canary gate reports hold or rollback', () => {
    const holdDecision = resolveCanaryRoute(
      {
        tenantId: 'tenant-alpha',
        sessionId: 'session-1',
      },
      {
        enabled: true,
        percentToV2: 100,
        controlledTenants: ['tenant-alpha'],
        controlledSessions: [],
      },
      {
        decision: 'hold',
        failedChecks: ['semantic_below_floor'],
      }
    );

    expect(holdDecision.route).toBe('v1');
    expect(holdDecision.autoAbort).toBe(true);
  });

  it('parses routing and gate env knobs', () => {
    const env = {
      SYNTH_V2_DEFAULT_ROUTE_ENABLED: '1',
      SYNTH_V2_DEFAULT_ROUTE_PERCENT: '25',
      SYNTH_V2_CONTROLLED_TENANTS: 'tenant-alpha,tenant-beta',
      SYNTH_V2_CONTROLLED_SESSIONS: 's1,s2',
      SYNTH_V2_GATE_DECISION: 'promote',
      SYNTH_V2_GATE_FAILED_CHECKS: 'none',
    } as NodeJS.ProcessEnv;

    const policy = parseRoutingPolicyFromEnv(env);
    expect(policy.enabled).toBe(true);
    expect(policy.percentToV2).toBe(25);
    expect(policy.controlledTenants).toEqual(['tenant-alpha', 'tenant-beta']);
    expect(policy.controlledSessions).toEqual(['s1', 's2']);

    const gate = parseGateStatusFromEnv(env);
    expect(gate?.decision).toBe('promote');
  });
});
