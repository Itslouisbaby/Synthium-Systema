import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { appendCanaryEvidenceDoc, parseCanaryEnv, runCanaryController } from '../../neuronwaves-v2/canary/canary-controller.js';
import { applyGateDecisionToPercent, parseRoutingPolicyFromEnv } from '../../neuronwaves-v2/canary/default-route.js';
import {
  defaultRolloutState,
  loadRolloutState,
  promoteRollout,
  rollbackRollout,
  saveRolloutState,
} from '../../neuronwaves-v2/canary/cohort-rollout.js';

export async function runCanary(action?: string): Promise<void> {
  switch (action) {
    case 'gate':
    case 'run':
    case undefined:
      await runGate();
      return;
    case 'promote':
      await updateRollout('promote');
      return;
    case 'rollback':
      await updateRollout('rollback');
      return;
    case 'status':
      await printRolloutStatus();
      return;
    default:
      console.error(`Unknown canary action: ${action}`);
      console.log('Usage: synth canary [gate|run|promote|rollback|status]');
      process.exit(1);
  }
}

function resolveRolloutStatePath(): string {
  return process.env.SYNTH_V2_ROLLOUT_STATE_PATH ?? '.synth/canary/rollout-state.json';
}

async function getOrCreateState() {
  const statePath = resolveRolloutStatePath();
  const policy = parseRoutingPolicyFromEnv();
  const existing = await loadRolloutState(statePath);
  const state = existing ?? defaultRolloutState(policy);
  return { state, statePath };
}

async function updateRollout(mode: 'promote' | 'rollback'): Promise<void> {
  const { state, statePath } = await getOrCreateState();
  const next = mode === 'promote' ? promoteRollout(state) : rollbackRollout(state);
  await saveRolloutState(statePath, next);

  console.log(`[canary] rollout ${mode} complete`);
  console.log(`[canary] stage=${next.stage} percentToV2=${next.percentToV2}%`);
  console.log(`[canary] state=${statePath}`);
}

async function printRolloutStatus(): Promise<void> {
  const { state, statePath } = await getOrCreateState();
  const cohorts = Object.values(state.cohorts);
  console.log(`[canary] state=${statePath}`);
  console.log(`[canary] stage=${state.stage} percentToV2=${state.percentToV2}% updatedAt=${state.updatedAt}`);
  console.log(`[canary] cohorts=${cohorts.length}`);
  for (const cohort of cohorts.slice(0, 10)) {
    console.log(`  - ${cohort.cohort}: total=${cohort.total} v2=${cohort.v2Routed} v1=${cohort.v1Routed} gate={promote:${cohort.promoteCount},hold:${cohort.holdCount},rollback:${cohort.rollbackCount}}`);
  }
}

async function runGate(): Promise<void> {
  const options = parseCanaryEnv();
  const artifact = await runCanaryController(options);
  await appendCanaryEvidenceDoc('docs/NEURONWAVES_V2_CANARY_DRILL_EVIDENCE.md', artifact);

  const machineReportPath = process.env.SYNTH_CANARY_MACHINE_REPORT ?? '.synth/canary/promotion-gate-report.json';
  await mkdir(dirname(machineReportPath), { recursive: true });
  await writeFile(machineReportPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(`[canary] stage=${artifact.stage} decision=${artifact.decision}`);
  console.log(`[canary] report=${machineReportPath}`);
  console.log(`[canary] artifact=${options.artifactPath}`);

  const policy = parseRoutingPolicyFromEnv();
  const effectivePercentToV2 = applyGateDecisionToPercent(policy.percentToV2, {
    decision: artifact.decision,
    failedChecks: artifact.report.failedChecks,
  });
  const routingStatePath = process.env.SYNTH_V2_ROUTING_STATE_PATH ?? '.synth/canary/runtime-routing-state.json';
  await mkdir(dirname(routingStatePath), { recursive: true });
  await writeFile(routingStatePath, `${JSON.stringify({
    generatedAt: artifact.generatedAt,
    stage: artifact.stage,
    decision: artifact.decision,
    failedChecks: artifact.report.failedChecks,
    basePercentToV2: policy.percentToV2,
    effectivePercentToV2,
  }, null, 2)}
`, 'utf8');

  console.log(`[canary] routing-state=${routingStatePath}`);

  const requirePromote = process.env.SYNTH_CANARY_REQUIRE_PROMOTE === '1';
  const shouldFail = artifact.decision === 'rollback' || (requirePromote && artifact.decision !== 'promote');
  if (shouldFail) {
    console.error(`[canary] gate failed: ${artifact.reason}`);
    process.exit(1);
  }

  // NeuronWaves runtimes may leave scheduler handles alive briefly; exit explicitly for CI predictability.
  process.exit(0);
}
