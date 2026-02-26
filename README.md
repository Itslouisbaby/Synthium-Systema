# Synthium Systema (NeuronWaves)

Synthium Systema is a local-first cognitive runtime and tooling stack for agentic workflows.

> **Repository status (operational):** actively evolving; contains a mix of stable, experimental, and incubating components.

## What is in this repository today

- Core runtime orchestration (`SynthRuntime`, autonomy/cognition loops, memory, policy gate)
- CLI + TUI interfaces
- Multi-agent routing/session/registry primitives
- Policy artifact lifecycle tooling (load/simulate/diff/sign/verify)
- External-read safety/audit components
- Shadow scheduler subsystem
- NeuronWaves v2 namespace and adapter surface (partially integrated)

For a system map, see [docs/ARCHITECTURE_MAP.md](./docs/ARCHITECTURE_MAP.md).

## Stability lanes (GA / Experimental / Incubating)

See full policy in [docs/RELEASE_LANES.md](./docs/RELEASE_LANES.md).

- **GA (safe default):** core v1 runtime path and baseline CLI/TUI workflow.
- **Experimental (usable with caution):** policy artifact authoring/versioning flows, external-read stack, multi-agent orchestration modules.
- **Incubating (for development):** NeuronWaves v2 namespaces and feature-flagged transitions.

## Runtime selection

`run` command defaults to v1 runtime. v2 runtime is opt-in via env flag:

```bash
SYNTH_NEURONWAVES_RUNTIME=v2
```

## Current command/testing reality

```bash
# install deps
pnpm install

# build all deliverables
npm run build

# test suites currently wired in this checkout
npm test

# static type validation
npm run typecheck

# lint alias (currently delegates to typecheck)
npm run lint
```

## Notes on documentation truth

Historical milestone documents are retained for context, but operational truth should come from:

1. This README
2. `MILESTONES.md` (Operational Snapshot section)
3. Build/test output in CI

## License

MIT.
