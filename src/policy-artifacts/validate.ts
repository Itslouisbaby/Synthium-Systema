import type { PolicyArtifact } from './types.js';
import { PolicyError } from './errors.js';

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

export function validatePolicyArtifact(input: unknown): PolicyArtifact {
  if (!input || typeof input !== 'object') {
    throw new PolicyError('Policy must be an object', 'POLICY_INVALID_TYPE');
  }

  const p: any = input;

  if (p.apiVersion !== 'synth.policy/v1') {
    throw new PolicyError('Unsupported apiVersion', 'POLICY_UNSUPPORTED_APIVERSION', { apiVersion: p.apiVersion });
  }

  for (const field of ['policyId', 'version', 'effectiveAt', 'changelog', 'rules']) {
    if (!(field in p)) {
      throw new PolicyError(`Missing required field: ${field}`, 'POLICY_MISSING_FIELD', { field });
    }
  }

  if (typeof p.policyId !== 'string' || !p.policyId.trim()) {
    throw new PolicyError('policyId must be a non-empty string', 'POLICY_INVALID_POLICY_ID');
  }

  if (typeof p.version !== 'string' || !SEMVER_RE.test(p.version)) {
    throw new PolicyError('version must be a semver string', 'POLICY_INVALID_VERSION', { version: p.version });
  }

  if (typeof p.effectiveAt !== 'string' || Number.isNaN(Date.parse(p.effectiveAt))) {
    throw new PolicyError('effectiveAt must be ISO-8601', 'POLICY_INVALID_EFFECTIVE_AT', { effectiveAt: p.effectiveAt });
  }

  if (!Array.isArray(p.changelog) || p.changelog.length === 0) {
    throw new PolicyError('changelog must be a non-empty array', 'POLICY_INVALID_CHANGELOG');
  }

  const hasVersionEntry = p.changelog.some((e: any) => e && typeof e === 'object' && e.version === p.version);
  if (!hasVersionEntry) {
    throw new PolicyError('changelog must include an entry for current version', 'POLICY_CHANGELOG_MISSING_VERSION');
  }

  if (!p.rules || typeof p.rules !== 'object') {
    throw new PolicyError('rules must be an object', 'POLICY_INVALID_RULES');
  }

  return p as PolicyArtifact;
}
