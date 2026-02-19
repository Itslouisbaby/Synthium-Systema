/**
 * M14: Policy Authoring & Versioning
 */

export type PolicyApiVersion = 'synth.policy/v1';

export interface PolicyChangelogEntry {
  version: string;
  at: string; // ISO 8601
  summary: string;
  changes?: string[];
}

export interface PolicyArtifact {
  apiVersion: PolicyApiVersion;
  policyId: string;
  version: string; // semver string
  effectiveAt: string; // ISO 8601
  createdBy?: string;
  changelog: PolicyChangelogEntry[];
  rules: Record<string, unknown>;
}

export interface PolicyLoadOptions {
  /** Canonical path, default: ./config/policy.yaml */
  canonicalPath?: string;
  /** Deprecated fallback alias, default: ./policy.yaml */
  deprecatedFallbackPath?: string;
}

export type PolicyLoadSource = 'canonical' | 'deprecated_fallback';

export interface PolicyLoadResult {
  policy: PolicyArtifact;
  source: PolicyLoadSource;
  path: string;
  policyHash: string;
  signed: boolean;
  warnings: string[];
}
