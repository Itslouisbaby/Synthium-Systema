/**
 * Tools Adapter — routes tool execution requests from v2 MicroLoops
 * into the v1 ToolExecutor. MicroLoops never import ToolExecutor directly.
 */
import { ToolExecutor } from '../../tools/executor.js';
import { ToolRegistry } from '../../tools/registry.js';
import { DEFAULT_TOOL_LIMITS } from '../../tools/types.js';
import type { ToolLimits } from '../../tools/types.js';

export interface ToolsAdapterConfig {
  limits?: Partial<ToolLimits>;
}

export interface ToolRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export class ToolsAdapter {
  private readonly executor: ToolExecutor;
  private readonly registry: ToolRegistry;

  constructor(config: ToolsAdapterConfig = {}) {
    this.registry = new ToolRegistry();
    this.executor = new ToolExecutor(this.registry, {
      ...DEFAULT_TOOL_LIMITS,
      ...config.limits,
    });
  }

  async execute(request: ToolRequest): Promise<ToolResult> {
    const result = await this.executor.execute(request.toolName, request.args as any);
    if ('error' in result) {
      return { success: false, error: result.error, durationMs: result.durationMs };
    }
    return { success: true, output: result.result, durationMs: result.durationMs };
  }
}
