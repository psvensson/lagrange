# Rollout and Rollback Runbook

This runbook covers rollout of control-plane readiness hardening for:

1. lifecycle probe contract,
2. work-class scheduling isolation,
3. durable join-session controls.

## 1. Rollout Controls

The runtime resolves these controls from environment values:

1. `CONTROL_PLANE_LIFECYCLE_PROBES_REQUIRED`
2. `CONTROL_PLANE_WORK_CLASS_SCHEDULER_REQUIRED`
3. `CONTROL_PLANE_DURABLE_JOIN_SESSIONS_REQUIRED`

Accepted values: `true`, `false`, `1`, `0`.

Default for all controls: `true`.

Notes:

1. These controls are fail-closed; if a required control resolves to `false`,
   startup throws and the process exits.
2. There is no legacy fallback path in-process.

## 2. Rollout Stages

| Stage | Scope | Entry Criteria | Exit Criteria |
|---|---|---|---|
| S0 Baseline | Existing production behavior | Cluster healthy and baseline harness report captured | Baseline metrics recorded |
| S1 Canary | One seed + one joiner environment | S0 complete | Probe contract, join path, and harness diagnostics stable |
| S2 Expansion | Multiple clusters / zones | S1 stable for 24h | No readiness flapping and no startup timeout regressions |
| S3 Broad | All clusters | S2 complete | Post-rollout soak complete and no rollback triggers |

## 3. Stage Verification Commands

Run in each stage before promotion:

1. `npm test -- test/bootstrap/bootstrap-api.test.js`
2. `npm test -- test/bootstrap/node-joining-service.test.js`
3. `npm test -- test/integration/node-join-convergence-slo.integration.test.js`
4. `npm test -- test/distributed/harness/__tests__/cluster.test.js`
5. `node test/distributed/run.js --config test/distributed/config/local-benchmark-3node-timeout180.json --scenario postgres-baseline-comparison --output test-output/reports/postgres-baseline-comparison-3node-timeout180.report.json --verbose`

## 4. Promotion Gates

Promote only when all are true:

1. No repeated `Seed node bootstrap API did not become join-ready` timeouts.
2. Harness timeout diagnostics (if any) show bounded `phaseCounts` and
   reason histograms without persistent hard blockers.
3. Join retries converge automatically for transient `503` / timeout paths.
4. No increase in terminal join failures (`4xx` conflict/validation classes).
5. No sustained class-A starvation under class-C logging pressure.

## 5. Rollback Triggers

Rollback immediately when one of these is observed:

1. Startup gate timeout rate increases above baseline for canary runs.
2. Join completion latency regresses materially and stays elevated.
3. Probe endpoints flap between ready/non-ready during steady-state operation.
4. Control-plane operations stall while class-C backlog is high.
5. Join failures switch from retryable to terminal unexpectedly.

## 6. Rollback Actions

1. Stop rollout promotion at current stage.
2. Revert deployment to previous release image.
3. Preserve captured harness artifacts and failure logs.
4. Re-run stage verification commands on reverted build to confirm recovery.
5. Diff reverted vs candidate reports, focusing on:
   - startup gate elapsed time,
   - `phaseCounts`,
   - `reasonCounts`,
   - join retry diagnostics.

## 7. Post-Rollback Triage

1. Identify top blocking reasons from timeout histograms.
2. Confirm whether blockers are hard dependencies or soft/degraded reasons.
3. Verify scheduler queue depth and shed counters by class.
4. Reproduce with targeted integration fixtures before retrying rollout.
