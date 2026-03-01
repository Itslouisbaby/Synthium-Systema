# Synth AI / NeuronWaves Engineering Brief

Synthium Systema is the engineering repository for **Synth AI**, powered by the **NeuronWaves** cognitive engine and a persistent **CoreMemory** substrate.

This README is intentionally written as a compact technical brief. For the full experiment-style white paper, see:

- [`docs/SYNTH_AI_ENGINEERING_WHITEPAPER.md`](./docs/SYNTH_AI_ENGINEERING_WHITEPAPER.md)

---

## System identity

- **Product / agent identity:** Synth AI
- **Cognitive engine:** NeuronWaves (v1 GA path, v2 staged/canary path)
- **Memory substrate:** CoreMemory (episodic + semantic retrieval, provenance, ranking, and artifact linkage)

---

## What exists in this repository

- Runtime orchestration (`SynthRuntime`, loop stack, reliability governor, policy gates)
- NeuronWaves v2 runtime and canary routing controls
- Capability and AGI evaluation harnesses (matrix, learning guard, red-team, expectancy board)
- Tool execution envelope and dependency-aware tool DAG execution
- Agentic operations manager and continual learning substrate
- CLI + TUI operator interfaces
- Artifacting for auditability and replay (`.synth/*` outputs)

For module-level map and topology, see:

- [`docs/ARCHITECTURE_MAP.md`](./docs/ARCHITECTURE_MAP.md)

---

## Operational lanes

See full lane policy in:

- [`docs/RELEASE_LANES.md`](./docs/RELEASE_LANES.md)

At a high level:

- **GA:** default v1 runtime path + baseline CLI/TUI
- **Experimental:** advanced policy tooling, multi-agent layers, extended eval surfaces
- **Incubating:** v2 cutover primitives and actively tuned autonomy features

---

## Runtime selection

Default runtime path is v1. To force NeuronWaves v2 during execution:

```bash
SYNTH_NEURONWAVES_RUNTIME=v2
```

---

## Build/test commands

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

Key evaluation commands used in CI governance:

```bash
pnpm capability:gate
pnpm capability:matrix
pnpm capability:learning-guard
pnpm capability:red-team
pnpm capability:expectancy-board
pnpm canary:gate
```

---

## Source-of-truth policy

When docs diverge, operational truth follows this precedence:

1. Current repository code + test outcomes
2. CI workflow gates and artifact outputs
3. This README and active white paper
4. Historical milestone docs (context only)

---

## License

MIT
