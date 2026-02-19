/**
 * CLI Deny Command - Milestone 5
 * synth deny --session <id> --step <stepId>
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CLIOptions, CLIResult } from '../types.js';
import { validateSessionId } from '../types.js';

interface Approval {
  stepId: string;
  decision: 'approved' | 'denied';
  decidedAtMs: number;
}

interface ApprovalsFile {
  approvals: Approval[];
}

/**
 * Load latest plan from plans.jsonl
 */
function loadLatestPlan(workspace: string, sessionId: string): any | null {
  const planPath = join(workspace, '.synth', 'neuronwaves', sessionId, 'plans.jsonl');
  if (!existsSync(planPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(planPath, 'utf-8');
    const lines = content.trim().split('\n');
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

/**
 * Write denial atomically
 */
function writeDenial(workspace: string, sessionId: string, denial: Approval): void {
  const stateDir = join(workspace, '.synth', 'neuronwaves', sessionId, 'state');
  const approvalPath = join(stateDir, 'approvals.json');
  const tempPath = `${approvalPath}.tmp`;
  
  // Load existing approvals
  let approvals: Approval[] = [];
  if (existsSync(approvalPath)) {
    try {
      const content = readFileSync(approvalPath, 'utf-8');
      const data: ApprovalsFile = JSON.parse(content);
      approvals = data.approvals || [];
    } catch {
      // File malformed, start fresh
    }
  }
  
  // Add new denial
  approvals.push(denial);
  
  // Atomic write
  writeFileSync(tempPath, JSON.stringify({ approvals }, null, 2), 'utf-8');
  writeFileSync(approvalPath, JSON.stringify({ approvals }, null, 2), 'utf-8');
}

export default async function denyCommand(options: CLIOptions): Promise<CLIResult> {
  const { sessionId, stepId, workspace } = options;
  
  // Validate session ID
  if (!sessionId || !validateSessionId(sessionId)) {
    return {
      exitCode: 1,
      error: 'Error: Invalid session ID. Must match pattern: ^[a-zA-Z0-9_-]+$',
    };
  }
  
  // Validate stepId
  if (!stepId) {
    return {
      exitCode: 1,
      error: 'Error: --step is required for deny command',
    };
  }
  
  // Load latest plan
  const plan = loadLatestPlan(workspace, sessionId);
  if (!plan) {
    return {
      exitCode: 1,
      error: `Error: No plan found for session ${sessionId}`,
    };
  }
  
  // Find step in plan
  const step = plan.steps?.find((s: any) => s.stepId === stepId);
  if (!step) {
    return {
      exitCode: 1,
      error: `Error: Step ${stepId} not found in latest plan`,
    };
  }
  
  // Verify step is awaiting approval
  if (step.status !== 'awaiting_approval') {
    return {
      exitCode: 1,
      error: `Error: Step ${stepId} is not awaiting approval (current status: ${step.status})`,
    };
  }
  
  // Write denial
  try {
    writeDenial(workspace, sessionId, {
      stepId,
      decision: 'denied',
      decidedAtMs: Date.now(),
    });
    
    return {
      exitCode: 0,
      output: `Denied step ${stepId} in session ${sessionId}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 2,
      error: `Error: Failed to write denial: ${message}`,
    };
  }
}
