# Rolling Restart Restart-Recovery Priority Spread Pending

Superseded by:

1. [Rolling restart convergence timeout truth and classification](./done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md)

Reason:

1. later `rolling-restart` artifacts moved beyond this blocker
2. `restart_recovery` is closed in the latest owner-state summary
3. priority spread is satisfied and priority recovery unresolved counts are `0`
4. the current failure is now a post-restart convergence timeout with
   over-target voters and in-flight operation history

## Why

The latest `rolling-restart` reruns moved the blocker back inside the
per-node restart barrier. The restarted node is reachable by bootstrap health,
but it does not become admin/control-plane recovery ready before the
`120000ms` timeout.

Latest evidence:

1. runtime report:
   `test-output/reports/runtime-stability-rolling-restart-20260424-codex-phase-adoption.report.json`
2. regenerated triage:
   `test-output/reports/.playback/runtime-stability-rolling-restart-20260424-codex-phase-adoption/rolling-restart/triage-summary.md`
3. terminal error:
   `Restarted node did not become recovery-ready within 120000ms`
4. reachability:
   `reachable=true` by `bootstrap_health`
5. readiness:
   `adminReady=false`, `controlPlaneRecoveryReady=false`,
   `readinessPhase=DEGRADED`
6. readiness reasons:
   `LEADER_METADATA_INCOMPLETE` and
   `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
7. owner state:
   publication is `PUBLISHED`, pending ACK count is `0`, failover is closed,
   and restart recovery remains open on `priority_spread_pending`
8. priority recovery:
   `sql_write_operations-p1` is `needs_operation`, while
   `replica_operations-p1`, `sql_transaction_participants-p1`, and
   `sql_transactions-p1` are `recovering_in_flight`

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Preserve strict `restartNode(... requireAdminReady=true)` semantics.
2. Classify the thrown per-node restart readiness timeout as the
   `restart_recovery` barrier.
3. Carry priority-spread and priority-operation witnesses into the failure
   bundle without reclassifying the failure as stale startup recovery.
4. Generalize follow-up operation creation beyond the previously fixed
   `replica_operations-p1` case.
5. Add enough bootstrap/rejoin diagnostics to explain a node that reaches
   bootstrap health but does not progress to admin readiness.

## Out Of Scope

1. Increasing restart readiness or convergence timeouts.
2. Disabling admin readiness for rolling restart.
3. Broad 7-node matrix continuation while this blocker is active.
4. Harness-only green paths that hide unresolved priority recovery ownership.

## Execution Splits

1. Harness split:
   [Harness canonical owner-state classification](./done-20260424-harness-canonical-owner-state-classification.md)
2. Runtime lifecycle split:
   [Critical replace operation lifecycle convergence owner](./todo-20260424-critical-replace-operation-lifecycle-convergence-owner.md)
3. Diagnostic follow-up:
   [Bootstrap rejoin recovery silence diagnostics](./superseded-20260424-bootstrap-rejoin-recovery-silence-diagnostics.md)

## Residual Closure Inventory

- [x] Record the latest `phase-adoption` failure as the current blocker.
- [ ] Patch failure-bundle barrier precedence for restart recovery.
- [ ] Add focused harness regression for restart recovery with
      priority-spread pending.
- [ ] Patch the priority operation lifecycle owner so `needs_operation` is not
      stranded for `sql_write_operations-p1`.
- [ ] Add or wire bootstrap/rejoin progress diagnostics for the silent
      `contacting_seed` interval.
- [ ] Rerun `rolling-restart` and record whether the blocker closes or
      migrates.

## Validation

1. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
2. `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
3. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
4. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

## Done When

1. The latest restart readiness timeout is classified as an open
   `restart_recovery` gate with priority-spread evidence.
2. Priority recovery operation lifecycle progress is not stranded at
   `needs_operation` or indefinitely `recovering_in_flight` for critical
   system partitions.
3. The next `rolling-restart` failure either passes the per-node restart
   readiness barrier or migrates to a newly named owner boundary.
