# Architecture Map (Operational)

## Top-level flow

```text
Input surfaces (CLI/TUI)
  -> Runtime orchestration (SynthRuntime + loops)
  -> Policy enforcement (policy gate / policy artifacts)
  -> Tool execution + external-read safeguards
  -> Memory consolidation (flash/warm/semantic)
  -> Audit + state persistence
```

## Entry points

- Library barrel: `src/index.ts`
- CLI entry: `src/cli/index.ts`
- TUI entry: `src/tui/index.ts`

## Major subsystems

### 1) Runtime + cognition core

- `src/synth-runtime.ts`
- `src/autonomous-cognitive-system.ts`
- `src/enhanced-autonomous-system.ts`
- `src/loops/*`

### 2) Memory

- `src/memory/*`
- `src/memory/semantic/*`

### 3) Policy

- Gate and execution policy: `src/policy/*`
- Artifact lifecycle (versioning/diff/sign/verify/simulate): `src/policy-artifacts/*`

### 4) Agentic orchestration

- Multi-agent routing/session/registry: `src/multi-agent/*`
- Shadow scheduler: `src/shadow-scheduler/*`

### 5) External-read boundary

- Fetch/policy/audit stack: `src/external-read/*`

### 6) Interfaces

- CLI commands: `src/cli/commands/*`
- TUI application/components: `src/tui/*`

### 7) V2 namespace (incubating)

- `src/neuronwaves-v2/*`
- Selected runtime feature-flag references are in CLI run command path.

## Architectural intent

- Keep stable execution path available while incubating advanced capabilities.
- Isolate experimental/in-progress modules by namespace and release lane labeling.
- Prefer policy/audit guardrails for anything that expands autonomy or external I/O.
