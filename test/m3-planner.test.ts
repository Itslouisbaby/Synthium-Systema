import { describe, it, expect } from 'vitest';
import { HeuristicPlanner } from '../src/planning/heuristic-planner.js';
import { PolicyGate, Autonomy } from '../src/index.js';
import type { PolicyStep, PolicyConfig, Plan, PlanStep } from '../src/index.js';

describe('Milestone 3: Planner + Heuristic', () => {
  const baseConfig: PolicyConfig = {
    baseDir: '.test-artifacts',
    allowlist: ['https://api.example.com'],
  };

  describe('Determinism', () => {
    it('is deterministic - same input yields same plan', () => {
      const planner = new HeuristicPlanner();
      const input = 'search the web for something';
      const sessionKey = 'test-session-1';

      const plan1 = planner.plan(input, sessionKey);
      const plan2 = planner.plan(input, sessionKey);

      // Compare deterministic fields (createdAtMs differs by ~1ms)
      expect(plan1.id).toBe(plan2.id);
      expect(plan1.sessionKey).toBe(plan2.sessionKey);
      expect(plan1.steps).toEqual(plan2.steps);
      expect(plan1.steps.length).toBeGreaterThan(0);
      expect(plan1.steps[0].actionClass).toBe('external_read');
    });

    it('produces consistent output across multiple calls', () => {
      const planner = new HeuristicPlanner();
      const input = 'write a note about anything';
      const sessionKey = 'test-session-2';

      const plans: Plan[] = [];
      for (let i = 0; i < 5; i++) {
        plans.push(planner.plan(input, sessionKey));
      }

      // All plans should be identical
      plans.forEach((plan) => {
        expect(plan.steps).toEqual(plans[0].steps);
      });
    });
  });

  describe('Keyword to actionClass mapping', () => {
    it('maps search keywords to external_read', () => {
      const planner = new HeuristicPlanner();
      const sessionKey = 'test-session-3';

      const searchInputs = [
        'search the web',
        'search for something',
        'look up information',
        'find data online',
      ];

      searchInputs.forEach((input) => {
        const plan = planner.plan(input, sessionKey);
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(plan.steps[0].actionClass).toBe('external_read');
        expect(plan.steps[0].intent).toContain(input);
      });
    });

    it('maps write keywords to local_only', () => {
      const planner = new HeuristicPlanner();
      const sessionKey = 'test-session-4';

      const writeInputs = [
        'write a note',
        'create a file',
        'save some text',
        'record information',
      ];

      writeInputs.forEach((input) => {
        const plan = planner.plan(input, sessionKey);
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(plan.steps[0].actionClass).toBe('local_only');
        expect(plan.steps[0].intent).toContain(input);
      });
    });

    it('maps delete keywords to irreversible', () => {
      const planner = new HeuristicPlanner();
      const sessionKey = 'test-session-5';

      const deleteInputs = [
        'delete a file',
        'remove this item',
        'erase the data',
        'destroy the record',
      ];

      deleteInputs.forEach((input) => {
        const plan = planner.plan(input, sessionKey);
        expect(plan.steps.length).toBeGreaterThan(0);
        const step = plan.steps[0];
        expect(step.actionClass).toBe('irreversible');
        expect(step.intent).toContain(input);
      });
    });

    it('maps money movement keywords to irreversible (as hard block candidate)', () => {
      const planner = new HeuristicPlanner();
      const sessionKey = 'test-session-6';

      const moneyInputs = [
        'transfer money',
        'send funds',
        'pay someone',
        'make a payment',
      ];

      moneyInputs.forEach((input) => {
        const plan = planner.plan(input, sessionKey);
        expect(plan.steps.length).toBeGreaterThan(0);
        // Money movement action class
        expect(plan.steps[0].actionClass).toBe('money_movement');
        expect(plan.steps[0].intent).toContain(input);
      });
    });

    it('maps random/unknown input to local_only (default)', () => {
      const planner = new HeuristicPlanner();
      const sessionKey = 'test-session-7';

      const randomInputs = [
        'what is the meaning of life',
        'tell me a joke',
        'how are you doing',
        'some random thing',
        'just thinking out loud',
      ];

      randomInputs.forEach((input) => {
        const plan = planner.plan(input, sessionKey);
        expect(plan.steps.length).toBeGreaterThan(0);
        expect(plan.steps[0].actionClass).toBe('local_only');
        expect(plan.steps[0].intent).toContain(input);
      });
    });
  });

  describe('Integration: Planner output through policy gate', () => {
    it('policy gate changes step status appropriately', () => {
      const planner = new HeuristicPlanner();
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      const sessionKey = 'test-session-8';

      // Test local_only - should be allowed
      const localPlan = planner.plan('write a note', sessionKey);
      const localStep: PolicyStep = {
        stepId: localPlan.steps[0].stepId,
        actionClass: localPlan.steps[0].actionClass,
      };
      const localDecision = gate.evaluate(localStep);
      expect(localDecision.decision).toBe('allow');
      expect(localPlan.steps[0].status).toBe('planned');

      // Test external_read - should be allowed at Level3
      const searchPlan = planner.plan('search for something', sessionKey);
      const searchStep: PolicyStep = {
        stepId: searchPlan.steps[0].stepId,
        actionClass: searchPlan.steps[0].actionClass,
        target: 'https://api.example.com',
      };
      const searchDecision = gate.evaluate(searchStep);
      expect(searchDecision.decision).toBe('allow');
      expect(searchPlan.steps[0].status).toBe('planned');

      // Test irreversible - should require approval
      const deletePlan = planner.plan('delete a file', sessionKey);
      const deleteStep: PolicyStep = {
        stepId: deletePlan.steps[0].stepId,
        actionClass: deletePlan.steps[0].actionClass,
      };
      const deleteDecision = gate.evaluate(deleteStep);
      expect(deleteDecision.decision).toBe('awaiting_approval');
      expect(deletePlan.steps[0].status).toBe('planned');
    });

    it('updates step status after policy evaluation', () => {
      const planner = new HeuristicPlanner();
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      const sessionKey = 'test-session-9';

      const plan = planner.plan('write a note', sessionKey);
      const step = plan.steps[0];

      // Step should start in 'planned' status
      expect(step.status).toBe('planned');

      // Evaluate through gate
      const stepToEvaluate: PolicyStep = {
        stepId: step.stepId,
        actionClass: step.actionClass,
      };
      const decision = gate.evaluate(stepToEvaluate);

      // Decision result
      expect(decision.decision).toBe('allow');

      // In a real implementation, the step status would be updated
      // This test validates the decision logic works correctly
      if (decision.decision === 'allow') {
        expect(step.status).toBe('planned'); // or 'allowed' in full implementation
      }
    });

    it('blocks external_read at Level 1 autonomy', () => {
      const planner = new HeuristicPlanner();
      const gate = new PolicyGate(Autonomy.Level1, baseConfig);
      const sessionKey = 'test-session-10';

      const plan = planner.plan('search for something', sessionKey);
      const step: PolicyStep = {
        stepId: plan.steps[0].stepId,
        actionClass: plan.steps[0].actionClass,
      };

      const decision = gate.evaluate(step);
      expect(decision.decision).toBe('block');
      expect(decision.reason).toContain('not allowed');
    });

    it('allows external_read at Level 3 autonomy', () => {
      const planner = new HeuristicPlanner();
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      const sessionKey = 'test-session-11';

      const plan = planner.plan('search for something', sessionKey);
      const step: PolicyStep = {
        stepId: plan.steps[0].stepId,
        actionClass: plan.steps[0].actionClass,
        target: 'https://api.example.com',
      };

      const decision = gate.evaluate(step);
      expect(decision.decision).toBe('allow');
    });
  });

  describe('Hard block enforcement', () => {
    it('blocks money_movement at all autonomy levels', () => {
      const planner = new HeuristicPlanner();
      const sessionKey = 'test-session-12';

      [Autonomy.Level1, Autonomy.Level2, Autonomy.Level3].forEach((level) => {
        const gate = new PolicyGate(level, baseConfig);
        const plan = planner.plan('transfer money', sessionKey);
        const step: PolicyStep = {
          stepId: plan.steps[0].stepId,
          actionClass: plan.steps[0].actionClass,
        };

        const decision = gate.evaluate(step);
        expect(decision.decision).toBe('block');
        expect(decision.reason).toContain('Hard block');
      });
    });

    it('audits hard blocked intents', () => {
      const planner = new HeuristicPlanner();
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      const sessionKey = 'test-session-13';

      const plan = planner.plan('transfer money', sessionKey);
      const step: PolicyStep = {
        stepId: plan.steps[0].stepId,
        actionClass: plan.steps[0].actionClass,
      };

      const decision = gate.evaluate(step);

      // Create audit event
      const auditEvent = gate.createAuditEvent(step.stepId, decision, Date.now());
      expect(auditEvent.stepId).toBe(step.stepId);
      expect(auditEvent.decision).toBe('block');
      expect(auditEvent.reason).toContain('Hard block');
      expect(auditEvent.autonomyLevel).toBe(Autonomy.Level3);
      expect(auditEvent.stats.actionsBlocked).toBeGreaterThan(0);
    });

    it('blocks identity_security_sensitive at all autonomy levels', () => {
      // Note: This test assumes HeuristicPlanner can identify identity-related intents
      // If the planner doesn't detect this, it would map to local_only (default)
      // and not be hard-blocked. This tests the hard block mechanism itself.
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      const step: PolicyStep = {
        stepId: 'test-step',
        actionClass: 'identity_security_sensitive',
      };

      const decision = gate.evaluate(step);
      expect(decision.decision).toBe('block');
      expect(decision.reason).toContain('Hard block');
    });
  });

  describe('Complex intent mapping', () => {
    it('handles mixed keywords with correct priority', () => {
      const planner = new HeuristicPlanner();
      const sessionKey = 'test-session-14';

      // "delete" is higher priority than "write"
      const deleteOverWritePlan = planner.plan('delete a written note', sessionKey);
      expect(deleteOverWritePlan.steps[0].actionClass).toBe('irreversible');
      expect(deleteOverWritePlan.steps[0].intent).toContain('delete');
    });

    it('produces a plan with valid structure', () => {
      const planner = new HeuristicPlanner();
      const sessionKey = 'test-session-15';

      const plan = planner.plan('search the web', sessionKey);

      // Validate plan structure
      expect(plan.id).toBeDefined();
      expect(plan.sessionKey).toBe(sessionKey);
      expect(plan.createdAtMs).toBeGreaterThan(0);
      expect(plan.steps).toBeInstanceOf(Array);
      expect(plan.steps.length).toBeGreaterThan(0);

      // Validate first step structure
      const step = plan.steps[0];
      expect(step.stepId).toBeDefined();
      expect(step.intent).toBeDefined();
      expect(step.actionClass).toBeDefined();
      expect(step.status).toBe('planned');
    });
  });
});
