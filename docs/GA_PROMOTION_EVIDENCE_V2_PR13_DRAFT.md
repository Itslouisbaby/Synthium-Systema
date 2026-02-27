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

1. Production-grade shadow evaluator with richer semantic parity metrics and CI-operational thresholds.
2. Policy/audit parity checks with per-step mismatch classification (decision/reason/missing/extra).
3. End-to-end v2 runtime integration tests with real plan execution path (not shadow bridge).
4. Rollback SLOs and cutover criteria, plus executed drill evidence.

Status: **In progress (PR18+ operationalization underway).**

## Recommendation

- Keep v2 in **Incubating**.
- Use PR13 evidence as the minimum baseline for PR14+ promotion work.


### 4) Real v2 E2E runtime path

- Added `tests/neuronwaves-v2/runtime-e2e-pr16.test.ts` using the true v2 runtime with input/output/executive/critic/monitor loops enabled.
- Validates output publication path (`OUTPUT_READY` -> `OUTPUT_SENT`) and executive replan signal emission under model error conditions.

Status: **Met (baseline integration path).**


### 5) Cutover and rollback gates

- Added `docs/NEURONWAVES_V2_CUTOVER_ROLLBACK_GATES_PR17.md` with canary stages, rollback SLO thresholds, auto-abort conditions, and lane-promotion checklists.

Status: **Met (operational gate baseline).**


### 6) Semantic threshold operationalization + trend gating

- Shadow comparison now emits configurable threshold settings and a promotion gate decision (`pass/fail`, failed checks, recommendation).
- Gate evaluation supports trend windows (consecutive pass requirements) so CI can block lane promotion on regressions.
- Covered by `tests/neuronwaves-v2/shadow-runner-pr11.test.ts` with hold/rollback scenarios.

Status: **Met (baseline gate logic in code).**

### 7) Canary/rollback drill evidence capture

- Added `docs/NEURONWAVES_V2_CANARY_DRILL_EVIDENCE.md` as the canonical drill evidence log with required schema and a Stage A dry-run entry.
- Includes SLO deltas, parity outcomes, and next-stage blockers.

Status: **Met (documentation + example evidence, further real drills required before Stage B).**


### 8) PR21 CI promotion gate + canary controller

- Added a dedicated CI job (`v2-promotion-gate`) that runs rolling-window parity checks and fails hard on threshold breaches.
- Gate enforces semantic floor/trend, policy mismatch class thresholds, and output publication reliability (`OUTPUT_READY` -> `OUTPUT_SENT`).
- Added canary controller automation (`synth canary gate`) that persists stage decision artifacts (`promote|hold|rollback`) and appends structured drill evidence.

Status: **Met (automation active; Stage B/C rollout still requires operational execution windows).**
