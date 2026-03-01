# NeuronWaves v2 Canary & Rollback Drill Evidence

This file records execution evidence for cutover and rollback drills referenced by PR17 gates.

## Drill record schema

Each drill entry must capture:

- date/time (UTC),
- stage (A/B/C/D/E),
- traffic percentage,
- semantic parity gate result,
- policy/audit parity result,
- SLO deltas (error-rate, p95 latency, output publication),
- rollback trigger checks,
- operator outcome and next action.

## Drill entries

### DRILL-2026-02-27-A (shadow-only dry run)

- Stage: **A (0% visible / 100% mirrored)**
- Window: **30 minutes**
- Semantic parity:
  - floor: `0.65`
  - observed total score trend: `0.71, 0.74, 0.76`
  - gate: **pass** (3 consecutive windows above floor)
- Policy/audit parity:
  - decision-count parity: **pass**
  - per-step mismatch classification: **2 missingInV2** (expected while bridge loop has partial policy emission)
  - gate: **hold** (requires richer v2 policy signal emission before Stage B)
- Rollback SLO deltas vs v1 baseline:
  - error-rate delta: `+0.2pp` (within `<= +1.5pp`)
  - p95 latency delta: `+4%` (within `<= +20%`)
  - `OUTPUT_READY` without `OUTPUT_SENT`: `0.0%` (within `<= 0.2%`)
- Auto-abort checks:
  - consecutive failed windows: **none**
  - critical incidents: **none**
- Outcome: **No rollback needed. Keep lane at Incubating and continue parity hardening.**

## Required evidence before Stage B

- At least one Stage A drill with **zero unresolved policy mismatch categories**.
- Demonstrated rollback rehearsal where an injected semantic-score breach triggers automatic rollback recommendation.
- Link to CI artifacts showing semantic gate and mismatch breakdown trend over the last three windows.

### DRILL-2026-02-27-B1 (Stage B internal canary window 1)

- Stage: **B (5% internal canary)**
- Window: **45 minutes**
- Semantic parity:
  - floor: `0.65`
  - observed total score trend: `0.77, 0.79, 0.81`
  - gate: **pass**
- Policy/audit parity:
  - decision-count parity: **pass**
  - mismatch breakdown: **0/0/0/0** (decision/reason/missing/extra)
  - gate: **pass**
- Rollback SLO deltas vs v1 baseline:
  - error-rate delta: `+0.3pp`
  - p95 latency delta: `+6%`
  - `OUTPUT_READY` without `OUTPUT_SENT`: `0.0%`
- Auto-abort checks:
  - consecutive failed windows: **none**
  - critical incidents: **none**
- Synth canary gate artifact: `docs/artifacts/canary/pr23/stage-b-window-1-gate.json`
- CI upload bundle: `docs/artifacts/canary/pr23/ci-upload-links.md`
- Outcome: **Promote hold-point accepted; continue Stage B.**

### DRILL-2026-02-27-B2 (Stage B internal canary window 2)

- Stage: **B (5% internal canary)**
- Window: **45 minutes**
- Semantic parity:
  - floor: `0.65`
  - observed total score trend: `0.78, 0.80, 0.82`
  - gate: **pass**
- Policy/audit parity:
  - decision-count parity: **pass**
  - mismatch breakdown: **0/0/0/0** (decision/reason/missing/extra)
  - gate: **pass**
- Rollback SLO deltas vs v1 baseline:
  - error-rate delta: `+0.4pp`
  - p95 latency delta: `+7%`
  - `OUTPUT_READY` without `OUTPUT_SENT`: `0.0%`
- Auto-abort checks:
  - consecutive failed windows: **none**
  - critical incidents: **none**
- Synth canary gate artifact: `docs/artifacts/canary/pr23/stage-b-window-2-gate.json`
- CI upload bundle: `docs/artifacts/canary/pr23/ci-upload-links.md`
- Outcome: **Stage B exit criteria met; eligible to start Stage C pilot cohort.**

### DRILL-2026-02-27-RB1 (rollback drill, injected gate breach)

- Drill type: **Rollback rehearsal (auto-abort validation)**
- Injection: forced semantic gate breach + output publication reliability dip
- Gate report decision: **rollback**
- Trigger details:
  - failed checks: `semantic_below_floor`, `output_publication_reliability_below_floor`
  - consecutive failed windows condition: **true**
- Auto-abort action:
  - v2 route disable asserted
  - traffic rerouted to v1 path within control window
- Evidence artifact: `docs/artifacts/canary/pr23/rollback-drill-gate.json`
- CI upload bundle: `docs/artifacts/canary/pr23/ci-upload-links.md`
- Outcome: **Rollback playbook verified; command path and gate automation behaved as expected.**

## Stage C pilot kickoff (PR24)

- Cohort: controlled tenants `tenant-alpha`, `tenant-beta`, `tenant-gamma`
- Default-route policy: **25% to v2** for controlled cohort only
- Auto-abort source: synth canary gate decision (`hold`/`rollback` => v1 forced)
- Routing evidence artifact: `docs/artifacts/canary/pr24/stage-c-routing-policy.json`

