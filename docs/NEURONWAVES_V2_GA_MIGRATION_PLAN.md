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
