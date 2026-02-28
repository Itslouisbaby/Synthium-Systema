import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  applyRolloutStateToPolicy,
  defaultRolloutState,
  promoteRollout,
  recordCohortHealth,
  rollbackRollout,
  saveRolloutState,
} from '../../src/neuronwaves-v2/canary/cohort-rollout';
import {
  resolveRoutingPolicyFromEnvOrState,
  shouldBlockGACutover,
} from '../../src/neuronwaves-v2/canary/default-route';

describe('PR9 cohort rollout manager', () => {
  it('promotes stage progressively from C to D and supports rollback', () => {
    const base = defaultRolloutState({
      enabled: true,
      percentToV2: 20,
      controlledTenants: ['tenant-a'],
      controlledSessions: [],
    });

    const p1 = promoteRollout(base);
    const p2 = promoteRollout(p1);
    const p3 = promoteRollout(p2);

    expect(p1.percentToV2).toBe(30);
    expect(p2.percentToV2).toBe(40);
    expect(p3.stage).toBe('D');
    expect(p3.percentToV2).toBe(50);

    const rolledBack = rollbackRollout(p3);
    expect(rolledBack.stage).toBe('C');
    expect(rolledBack.percentToV2).toBe(0);
  });

  it('records per-cohort route and gate health counters', () => {
    const initial = defaultRolloutState({
      enabled: true,
      percentToV2: 25,
      controlledTenants: ['tenant-a'],
      controlledSessions: [],
    });

    const afterPromote = recordCohortHealth(initial, 'tenant:tenant-a', 'v2', 'promote');
    const afterHold = recordCohortHealth(afterPromote, 'tenant:tenant-a', 'v1', 'hold');
    const afterRollback = recordCohortHealth(afterHold, 'tenant:tenant-a', 'v1', 'rollback');

    const cohort = afterRollback.cohorts['tenant:tenant-a'];
    expect(cohort.total).toBe(3);
    expect(cohort.v2Routed).toBe(1);
    expect(cohort.v1Routed).toBe(2);
    expect(cohort.promoteCount).toBe(1);
    expect(cohort.holdCount).toBe(1);
    expect(cohort.rollbackCount).toBe(1);
  });

  it('loads routing policy from rollout state file with no manual env edits', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'synth-rollout-pr9-'));
    const statePath = join(dir, 'rollout-state.json');
    const state = {
      ...defaultRolloutState({
        enabled: false,
        percentToV2: 0,
        controlledTenants: [],
        controlledSessions: [],
      }),
      stage: 'D' as const,
      percentToV2: 65,
      controlledTenants: ['tenant-live'],
    };
    await saveRolloutState(statePath, state);

    const policy = await resolveRoutingPolicyFromEnvOrState({
      SYNTH_V2_DEFAULT_ROUTE_ENABLED: '0',
      SYNTH_V2_DEFAULT_ROUTE_PERCENT: '0',
      SYNTH_V2_ROLLOUT_STATE_PATH: statePath,
    } as NodeJS.ProcessEnv);

    const applied = applyRolloutStateToPolicy(
      { enabled: false, percentToV2: 0, controlledTenants: [], controlledSessions: [] },
      state
    );

    expect(policy.enabled).toBe(true);
    expect(policy.percentToV2).toBe(65);
    expect(policy.controlledTenants).toEqual(['tenant-live']);
    expect(applied.percentToV2).toBe(65);
  });
});

describe('PR10 GA release guard', () => {
  it('blocks GA cutover when release guard is enabled and gate is not promote', () => {
    const blocked = shouldBlockGACutover(
      { decision: 'hold', failedChecks: ['semantic_floor'] },
      { SYNTH_GA_RELEASE_GUARD: '1' } as NodeJS.ProcessEnv
    );

    expect(blocked.blocked).toBe(true);
    expect(blocked.reason).toContain('requires promote');
  });

  it('allows GA cutover when release guard enabled and gate is promote', () => {
    const allowed = shouldBlockGACutover(
      { decision: 'promote', failedChecks: [] },
      { SYNTH_GA_RELEASE_GUARD: '1' } as NodeJS.ProcessEnv
    );

    expect(allowed.blocked).toBe(false);
  });
});
