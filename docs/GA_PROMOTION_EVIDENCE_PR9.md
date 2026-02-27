# GA Promotion Evidence (PR9)

This document captures concrete evidence for promoting the default v1 runtime path toward GA readiness.

## Scope

- In scope: `SynthRuntime.processInput()` orchestration path and `v1-pipeline-adapter` behavior.
- Out of scope: v2 neuronwaves namespace, shadow scheduler advanced features, multi-agent orchestration.

## Promotion checklist with evidence

### 1) Stable, documented behavior

- Runtime orchestration and lane expectations are documented in:
  - `docs/ARCHITECTURE_MAP.md`
  - `docs/RELEASE_LANES.md`
  - `docs/PHASE_A_DESTUB_RUNTIME_PLAN.md`

Status: **Met for v1 runtime path**.

### 2) CI coverage includes success + failure paths

Covered by runtime tests:

- Success/policy smoke:
  - `tests/runtime/synth-runtime-pr1.test.ts`
- Adapter policy and execution behavior:
  - `tests/runtime/v1-pipeline-adapter.test.ts`
- Failure/replan semantics:
  - `tests/runtime/pipeline-step-failure-replan.test.ts`
- Memory/audit observability:
  - `tests/runtime/pipeline-memory-audit.test.ts`
- Reliability/performance gates (PR8):
  - `tests/runtime/runtime-reliability-pr89.test.ts`

Status: **Met in this checkout**.

### 3) Operational artifacts and rollback visibility

Evidence generated per run:

- Signal stream (`INPUT_RECEIVED`, `OUTPUT_READY`)
- Run manifest (`artifacts/<session>/runs/latest.json`) with:
  - `planId`
  - `evaluation`
  - `policyDecisions`

Status: **Met for default runtime execution path**.

### 4) Security/policy controls are explicit

- Runtime requests are processed through policy checks in the adapter.
- External-read requests are blocked or approval-gated by autonomy/policy level.
- Policy audit decisions are attached to run artifacts.

Status: **Met for implemented action classes**.

### 5) No unresolved high-severity defects for scoped path

Current scoped risk remains:

- Default planner decomposition is intentionally simple heuristic logic and should be upgraded before broad GA claims beyond the scoped v1 path.

Status: **Conditionally met** for the current scoped runtime; track planner-hardening as next item.

## Recommendation

- Keep **default v1 runtime path** in GA lane with the above scoped caveat.
- Keep advanced subsystems (`v2`, multi-agent extensions, shadow scheduler advanced flows) in Experimental/Incubating lanes until equivalent evidence exists.
