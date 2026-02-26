# MILESTONES - Operational Snapshot

**Last Updated:** 2026-02-26

This file is the current operational view. Historical milestone narratives are useful context, but not release truth on their own.

## 1) Current verified execution state (this checkout)

- Build pipeline: library + CLI + TUI build targets are configured and runnable.
- Test pipeline: active Vitest suites under `tests/multi-agent/*` are passing in this checkout.
- Runtime split: default `run` command path is v1 runtime; v2 is feature-flag opt-in.

## 2) Capability map by maturity

### GA (General Availability)

- Core runtime orchestration and default CLI run path
- Baseline CLI/TUI surfaces required for local operation
- Core memory/policy/runtime modules used by default execution path

### Experimental

- Multi-agent routing/session/registry modules
- External-read policy/fetch/audit stack
- Policy artifact authoring/versioning/signing workflows
- Shadow scheduler subsystem

### Incubating

- `src/neuronwaves-v2/*` namespace and transition adapters

See release-lane policy: `docs/RELEASE_LANES.md`.

## 3) Historical context (retained)

Previous milestone logs (M1-M14) represented point-in-time delivery statements. Keep them for archaeology and traceability, but do not use historical totals as current release claims without re-validation.

## 4) Operational hygiene requirements

To keep this file truthful:

1. Update date whenever this file changes.
2. When test scope changes, update "Current verified execution state".
3. If a module lane changes (GA/Experimental/Incubating), update here and in README.
4. Never claim aggregate test counts unless they match current CI configuration.
