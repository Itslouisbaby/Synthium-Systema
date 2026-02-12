/**
 * CLI Tail Command - Milestone 5
 * synth tail observations|plans|evaluations|audit --session <id>
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CLIOptions, CLIResult } from '../types.js';
import { validateSessionId } from '../types.js';

const VALID_STREAMS = ['observations', 'plans', 'evaluations', 'audit'];

function getStreamPath(workspace: string, sessionId: string, stream: string): string | null {
  const baseDir = join(workspace, '.synth', 'neuronwaves', sessionId);
  
  switch (stream) {
    case 'observations':
      return join(baseDir, 'observations.jsonl');
    case 'plans':
      return join(baseDir, 'plans.jsonl');
    case 'evaluations':
      return join(baseDir, 'evaluations.jsonl');
    case 'audit':
      return join(baseDir, 'audit', 'actions.jsonl');
    default:
      return null;
  }
}

export default async function tailCommand(options: CLIOptions): Promise<CLIResult> {
  const { sessionId, workspace, tailStream } = options;
  
  // Validate session ID
  if (!sessionId || !validateSessionId(sessionId)) {
    return {
      exitCode: 1,
      error: 'Error: Invalid session ID. Must match pattern: ^[a-zA-Z0-9_-]+$',
    };
  }
  
  // Validate stream
  if (!tailStream) {
    return {
      exitCode: 1,
      error: `Error: Must specify stream. Valid: ${VALID_STREAMS.join(', ')}`,
    };
  }
  
  if (!VALID_STREAMS.includes(tailStream)) {
    return {
      exitCode: 1,
      error: `Error: Invalid stream "${tailStream}". Valid: ${VALID_STREAMS.join(', ')}`,
    };
  }
  
  const streamPath = getStreamPath(workspace, sessionId, tailStream);
  
  if (!streamPath || !existsSync(streamPath)) {
    return {
      exitCode: 1,
      error: `Error: No ${tailStream} stream found for session ${sessionId}`,
    };
  }
  
  try {
    const content = readFileSync(streamPath, 'utf-8');
    const lines = content.trim().split('\n');
    
    if (lines.length === 0) {
      return {
        exitCode: 0,
        output: `No entries in ${tailStream} stream`,
      };
    }
    
    // Show last 10 entries
    const lastEntries = lines.slice(-10);
    const entries = lastEntries.map((line, i) => {
      try {
        const entry = JSON.parse(line);
        const preview = JSON.stringify(entry).slice(0, 100);
        return `[${lines.length - 10 + i + 1}] ${preview}...`;
      } catch {
        return `[${lines.length - 10 + i + 1}] (malformed entry)`;
      }
    }).join('\n');
    
    const totalInfo = lines.length > 10 ? ` (showing last 10 of ${lines.length})` : '';
    
    return {
      exitCode: 0,
      output: `=== ${tailStream}${totalInfo} ===\n${entries}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      exitCode: 2,
      error: `Error: Failed to read stream: ${message}`,
    };
  }
}
