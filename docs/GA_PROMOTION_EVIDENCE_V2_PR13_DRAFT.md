# GA Promotion Evidence (NeuronWaves v2) — PR13 Draft

This draft defines concrete evidence expected before promoting `src/neuronwaves-v2/*` beyond Incubating.

## Scope

- In scope: v2 signal-driven runtime, scheduler, and default micro-loops.
- Out of scope: changing default production path from v1 in this PR.

## Evidence captured in PR13

### 1) Shadow parity harness exists and runs in CI

- `runV1V2ShadowComparison` now returns:
  - output parity flags (`exact`, `normalized`),
  - v2 evidence metadata (`v2SignalTypes`, `v2TickCount`),
  - artifact directories for both runtimes.
- Covered by `tests/neuronwaves-v2/shadow-runner-pr11.test.ts`.

Status: **Met (extended in PR14 with semantic parity + policy/audit parity checks).**

### 2) v2 failure-path micro-loop coverage

- Monitor loop failure reaction validated (`STEP_FAILED` -> `CONFIDENCE_DROP`, `MODEL_ERROR_DETECTED`).
- Executive replan behavior validated (`MODEL_ERROR_DETECTED` -> `EXEC_REQUEST_REPLAN`).
- Critic shallow-plan detection validated (`PLAN_CREATED` shallow -> `PLAN_TOO_SHALLOW`).

Status: **Met (initial failure-path contract).**

### 3) Remaining gates before lane promotion

1. Add production-grade shadow evaluator with richer semantic parity metrics.
2. Add policy/audit parity checks between v1 and v2 artifacts.
3. Add end-to-end v2 runtime integration tests with real plan execution path (not shadow bridge).
4. Define rollback SLOs and cutover criteria for controlled tenant rollout.

Status: **Partially open.**

## Recommendation

- Keep v2 in **Incubating**.
- Use PR13 evidence as the minimum baseline for PR14+ promotion work.


### 4) Real v2 E2E runtime path

- Added `tests/neuronwaves-v2/runtime-e2e-pr16.test.ts` using the true v2 runtime with input/output/executive/critic/monitor loops enabled.
- Validates output publication path (`OUTPUT_READY` -> `OUTPUT_SENT`) and executive replan signal emission under model error conditions.

Status: **Met (baseline integration path).**
