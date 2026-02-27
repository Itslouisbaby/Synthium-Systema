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
