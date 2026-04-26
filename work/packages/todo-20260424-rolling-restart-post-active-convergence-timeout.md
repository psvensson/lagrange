# Rolling Restart Post-Active Convergence Timeout

Supersession note: Superseded as the active blocker by the latest
restart-recovery failure on April 24, 2026.

## Supersession Note

This package remains valid if `rolling-restart` returns to post-active
convergence after the restart-recovery blocker closes. The active blocker is
now
[Rolling restart convergence timeout truth and classification](./done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md).

## Latest Migration Update

The latest strict restart rerun moved beyond the prior inactive-node ACTIVE
gate blocker:

1. runtime report:
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-restart-admin-ready.report.json`
2. failure point:
   `waitForConvergence` in `waitForPostRestartRecoveryBarrier`
3. terminal error:
   `Convergence timeout after 120000ms`
4. active-gate state:
   `ready`
5. publication:
   `PUBLISHED`, pending ACK count `0`
6. priority recovery:
   unresolved and blocked counts `0`
7. convergence evidence:
   over-target voter durations on `control_plane_publications-p1` and
   `sql_transaction_participants-p1`, plus active `REPLACE` operation history
8. classification drift:
   the regenerated bundle still reports `startup_recovery_blocked` because a
   retained readiness delay outranks the actual thrown convergence barrier.

## Why

The final-consistency continuation rerun first moved `rolling-restart` to a
new owner boundary:

1. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-final-consistency-rerun.report.json`
2. failure point: `cluster.waitForAllActive`
3. terminal active gate: `state=timed_out`
4. active nodes: `4/5`
5. snapshot coverage: `5/5`
6. publication: `PUBLISHED`
7. recovery protocol: `steady_published`
8. priority spread: satisfied
9. priority recovery blocked partition count: `0`
10. terminal blocker: `inactive_nodes=1`

The generated bundle initially reused stale playback priority-recovery
evidence. The harness classifier now prefers terminal report-level active-gate
diagnostics for that run. The latest run moved again: strict ACTIVE is closed,
and the current blocker is post-active topology convergence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Failure simulations`
2. `Topology workflow stabilization`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Preserve the stricter post-restart ACTIVE gate.
2. Classify the latest failure as the actual post-active convergence barrier,
   not as retained startup readiness evidence.
3. Identify the runtime owner loop behind over-target voters, active
   replacement operations, remove-safety blocking, and learner-promotion
   deferral.
4. Keep failure bundles anchored to terminal barrier evidence when playback
   reconstruction has older publication, priority-recovery, or readiness state.

## Out Of Scope

1. Reopening final leader-map consistency while the run fails before final
   consistency.
2. Treating `PUBLISHED` publication or satisfied priority recovery as enough to
   pass strict ACTIVE.
3. Increasing `waitForConvergence` timeouts before the convergence owner path
   is identified.
4. Broad matrix continuation while this blocker is active.

## Evidence

1. Runtime report:
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-final-consistency-rerun.report.json`
2. Regenerated failure bundle:
   `test-output/reports/.playback/runtime-stability-rolling-restart-20260424-codex-final-consistency-rerun/rolling-restart/failure-bundle.json`
3. Regenerated triage summary:
   `test-output/reports/.playback/runtime-stability-rolling-restart-20260424-codex-final-consistency-rerun/rolling-restart/triage-summary.json`
4. Latest runtime report:
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-restart-admin-ready.report.json`
5. Latest failure bundle:
   `test-output/reports/.playback/runtime-stability-rolling-restart-20260424-codex-strict-restart-admin-ready/rolling-restart/failure-bundle.json`
6. Latest triage summary:
   `test-output/reports/.playback/runtime-stability-rolling-restart-20260424-codex-strict-restart-admin-ready/rolling-restart/triage-summary.json`

Terminal bundle state after classifier repair:

1. `failureClass=topology_unstable`
2. `dominantReason=inactive_nodes=1`
3. `publicationStatus=PUBLISHED`
4. `recoveryProtocolState=steady_published`
5. `prioritySpreadPending=false`
6. `priorityRecoveryProgressClassCount=0`
7. `priorityRecoveryBlockedPartitionCount=0`
8. `readinessFailure.classCode=no_progress_terminal`

## Residual Closure Inventory

- [x] Reproduce the active-gate timeout with terminal diagnostics.
- [x] Repair failure-bundle classification so stale playback priority recovery
      cannot override terminal report-level active-gate evidence.
- [x] Record that the blocker migrated beyond inactive-node ACTIVE to
      post-active convergence timeout.
- [ ] Patch harness barrier precedence so the latest bundle reports
      `convergence` before retained readiness-delay evidence.
- [ ] Identify the runtime convergence owner loop behind over-target voters
      and active replacement operations.
- [ ] Patch the owner path without weakening strict ACTIVE or increasing the
      convergence timeout.
- [ ] Rerun `rolling-restart` and record whether it reaches quiescence/final
      consistency again or exposes a new blocker.

## Validation

Executed:

1. `node --check test/distributed/harness/failure-bundle-segment-3.js`
2. Result: passed.
3. `node --check test/distributed/harness/failure-bundle-segment-4.js`
4. Result: passed.
5. `node --check test/distributed/harness/failure-bundle-segment-5.js`
6. Result: passed.
7. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
8. Result: passed, `41/41`.
9. Regenerated the latest rolling-restart failure bundle and triage summary from
   the patched classifier.
10. Result: bundle and triage now report `topology_unstable` /
    `inactive_nodes=1` with publication and priority recovery closed.

## Done When

1. Harness artifacts classify the latest failure as a post-active convergence
   timeout.
2. The runtime convergence owner path is identified from operation lifecycle,
   voter over-target, remove-safety, learner-promotion, and pressure evidence.
3. `rolling-restart` either passes post-active convergence or moves to the next
   named owner boundary with publication and priority evidence still canonical.
