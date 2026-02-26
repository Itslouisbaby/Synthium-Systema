/**
 * CLI Run Command - Milestone 5
 * synth run --session <id> "<text>" --level 1|2|3 --workspace <path>
 *
 * Feature flag: SYNTH_NEURONWAVES_RUNTIME=v2 routes input into NeuronWaves v2 runtime.
 * Default is v1 (stable). v2 is opt-in until CI gates pass.
 */
import { createSynthRuntime } from '../../orchestrator/runtime.js';
import { createRuntime as createV2Runtime } from '../../neuronwaves-v2/index.js';
import { validateSessionId } from '../types.js';
import type { CLIOptions, CLIResult } from '../types.js';

const USE_V2_RUNTIME = process.env['SYNTH_NEURONWAVES_RUNTIME'] === 'v2';

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

  try {
    if (USE_V2_RUNTIME) {
      // v2 runtime path (feature-flagged, off by default)
      const runtime = createV2Runtime({
        baseDir: artifactBaseDir,
        sessionKey: sessionId as any,
        autonomyLevel: level,
      });
      await runtime.startSession();
      await runtime.pushInput(text);
      await runtime.runForTicks(10);
      await runtime.stop();
      return {
        exitCode: 0,
        output: `[v2] Session ${sessionId}: input processed`,
      };
    }

    // v1 runtime path (stable default)
    const runtime = createSynthRuntime({ artifactBaseDir, autonomyLevel: level });
    const result = await runtime.submitInput(sessionId, text);
    runtime.stop();

    // Success: print summary and exit 0
    return {
      exitCode: 0,
      output: `Session ${sessionId}: plan created with status ${result.evaluation.result}`,
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
