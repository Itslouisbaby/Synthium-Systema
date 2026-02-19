import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

import type { PolicyArtifact } from './types.js';
import { validatePolicyArtifact } from './validate.js';
import { hashPolicy, signPolicyManifest, verifyPolicyManifest, type PolicyBundleManifest } from './signing.js';

export interface CreateBundleInput {
  policy: PolicyArtifact;
  outDir: string;
  privateKeyPem: string;
  keyId: string;
}

export async function createSignedPolicyBundle(input: CreateBundleInput): Promise<PolicyBundleManifest> {
  const outDir = path.resolve(input.outDir);
  await fs.mkdir(outDir, { recursive: true });

  const manifest = signPolicyManifest(input.policy, input.privateKeyPem, input.keyId);

  const policyYaml = yaml.dump(input.policy, { noRefs: true, sortKeys: true });
  await fs.writeFile(path.join(outDir, 'policy.yaml'), policyYaml, 'utf8');
  await fs.writeFile(path.join(outDir, 'policy.manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return manifest;
}

export async function verifySignedPolicyBundle(bundleDir: string, publicKeyPem: string): Promise<{ valid: boolean; reason?: string }> {
  const resolved = path.resolve(bundleDir);
  const policyRaw = await fs.readFile(path.join(resolved, 'policy.yaml'), 'utf8');
  const manifestRaw = await fs.readFile(path.join(resolved, 'policy.manifest.json'), 'utf8');

  const policy = validatePolicyArtifact(yaml.load(policyRaw));
  const manifest = JSON.parse(manifestRaw) as PolicyBundleManifest;

  const computedHash = hashPolicy(policy);
  if (computedHash !== manifest.policyHash) {
    return { valid: false, reason: 'Policy hash mismatch.' };
  }

  const verified = verifyPolicyManifest(manifest, publicKeyPem);
  if (!verified) {
    return { valid: false, reason: 'Manifest signature verification failed.' };
  }

  return { valid: true };
}
