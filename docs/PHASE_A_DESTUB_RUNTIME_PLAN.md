# Phase A — De-stub Runtime (Productionization Plan)

Objective: replace synthetic/stubbed behavior in the runtime path with a real, auditable, policy-governed reasoning pipeline.

## Scope (Phase A)

- Target runtime: `src/synth-runtime.ts` (default operational path)
- Keep public CLI contract stable while replacing internals
- Do not claim AGI/GA promotion until acceptance tests pass

## Remaining blockers to production hardening

1. Planner decomposition is still heuristic and needs stronger intent/action extraction quality gates.
2. Signal ownership for `OUTPUT_READY` should move from `processInput()` convenience emission to loop-orchestrated completion path.
3. Policy artifact load failures now surface as warnings, but should be promoted into explicit operational telemetry/alerts.

## File-by-file implementation plan

### 1) `src/synth-runtime.ts`

- Replace synthetic `v1Loop` passed to `CortexLoop` with a real pipeline adapter.
- Refactor `processInput()` to:
  1. create session context,
  2. emit `INPUT_RECEIVED`,
  3. wait for runtime output signal,
  4. return finalized output from signal stream.
- Keep memory write/read behavior, but move it to pipeline edges (input ingest + finalization), not bypass path.

### 2) `src/loops/cortex-loop.ts`

- Keep wrapper behavior, but ensure payload supports:
  - planning result,
  - policy decisions per step,
  - step execution outcomes,
  - final evaluation output.
- Ensure no default success outcomes are synthesized when steps fail.

### 3) New adapter: `src/runtime/v1-pipeline-adapter.ts` (new)

- Implement `V1LoopFunction` bridge that composes:
  - planning,
  - policy gate checks,
  - step execution,
  - evaluation summarization.
- Return typed result matching `CortexLoop` expectations.
- Include deterministic fallback if provider unavailable.

### 4) `src/policy/gate.ts` + execution integration points

- Ensure each executable step gets a policy decision artifact with reason.
- Enforce deny/awaiting-approval states in pipeline output.
- Ban silent success for denied steps.

### 5) `src/memory/*` integration

- Persist:
  - user input,
  - selected execution/evaluation outcomes,
  - final assistant output.
- Consolidate semantic facts only from successful tool outcomes.

### 6) Test suites (new)

Create these tests under `tests/runtime/`:

1. `pipeline-happy-path.test.ts`
   - Input -> plan -> policy allow -> execution -> evaluation -> output.
2. `pipeline-policy-block.test.ts`
   - Denied/approval-required steps produce no false execution success.
3. `pipeline-step-failure-replan.test.ts`
   - Step failure triggers critic/executive replan behavior and clear final summary.
4. `pipeline-memory-audit.test.ts`
   - Verify memory/audit artifacts for input + final output + step outcomes.

## Acceptance tests (must pass before Phase A done)

### A. Runtime fidelity
- No synthetic `v1Loop` implementation in `SynthRuntime`.
- `processInput()` relies on loop orchestration output path.

### B. Policy correctness
- Every step has an explicit policy decision.
- Denied steps cannot appear as executed.

### C. Failure semantics
- Execution/model failure produces non-success evaluation and visible reason.
- Replan path is traceable in emitted signals.

### D. Observability
- For each run, artifacts include enough evidence to reconstruct plan + decisions + outputs.

### E. CI
- Existing tests remain green.
- New `tests/runtime/*` pass in CI.

## Promotion criteria (Experimental -> GA for runtime path)

- All acceptance tests above pass.
- Runtime has no synthetic success outputs in core path.
- Policy and memory artifacts verified in CI for at least one golden scenario per category.
- README and release lane docs updated with evidence links.

## Suggested execution order

1. Add adapter + wire `SynthRuntime` to adapter.
2. Refactor `processInput()` to signal-driven output collection.
3. Add happy-path and policy-block tests.
4. Add failure/replan and memory/audit tests.
5. Update docs and promote lane only if criteria pass.
