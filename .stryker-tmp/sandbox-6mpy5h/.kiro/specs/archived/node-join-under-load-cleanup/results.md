# Node Join Under Load Cleanup Results

## Spec Status

- Status: `PARTIAL` (`no-ship` gate result)
- Last updated: `2026-03-23`

## A32 Validation Matrix

Executed with:

`node test/distributed/validate-node-join-under-load.js --config test/distributed/config/local.json --runs 3 --seed-start 8101 --seed-step 37 --output test-output/reports/node-join-under-load-validation-a32-20260323T064754Z.json`

Artifacts:

1. Aggregate validation report:
   `test-output/reports/node-join-under-load-validation-a32-20260323T064754Z.json`
2. Per-run reports:
   - `test-output/reports/node-join-under-load-run-1-seed-8101.report.json`
   - `test-output/reports/node-join-under-load-run-2-seed-8138.report.json`
   - `test-output/reports/node-join-under-load-run-3-seed-8175.report.json`

Observed outcomes:

1. Runs: `3`
2. Passed: `0`
3. Failed: `3`
4. Failure rate: `1.0`
5. Failure mode distribution:
   - `load:nodeAdmissionBlocked` -> `3/3` (single-mode, not multi-modal)

## Outcome Distributions

From `summary.distributions` in the validation artifact:

1. Failed operations:
   - p95: `0`
2. Attempt errors:
   - p95: `45`
3. Queue-delay p95 (ms):
   - p95: `19106`
4. Undispatched ratio:
   - p95: `0.35133333333333333`
5. Timeout waits:
   - p95: `0`

## Ship/No-Ship Gate

Gate thresholds are codified in:

`test/distributed/harness/validation-matrix.js` (`DEFAULT_SHIP_GATE`).

Current decision: `no-ship`.

Failed criteria:

1. `failureRate <= 0` (observed `1`)
2. `attemptErrors.p95 <= 0` (observed `45`)
3. `queueDelayP95Ms.p95 <= 250` (observed `19106`)
4. `undispatchedRatio.p95 <= 0.05` (observed `0.35133333333333333`)

Passing criteria:

1. `totalRuns >= 3` (observed `3`)
2. `failedOperations.p95 <= 0` (observed `0`)
3. `timeoutWaits.p95 <= 0` (observed `0`)

## Residual Risks

1. Correctness improved (no hard load failures, no timeout waits), but load
   backlog remains structurally high under join pressure.
2. Admission-pressure signals are lower than pre-A31, but dispatch queue
   pressure still dominates scenario failure.
3. Adaptive guardrail currently engages and remains clamped in these runs;
   recovery did not occur before scenario completion.

## Next Branch-Selection Rules

1. If failed operations or timeout waits rise above zero again, prioritize
   correctness-preserving pressure isolation over throughput tuning.
2. If correctness stays clean but backlog metrics remain above gate, prioritize
   dispatch-queue pressure controls:
   - adaptive guardrail tuning and recovery policy
   - bounded queue rejection strategy
   - scenario-level load-shaping during join windows
3. After each branch, rerun the 3-seed validation matrix and keep spec status
   `PARTIAL` until all gate criteria pass.
