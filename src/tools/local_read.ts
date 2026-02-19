/**
 * Local Read Tool - Milestone 6
 * Reads files under workspace root with security constraints
 */
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute, normalize } from 'node:path';
import type { LocalReadInput, LocalReadOutput, ToolLimits, ExecutorResult } from './types.js';
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
 * Execute local read tool
 */
export async function localRead(
  input: LocalReadInput,
  workspace: string,
  limits: ToolLimits = DEFAULT_TOOL_LIMITS
): Promise<ExecutorResult> {
  const startedAtMs = Date.now();

  try {
    // Validate path
    const absolutePath = validatePath(input.path, workspace);

    // Apply maxBytes limit (hard cap at 10MB per requirements)
    const effectiveLimit = Math.min(
      input.maxBytes ?? limits.maxReadBytes,
      10_000_000 // Hard cap: 10MB
    );

    let content: string;
    let bytesRead: number;
    let truncated = false;

    try {
      // Read file
      const buffer = readFileSync(absolutePath);
      
      // Check size limit
      if (buffer.length > effectiveLimit) {
        content = buffer.slice(0, effectiveLimit).toString('utf-8');
        bytesRead = effectiveLimit;
        truncated = true;
      } else {
        content = buffer.toString('utf-8');
        bytesRead = buffer.length;
        truncated = false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to read file: ${message}`,
        durationMs: Date.now() - startedAtMs,
      };
    }

    const output: LocalReadOutput = {
      content,
      bytesRead,
      truncated,
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
