# Release Lanes and Promotion Policy

## Why lanes exist

This repository contains modules at different maturity levels. Lanes provide an explicit contract to operators and stakeholders.

## Lane definitions

### GA (General Availability)

Criteria:
- Default path in CLI/runtime
- Covered by tests executed in standard CI
- Documented operational behavior
- No known high-risk caveats for normal usage

Expectation:
- Safe to run in production with normal guardrails.

### Experimental

Criteria:
- Functionally useful and implemented
- Limited production hardening and/or integration coverage
- May change API/behavior between minor updates

Expectation:
- Suitable for pilot environments and controlled rollout.

### Incubating

Criteria:
- Active design/build stage
- Partial integration or feature-flag-only access
- Incomplete docs/tests/operational guidance

Expectation:
- Development use only.

## Current lane mapping (repository-level)

- **GA:** Core v1 runtime path (default `synth run` behavior), baseline CLI/TUI workflows.
- **Experimental:** Multi-agent subsystem, external-read stack, policy artifact authoring/versioning workflows, shadow scheduler.
- **Incubating:** `src/neuronwaves-v2/*` modules and transition surfaces gated by `SYNTH_NEURONWAVES_RUNTIME=v2`.


Evidence:
- GA evidence for default v1 runtime path: `docs/GA_PROMOTION_EVIDENCE_PR9.md`
- v2 migration approach and gates: `docs/NEURONWAVES_V2_GA_MIGRATION_PLAN.md`
- v2 GA evidence draft baseline: `docs/GA_PROMOTION_EVIDENCE_V2_PR13_DRAFT.md`
- v2 cutover/rollback operational gates: `docs/NEURONWAVES_V2_CUTOVER_ROLLBACK_GATES_PR17.md`

## Promotion checklist

A module is promoted only when all are true:
1. Stable API/behavior documented
2. CI coverage includes normal + failure-path validation
3. Operational runbook and rollback path exist
4. Security/policy controls are explicit
5. No unresolved high-severity defects for defined scope
