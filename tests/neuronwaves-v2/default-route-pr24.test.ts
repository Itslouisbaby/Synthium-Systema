import { describe, expect, it } from 'vitest';

import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  applyGateDecisionToPercent,
  loadGateStatusFromMachineReport,
  parseGateStatusFromEnv,
  parseRoutingPolicyFromEnv,
  resolveCanaryRoute,
  resolveGateStatusFromEnvOrReport,
} from '../../src/neuronwaves-v2/canary/default-route';

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
    expect(holdDecision.autoAbort).toBe(false);
    expect(holdDecision.effectivePercentToV2).toBe(5);
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

  it('loads gate decision from machine report and auto-aborts route on rollback', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'synth-pr8-gate-'));
    const reportPath = join(dir, 'gate.json');
    await writeFile(reportPath, JSON.stringify({
      decision: 'rollback',
      report: { failedChecks: ['semantic_below_floor'] },
    }), 'utf8');

    const gate = await loadGateStatusFromMachineReport(reportPath);
    expect(gate?.decision).toBe('rollback');

    const decision = resolveCanaryRoute(
      { tenantId: 'tenant-alpha', sessionId: 's1' },
      {
        enabled: true,
        percentToV2: 25,
        controlledTenants: ['tenant-alpha'],
        controlledSessions: [],
      },
      gate
    );

    expect(decision.route).toBe('v1');
    expect(decision.autoAbort).toBe(true);
    expect(decision.effectivePercentToV2).toBe(0);
  });

  it('throttles effective percent on hold decision and resolves from env/report fallback', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'synth-pr8-hold-'));
    const reportPath = join(dir, 'gate.json');
    await writeFile(reportPath, JSON.stringify({ decision: 'hold', report: { failedChecks: [] } }), 'utf8');

    const gate = await resolveGateStatusFromEnvOrReport({
      SYNTH_V2_GATE_REPORT_PATH: reportPath,
    } as NodeJS.ProcessEnv);

    expect(gate?.decision).toBe('hold');
    expect(applyGateDecisionToPercent(25, gate)).toBe(5);
  });

});
