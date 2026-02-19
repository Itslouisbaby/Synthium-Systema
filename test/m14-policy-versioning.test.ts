import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import { PolicyGate } from '../src/policy/gate.js';
import { ActionClass, Autonomy } from '../src/policy/types.js';
import { loadPolicy } from '../src/policy-artifacts/load.js';
import { PolicyRuntime } from '../src/policy-artifacts/runtime.js';
import { diffPolicies } from '../src/policy-artifacts/diff.js';
import { createSignedPolicyBundle, verifySignedPolicyBundle } from '../src/policy-artifacts/bundle.js';

function policyYaml(version: string, enabled = true, extraDomain = '') {
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
${extraDomain}`;
}

describe('M14 policy authoring/versioning', () => {
  it('includes policy version metadata in policy decision audit', () => {
    const gate = new PolicyGate(Autonomy.Level2, {
      baseDir: '.',
      allowlist: ['example.com'],
      policyId: 'default',
      policyVersion: '1.4.0',
      policyEffectiveAt: '2026-02-19T00:00:00Z',
      policyHash: 'abc123',
    });

    const decision = gate.evaluate({
      stepId: 's1',
      actionClass: ActionClass.ExternalRead,
      target: 'example.com',
    });

    const audit = gate.createAuditEvent('s1', decision, Date.now());
    expect(audit.policyId).toBe('default');
    expect(audit.policyVersion).toBe('1.4.0');
    expect(audit.policyEffectiveAt).toBe('2026-02-19T00:00:00Z');
    expect(audit.policyHash).toBe('abc123');
  });

  it('supports reload/simulate workflow to test policy change without code change', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'synth-policy-runtime-'));
    const cfgDir = path.join(tmp, 'config');
    await fs.mkdir(cfgDir, { recursive: true });

    const policyPath = path.join(cfgDir, 'policy.yaml');
    await fs.writeFile(policyPath, policyYaml('1.0.0', true), 'utf8');

    const runtime = new PolicyRuntime({
      canonicalPath: policyPath,
      deprecatedFallbackPath: path.join(tmp, 'policy.yaml'),
    });

    await runtime.reload();
    const first = runtime.simulate({ operation: 'external_read', domain: 'api.example.com' });
    expect(first.policyVersion).toBe('1.0.0');
    expect(first.decision).toBe('allow');

    await fs.writeFile(policyPath, policyYaml('1.1.0', false), 'utf8');
    await runtime.reload();

    const second = runtime.simulate({ operation: 'external_read', domain: 'api.example.com' });
    expect(second.policyVersion).toBe('1.1.0');
    expect(second.decision).toBe('deny');
    expect(second.explanation.join(' ')).toMatch(/disabled/i);
  });

  it('generates policy diff report and verifies signed bundles', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'synth-policy-bundle-'));
    const fromPath = path.join(tmp, 'from.yaml');
    const toPath = path.join(tmp, 'to.yaml');

    await fs.writeFile(fromPath, policyYaml('1.0.0', true), 'utf8');
    await fs.writeFile(
      toPath,
      policyYaml('1.1.0', true, '      - pattern: "bad.example.com"\n        allow: false\n'),
      'utf8'
    );

    const from = await loadPolicy({ canonicalPath: fromPath, deprecatedFallbackPath: path.join(tmp, 'x.yaml') });
    const to = await loadPolicy({ canonicalPath: toPath, deprecatedFallbackPath: path.join(tmp, 'y.yaml') });

    const diff = diffPolicies(from.policy, to.policy);
    expect(diff.fromVersion).toBe('1.0.0');
    expect(diff.toVersion).toBe('1.1.0');
    expect(diff.changedSections).toContain('externalRead.domains');

    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const bundleDir = path.join(tmp, 'bundle');
    await createSignedPolicyBundle({
      policy: to.policy,
      outDir: bundleDir,
      privateKeyPem: privatePem,
      keyId: 'test-key-1',
    });

    const verifyOk = await verifySignedPolicyBundle(bundleDir, publicPem);
    expect(verifyOk.valid).toBe(true);

    await fs.writeFile(path.join(bundleDir, 'policy.yaml'), policyYaml('9.9.9', true), 'utf8');
    const verifyTampered = await verifySignedPolicyBundle(bundleDir, publicPem);
    expect(verifyTampered.valid).toBe(false);
  });
});
