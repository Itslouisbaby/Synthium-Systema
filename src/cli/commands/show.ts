/**
 * CLI Show Command - Milestone 5
 * synth show plan|memory --session <id>
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CLIOptions, CLIResult } from '../types.js';
import { validateSessionId } from '../types.js';

function showPlan(workspace: string, sessionId: string, json: boolean): CLIResult {
  const planPath = join(workspace, '.synth', 'neuronwaves', sessionId, 'plans.jsonl');
  
  if (!existsSync(planPath)) {
    return {
      exitCode: 1,
      error: `Error: No plans found for session ${sessionId}`,
    };
  }
  
  try {
    const content = readFileSync(planPath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length === 0) {
      return {
        exitCode: 1,
        error: `Error: No plans found for session ${sessionId}`,
      };
    }
    
    const latestPlan = JSON.parse(lines[lines.length - 1]);
    
    if (json) {
      return {
        exitCode: 0,
        output: JSON.stringify(latestPlan, null, 2),
      };
    }
    
    // Human-readable format
    const steps = latestPlan.steps?.map((s: any, i: number) => 
      `  ${i + 1}. [${s.status}] ${s.actionClass}: ${s.intent}`
    ).join('\n') || '  No steps';
    
    const output = [
      `Plan ID: ${latestPlan.id}`,
      `Session: ${latestPlan.sessionKey}`,
      `Created: ${new Date(latestPlan.createdAtMs).toISOString()}`,
      `Steps:`,
      steps,
    ].join('\n');
    
    return {
      exitCode: 0,
      output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 2,
      error: `Error: Failed to read plan: ${message}`,
    };
  }
}

function showMemory(workspace: string, sessionId: string, json: boolean): CLIResult {
  const flashPath = join(workspace, '.synth', 'memory', 'sessions', sessionId, 'hot', 'flash', 'current.json');
  
  if (!existsSync(flashPath)) {
    return {
      exitCode: 1,
      error: `Error: No memory found for session ${sessionId}`,
    };
  }
  
  try {
    const content = readFileSync(flashPath, 'utf-8');
    const data = JSON.parse(content);
    
    if (json) {
      return {
        exitCode: 0,
        output: JSON.stringify(data, null, 2),
      };
    }
    
    // Human-readable format
    const entries = data.entries?.slice(0, 10).map((e: any) => 
      `  - [${new Date(e.timestampMs).toISOString()}] ${e.content.slice(0, 50)}...`
    ).join('\n') || '  No entries';
    
    const output = [
      `Memory Session: ${sessionId}`,
      `Updated: ${new Date(data.updatedAtMs).toISOString()}`,
      `Recent entries:`,
      entries,
      data.entries?.length > 10 ? `  ... and ${data.entries.length - 10} more` : '',
    ].filter(Boolean).join('\n');
    
    return {
      exitCode: 0,
      output,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 2,
      error: `Error: Failed to read memory: ${message}`,
    };
  }
}

export default async function showCommand(options: CLIOptions): Promise<CLIResult> {
  const { sessionId, workspace, json, showTarget } = options;
  
  // Validate session ID
  if (!sessionId || !validateSessionId(sessionId)) {
    return {
      exitCode: 1,
      error: 'Error: Invalid session ID. Must match pattern: ^[a-zA-Z0-9_-]+$',
    };
  }
  
  // Validate show target
  if (!showTarget) {
    return {
      exitCode: 1,
      error: 'Error: Must specify what to show: "plan" or "memory"',
    };
  }
  
  if (showTarget === 'plan') {
    return showPlan(workspace, sessionId, json ?? false);
  }
  
  if (showTarget === 'memory') {
    return showMemory(workspace, sessionId, json ?? false);
  }
  
  return {
    exitCode: 1,
    error: `Error: Unknown show target: ${showTarget}. Use "plan" or "memory"`,
  };
}
