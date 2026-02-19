import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import yaml from 'js-yaml';

import type { PolicyLoadOptions, PolicyLoadResult } from './types.js';
import { PolicyError } from './errors.js';
import { validatePolicyArtifact } from './validate.js';
import { canonicalizeJson } from './canonicalize.js';

export const DEFAULT_CANONICAL_POLICY_PATH = './config/policy.yaml';
export const DEFAULT_DEPRECATED_POLICY_PATH = './policy.yaml';

export async function loadPolicy(opts: PolicyLoadOptions = {}): Promise<PolicyLoadResult> {
  const canonicalPath = opts.canonicalPath ?? DEFAULT_CANONICAL_POLICY_PATH;
  const deprecatedFallbackPath = opts.deprecatedFallbackPath ?? DEFAULT_DEPRECATED_POLICY_PATH;

  const warnings: string[] = [];

  const canonicalAbs = path.resolve(canonicalPath);
  const deprecatedAbs = path.resolve(deprecatedFallbackPath);

  const canonicalExists = await exists(canonicalAbs);
  const deprecatedExists = canonicalAbs === deprecatedAbs ? false : await exists(deprecatedAbs);

  let chosenAbs: string | null = null;
  let source: 'canonical' | 'deprecated_fallback' = 'canonical';

  if (canonicalExists) {
    chosenAbs = canonicalAbs;
    source = 'canonical';
  } else if (deprecatedExists) {
    chosenAbs = deprecatedAbs;
    source = 'deprecated_fallback';
    warnings.push(`Deprecated policy path in use: ${deprecatedFallbackPath}. Please migrate to ${canonicalPath}.`);
  }

  if (!chosenAbs) {
    throw new PolicyError(
      `Policy file not found. Looked for ${canonicalPath} (canonical) and ${deprecatedFallbackPath} (deprecated).`,
      'POLICY_NOT_FOUND',
      { canonicalPath, deprecatedFallbackPath }
    );
  }

  const raw = await fs.readFile(chosenAbs, 'utf8');
  const parsed = yaml.load(raw);
  const policy = validatePolicyArtifact(parsed);

  const canonicalPayload = canonicalizeJson(policy);
  const policyHash = crypto.createHash('sha256').update(Buffer.from(canonicalPayload, 'utf8')).digest('hex');

  const signed = false;
  if (source === 'deprecated_fallback') {
    warnings.push('Policy loaded from deprecated fallback is treated as unsigned/deprecated.');
  }

  return { policy, source, path: chosenAbs, policyHash, signed, warnings };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
