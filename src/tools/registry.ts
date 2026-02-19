/**
 * Tool Registry - Milestone 6
 * Manages registered tools and provides lookup functionality
 */
import type { Tool, ToolLimits } from './types.js';
import { DEFAULT_TOOL_LIMITS } from './types.js';
import { localRead } from './local_read.js';
import { localWrite } from './local_write.js';
import { localSearch } from './local_search.js';

/**
 * ToolRegistry - Registry for managing available tools
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private limits: ToolLimits;

  constructor(limits?: Partial<ToolLimits>) {
    this.limits = { ...DEFAULT_TOOL_LIMITS, ...limits };
  }

  /**
   * Register a tool
   */
  register(tool: Tool): void {
    if (!tool.name || typeof tool.execute !== 'function') {
      throw new Error('Tool must have a name and execute function');
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Unregister a tool by name
   */
  unregister(name: string): void {
    this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool names
   */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Get all registered tools
   */
  getAll(): Map<string, Tool> {
    return new Map(this.tools);
  }

  /**
   * Get the tool limits
   */
  getLimits(): ToolLimits {
    return { ...this.limits };
  }
}

/**
 * Create a default registry with built-in tools
 */
export function createDefaultRegistry(limits?: Partial<ToolLimits>): ToolRegistry {
  const registry = new ToolRegistry(limits);

  // Register built-in tools
  registry.register({
    name: 'local_read',
    execute: localRead,
  });

  registry.register({
    name: 'local_write',
    execute: localWrite,
  });

  registry.register({
    name: 'local_search',
    execute: localSearch,
  });

  return registry;
}
