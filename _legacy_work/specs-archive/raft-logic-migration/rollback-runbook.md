# Raft Logic Migration Rollback Runbook

Rollback is an operational redeploy/restart to the prior provider selection.
No runtime fallback is used inside a running process.

## Rollback Drill Command

`npm run migration:raft:rollback-drill`

Artifacts are written under:
`.kiro/specs/raft-logic-migration/reports/rollback/`

## Rollback Procedure

1. Set rollout cohort target to previous provider (`liferaft`).
2. Redeploy or restart affected nodes with `RAFT_PROVIDER=liferaft`.
3. Verify cluster reachability, leader election health, and convergence.
4. Validate write/read correctness on post-rollback traffic.
5. Record incident summary and rollback timing in stage report.

## Operator Checklist

1. Confirm new deploy/restart completed on all targeted nodes.
2. Confirm no split provider state inside the same process.
3. Confirm readiness checks return healthy for all nodes.
4. Confirm partition voter counts return to target.
5. Confirm benchmark gate for rollback baseline passes.

## Required Telemetry Signals

1. `benchmarkRegressionGate.status`
2. Scenario pass/fail status and exit code
3. `convergenceTiming.settledAfterMs`
4. `convergenceTiming.maxOverTargetMs`
5. Per-profile `recoveryTimingMs` from rollback drill summary

## Failure Handling

1. If rollback drill fails, block stage promotion.
2. Open incident with report paths and failing profile details.
3. Keep default provider unchanged until drill passes.
