import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { CanaryRoutingPolicy } from './default-route.js';

export type RolloutStage = 'C' | 'D';

export interface CohortHealth {
  cohort: string;
  total: number;
  v2Routed: number;
  v1Routed: number;
  rollbackCount: number;
  holdCount: number;
  promoteCount: number;
  lastDecision: 'promote' | 'hold' | 'rollback' | 'none';
  lastUpdated: string;
}

export interface RolloutState {
  stage: RolloutStage;
  percentToV2: number;
  controlledTenants: string[];
  controlledSessions: string[];
  updatedAt: string;
  cohorts: Record<string, CohortHealth>;
}

export function defaultRolloutState(policy: CanaryRoutingPolicy): RolloutState {
  return {
    stage: 'C',
    percentToV2: Math.max(0, Math.min(100, policy.percentToV2)),
    controlledTenants: [...policy.controlledTenants],
    controlledSessions: [...policy.controlledSessions],
    updatedAt: new Date().toISOString(),
    cohorts: {},
  };
}

export async function loadRolloutState(path: string): Promise<RolloutState | undefined> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as RolloutState;
    if (parsed.stage !== 'C' && parsed.stage !== 'D') {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function saveRolloutState(path: string, state: RolloutState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function applyRolloutStateToPolicy(policy: CanaryRoutingPolicy, state?: RolloutState): CanaryRoutingPolicy {
  if (!state) return policy;
  return {
    ...policy,
    enabled: true,
    percentToV2: state.percentToV2,
    controlledTenants: state.controlledTenants,
    controlledSessions: state.controlledSessions,
  };
}

function stageTarget(stage: RolloutStage): number {
  return stage === 'C' ? 50 : 100;
}

export function promoteRollout(state: RolloutState): RolloutState {
  const stage = state.percentToV2 >= 50 ? 'D' : state.stage;
  const currentStage = stage === 'D' ? 'D' : 'C';
  const increment = currentStage === 'C' ? 10 : 15;
  const target = stageTarget(currentStage);
  const nextPercent = Math.min(target, state.percentToV2 + increment);
  const nextStage = nextPercent >= 50 ? 'D' : 'C';

  return {
    ...state,
    stage: nextStage,
    percentToV2: nextPercent,
    updatedAt: new Date().toISOString(),
  };
}

export function rollbackRollout(state: RolloutState): RolloutState {
  return {
    ...state,
    stage: 'C',
    percentToV2: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function recordCohortHealth(
  state: RolloutState,
  cohort: string,
  route: 'v1' | 'v2',
  gateDecision?: 'promote' | 'hold' | 'rollback'
): RolloutState {
  const existing = state.cohorts[cohort] ?? {
    cohort,
    total: 0,
    v2Routed: 0,
    v1Routed: 0,
    rollbackCount: 0,
    holdCount: 0,
    promoteCount: 0,
    lastDecision: 'none' as const,
    lastUpdated: new Date().toISOString(),
  };

  const updated: CohortHealth = {
    ...existing,
    total: existing.total + 1,
    v2Routed: existing.v2Routed + (route === 'v2' ? 1 : 0),
    v1Routed: existing.v1Routed + (route === 'v1' ? 1 : 0),
    rollbackCount: existing.rollbackCount + (gateDecision === 'rollback' ? 1 : 0),
    holdCount: existing.holdCount + (gateDecision === 'hold' ? 1 : 0),
    promoteCount: existing.promoteCount + (gateDecision === 'promote' ? 1 : 0),
    lastDecision: gateDecision ?? existing.lastDecision,
    lastUpdated: new Date().toISOString(),
  };

  return {
    ...state,
    updatedAt: new Date().toISOString(),
    cohorts: {
      ...state.cohorts,
      [cohort]: updated,
    },
  };
}
