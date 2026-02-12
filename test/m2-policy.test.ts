import { describe, it, expect } from 'vitest';
import { PolicyGate, Autonomy, ActionClass, HARD_BLOCKED_CLASSES } from '../src/index.js';
import type { PolicyStep, PolicyConfig } from '../src/index.js';

describe('Milestone 2: Policy Gate', () => {
  const baseConfig: PolicyConfig = {
    baseDir: '.test-artifacts',
    allowlist: ['https://api.example.com', 'allowed-host'],
  };

  describe('Hard blocks (all levels)', () => {
    it('should block money_movement regardless of level', () => {
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.MoneyMovement,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('block');
      expect(decision.reason).toContain('Hard block');
    });

    it('should block identity_security_sensitive regardless of level', () => {
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.IdentitySecurity,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('block');
      expect(decision.reason).toContain('Hard block');
    });
  });

  describe('Level 1: Assist', () => {
    const gate = new PolicyGate(Autonomy.Level1, baseConfig);

    it('should allow local_only', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.LocalOnly,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('allow');
      expect(decision.reason).toContain('local_only allowed');
    });

    it('should block external_read', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.ExternalRead,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('block');
    });

    it('should block external_write', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.ExternalWrite,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('block');
    });

    it('should block irreversible', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.Irreversible,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('block');
    });
  });

  describe('Level 2: Delegated', () => {
    const gate = new PolicyGate(Autonomy.Level2, baseConfig);

    it('should allow local_only', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.LocalOnly,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('allow');
    });

    it('should allow external_read if allowlisted', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.ExternalRead,
        target: 'https://api.example.com',
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('allow');
      expect(decision.reason).toContain('allowlisted');
    });

    it('should block external_read if not allowlisted', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.ExternalRead,
        target: 'https://untrusted.com',
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('block');
      expect(decision.reason).toContain('not in allowlist');
    });

    it('should set irreversible to awaiting_approval', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.Irreversible,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('awaiting_approval');
      expect(decision.reason).toContain('requires approval');
    });

    it('should block external_write', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.ExternalWrite,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('block');
    });
  });

  describe('Level 3: Dev', () => {
    const gate = new PolicyGate(Autonomy.Level3, baseConfig);

    it('should allow local_only', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.LocalOnly,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('allow');
    });

    it('should allow external_read (no allowlist required)', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.ExternalRead,
        target: 'any-host',
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('allow');
    });

    it('should allow external_write', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.ExternalWrite,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('allow');
    });

    it('should set irreversible to awaiting_approval', () => {
      const step: PolicyStep = {
        stepId: 'step-1',
        actionClass: ActionClass.Irreversible,
      };

      const decision = gate.evaluate(step);

      expect(decision.decision).toBe('awaiting_approval');
    });
  });

  describe('Limit enforcement', () => {
    it('should enforce maxActionsPerRun', () => {
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      
      // Fill up to limit
      for (let i = 0; i < 100; i++) {
        gate.evaluate({ stepId: `step-${i}`, actionClass: ActionClass.LocalOnly });
      }

      // Next should be blocked
      const decision = gate.evaluate({ stepId: 'overflow', actionClass: ActionClass.LocalOnly });
      
      expect(decision.decision).toBe('block');
      expect(decision.triggeredLimit).toBe('maxActionsPerRun');
    });

    it('should enforce maxExternalPerRun', () => {
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      
      // Fill up to external limit
      for (let i = 0; i < 100; i++) {
        gate.evaluate({ stepId: `step-${i}`, actionClass: ActionClass.ExternalRead });
      }

      expect(gate.getStats().externalCount).toBe(100);
    });

    it('should enforce maxIrreversiblePerRun', () => {
      const gate = new PolicyGate(Autonomy.Level3, baseConfig);
      
      // Fill up to irreversible limit
      for (let i = 0; i < 10; i++) {
        gate.evaluate({ stepId: `step-${i}`, actionClass: ActionClass.Irreversible });
      }

      expect(gate.getStats().irreversibleCount).toBe(10);
    });
  });

  describe('Stats tracking', () => {
    it('should track considered actions', () => {
      const gate = new PolicyGate(Autonomy.Level1, baseConfig);
      
      gate.evaluate({ stepId: '1', actionClass: ActionClass.LocalOnly });
      gate.evaluate({ stepId: '2', actionClass: ActionClass.ExternalRead });
      
      expect(gate.getStats().actionsConsidered).toBe(2);
    });

    it('should track allowed vs blocked', () => {
      const gate = new PolicyGate(Autonomy.Level1, baseConfig);
      
      gate.evaluate({ stepId: '1', actionClass: ActionClass.LocalOnly }); // allowed
      gate.evaluate({ stepId: '2', actionClass: ActionClass.ExternalRead }); // blocked

      const stats = gate.getStats();
      expect(stats.actionsAllowed).toBe(1);
      expect(stats.actionsBlocked).toBe(1);
    });
  });
});