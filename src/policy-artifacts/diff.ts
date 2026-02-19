import type { PolicyArtifact } from './types.js';

export interface PolicyDiffReport {
  fromVersion: string;
  toVersion: string;
  changedSections: string[];
  addedDomains: string[];
  removedDomains: string[];
  toggles: Record<string, { from: unknown; to: unknown }>;
}

interface DomainRule {
  pattern: string;
  allow: boolean;
}

function listDomainRules(policy: PolicyArtifact): DomainRule[] {
  const externalRead = (policy.rules.externalRead ?? {}) as Record<string, unknown>;
  return ((externalRead.domains ?? []) as DomainRule[]).filter(
    (r) => r && typeof r.pattern === 'string' && typeof r.allow === 'boolean'
  );
}

export function diffPolicies(fromPolicy: PolicyArtifact, toPolicy: PolicyArtifact): PolicyDiffReport {
  const changedSections = new Set<string>();
  const fromRules = listDomainRules(fromPolicy);
  const toRules = listDomainRules(toPolicy);

  const fromKeys = new Set(fromRules.map((r) => `${r.pattern}:${r.allow}`));
  const toKeys = new Set(toRules.map((r) => `${r.pattern}:${r.allow}`));

  const addedDomains = [...toKeys].filter((k) => !fromKeys.has(k));
  const removedDomains = [...fromKeys].filter((k) => !toKeys.has(k));

  if (addedDomains.length || removedDomains.length) {
    changedSections.add('externalRead.domains');
  }

  const toggles: Record<string, { from: unknown; to: unknown }> = {};

  const fromExternal = (fromPolicy.rules.externalRead ?? {}) as Record<string, unknown>;
  const toExternal = (toPolicy.rules.externalRead ?? {}) as Record<string, unknown>;

  const fromEnabled = (fromExternal.global as Record<string, unknown> | undefined)?.enabled;
  const toEnabled = (toExternal.global as Record<string, unknown> | undefined)?.enabled;

  if (fromEnabled !== toEnabled) {
    toggles['externalRead.global.enabled'] = { from: fromEnabled, to: toEnabled };
    changedSections.add('externalRead.global.enabled');
  }

  return {
    fromVersion: fromPolicy.version,
    toVersion: toPolicy.version,
    changedSections: [...changedSections],
    addedDomains,
    removedDomains,
    toggles,
  };
}
