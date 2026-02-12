/**
 * Milestone 7: LLM Planner Tests
 * Optional, gated, fail-safe
 */
import { describe, it, expect } from 'vitest';
import { PlannerRegistry } from '../src/planning/planner.js';
import { HeuristicPlanner } from '../src/planning/heuristic-planner.js';
import { validatePlanGraph, createFallbackPlan } from '../src/planning/validation.js';
import { hashText, extractJsonFromResponse, sanitizeUserInput } from '../src/planning/prompts.js';
import { ActionClass } from '../src/types.js';
import type { PlannerInput, PlanGraph } from '../src/types.js';

describe('M7: LLM Planner', () => {
  describe('Planner selection', () => {
    it('disabled config → HeuristicPlanner', () => {
      const registry = new PlannerRegistry({ enabled: false });
      const planner = registry.selectPlanner();
      expect(planner).toBeInstanceOf(HeuristicPlanner);
    });

    it('enabled but no apiKey → HeuristicPlanner', () => {
      const registry = new PlannerRegistry({
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
      });
      const planner = registry.selectPlanner();
      expect(planner).toBeInstanceOf(HeuristicPlanner);
    });

    it('not available when misconfigured', () => {
      const registry = new PlannerRegistry({
        enabled: true,
        provider: 'openai',
        model: 'gpt-4o-mini',
      });
      expect(registry.isPromptedPlannerAvailable()).toBe(false);
    });

    it('creates audit record', () => {
      const registry = new PlannerRegistry();
      const audit = registry.createAuditRecord(
        'test-plan-1',
        'heuristic',
        'abcd1234'
      );
      expect(audit.planId).toBe('test-plan-1');
      expect(audit.plannerUsed).toBe('heuristic');
      expect(audit.promptHash).toBe('abcd1234');
      expect(audit.validationPassed).toBe(true);
      expect(audit.timestampMs).toBeGreaterThan(0);
    });
  });

  describe('Plan validation', () => {
    const validPlan: PlanGraph = {
      id: 'plan-1',
      sessionKey: 'session-1',
      createdAtMs: Date.now(),
      steps: [{
        stepId: 'step-1',
        intent: 'test step',
        actionClass: ActionClass.LocalOnly,
        status: 'planned',
      }],
    };

    it('valid PlanGraph → accepted', () => {
      const result = validatePlanGraph(validPlan, 10);
      expect(result.valid).toBe(true);
      expect(result.plan).toBeDefined();
    });

    it('invalid JSON → rejected', () => {
      const result = validatePlanGraph('not an object', 10);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('unknown actionClass → rejected', () => {
      const badPlan = {
        ...validPlan,
        steps: [{
          stepId: 'step-1',
          intent: 'bad',
          actionClass: 'unknown_action',
          status: 'planned',
        }],
      };
      const result = validatePlanGraph(badPlan, 10);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('actionClass');
    });

    it('too many steps → rejected', () => {
      const bigPlan = {
        ...validPlan,
        steps: Array(15).fill(null).map((_, i) => ({
          stepId: `step-${i}`,
          intent: 'test',
          actionClass: ActionClass.LocalOnly,
          status: 'planned',
        })),
      };
      const result = validatePlanGraph(bigPlan, 10);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('steps');
    });

    it('extra fields → stripped', () => {
      const planWithExtra = {
        ...validPlan,
        unknownField: 'ignored',
        steps: [{
          stepId: 'step-1',
          intent: 'test',
          actionClass: ActionClass.LocalOnly,
          status: 'planned',
          extraField: 'stripped',
        }],
      };
      const result = validatePlanGraph(planWithExtra, 10);
      expect(result.valid).toBe(true);
      expect((result.plan as any)?.unknownField).toBeUndefined();
    });

    it('unknown toolName → rejected', () => {
      const planWithTool = {
        ...validPlan,
        steps: [{
          stepId: 'step-1',
          intent: 'test',
          actionClass: ActionClass.LocalOnly,
          status: 'planned',
          toolName: 'unknown_tool',
          toolInput: {},
        }],
      };
      const result = validatePlanGraph(planWithTool, 10);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tool');
    });

    it('creates fallback plan', () => {
      const fallback = createFallbackPlan({
        sessionKey: 'test',
        text: 'test input',
      });
      expect(fallback.id).toBeDefined();
      expect(fallback.sessionKey).toBe('test');
      expect(fallback.steps.length).toBe(1);
      expect(fallback.steps[0].intent).toContain('test input');
    });
  });

  describe('Prompt sanitization', () => {
    it('limits string length', () => {
      const longString = 'x'.repeat(5000);
      const sanitized = sanitizeUserInput(longString, 100);
      expect(sanitized.length).toBeLessThanOrEqual(100);
    });

    it('escapes JSON special chars', () => {
      const input = 'hello "world"\n\t\\';
      const sanitized = sanitizeUserInput(input);
      // Quotes become escaped \"
      expect(sanitized).toContain('\\"');
      expect(sanitized).toContain('\\n');
    });

    it('removes null bytes', () => {
      const input = 'test\x00string';
      const sanitized = sanitizeUserInput(input);
      expect(sanitized).not.toContain('\x00');
    });
  });

  describe('JSON extraction', () => {
    it('extracts direct JSON', () => {
      const json = '{"id": "1", "steps": []}';
      const result = extractJsonFromResponse(json);
      expect(result).toBe(json);
    });

    it('extracts from markdown code block', () => {
      const response = 'Here is the plan:\n```json\n{"id": "1", "steps": []}\n```';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('{"id": "1", "steps": []}');
    });

    it('extracts from plain markdown block', () => {
      const response = '```\n{"id": "1", "steps": []}\n```';
      const result = extractJsonFromResponse(response);
      expect(result).toBe('{"id": "1", "steps": []}');
    });

    it('returns null for invalid input', () => {
      expect(extractJsonFromResponse('')).toBeNull();
      expect(extractJsonFromResponse('not json')).toBeNull();
    });
  });

  describe('Hashing', () => {
    it('produces SHA-256 hash', async () => {
      const hash = await hashText('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is deterministic', async () => {
      const hash1 = await hashText('same text');
      const hash2 = await hashText('same text');
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different inputs', async () => {
      const hash1 = await hashText('text1');
      const hash2 = await hashText('text2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Hash content', () => {
    it('PlannerRegistry hashes content', () => {
      const hash = PlannerRegistry.hashContent('test content');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
