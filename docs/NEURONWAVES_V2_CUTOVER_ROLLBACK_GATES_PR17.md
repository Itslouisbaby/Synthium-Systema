# NeuronWaves v2 Cutover & Rollback Gates (PR17)

This document defines operational cutover and rollback controls for promoting v2 from Incubating to higher lanes.

## 1) Canary rollout percentages

Use staged traffic percentages with explicit hold points and sign-off:

1. **Stage A (Shadow-only):** 0% user-visible traffic, 100% mirrored comparison.
2. **Stage B (Internal canary):** 5% of eligible internal sessions.
3. **Stage C (Pilot canary):** 25% of eligible pilot-tenant sessions.
4. **Stage D (Broad canary):** 50% of eligible sessions.
5. **Stage E (Primary):** 100% of eligible sessions after all exit criteria pass.

Promotion to the next stage requires all SLO gates below to pass for a full observation window.

## 2) Rollback SLO thresholds (hard gates)

Rollback is mandatory when any threshold is breached in the active canary window:

- **Error-rate delta gate:** v2 failure rate exceeds v1 baseline by **> 1.5 percentage points**.
- **Latency gate (p95):** v2 p95 end-to-end latency exceeds v1 by **> 20%**.
- **Policy parity gate:** any increase in policy misclassification versus v1 (block/allow/escalate mismatch) above **0.5%**.
- **Output publication gate:** `OUTPUT_READY` without `OUTPUT_SENT` exceeds **0.2%** of completed sessions.
- **Critical incident gate:** any Sev1 policy/safety violation attributable to v2 triggers immediate rollback.

## 3) Auto-abort conditions

Auto-abort must automatically stop canary progression and route traffic back to v1 if any occur:

1. Two consecutive canary windows fail the same SLO gate.
2. Shadow parity score total drops below **0.65** for two consecutive windows.
3. Policy/audit parity exact-count mismatch trend worsens for three consecutive windows.
4. Replan-related failure loops (`MODEL_ERROR_DETECTED` -> `EXEC_REQUEST_REPLAN`) spike by **> 2x** baseline.
5. On-call escalation manually flags a safety concern requiring v1-only mode.

## 4) Lane promotion checklist

### Incubating -> Experimental

- [ ] PR14 semantic parity scoring active in CI.
- [ ] PR15 policy/audit parity checks active in CI.
- [ ] PR16 real v2 E2E runtime path green in CI.
- [ ] Canary Stage B and Stage C complete without rollback events.
- [ ] Runbook and rollback command path validated in a drill.

### Experimental -> GA

- [ ] Canary Stage D and Stage E complete with all SLO gates green.
- [ ] No unresolved high-severity defects in scoped v2 runtime path.
- [ ] Operational dashboard covers parity, latency, error, and policy mismatch trends.
- [ ] Release lanes documentation updated with objective evidence links.
- [ ] Formal sign-off from runtime, policy, and operations owners.

## 5) Execution ownership

- **Runtime owner:** v2 scheduler/loop health, latency/error SLOs.
- **Policy owner:** policy decision parity and safety controls.
- **Ops owner:** canary progression, rollback drills, and incident response.

Use this file as the authoritative cutover gate reference for PR17 onward.

## 6) Evidence links (PR23 / PR24)

- Stage B canary and rollback drill log: `docs/NEURONWAVES_V2_CANARY_DRILL_EVIDENCE.md`
- Stage B + rollback machine artifacts: `docs/artifacts/canary/pr23/`
- Stage C controlled tenant routing policy artifact: `docs/artifacts/canary/pr24/stage-c-routing-policy.json`

