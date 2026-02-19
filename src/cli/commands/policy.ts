import fs from 'node:fs/promises';
import yaml from 'js-yaml';

import type { CLIOptions, CLIResult } from '../types.js';
import {
  loadPolicy,
  simulatePolicyDecision,
  diffPolicies,
  createSignedPolicyBundle,
  verifySignedPolicyBundle,
  readPemKey,
} from '../../policy-artifacts/index.js';

function ok(output: string): CLIResult {
  return { exitCode: 0, output };
}

function userError(error: string): CLIResult {
  return { exitCode: 1, error };
}

export default async function policyCommand(options: CLIOptions): Promise<CLIResult> {
  const action = options.policyAction;
  if (!action) {
    return userError('Error: policy action required: simulate | diff | bundle | verify-bundle');
  }

  if (action === 'simulate') {
    if (!options.policyPath || !options.inputPath) {
      return userError('Error: simulate requires --policy <path> and --input <json>');
    }

    const loaded = await loadPolicy({ canonicalPath: options.policyPath, deprecatedFallbackPath: options.policyPath });
    const input = JSON.parse(await fs.readFile(options.inputPath, 'utf8')) as { operation: 'external_read'; domain: string };
    const result = simulatePolicyDecision(loaded.policy, input);
    return ok(JSON.stringify({ ...result, policyHash: loaded.policyHash }, null, 2));
  }

  if (action === 'diff') {
    if (!options.fromPath || !options.toPath) {
      return userError('Error: diff requires --from <policy.yaml> and --to <policy.yaml>');
    }

    const fromLoaded = await loadPolicy({ canonicalPath: options.fromPath, deprecatedFallbackPath: options.fromPath });
    const toLoaded = await loadPolicy({ canonicalPath: options.toPath, deprecatedFallbackPath: options.toPath });

    const report = diffPolicies(fromLoaded.policy, toLoaded.policy);
    return ok(JSON.stringify(report, null, 2));
  }

  if (action === 'bundle') {
    if (!options.policyPath || !options.outPath || !options.privateKeyPath || !options.keyId) {
      return userError('Error: bundle requires --policy --out --private-key --key-id');
    }

    const loaded = await loadPolicy({ canonicalPath: options.policyPath, deprecatedFallbackPath: options.policyPath });
    const privateKeyPem = await readPemKey(options.privateKeyPath);

    const manifest = await createSignedPolicyBundle({
      policy: loaded.policy,
      outDir: options.outPath,
      privateKeyPem,
      keyId: options.keyId,
    });

    return ok(JSON.stringify(manifest, null, 2));
  }

  if (action === 'verify-bundle') {
    if (!options.bundlePath || !options.publicKeyPath) {
      return userError('Error: verify-bundle requires --bundle <dir> and --public-key <pem>');
    }

    const publicKeyPem = await readPemKey(options.publicKeyPath);
    const result = await verifySignedPolicyBundle(options.bundlePath, publicKeyPem);
    return ok(JSON.stringify(result, null, 2));
  }

  return userError(`Error: unsupported policy action: ${String(action)}`);
}
