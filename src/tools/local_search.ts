/**
 * Local Search Tool - Milestone 6
 * Literal string search (NOT regex) under workspace root
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, isAbsolute, normalize, sep } from 'node:path';
import type { LocalSearchInput, LocalSearchOutput, SearchResult, ToolLimits, ExecutorResult } from './types.js';
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

  // Verify within workspace
  const resolvedWorkspace = resolve(workspace);
  if (!absolutePath.startsWith(resolvedWorkspace + '\\') && 
      !absolutePath.startsWith(resolvedWorkspace + '/') &&
      absolutePath !== resolvedWorkspace) {
    throw new ToolSecurityError('path escapes workspace directory');
  }

  return absolutePath;
}

/**
 * Recursively get all files under root
 */
function* getFiles(root: string, maxDepth = 10): Generator<string> {
  if (maxDepth <= 0) return;
  
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* getFiles(fullPath, maxDepth - 1);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

/**
 * Execute local search tool
 * Literal string search, NOT regex
 */
export async function localSearch(
  input: LocalSearchInput,
  workspace: string,
  limits: ToolLimits = DEFAULT_TOOL_LIMITS
): Promise<ExecutorResult> {
  const startedAtMs = Date.now();

  try {
    // Validate paths
    const absoluteRoot = validatePath(input.root, workspace);
    
    // Get maxResults
    const maxResults = input.maxResults ?? limits.maxSearchResults;

    const matches: SearchResult[] = [];
    let totalMatches = 0;
    let truncated = false;

    // Escape the query for literal search
    const escapedQuery = input.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Iterate through files
    fileLoop: for (const filePath of getFiles(absoluteRoot)) {
      try {
        // Skip binary files (check if file is text)
        const stats = statSync(filePath);
        if (stats.size > 10_000_000) continue; // Skip超大文件

        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          // Literal string search (case-sensitive for now)
          if (line.includes(input.query)) {
            totalMatches++;
            
            if (matches.length < maxResults) {
              matches.push({
                file: filePath.substring(resolve(workspace).length + 1),
                line: lineNum + 1,
                content: line.trim().slice(0, 200), // Truncated line
              });
            } else {
              truncated = true;
              break fileLoop; // Exit both loops
            }
          }
        }
      } catch (error) {
        // Skip files we can't read
        continue;
      }
    }

    const output: LocalSearchOutput = {
      matches,
      totalMatches,
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
