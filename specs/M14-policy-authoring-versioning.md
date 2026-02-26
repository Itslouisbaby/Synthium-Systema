# M14 — Policy Authoring & Versioning

**Owner:** Product Team (engineering execution support)

## Goal
Make policy a **first-class artifact** with **versioning** and a **review workflow**, suitable for agentic infrastructure.

## Core Deliverables (as defined by product requirements)
1. Policy file format with **version**, **effective date**, and **change log**
2. **Policy simulation mode** that explains decisions
3. **Policy diff report** tooling
4. **Signed policy bundles** for release builds

## Acceptance Criteria (as defined by product requirements)
1. Policy decisions include **policy version** in audit
2. A policy change can be **tested without changing code**

---

## 1) Policy Artifact Format (YAML)

### Canonical file: `policy.yaml`
YAML is canonical. (Optional: we may support JSON later as a derived format.)

### Schema (v1)
```yaml
apiVersion: synth.policy/v1
policyId: "default"              # string
version: "1.4.0"                 # semver (string)
effectiveAt: "2026-02-19T00:00:00Z"  # ISO 8601
createdBy: "operator"                # optional string
changelog:
  - version: "1.4.0"
    at: "2026-02-19T00:00:00Z"
    summary: "Tighten external read limits"
    changes:
      - "Disallow private IP ranges"
      - "Reduce max redirects to 3"

rules:
  # Example: External Read policy (M11)
  externalRead:
    global:
      enabled: true
      maxRequestsPerMinute: 60
    domains:
      - pattern: "*.example.com"
        allow: true
      - pattern: "127.0.0.1"      # explicit deny
        allow: false

signing:
  # Optional inside source artifact; required in bundle.
  required: false
```

### Validation
- Required: `apiVersion`, `policyId`, `version`, `effectiveAt`, `changelog`, `rules`
- `version` must be semver-like (`X.Y.Z` string)
- `effectiveAt` must parse as ISO date
- `changelog` must include an entry for current `version`

### Loading / overrides
- Runtime loads from a configured path (default: `./config/policy.yaml` or `./policy.yaml` — TBD)
- Policy can be swapped/edited and reloaded without code changes.

---

## 2) Policy Version in Audit

### Requirement
Every policy decision must emit `policyVersion` (and ideally `policyId`) into audit events.

### Target locations
- External Read audit logger (`src/external-read/audit/...`) should record:
  - `policyId`
  - `policyVersion`
  - `policyEffectiveAt`
  - `policyHash` (recommended)

---

## 3) Policy Simulation Mode (Explain Decisions)

### CLI
Add a CLI command:
- `synth policy simulate --policy ./policy.yaml --input ./case.json`

### Output requirements
- Must explain:
  - allow/deny
  - matched rule(s)
  - why (reason string)
  - policy version (and hash)

### Example output
```json
{
  "policyId": "default",
  "policyVersion": "1.4.0",
  "decision": "deny",
  "reason": "Domain is explicitly denied",
  "matched": {
    "section": "externalRead.domains",
    "pattern": "127.0.0.1",
    "ruleIndex": 1
  }
}
```

---

## 4) Policy Diff Report Tooling

### CLI
- `synth policy diff --from ./policy-old.yaml --to ./policy.yaml`

### Output
- Human-readable summary + machine-readable JSON (optional)
- Must include:
  - from/to versions
  - changed sections
  - added/removed domain patterns
  - changed rate limits / toggles

---

## 5) Signed Policy Bundles (Release Builds)

### Bundle contents
A release bundle is a directory or single file containing:
- `policy.yaml`
- `policy.manifest.json` (includes policy hash, version, effectiveAt)
- `policy.sig` (signature over manifest)

### CLI
- `synth policy bundle --policy ./policy.yaml --out ./dist/policy-bundle`
- `synth policy verify-bundle --bundle ./dist/policy-bundle`

### Requirements
- Verifier rejects tampered bundles
- Runtime can be configured to load only verified bundles for release mode

---

## Implementation Plan (main-only, small commits)

1. Add spec (this file) + tests for:
   - policy YAML validation
   - audit includes policyVersion
2. Implement policy loader + schema validation
3. Wire policy version into audit
4. Implement simulation
5. Implement diff
6. Implement bundle + signing + verification

## Locked Decisions (per Apex)
1. **Canonical policy path:** `./config/policy.yaml`
   - `./policy.yaml` may exist only as a **deprecated fallback alias** during migration.
   - Loader must emit a warning when the alias is used.
2. **Review workflow enforcement:** **Synth approvals queue** (not Git PR-only)
   - Git PR review is optional/auxiliary documentation.
   - Runtime enforcement for sensitive changes is handled via approvals.

## Open Questions
1. Signing method:
   - Ed25519 (recommended) using Node `crypto`? or external tooling?
2. Which action classes require approval by default:
   - Identity/tenant boundary changes, external write, irreversible ops, money movement, etc.
