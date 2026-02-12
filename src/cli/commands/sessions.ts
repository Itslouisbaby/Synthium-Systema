/**
 * CLI Sessions Command - Milestone 5
 * synth sessions --workspace <path>
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CLIOptions, CLIResult } from '../types.js';

export default async function sessionsCommand(options: CLIOptions): Promise<CLIResult> {
  const { workspace } = options;
  const neuronwavesDir = join(workspace, '.synth', 'neuronwaves');
  
  if (!existsSync(neuronwavesDir)) {
    return {
      exitCode: 0,
      output: 'No sessions found.',
    };
  }
  
  try {
    const entries = readdirSync(neuronwavesDir, { withFileTypes: true });
    const sessionIds = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();
    
    if (sessionIds.length === 0) {
      return {
        exitCode: 0,
        output: 'No sessions found.',
      };
    }
    
    return {
      exitCode: 0,
      output: sessionIds.join('\n'),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 2,
      error: `Error: Failed to list sessions: ${message}`,
    };
  }
}
