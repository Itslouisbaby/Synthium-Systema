import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { appendCanaryEvidenceDoc, parseCanaryEnv, runCanaryController } from '../../neuronwaves-v2/canary/canary-controller.js';

export async function runCanary(action?: string): Promise<void> {
  switch (action) {
    case 'gate':
    case 'run':
    case undefined:
      await runGate();
      return;
    default:
      console.error(`Unknown canary action: ${action}`);
      console.log('Usage: synth canary [gate|run]');
      process.exit(1);
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

  const requirePromote = process.env.SYNTH_CANARY_REQUIRE_PROMOTE === '1';
  const shouldFail = artifact.decision === 'rollback' || (requirePromote && artifact.decision !== 'promote');
  if (shouldFail) {
    console.error(`[canary] gate failed: ${artifact.reason}`);
    process.exit(1);
  }

  // NeuronWaves runtimes may leave scheduler handles alive briefly; exit explicitly for CI predictability.
  process.exit(0);
}
