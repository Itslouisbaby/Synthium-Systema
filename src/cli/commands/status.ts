/**
 * CLI Status Command - Milestone 5
 * synth status --session <id>
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CLIOptions, CLIResult } from '../types.js';
import { validateSessionId } from '../types.js';

interface LoopState {
  sessionKey: string;
  latestObservationId: string;
  latestPlanId: string;
  latestEvaluationId: string;
  updatedAtMs: number;
  runCount: number;
}

export default async function statusCommand(options: CLIOptions): Promise<CLIResult> {
  const { sessionId, workspace, json } = options;
  
  // Validate session ID
  if (!sessionId || !validateSessionId(sessionId)) {
    return {
      exitCode: 1,
      error: 'Error: Invalid session ID. Must match pattern: ^[a-zA-Z0-9_-]+$',
    };
  }
  
  // Load state
  const statePath = join(workspace, '.synth', 'neuronwaves', sessionId, 'state', 'active.json');
  
  if (!existsSync(statePath)) {
    return {
      exitCode: 1,
      error: `Error: No state found for session ${sessionId}. Run 'synth run' first.`,
    };
  }
  
  try {
    const content = readFileSync(statePath, 'utf-8');
    const state: LoopState = JSON.parse(content);
    
    if (json) {
      return {
        exitCode: 0,
        output: JSON.stringify(state, null, 2),
      };
    }
    
    const output = [
      `Session: ${state.sessionKey}`,
      `Run Count: ${state.runCount}`,
      `Last Observation: ${state.latestObservationId}`,
      `Last Plan: ${state.latestPlanId}`,
      `Last Evaluation: ${state.latestEvaluationId}`,
      `Updated: ${new Date(state.updatedAtMs).toISOString()}`,
    ].join('\n');
    
    return {
      exitCode: 0,
      output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 2,
      error: `Error: Failed to read state: ${message}`,
    };
  }
}
