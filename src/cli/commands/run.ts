/**
 * CLI Run Command - Milestone 5
 * synth run --session <id> "<text>" --level 1|2|3 --workspace <path>
 *
 * Default runtime is now v2 for GA cutover, with explicit v1 emergency fallback.
 */
import { SynthRuntime } from '../../synth-runtime.js';
import { NeuronWavesRuntime } from '../../neuronwaves-v2/neuronwaves-runtime.js';
import {
  resolveCanaryRoute,
  resolveGateStatusFromEnvOrReport,
  resolveRoutingPolicyFromEnvOrState,
  shouldBlockGACutover,
} from '../../neuronwaves-v2/canary/default-route.js';
import {
  defaultRolloutState,
  loadRolloutState,
  recordCohortHealth,
  saveRolloutState,
} from '../../neuronwaves-v2/canary/cohort-rollout.js';
import { validateSessionId } from '../types.js';
import type { CLIOptions, CLIResult } from '../types.js';

const FORCE_V1_RUNTIME = process.env['SYNTH_NEURONWAVES_RUNTIME'] === 'v1' || process.env['SYNTH_FORCE_V1_FALLBACK'] === '1';

function resolveRolloutStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.SYNTH_V2_ROLLOUT_STATE_PATH ?? '.synth/canary/rollout-state.json';
}

/**
 * Validate that level is a valid autonomy level (1, 2, or 3)
 */
function validateLevel(level: number | undefined): 1 | 2 | 3 {
  if (level === undefined) {
    return 1; // Default to level 1
  }
  if (level === 1 || level === 2 || level === 3) {
    return level;
  }
  return 1; // Default to level 1 if invalid
}

/**
 * Main run command handler
 * Executes the NeuronWaves planning loop with given input
 */
export default async function runCommand(options: CLIOptions): Promise<CLIResult> {
  // Extract and validate required options
  const { sessionId, text, workspace } = options;

  // Validate session ID
  if (!sessionId || !validateSessionId(sessionId)) {
    return {
      exitCode: 1,
      error: 'Error: Invalid session ID. Must match pattern: ^[a-zA-Z0-9_-]+$',
    };
  }

  // Validate text input
  if (!text) {
    return {
      exitCode: 1,
      error: 'Error: Missing input text for run command',
    };
  }

  // Parse and validate level (default to 1)
  const level = validateLevel(options.level);

  // Construct artifact base directory
  const artifactBaseDir = `${workspace}/.synth/neuronwaves`;
  const tenantId = process.env.SYNTH_TENANT_ID;

  const canaryGate = await resolveGateStatusFromEnvOrReport();
  const gaGuard = shouldBlockGACutover(canaryGate);
  if (gaGuard.blocked && !FORCE_V1_RUNTIME) {
    return {
      exitCode: 1,
      error: `Error: ${gaGuard.reason}`,
    };
  }

  const canaryRoute = resolveCanaryRoute(
    {
      tenantId,
      sessionId,
    },
    await resolveRoutingPolicyFromEnvOrState(),
    canaryGate
  );

  const useV2Runtime = !FORCE_V1_RUNTIME && (canaryRoute.route === 'v2' || process.env.SYNTH_GA_DEFAULT_V2 !== '0');

  try {
    if (useV2Runtime) {
      const runtime = new NeuronWavesRuntime({
        artifactBaseDir,
      });
      runtime.start();
      await runtime.submitInput(sessionId, text);
      await new Promise(resolve => setTimeout(resolve, 600));
      runtime.stop();
    } else {
      const runtime = new SynthRuntime({
        baseDir: artifactBaseDir,
      });
      await runtime.initialize();
      await runtime.start();
      await runtime.processInput(text);

      // Wait for a few ticks to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      runtime.stop();
    }

    const statePath = resolveRolloutStatePath();
    const routeKey = tenantId ? `tenant:${tenantId}` : `session:${sessionId}`;
    const state = (await loadRolloutState(statePath)) ?? defaultRolloutState(await resolveRoutingPolicyFromEnvOrState());
    const nextState = recordCohortHealth(state, routeKey, useV2Runtime ? 'v2' : 'v1', canaryGate?.decision);
    await saveRolloutState(statePath, nextState);

    // Success: print summary and exit 0
    return {
      exitCode: 0,
      output: `Session ${sessionId}: Event loop execution complete. Runtime=${useV2Runtime ? 'v2' : 'v1'} (${canaryRoute.reason}; effectiveV2=${canaryRoute.effectivePercentToV2}%). System responded to "${text}"`,
    };
  } catch (error) {
    // Error: print error message and exit 2
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 2,
      error: `Error: ${errorMessage}`,
    };
  }
}
