import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { PolicyArtifact } from './types.js';
import { canonicalizeJson } from './canonicalize.js';

export interface PolicyBundleManifest {
  policyId: string;
  policyVersion: string;
  effectiveAt: string;
  createdAt: string;
  keyId: string;
  policyHash: string;
  signature: string;
}

export function hashPolicy(policy: PolicyArtifact): string {
  const canonical = canonicalizeJson(policy);
  return crypto.createHash('sha256').update(Buffer.from(canonical, 'utf8')).digest('hex');
}

export function signPolicyManifest(
  policy: PolicyArtifact,
  privateKeyPem: string,
  keyId: string,
  createdAt: string = new Date().toISOString()
): PolicyBundleManifest {
  const policyHash = hashPolicy(policy);
  const unsigned = {
    policyId: policy.policyId,
    policyVersion: policy.version,
    effectiveAt: policy.effectiveAt,
    createdAt,
    keyId,
    policyHash,
  };

  const payload = canonicalizeJson(unsigned);
  const signature = crypto
    .sign(null, Buffer.from(payload, 'utf8'), privateKeyPem)
    .toString('base64');

  return {
    ...unsigned,
    signature,
  };
}

export function verifyPolicyManifest(manifest: PolicyBundleManifest, publicKeyPem: string): boolean {
  const { signature, ...unsigned } = manifest;
  const payload = canonicalizeJson(unsigned);
  return crypto.verify(
    null,
    Buffer.from(payload, 'utf8'),
    publicKeyPem,
    Buffer.from(signature, 'base64')
  );
}

export async function readPemKey(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  return fs.readFile(resolved, 'utf8');
}
