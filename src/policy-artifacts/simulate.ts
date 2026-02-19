import type { PolicyArtifact } from './types.js';

export interface SimulationInput {
  operation: 'external_read';
  domain: string;
}

export interface SimulationResult {
  policyId: string;
  policyVersion: string;
  decision: 'allow' | 'deny';
  reason: string;
  explanation: string[];
  matched?: {
    section: string;
    pattern: string;
    ruleIndex: number;
  };
}

interface DomainRule {
  pattern: string;
  allow: boolean;
}

function matches(pattern: string, domain: string): boolean {
  const normalizedPattern = String(pattern).toLowerCase();
  const normalizedDomain = domain.toLowerCase();

  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2);
    return normalizedDomain === suffix || normalizedDomain.endsWith(`.${suffix}`);
  }

  return normalizedPattern === normalizedDomain;
}

export function simulatePolicyDecision(policy: PolicyArtifact, input: SimulationInput): SimulationResult {
  if (input.operation !== 'external_read') {
    return {
      policyId: policy.policyId,
      policyVersion: policy.version,
      decision: 'deny',
      reason: `Unsupported simulation operation: ${input.operation}`,
      explanation: ['Only external_read simulation is currently supported.'],
    };
  }

  const externalRead = (policy.rules.externalRead ?? {}) as Record<string, unknown>;
  const globalConfig = (externalRead.global ?? {}) as Record<string, unknown>;
  const enabled = globalConfig.enabled !== false;

  const explanation: string[] = [`externalRead.global.enabled=${String(enabled)}`];

  if (!enabled) {
    explanation.push('Global external_read is disabled.');
    return {
      policyId: policy.policyId,
      policyVersion: policy.version,
      decision: 'deny',
      reason: 'External read globally disabled by policy.',
      explanation,
    };
  }

  const domains = (externalRead.domains ?? []) as DomainRule[];
  for (let i = 0; i < domains.length; i++) {
    const rule = domains[i];
    if (!rule || typeof rule.pattern !== 'string' || typeof rule.allow !== 'boolean') {
      continue;
    }

    if (matches(rule.pattern, input.domain)) {
      explanation.push(`Matched domains[${i}] pattern=${rule.pattern} allow=${rule.allow}`);
      return {
        policyId: policy.policyId,
        policyVersion: policy.version,
        decision: rule.allow ? 'allow' : 'deny',
        reason: rule.allow ? 'Domain explicitly allowed by policy rule.' : 'Domain explicitly denied by policy rule.',
        explanation,
        matched: {
          section: 'externalRead.domains',
          pattern: rule.pattern,
          ruleIndex: i,
        },
      };
    }
  }

  explanation.push('No matching domain rule found; default deny.');
  return {
    policyId: policy.policyId,
    policyVersion: policy.version,
    decision: 'deny',
    reason: 'No matching externalRead domain rule found.',
    explanation,
  };
}
