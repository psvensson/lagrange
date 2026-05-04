# Rolling Restart Convergence Timeout Truth And Classification

## Why

The latest `rolling-restart` evidence moved beyond the previously named
restart-recovery priority-spread blocker.

Latest evidence:

1. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`
2. the scenario still fails with `Convergence timeout after 120000ms`
3. failover, convergence publication gates, and `restart_recovery` are closed
   in the generated owner-state summary
4. publication is `PUBLISHED`, pending ACK count is `0`, priority spread is
   satisfied, and priority recovery unresolved counts are `0`
5. the timeout evidence names over-target voters for `replica_operations-p1`
   and `sql_transactions-p1`, plus in-flight `REPLACE`/`REMOVE` operation
   history
6. before this package, the failure bundle classified the run as
   `startup_recovery_blocked` from retained readiness-probe evidence

This package exists to make the sprint truth match the latest artifact before
runtime work continues.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Supersedes:

1. [Rolling restart restart-recovery priority spread pending](./superseded-20260424-rolling-restart-restart-recovery-priority-spread-pending.md)

Hands runtime closure to:

1. [Critical replace operation lifecycle convergence owner](./todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md)
2. [Rolling restart operation transition pressure and over-target trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)
3. [Rolling restart in-flight operation drain and CDC pressure](./todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md)

## April 25 Execution Update

The operation-lifecycle rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json`
kept the canonical barrier as `Convergence timeout after 120000ms`, with
failover, convergence, and restart recovery gates closed. It moved runtime
evidence forward:

1. `sql_transactions-p1` reached the target voter count.
2. `replica_operations-p1` reached the target voter count but retained a
   failed `REPLACE` with `Timeout in STOPPING step after 81688ms`.
3. the over-target set moved to `control_plane_publications-p1`, `logs-p1`,
   `sql_transaction_participants-p1`, and `replica_operations-p1`.
4. the terminal logs name retryable owner-query and operation-transition
   pressure rather than restart recovery or priority spread.

The fresh artifact initially regenerated with the stale startup label, then
replayed through the fixed barrier precedence as `topology_unstable` /
`convergence_timeout` at the canonical playback path.

The STOPPING visibility-pressure rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json`
kept the same canonical barrier, but closed the over-target voter symptom:
all expected partitions reached voter count `3`, `Max over-target` was `0ms`,
and over-target durations were empty. The remaining runtime work is now the
in-flight operation drain and CDC pressure package.

## In Scope

1. Update the sprint so the current blocker is the latest post-restart
   convergence timeout, not the older `phase-adoption` restart-recovery gate.
2. Make harness failure bundles prefer the thrown `convergence` barrier over
   retained startup/readiness evidence once publication, priority spread, and
   restart recovery are closed.
3. Add focused harness proof for the latest barrier precedence.
4. Update the runtime lifecycle package with the latest over-target voter and
   in-flight operation evidence.
5. Regenerate or replay the latest artifact and record blocker movement.

## Out Of Scope

1. Increasing convergence or restart readiness timeout budgets.
2. Broad matrix continuation before `rolling-restart` has a named owner outcome.
3. Runtime fixes outside the operation lifecycle convergence owner package.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  harness barrier classification for the latest `rolling-restart` artifact.
- Canonical contract shape / vocabulary:
  when the thrown error is a convergence timeout and publication/restart
  recovery owner gates are closed, the canonical barrier is `convergence` with
  reason `convergence_timeout`.
- Allowed consumers:
  failure bundle, triage summary, run failure bundle, active sprint, and the
  runtime operation lifecycle package.
- Prohibited reinterpretations:
  retained readiness-probe timeout evidence must not dominate a later
  convergence barrier after owner gates close.
- Primary diagnostics / proof surfaces:
  `failure-bundle.json`, `triage-summary.md`, scenario error text,
  stability gates, priority recovery progress summary, voter-count diagnostics,
  and focused failure-bundle tests.

## Residual Closure Inventory

- [x] Latest artifact is recorded as the current sprint truth.
- [x] Harness classification reports `convergence_timeout` for the latest
      post-restart convergence artifact.
- [x] Focused failure-bundle regression covers the latest closed-gate
      convergence timeout shape.
- [x] Runtime lifecycle package names the over-target voter and in-flight
      operation owner loop as the next implementation target.
- [x] Latest artifact is replayed/regenerated after the harness fix.
- [x] Any remaining runtime blocker is either closed by the lifecycle package
      or split into a newly named package.

## Validation

1. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
2. `node --check test/distributed/harness/failure-bundle-segment-4.js`
3. `node --check test/distributed/harness/failure-bundle-segment-5.js`
4. Regenerate or replay
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`

Executed:

1. `node --check test/distributed/harness/failure-bundle-segment-4.js`
2. Result: passed.
3. `node --check test/distributed/harness/failure-bundle-segment-5.js`
4. Result: passed.
5. `node --check test/distributed/harness/__tests__/failure-bundle.test.js`
6. Result: passed.
7. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
8. Result: passed, `44/44`.
9. Replayed
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`
   through `writeFailureBundlesForReport`.
10. Result: the replayed `rolling-restart` bundle reports root cause
    `topology`, failure class `topology_unstable`, dominant reason
    `convergence_timeout`, and failure-barrier signals
    `failureBarrier=convergence` and
    `failureBarrierReason=convergence_timeout`.
11. Result: the regenerated triage summary opens with the same
    `convergence_timeout` classification and points operators at final leader
    ownership, in-flight replica operations, and over-target partition
    durations.
12. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json --fast-local --verbose`
13. Result: failed with the same post-active convergence barrier, but moved
    the runtime blocker to operation transition pressure and over-target trim.
14. Regenerated
    `test-output/reports/.playback/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun/rolling-restart/failure-bundle.json`
    and sibling triage summary.
15. Result: the canonical playback artifact now reports root cause
    `topology`, failure class `topology_unstable`, dominant reason
    `convergence_timeout`, and failure-barrier signals
    `failureBarrier=convergence` and
    `failureBarrierReason=convergence_timeout`.
16. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json --fast-local --verbose`
17. Result: failed with the same post-active convergence barrier, but moved
    the runtime blocker again: voter placement is target-converged and the
    remaining evidence is operation drain under CDC/control-plane pressure.

## Done When

1. The sprint current-blocker section points at the latest convergence timeout.
2. The harness artifact classifies the thrown barrier as convergence, not
   startup recovery.
3. The next runtime work is owned by the operation lifecycle convergence
   package.
