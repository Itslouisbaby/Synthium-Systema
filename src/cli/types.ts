/**
 * Synth NeuronWaves - CLI Types
 * Milestone 5: CLI framework
 */

/**
 * CLIOptions - Parsed command-line options
 */
export interface CLIOptions {
  /** Workspace directory (default: process.cwd()) */
  workspace: string;
  /** Session identifier */
  sessionId?: string;
  /** Autonomy level (1-3) */
  level?: number;
  /** Output format: JSON for machine-readable output */
  json?: boolean;
  /** Additional options based on command */
  // For 'run' command
  text?: string;
  // For 'show' command
  showTarget?: 'plan' | 'memory';
  // For 'tail' command
  tailStream?: 'observations' | 'plans' | 'evaluations' | 'audit';
  // For 'approve'/'deny' commands
  stepId?: string;
  // For 'policy' command
  policyAction?: 'simulate' | 'diff' | 'bundle' | 'verify-bundle';
  policyPath?: string;
  inputPath?: string;
  fromPath?: string;
  toPath?: string;
  outPath?: string;
  bundlePath?: string;
  privateKeyPath?: string;
  publicKeyPath?: string;
  keyId?: string;
}

/**
 * CLIResult - Standard result return type
 */
export interface CLIResult {
  /** Exit code: 0=success, 1=user error, 2=system error */
  exitCode: number;
  /** Optional output string */
  output?: string;
  /** Optional error message */
  error?: string;
}

/**
 * SessionId - Type alias for validated session IDs
 * Must match pattern: ^[a-zA-Z0-9_-]+$
 */
export type SessionId = string;

/**
 * validateSessionId - Validate session ID format
 * @param id - Session ID to validate
 * @returns true if valid, false otherwise
 */
export function validateSessionId(id: string): boolean {
  // Regex: alphanumeric, underscores, and hyphens only
  const pattern = /^[a-zA-Z0-9_-]+$/;
  return pattern.test(id) && id.length > 0;
}
