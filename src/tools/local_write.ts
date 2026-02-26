/**
 * Local Write Tool - Milestone 6
 * Writes files under workspace root with security constraints
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute, normalize } from 'node:path';
import type { LocalWriteInput, LocalWriteOutput, ToolLimits, ExecutorResult } from './types.js';
import { DEFAULT_TOOL_LIMITS } from './types.js';

/** Security error for invalid paths */
class ToolSecurityError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`Security violation: ${reason}`);
    this.reason = reason;
  }
}

/**
 * Validate and sanitize path for security
 * - Rejects null bytes
 * - Normalizes path
 * - Resolves to absolute
 * - Verifies within workspace
 * - Rejects traversal attempts
 */
function validatePath(targetPath: string, workspace: string): string {
  // Reject null bytes
  if (targetPath.includes('\x00')) {
    throw new ToolSecurityError('null byte in path');
  }

  // Reject encoded traversal attempts
  const encodedTraversals = ['..%2f', '..%2F', '%2e%2e%2f', '%2e%2e/', '..\\', '..\\'];
  for (const enc of encodedTraversals) {
    if (targetPath.includes(enc)) {
      throw new ToolSecurityError('encoded path traversal attempt');
    }
  }

  // Normalize the path
  const normalized = normalize(targetPath);
  
  // Resolve to absolute path
  const absolutePath = isAbsolute(normalized)
    ? normalized
    : resolve(workspace, normalized);

  // Verify within workspace (strict prefix check)
  const resolvedWorkspace = resolve(workspace);
  if (!absolutePath.startsWith(resolvedWorkspace + '\\') && 
      !absolutePath.startsWith(resolvedWorkspace + '/') &&
      absolutePath !== resolvedWorkspace) {
    throw new ToolSecurityError('path escapes workspace directory');
  }

  return absolutePath;
}

/**
 * Execute local write tool
 */
export async function localWrite(
  input: LocalWriteInput,
  workspace: string,
  limits: ToolLimits = DEFAULT_TOOL_LIMITS
): Promise<ExecutorResult> {
  const startedAtMs = Date.now();

  try {
    // Validate path
    const absolutePath = validatePath(input.path, workspace);

    // Enforce maxWriteBytes
    const contentBuffer = Buffer.from(input.content, 'utf-8');
    if (contentBuffer.length > limits.maxWriteBytes) {
      return {
        success: false,
        error: `Content exceeds maxWriteBytes limit (${limits.maxWriteBytes} bytes)`,
        durationMs: Date.now() - startedAtMs,
      };
    }

    // Ensure parent directory exists
    const parentDir = dirname(absolutePath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }

    // Determine if we're creating or overwriting
    const exists = existsSync(absolutePath);

    // Write the file
    const flag = input.mode === 'append' ? 'a' : 'w';
    writeFileSync(absolutePath, contentBuffer, { flag });

    const output: LocalWriteOutput = {
      bytesWritten: contentBuffer.length,
      path: absolutePath,
    };

    return {
      success: true,
      output,
      durationMs: Date.now() - startedAtMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      durationMs: Date.now() - startedAtMs,
    };
  }
}
