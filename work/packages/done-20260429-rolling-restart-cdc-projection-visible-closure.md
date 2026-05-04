# Rolling Restart CDC Projection Visible Closure

April 29 activation: the quiescence stable-window slice moved the
representative `rolling-restart --fast-local` path off the reasonless
quiescence-candidate timeout and back to post-active convergence:

1. `test-output/reports/runtime-stability-rolling-restart-20260429-codex-quiescence-stable-window.report.json`
2. result: failed, `0/1` passed after `380.1s`
3. terminal barrier: `Convergence timeout after 120000ms`
4. failure class: `topology_unstable`
5. dominant reason: `convergence_timeout`
6. failover, convergence, and restart-recovery stability gates are closed
7. publication epoch `11` is `PUBLISHED`
8. pending ACK count is `0`
9. blocked publication node count is `0`
10. priority recovery blocked and unresolved counts are `0`
11. post-rebalance closure state is `open`
12. the only hard post-rebalance blocker is
    `cdc_projection_visible_open`
13. the hard reason is `missing_partition_leaders`
14. operation drain is soft-closed with `ignored_stale_replica_operations`
15. membership trim is soft-closed with `ignored_stale_replica_operations`
16. publication visibility is soft-closed with
    `effective_published_membership_during_freeze`
17. no-over-target is represented as a soft closure with
    `current_overtarget_voters`

The active blocker is therefore no longer publication ACK, restart recovery,
priority recovery, or quiescence stable-window accounting. It is the CDC
projection visibility owner after the canonical gates have closed.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Control Plane Quiescence Stable Window After Publication Closure](./done-20260429-control-plane-quiescence-stable-window-after-publication-closure.md)
2. [Rolling Restart Operation Transition Pressure And Over-Target Trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

## In Scope

1. Reconstruct the CDC projection visibility dimension from the fresh report,
   failure bundle, and playback artifacts.
2. Identify which partition leaders are missing from the CDC projection view
   while the authoritative leader map and publication gates are closed.
3. Decide whether the owner defect is CDC replay lag, projection cache
   visibility, partition leader publication, or post-rebalance closure
   interpretation.
4. Preserve operation-drain and membership-trim soft closures while debugging
   CDC projection visibility.
5. Add focused coverage for the owner boundary that fixes or classifies
   `cdc_projection_visible_open` without reopening publication convergence.
6. Rerun `rolling-restart --fast-local` and record the next named owner
   boundary.

## Out Of Scope

1. Increasing convergence timeout budgets.
2. Reopening publication ACK or priority-recovery gates while they are closed.
3. Treating CDC projection visibility as closed without owner evidence.
4. Broad matrix execution before the representative 5-node path moves.
5. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  CDC projection visibility and post-rebalance closure resolver.
- Canonical contract:
  once publication, restart recovery, priority recovery, operation drain, and
  membership trim are closed or soft-closed, CDC projection visibility must
  either expose the missing partition-leader evidence or close from a canonical
  owner snapshot.
- Allowed consumers:
  `waitForConvergence`, post-rebalance closure diagnostics, failure bundles,
  and sprint triage.
- Prohibited reinterpretations:
  do not use closed publication ACKs or stale operation rows to infer CDC
  projection closure without owner evidence.

## Residual Closure Inventory

- [x] Reconstruct the missing CDC projection partition-leader evidence from
      the latest report and playback artifacts.
- [x] Identify whether authoritative leader rows, CDC projection rows, or
      post-rebalance closure normalization own the gap.
- [x] Add one canonical evidence field or transition that closes or names the
      CDC projection visibility blocker.
- [x] Preserve the current soft closures for operation drain, membership trim,
      publication visibility, and no-over-target evidence.
- [x] Add focused coverage for `cdc_projection_visible_open` /
      `missing_partition_leaders`.
- [x] Rerun `rolling-restart --fast-local` and record whether the blocker
      passes or migrates to a new named owner boundary.

## Execution Notes

Reconstruction of
`test-output/reports/runtime-stability-rolling-restart-20260429-codex-quiescence-stable-window.report.json`
identified the hard CDC projection blocker as two missing leader partitions:

1. `replica_operations-p1`
2. `sql_transaction_participants-p1`

Both missing partitions were covered by cache-visible, spread-satisfied
priority-recovery decision snapshots. The gap was therefore owned by
post-rebalance closure interpretation, not by publication ACK, priority
recovery, operation drain, or raw CDC replay lag.

Implemented closure ownership:

1. `post-rebalance-closure-contract.js` now collects cache-visible
   priority-recovery owner evidence and records
   `cacheVisibleSatisfiedPriorityRecoveryPartitionIds`,
   `coveredMissingLeaderPartitionIds`, and
   `uncoveredMissingLeaderPartitionIds`.
2. `cdc_projection_visible` soft-closes with
   `ignored_stale_replica_operations` only when all missing leader partitions
   are covered by that owner evidence while stale/cache-visible operation
   discounting is enabled.
3. `waitForConvergence` now uses the same CDC projection closure decision
   instead of requiring raw leader coverage only.

Replay of the prior failure evidence now yields:

1. post-rebalance closure state: `soft_closed`
2. blockers: `[]`
3. soft closures preserved for operation drain, membership trim, publication
   visibility, CDC projection visibility, and no-over-target
4. covered missing leader partitions:
   `replica_operations-p1`, `sql_transaction_participants-p1`

The representative rerun wrote:

`test-output/reports/runtime-stability-rolling-restart-20260429-codex-cdc-projection-visible.report.json`

Result: failed, `0/1` passed after `389.0s`, but the failure migrated out of
post-rebalance closure. The new terminal barrier is:

`Cluster load readiness did not stabilize within 300000ms`

New owner boundary:

1. root cause class: `startup`
2. dominant reason: `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`
3. readiness stable-window blocker: `READINESS_STABLE_WINDOW_PENDING`
4. snapshot coverage: `5/5`
5. publication convergence: `ready`
6. priority spread: `ready`
7. instability summary: `state:degraded:234`, readiness probe timeout fallback
   for seed, and `state:warming:13`

The next active package is:

`active-20260430-rolling-restart-load-readiness-stable-window-after-cdc-closure.md`

## Validation

1. Focused syntax checks for touched files.
2. Focused unit tests around the CDC projection visibility owner.
3. `npm run audit:guideline:literals`
4. `npm run audit:guideline:decision-boundaries`
5. `npm run audit:runtime-grammar`
6. `git diff --check`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/runtime-stability-rolling-restart-20260429-codex-cdc-projection-visible.report.json --verbose`

## Done When

1. The representative failure no longer stops on
   `cdc_projection_visible_open` without canonical owner evidence.
2. Publication, restart-recovery, priority-recovery, operation-drain, and
   membership-trim evidence remain canonical and are not reopened by the fix.
3. The next failure, if any, is represented by one active work package.
