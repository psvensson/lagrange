# Priority Recovery Follow-Up Operation Creation

## Why

The representative `node-join-under-load` gate is now green twice, so the
sprint moved into secondary matrix re-entry. The first secondary scenario,
`rolling-restart`, still exposes real priority recovery liveness gaps.

The latest April 24, 2026 rerun no longer fails on stale publication summaries,
terminal operation wakeup, or superseded stale in-flight rows. It now fails
because `replica_operations-p1` reaches the explicit `needs_operation` state
after a timed-out replacement, but no durable follow-up operation is created
before the harness active gate expires.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Make priority recovery re-enter operation creation when a priority
   partition is in `needs_operation` after terminal failed replacement work.
2. Preserve the existing invariant that completed placement evidence closes a
   spread gap only when the replacement target is operational on an eligible
   node.
3. Keep failed terminal rows as actionable follow-up evidence, not completed
   recovery evidence.
4. Add focused tests for terminal operation wakeup and stale in-flight
   supersession.
5. Rerun `rolling-restart` after the follow-up operation creation path is
   implemented.

## Out Of Scope

1. Treating `needs_operation` as success.
2. Harness exemptions for priority spread.
3. Broad matrix continuation while `rolling-restart` still has an unnamed
   priority recovery blocker.

## Shared Boundary Contract

- Semantic owner:
  priority recovery operation creation after terminal failed replacement work.
- Canonical contract:
  a failed terminal operation may supersede older non-operational in-flight
  rows, but it must leave the partition on `needs_operation` until a new
  operation is durably created or spread is truly satisfied.
- Allowed consumers:
  priority recovery decision snapshots, unified rebalancer priority planning,
  membership publication wakeups, and harness failure bundles.
- Prohibited reinterpretations:
  using failed terminal operations as completed placement evidence, ignoring
  a real spread gap, or letting stale in-flight rows indefinitely block a newer
  terminal failure.

## Status Update

Implemented during the sprint:

1. Terminal `replica_operations` CDC rows now wake the priority recovery owner.
2. Completed `REPLACE` rows count as spread-satisfying only when the target is
   active and operational on an eligible node.
3. Failed terminal rows can supersede older non-operational in-flight rows for
   planning, returning the partition to the actionable `needs_operation` lane.
4. The unified rebalancer now synthesizes a bounded priority follow-up move
   when the canonical current-partition decision says `needs_operation` /
   `create_recovery_operation` and the normal planner emits no add-like move.

Latest secondary evidence:

1. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-terminal-operation-wakeup.report.json`
2. Result: failed with stale in-flight operation state after terminal failure.
3. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-superseded-stale-operation.report.json`
4. Result: failed later with `priority_recovery_progress_blocked`,
   semantic state `needs_operation`, unresolved partition
   `replica_operations-p1`.
5. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-priority-followup-created.report.json`
6. Result: moved beyond `needs_operation`; priority recovery decisions no
   longer had unresolved semantic states, and the next failure was a final
   leader-identity comparison after load-mode soft active success.
7. `test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-final-active.report.json`
8. Result: after correcting the scenario to require strict final active
   convergence once load has stopped, the blocker moved earlier to restarted
   node recovery readiness under admin/transport pressure.

## Residual Closure Inventory

- [x] Terminal operation visibility wakes the priority recovery owner.
- [x] Completed `REPLACE` placement evidence is constrained to operational
      eligible targets.
- [x] Newer failed terminal rows supersede older non-operational in-flight
      rows for planning.
- [x] Rebalancer creates a durable follow-up operation for
      `replica_operations-p1` when the current partition state is
      `needs_operation`.
- [x] `rolling-restart` passes or moves to a newly named blocker after the
      follow-up operation creation cut.

## Validation

Executed:

1. `npm test -- test/rebalancer/unified-rebalancer.test.js test/control-plane/priority-recovery-snapshot.test.js`
2. Result: `289/289` assertions passing.
3. `node --test test/distributed/harness/__tests__/rolling-restart-scenario.test.js`
4. Result: passed.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-superseded-stale-operation.report.json --fast-local --verbose`
6. Result: failed with the residual `replica_operations-p1` follow-up
   creation blocker.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-priority-followup-created.report.json --fast-local --verbose`
8. Result: moved beyond `needs_operation` and exposed final leader comparison
   after load-mode soft active success.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/runtime-stability-rolling-restart-20260424-codex-strict-final-active.report.json --fast-local --verbose`
10. Result: moved to restarted node recovery readiness under transport/admin
    pressure; follow-up operation creation is no longer the active blocker.

## Done When

1. `replica_operations-p1` does not remain in `needs_operation` without a
   durable follow-up operation after a failed replacement. Status: complete.
2. `rolling-restart` passes, or the next failure is explicitly split and no
   longer blocked on follow-up operation creation. Status: complete; the
   remaining blocker is now
   [Rolling restart final leader-map consistency and CDC pressure](./done-20260424-rolling-restart-final-leader-map-consistency-and-cdc-pressure.md).
