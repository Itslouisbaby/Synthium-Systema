/**
 * LLM Prompts - Milestone 7
 * Prompt templates and sanitization for LLM-powered planning
 */

import type { PlannerInput } from '../types.js';

/**
 * System prompt defining the PlanGraph schema
 */
export const SYSTEM_PROMPT = `You are an AI planning assistant. Given user input, you must output a PlanGraph as JSON.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "id": "string (uuid)",
  "sessionKey": "string",
  "createdAtMs": number,
  "steps": [
    {
      "stepId": "string (uuid)",
      "intent": "string: what this step does",
      "actionClass": "one of: local_only | external_read | external_write | irreversible | money_movement | identity_security_sensitive",
      "toolName": "optional: local_read | local_write | local_search",
      "toolInput": "optional: object matching the tool's input schema",
      "status": "optional: planned | allowed | awaiting_approval | blocked | executed | failed | skipped"
    }
  ]
}

ACTION CLASS RULES:
- local_only: Safe local file operations
- external_read: Reading from external sources
- external_write: Writing to external sources
- irreversible: Permanent changes that cannot be undone
- money_movement: Financial transactions
- identity_security_sensitive: Authentication/credential operations

TOOLS AVAILABLE (local_only only):
1. local_read: { path: string, maxBytes?: number }
2. local_write: { path: string, content: string, mode: "overwrite" | "append" }
3. local_search: { root: string, query: string, maxResults?: number }

IMPORTANT:
- Return ONLY the JSON, no markdown, no explanation
- Max steps: {{maxSteps}}
- Only local_only actions can have tools
- Unknown action classes will be rejected`;

/**
 * Sanitize user input for safe prompt insertion
 * Removes control characters, limits length
 */
export function sanitizeUserInput(text: string, maxLength = 4000): string {
  if (!text) return '';
  
  // Limit length
  let sanitized = text.slice(0, maxLength);
  
  // Remove null bytes and control chars
  sanitized = sanitized.replace(/\x00/g, '');
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Escape JSON special chars in context
  sanitized = sanitized.replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  
  return sanitized;
}

/**
 * Build user prompt from planner input
 */
export function buildUserPrompt(input: PlannerInput, maxSteps = 10): string {
  const sanitized = sanitizeUserInput(input.text);
  
  let prompt = `Create a plan for: "${sanitized}"`;
  
  if (input.contextBundle && input.contextBundle?.flash?.length > 0) {
    prompt += '\n\nRecent context:';
    for (const entry of input.contextBundle.flash.slice(0, 5)) {
      const sanitizedEntry = sanitizeUserInput(entry.content, 200);
      prompt += `\n- ${sanitizedEntry}`;
    }
  }
  
  prompt += `\n\nGenerate a plan with at most ${maxSteps} steps.`;
  
  return prompt;
}

/**
 * Extract JSON from LLM response
 * Strips markdown code blocks, handles common LLM output formats
 */
export function extractJsonFromResponse(text: string): string | null {
  if (!text) return null;
  
  const trimmed = text.trim();
  
  // Try direct JSON first
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }
  
  // Try to extract from markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    const content = codeBlockMatch[1].trim();
    if (content.startsWith('{') && content.endsWith('}')) {
      return content;
    }
  }
  
  // Try finding first { and last }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  
  return null;
}

/**
 * Hash function for audit (SHA-256)
 */
export async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
