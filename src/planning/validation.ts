/**
 * Plan Validation - Milestone 7
 * Strict validation of LLM-generated plans with clear fallback rules
 */

import type { PlanGraph, PlanStep } from '../types.js';
import { ActionClass } from '../types.js';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  plan?: PlanGraph;
}

/**
 * Valid action classes
 */
const VALID_ACTION_CLASSES = new Set([
  ActionClass.LocalOnly,
  ActionClass.ExternalRead,
  ActionClass.ExternalWrite,
  ActionClass.Irreversible,
  ActionClass.MoneyMovement,
  ActionClass.IdentitySecurity,
]);

/**
 * Valid tool names
 */
const VALID_TOOLS = new Set([
  'local_read',
  'local_write',
  'local_search',
]);

/**
 * Tool input schemas for validation
 */
const TOOL_INPUT_SCHEMAS: Record<string, { required: string[]; types: Record<string, string> }> = {
  local_read: {
    required: ['path'],
    types: { path: 'string', maxBytes: 'number' }
  },
  local_write: {
    required: ['path', 'content', 'mode'],
    types: { path: 'string', content: 'string', mode: 'string' }
  },
  local_search: {
    required: ['root', 'query'],
    types: { root: 'string', query: 'string', maxResults: 'number' }
  }
};

/**
 * Validate PlanGraph structure
 * Stage 1: Basic structure validation
 */
export function validatePlanGraph(
  raw: unknown,
  maxSteps = 10
): ValidationResult {
  const errors: string[] = [];
  
  // Must be an object
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { valid: false, errors: ['PlanGraph must be an object'] };
  }
  
  const obj = raw as Record<string, unknown>;
  
  // Must have steps array
  if (!Array.isArray(obj.steps)) {
    return { valid: false, errors: ['PlanGraph.steps must be an array'] };
  }
  
  // Check max steps
  if (obj.steps.length > maxSteps) {
    errors.push(`Too many steps: ${obj.steps.length} > max ${maxSteps}`);
    return { valid: false, errors };
  }
  
  // Validate each step
  const validatedSteps: PlanStep[] = [];
  
  for (let i = 0; i < obj.steps.length; i++) {
    const step = obj.steps[i];
    
    if (typeof step !== 'object' || step === null || Array.isArray(step)) {
      errors.push(`Step ${i}: must be an object`);
      continue;
    }
    
    const s = step as Record<string, unknown>;
    
    // Required fields
    if (typeof s.stepId !== 'string') {
      errors.push(`Step ${i}: stepId must be a string`);
    }
    
    if (typeof s.intent !== 'string') {
      errors.push(`Step ${i}: intent must be a string`);
    }
    
    // Validate actionClass
    if (!VALID_ACTION_CLASSES.has(s.actionClass as ActionClass)) {
      errors.push(`Step ${i}: invalid actionClass "${s.actionClass}"`);
    }
    
    // Tool validation (if present)
    if (s.toolName !== undefined) {
      const toolName = s.toolName as string;
      
      if (!VALID_TOOLS.has(toolName)) {
        errors.push(`Step ${i}: unknown tool "${toolName}"`);
      } else {
        // Tool can only be used with local_only
        if (s.actionClass !== ActionClass.LocalOnly) {
          errors.push(`Step ${i}: tool can only be used with local_only actionClass`);
        }
        
        // Validate tool input
        const schema = TOOL_INPUT_SCHEMAS[toolName];
        if (schema && s.toolInput !== undefined) {
          const input = s.toolInput as Record<string, unknown>;
          
          for (const field of schema.required) {
            if (!(field in input)) {
              errors.push(`Step ${i}: tool ${toolName} missing required field "${field}"`);
            }
          }
          
          // Check for null bytes in path
          if (typeof input.path === 'string' && input.path.includes('\x00')) {
            errors.push(`Step ${i}: path contains null bytes`);
          }
          if (typeof input.root === 'string' && input.root.includes('\x00')) {
            errors.push(`Step ${i}: root contains null bytes`);
          }
        }
      }
    }
    
    // Build validated step (strip unknown fields)
    let validatedStep: PlanStep = {
      stepId: (s.stepId as string) || `step-${i}`,
      intent: (s.intent as string) || 'unnamed step',
      actionClass: (s.actionClass as PlanStep['actionClass']) || ActionClass.LocalOnly,
      status: (s.status as PlanStep['status']) || 'planned',
    };
    
    if (s.toolName) {
      validatedStep = { ...validatedStep, toolName: s.toolName as string };
    }
    if (s.toolInput) {
      validatedStep = { ...validatedStep, toolInput: s.toolInput as Record<string, unknown> };
    }
    
    validatedSteps.push(validatedStep);
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  // Build validated plan
  const plan: PlanGraph = {
    id: (obj.id as string) || '',
    sessionKey: (obj.sessionKey as string) || '',
    createdAtMs: typeof obj.createdAtMs === 'number' ? obj.createdAtMs : Date.now(),
    steps: validatedSteps,
  };
  
  return { valid: true, errors: [], plan };
}

/**
 * Create fallback PlanGraph on validation failure
 */
export function createFallbackPlan(input: { sessionKey: string; text: string }): PlanGraph {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `plan-${Date.now()}`,
    sessionKey: input.sessionKey,
    createdAtMs: Date.now(),
    steps: [{
      stepId: crypto.randomUUID ? crypto.randomUUID() : `step-${Date.now()}`,
      intent: `Process: ${input.text.slice(0, 50)}`,
      actionClass: ActionClass.LocalOnly,
      status: 'planned',
    }],
  };
}
