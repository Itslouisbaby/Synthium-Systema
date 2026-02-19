import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import { loadPolicy } from '../src/policy-artifacts/load.js';

function policyYaml(version: string) {
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
      enabled: true
`;
}

describe('M14 Policy loader', () => {
  it('loads canonical ./config/policy.yaml when present', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'synth-policy-'));
    const cfgDir = path.join(tmp, 'config');
    await fs.mkdir(cfgDir, { recursive: true });

    await fs.writeFile(path.join(cfgDir, 'policy.yaml'), policyYaml('1.0.0'), 'utf8');

    const result = await loadPolicy({
      canonicalPath: path.join(tmp, 'config', 'policy.yaml'),
      deprecatedFallbackPath: path.join(tmp, 'policy.yaml'),
    });

    expect(result.source).toBe('canonical');
    expect(result.policy.version).toBe('1.0.0');
    expect(result.warnings).toEqual([]);
    expect(result.policyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('falls back to deprecated ./policy.yaml with warnings', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'synth-policy-'));

    await fs.writeFile(path.join(tmp, 'policy.yaml'), policyYaml('1.0.1'), 'utf8');

    const result = await loadPolicy({
      canonicalPath: path.join(tmp, 'config', 'policy.yaml'),
      deprecatedFallbackPath: path.join(tmp, 'policy.yaml'),
    });

    expect(result.source).toBe('deprecated_fallback');
    expect(result.policy.version).toBe('1.0.1');
    expect(result.warnings.join('\n')).toMatch(/Deprecated policy path/);
    expect(result.warnings.join('\n')).toMatch(/unsigned\/deprecated/);
  });
});
