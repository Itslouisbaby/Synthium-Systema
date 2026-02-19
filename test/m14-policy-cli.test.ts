import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import policyCommand from '../src/cli/commands/policy.js';

function policyYaml(version: string, enabled = true) {
  return `apiVersion: synth.policy/v1
policyId: default
version: "${version}"
effectiveAt: "2026-02-19T00:00:00Z"
changelog:
  - version: "${version}"
    at: "2026-02-19T00:00:00Z"
    summary: "test"
rules:
  externalRead:
    global:
      enabled: ${enabled}
    domains:
      - pattern: "*.example.com"
        allow: true
`;
}

describe('M14 policy CLI command', () => {
  it('simulates, diffs, bundles, and verifies', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'synth-policy-cli-'));
    const oldPolicy = path.join(tmp, 'old.yaml');
    const newPolicy = path.join(tmp, 'new.yaml');
    const inputPath = path.join(tmp, 'input.json');

    await fs.writeFile(oldPolicy, policyYaml('1.0.0', true), 'utf8');
    await fs.writeFile(newPolicy, policyYaml('1.1.0', false), 'utf8');
    await fs.writeFile(inputPath, JSON.stringify({ operation: 'external_read', domain: 'api.example.com' }), 'utf8');

    const simulate = await policyCommand({
      workspace: tmp,
      policyAction: 'simulate',
      policyPath: newPolicy,
      inputPath,
    });
    expect(simulate.exitCode).toBe(0);
    expect(simulate.output).toContain('"decision": "deny"');

    const diff = await policyCommand({
      workspace: tmp,
      policyAction: 'diff',
      fromPath: oldPolicy,
      toPath: newPolicy,
    });
    expect(diff.exitCode).toBe(0);
    expect(diff.output).toContain('externalRead.global.enabled');

    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const privatePemPath = path.join(tmp, 'private.pem');
    const publicPemPath = path.join(tmp, 'public.pem');
    await fs.writeFile(privatePemPath, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'utf8');
    await fs.writeFile(publicPemPath, publicKey.export({ type: 'spki', format: 'pem' }).toString(), 'utf8');

    const bundleDir = path.join(tmp, 'bundle');
    const bundle = await policyCommand({
      workspace: tmp,
      policyAction: 'bundle',
      policyPath: newPolicy,
      outPath: bundleDir,
      privateKeyPath: privatePemPath,
      keyId: 'k1',
    });
    expect(bundle.exitCode).toBe(0);

    const verify = await policyCommand({
      workspace: tmp,
      policyAction: 'verify-bundle',
      bundlePath: bundleDir,
      publicKeyPath: publicPemPath,
    });
    expect(verify.exitCode).toBe(0);
    expect(verify.output).toContain('"valid": true');
  });
});
