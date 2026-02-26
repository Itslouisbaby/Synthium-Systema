/**
 * Policy Adapter — wraps v1 PolicyGate into typed signals for v2 MicroLoops.
 * MicroLoops never import PolicyGate directly; they call this adapter.
 */
import { PolicyGate } from '../../policy/gate.js';
import { Autonomy } from '../../policy/types.js';
import type { AutonomyLevel, PolicyConfig, PolicyDecision } from '../../policy/types.js';

export interface PolicyAdapterConfig {
  autonomyLevel?: AutonomyLevel;
  baseDir: string;
  allowlist?: string[];
}

export type PolicySignal =
  | { kind: 'allowed' }
  | { kind: 'awaiting_approval'; reason: string }
  | { kind: 'blocked'; reason: string };

export class PolicyAdapter {
  private readonly gate: PolicyGate;

  constructor(config: PolicyAdapterConfig) {
    const policyConfig: PolicyConfig = {
      baseDir: config.baseDir,
      allowlist: config.allowlist ?? [],
    };
    this.gate = new PolicyGate(config.autonomyLevel ?? Autonomy.Level1, policyConfig);
  }

  /**
   * Evaluate a planned action and return a typed signal for v2 loops.
   */
  evaluate(actionClass: string, description: string): PolicySignal {
    const decision: PolicyDecision = this.gate.evaluate({
      actionClass: actionClass as any,
      description,
    });

    switch (decision.decision) {
      case 'allow':
        return { kind: 'allowed' };
      case 'await_approval':
        return { kind: 'awaiting_approval', reason: decision.reason ?? 'Approval required' };
      case 'block':
        return { kind: 'blocked', reason: decision.reason ?? 'Blocked by policy' };
    }
  }

  getStats() {
    return this.gate.getStats();
  }
}
