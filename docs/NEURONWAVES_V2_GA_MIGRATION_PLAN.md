# NeuronWaves v2 GA Migration Plan (PR11/PR12)

## Objective

Promote NeuronWaves v2 micro-loop runtime from Incubating toward GA using measurable parity, failure-path hardening, and staged rollout.

## Current state

- v1 runtime remains the default GA path.
- v2 runtime provides signal-driven micro-loops (input/output/executive/critic/monitor) and scheduler-driven orchestration.
- v2 requires migration evidence before lane promotion.

## PR11 deliverable: shadow comparison harness

A shadow runner executes v1 and v2 in parallel for the same input and captures:

- v1 output
- v2 output
- exact/normalized parity booleans
- artifact directory pointers for both paths

This enables repeatable side-by-side comparisons without changing default production routing.

## PR12 deliverable: failure-path propagation coverage

Added a runtime failure-path test that validates this signal chain:

1. Failure signal injected (`STEP_FAILED`)
2. Monitor loop emits `CONFIDENCE_DROP` and `MODEL_ERROR_DETECTED`
3. Executive loop emits `EXEC_REQUEST_REPLAN`

This confirms that micro-loops coordinate correctly under error conditions.

## Promotion gates before v2 lane change

1. Shadow parity pass rate target met for representative workloads.
2. Failure-path suites green in CI (including replan/escalation paths).
3. Operational artifact parity with v1 (signals, run manifests, policy metadata).
4. Rollback path documented and tested.
5. Release lanes updated only after objective criteria above are met.


## PR14 deliverable: semantic + policy parity scoring

Shadow comparison now reports weighted semantic parity and policy/audit parity data:

- Plan-step alignment
- Policy decision alignment
- Evaluation result alignment
- Output quality heuristic
- v1/v2 policy decision count parity


## PR16 deliverable: real v2 E2E runtime path

Added a runtime integration test using actual v2 loops (input/output/executive/critic/monitor) that validates:

- output publication (`OUTPUT_READY` -> `OUTPUT_SENT`),
- executive replan signal on model error (`EXEC_REQUEST_REPLAN`).


## PR17 deliverable: cutover and rollback gates

Defined production cutover controls in `docs/NEURONWAVES_V2_CUTOVER_ROLLBACK_GATES_PR17.md`:

- staged canary percentages,
- rollback SLO thresholds,
- auto-abort criteria,
- lane-promotion checklist for Incubating -> Experimental -> GA.


## PR18 deliverable: semantic threshold operationalization

Shadow comparison now includes CI-ready promotion gate evaluation:

- configurable semantic floor,
- consecutive-pass trend windows,
- explicit recommendation (`promote`/`hold`/`rollback`).

This closes the operational policy gap between raw score computation and lane-move decisions.

## PR19 deliverable: richer policy/audit parity

Policy parity now reports mismatch classes beyond decision counts:

- decision type mismatches,
- reason mismatches (similarity-scored),
- missing-in-v2 decisions,
- extra-in-v2 decisions.

## PR20 deliverable: canary drill evidence artifact

Added a dedicated evidence ledger (`docs/NEURONWAVES_V2_CANARY_DRILL_EVIDENCE.md`) for staged cutover and rollback rehearsal results.
