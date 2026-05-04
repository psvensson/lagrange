# Critical Replace Operation Lifecycle Convergence Owner

Migration note: This remains the queued owner-contract cleanup
for operation lifecycle convergence, but it is not the current execution
package while `rolling-restart` is blocked on the active operation transition
and over-target trim boundary.

## Latest Migration Update

The latest regenerated `rolling-restart` restart-recovery failure no longer
reports an unresolved `needs_operation` partition. It keeps the operation
lifecycle cleanup queued from earlier evidence while placing the current
priority partitions under `spread_satisfied_in_flight`.

Later `rolling-restart` evidence moved beyond that restart-recovery blocker.
`test-output/reports/runtime-stability-rolling-restart-20260424-codex-system-yields-priority-spread.report.json`
has `restart_recovery` closed, priority spread satisfied, and no unresolved
priority recovery semantic states, but still times out in post-restart
convergence with over-target voters for `replica_operations-p1` and
`sql_transactions-p1` plus in-flight `REPLACE`/`REMOVE` history.

This package remains queued as the owner-contract cleanup handed off by
[Rolling restart convergence timeout truth and classification](./done-20260425-rolling-restart-convergence-timeout-truth-and-classification.md).

April 25 execution moved the blocker again. The operation-lifecycle rerun
`test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json`
still fails at the post-active convergence barrier, but `sql_transactions-p1`
now reaches the target voter count, and `replica_operations-p1` reaches target
while carrying a failed `REPLACE` `STOPPING` timeout. The remaining over-target
set is now `control_plane_publications-p1`, `logs-p1`,
`sql_transaction_participants-p1`, and `replica_operations-p1`, with repeated
owner-query and transition-pressure evidence. The current execution split is
[Rolling restart operation transition pressure and over-target trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).

The next April 25 rerun after the STOPPING visibility-pressure fix closed the
over-target voter symptom in the representative artifact: all voter counts are
target, `Max over-target` is `0ms`, and over-target durations are empty. The
remaining blocker is current in-flight operation drain under CDC/control-plane
pressure, now tracked by
[Rolling restart in-flight operation drain and CDC pressure](./todo-20260425-rolling-restart-inflight-operation-drain-and-cdc-pressure.md).
The first continuation in that split fences duplicate add-like creates when
cache-visible source removal exists but authoritative entity visibility is
deferred.

The seed-contact startup-authority continuation moved `rolling-restart` past
restart readiness and back to post-active convergence. The current execution
split is again
[Rolling restart operation transition pressure and over-target trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md),
now with over-target evidence on `control_plane_publications-p1` and
`service_timers-p1`.

## Why

The latest `rolling-restart` strict restart report failed after the active gate
closed:

1. `control_plane_publications-p1` and
   `sql_transaction_participants-p1` remained over target.
2. active `REPLACE` operations were still in flight.
3. logs repeatedly showed `replace_remove_safety_blocked`.
4. learner promotion was deferred because the voter count was already above
   the allowed bound.

Those are one operation lifecycle loop, not separate local bugs.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)
2. [Critical topology convergence grammar contract](./done-20260424-critical-topology-convergence-grammar-contract.md)

## In Scope

1. Define one owner-state snapshot for critical `REPLACE` lifecycle closure.
2. Keep `spread_satisfied` separate from `operation_lifecycle_closed`.
3. Collapse safe source removal, replacement leader handoff, failed async
   removal, learner promotion, and over-target voter evidence into one
   operation workflow outcome.
4. Emit one next action: retry removal, request replacement election, wait for
   handoff, tolerate bounded overflow, or mark terminal.
5. Add focused owner-path proof for failed removal plus over-target voters.

## Out Of Scope

1. Harness-only classification changes.
2. New planner heuristics that bypass the workflow owner.
3. Increasing convergence timeout budgets.

## Shared Boundary Contract

- Semantic owner:
  operation workflow owner for `replica_operations` lifecycle closure.
- Canonical contract:
  a critical replacement is not closed until spread, visibility, handoff, safe
  removal, and voter-count convergence are all closed or explicitly terminal.
- Allowed consumers:
  priority recovery snapshot, partition learner-promotion admission,
  rebalancer follow-up planning, diagnostics, and harness reporting.
- Prohibited reinterpretations:
  treating priority spread satisfaction, source follower evidence, or a
  removed historical operation row as current operation convergence.

## Residual Closure Inventory

- [ ] Owner snapshot names `over_target_voters`.
- [ ] Owner snapshot names `remove_safety_blocked`.
- [ ] Owner snapshot names `promotion_blocked`.
- [ ] Priority recovery observation distinguishes spread from lifecycle
      closure.
- [ ] Follow-up operation creation covers `sql_write_operations-p1` and any
      critical priority partition that reaches `needs_operation`.
- [ ] In-flight lifecycle progress exposes the current owner, boundary,
      wait mode, and next required action for `recovering_in_flight`
      partitions.
- [ ] Partition promotion consumes the owner outcome instead of local voter
      recovery exceptions.
- [ ] Focused regression covers failed async removal with active replacement.
- [x] `rolling-restart` rerun records blocker movement.

## Validation

1. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
2. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
3. `npm test -- test/partition/partition-service.test-part-4.js`
4. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`

Executed on April 25, 2026:

1. `npm test -- test/rebalancer/quorum-conditioned-remove-safety.test.js`
2. Result: passed, `207/207`.
3. `npm test -- test/rebalancer/replace-replica-workflow.test.js`
4. Result: passed, `177/177`.
5. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`
6. Result: passed, `187/187`.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-operation-lifecycle-rerun.report.json --fast-local --verbose`
8. Result: failed with `Convergence timeout after 120000ms`, but moved the
   blocker from the previous `sql_transactions-p1` /
   `replica_operations-p1` over-target pair to operation transition pressure
   and the over-target set named above.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260425-codex-stopping-visibility-defer.report.json --fast-local --verbose`
10. Result: failed with `Convergence timeout after 120000ms`, but closed the
    over-target voter symptom; all expected partitions are at voter count `3`.
11. `npm test -- test/rebalancer/coordinator-dedup-gap.test.js`
12. Result: passed, `43/43`; duplicate add-like create admission now honors
    cache-visible source-removal conflicts under deferred authoritative entity
    visibility.

## Done When

1. The runtime emits one canonical convergence outcome for the over-target
   replacement lifecycle loop.
2. The scenario either passes post-active convergence or migrates to a newly
   named owner boundary.
