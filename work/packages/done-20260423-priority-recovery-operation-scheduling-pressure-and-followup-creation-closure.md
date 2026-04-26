# Priority-Recovery Operation-Scheduling Pressure And Follow-Up Creation Closure

## Why

The 2026-04-23 `node-join-under-load` confirmation rerun for the runtime-grammar
amendment no longer fails on a grammar contradiction.

The dominant retained witness is now:

1. `sql_write_operations-p1`
2. current owner `rebalancer_leader`
3. boundary `operation_scheduling`
4. dominant reason
   `priority_recovery_operation_scheduling_persist_blocked_by_pressure`
5. `nextRequiredAction = create_recovery_operation`
6. `actuationState = persist_blocked_by_pressure`
7. workflow phase `terminal` after a prior `REPLACE` reached `REMOVED`

That means the next blocker is no longer about how the system describes the
state. It is about whether the rebalancer leader can create the required
follow-up recovery operation under sustained control-plane write pressure.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Coherence Closure Before Harness Sprint](../../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md)

Predecessor packages:

1. [Priority-recovery completion and remove-safety under load closure](./done-20260421-priority-recovery-completion-and-remove-safety-under-load-closure.md)
2. [Runtime-grammar pilot harness confirmation](./done-20260422-runtime-grammar-pilot-harness-confirmation.md)

## In Scope

1. Reuse the existing rebalancer-leader scheduling path and control-plane
   pressure contract to define one explicit owner answer for follow-up
   operation creation under write backlog.
2. Eliminate touched ambiguity where terminal prior-operation follow-up work
   can remain `create_recovery_operation` plus `retry` indefinitely without a
   scheduler-owned persistence decision.
3. Add failing owner-path tests first for pressure-blocked follow-up creation
   on priority partitions under retained backlog growth.
4. Preserve the shared `PriorityRecoveryDecisionSnapshot` contract by flowing
   the corrected owner result through the existing snapshot instead of adding a
   report-side or diagnostics-only interpretation.

## Out Of Scope

1. Broad runtime-grammar or harness-summary redesign that was already closed in
   the amendment sprint
2. Workflow-owner timeout/state-machine work for the separate
   `sql_transactions-p1` `workflow_progress` seam
3. A new scheduler or pressure-control subsystem beside the current rebalancer
   owners
4. Another `node-join-under-load` rerun before focused owner-path proof is
   green

## Hotspots

1. `src/rebalancer/rebalance-coordinator-segment-3.js`
2. `src/rebalancer/rebalance-coordinator-segment-5.js`
3. `src/rebalancer/unified-rebalancer-segment-5.js`
4. `src/control-plane/priority-recovery-snapshot.js`
5. `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
6. `test/rebalancer/coordinator-created-operation-progress.test.js`
7. `test/control-plane/priority-recovery-snapshot.test.js`

## Shared Boundary Contract

- Semantic owner:
  `rebalancer_leader` scheduling the next priority-recovery operation on the
  existing rebalancer owner path
- Canonical owner question:
  when spread remains unsatisfied after a terminal prior operation and
  control-plane writes are backlogged, does the owner create immediately,
  persist a bounded retry, or emit a pressure-owned blocked outcome
- Allowed consumers:
  shared priority-recovery snapshot composition,
  focused rebalancer/runtime tests,
  and the later harness confirmation pass
- Prohibited reinterpretations:
  consumer-local stall inference,
  silent leader-side deferral without one explicit owner outcome,
  or flattening pressure-owned scheduling failure back into a generic topology
  blocker
- Primary diagnostics / proof surfaces:
  focused rebalancer owner-path tests,
  shared priority-recovery snapshot tests,
  and the next representative scenario rerun after focused proof

## Closure Note

The retained `priority_recovery_operation_scheduling_persist_blocked_by_pressure`
witness proved to be stale at the shared snapshot boundary, not a second live
leader-side creation failure. Canonical `replicaOperations.rows` already held
the newer follow-up recovery operation while the raw cache-visible
`replicaOperationRows` still only exposed the terminal prior operation. Closure
therefore reuses the canonical summary rows inside
`PriorityRecoveryDecisionSnapshot` and proves the same contract through the
admin control-snapshot consumer path without another harness rerun.

## Detection / Analysis Tasks

- [x] Record the exact leader-side creation path and pressure gate used when a
      follow-up `REPLACE` must be created after a terminal prior operation.
- [x] Identify which write-pressure or persistence guard still prevents the
      follow-up operation from being created on `sql_write_operations-p1`.
- [x] Confirm whether the retained retry answer is bounded and owner-owned or
      whether the path still leaks generic retry meaning from a lower layer.

## Implementation Tasks

- [x] Add failing owner-path tests first for pressure-blocked follow-up
      creation on the touched priority-recovery path.
- [x] Normalize one explicit rebalancer-leader answer for follow-up operation
      creation under write backlog on the touched path.
- [x] Ensure the owner path emits the pressure-owned retry/block outcome
      directly instead of leaving creation failure implicit.
- [x] Reuse that owner result in the shared
      `PriorityRecoveryDecisionSnapshot` without widening the consumer
      contract.
- [x] Update touched docs if the leader-side scheduling contract changes
      durably.

## Validation

1. Focused rebalancer scheduling / ownership tests on the touched follow-up
   creation path
2. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
3. Any touched harness or reporting tests needed to preserve the shared
   owner-facing vocabulary
4. `npm run test:metrics`

## Done When

1. The rebalancer-leader scheduling path gives one explicit owner answer for a
   required follow-up recovery operation under control-plane write pressure.
2. The shared snapshot continues to describe that owner answer without another
   grammar contradiction or consumer-local patch.
3. The next `node-join-under-load` rerun, when executed, no longer fails first
   on `priority_recovery_operation_scheduling_persist_blocked_by_pressure`
   unless a genuine separate pressure defect remains.
