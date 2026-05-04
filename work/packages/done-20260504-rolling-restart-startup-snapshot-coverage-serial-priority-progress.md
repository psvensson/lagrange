# Rolling Restart Startup Snapshot Coverage And Serial Priority Progress

Opened on May 4, 2026 after
[Rolling Restart Readiness Gate Priority Operation Creation Reentry](./done-20260504-rolling-restart-readiness-gate-priority-operation-creation-reentry.md)
closed by migration.

Closed May 4, 2026 by migration into
[Rolling Restart Operation Transition Pressure And Over-Target Trim](./todo-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-load-readiness-priority-operation-creation-reentry-20260504-codex.report.json`
2. Result: failed, `0/1` passed after `129.9s`.
3. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
4. Node diagnostics reported all five nodes as active.
5. Selected snapshot coverage was `3/5`.
6. Selected publication was `PUBLISHED`, pending ACK count was `0`, and
   selected published active membership was `3/5`.
7. Missing selected published active nodes:
   `11601fe0-72d6-5853-8590-ec2881853e72` and
   `8be8d30f-4499-5eed-865c-71b4d529a67a`.
8. Publication convergence was reported ready and priority recovery invariants
   passed.
9. Priority recovery unresolved progress classes:
   `eligible_but_no_operation_created` and
   `operation_created_but_no_step_transitions`.
10. Priority recovery semantic states:
    `needs_operation` for `sql_transactions-p1` and
    `sql_write_operations-p1`, plus operation progress for
    `sql_transaction_participants-p1`.
11. Timeline evidence shows the rebalancer evaluated
    `sql_transactions-p1` and `sql_write_operations-p1` through capacity
    feasibility, but no durable operation rows existed for those partitions in
    the terminal selected snapshot.
12. The latest selected snapshot still had three active replicas for
    `sql_transactions-p1` and `sql_write_operations-p1` on the same node,
    leaving priority spread unsatisfied while ordinary priority operation
    progress was already in flight.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Determine whether startup active-gate closure should wait on selected
   snapshot coverage, serialized ordinary priority operation progress, or both.
2. Preserve publication convergence authority: no stale missing-published
   reconstruction may override canonical publication recovery evidence.
3. Make the active-gate owner state expose serialized priority recovery
   progress explicitly instead of leaving `eligible_but_no_operation_created`
   as the only visible class when an ordinary priority operation is already
   in flight.
4. Drive `sql_transactions-p1` and `sql_write_operations-p1` from same-node
   duplicate replicas toward durable recovery operations once the serial lane
   permits it.
5. Re-run focused owner-state regressions and the representative
   `rolling-restart --fast-local` scenario.

## Out Of Scope

1. Post-active over-target trim.
2. Broad matrix reruns before the representative path passes or migrates.
3. Reopening restart-recovery control snapshot authority.
4. Reopening publication/coordinator mismatch.
5. Pro or Enterprise behavior.

## Shared Boundary Contract

Semantic owners:

1. active-gate selected snapshot coverage
2. priority recovery serial operation-progress lane
3. priority recovery operation-scheduling diagnostics

Consumer:

1. distributed harness active gate and failure bundle classification

Contract:

1. Startup active-gate timeout must report whether selected snapshot coverage
   or priority recovery serial progress is the current owner boundary.
2. A priority partition waiting because another ordinary priority operation is
   already in flight must not look identical to a partition that never reached
   operation scheduling.
3. Publication convergence can be ready while selected snapshot coverage is
   incomplete; those are separate owner states.
4. Same-node duplicate priority replicas require operation progress or an
   explicit serial-wait owner before the startup active gate can close.

## Progress Grammar

1. `snapshot_coverage_pending` means the selected active-gate snapshot has not
   observed every expected active node.
2. `priority_operation_serial_wait` means a priority partition requires work
   but ordinary priority recovery is intentionally serialized behind another
   in-flight operation.
3. `eligible_but_no_operation_created` means no operation exists and no serial
   owner explains the absence.
4. `operation_created_but_no_step_transitions` means an operation exists but
   workflow progress has not reached a step transition.
5. `closed` means the startup active gate no longer blocks on this owner path.
6. `migrated` means the representative path reaches a new named owner
   boundary.

## Residual Closure Inventory

- [x] Active-gate classification separates selected snapshot coverage from
      publication convergence.
- [x] Priority recovery diagnostics expose serial wait distinctly from
      no-operation-created.
- [x] Same-node duplicate priority replicas create durable follow-up work when
      the serial lane permits it.
- [x] Representative rerun no longer fails with `snapshot_coverage=3/5` plus
      unresolved `eligible_but_no_operation_created`.
- [x] Operation-transition / over-target trim re-enters only after this
      startup active gate closes or migrates to post-active convergence.

## Validation

1. Focused unit tests for the selected owner-state change: added.
2. `npm test -- test/rebalancer/unified-rebalancer.test-part-5-2.js`:
   passed.
3. `npm test -- test/rebalancer/unified-rebalancer.test.js`: passed.
4. `npm test -- test/control-plane/priority-recovery-snapshot.test.js`:
   passed.
5. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`:
   passed.
6. `git diff --check`: passed.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local`:
   failed by migration after `131.5s`.

## Execution Log

May 4 execution:

1. Priority recovery decision and harness observation now filter stale synthetic
   no-operation snapshots when operation-backed progress exists for the same
   partition.
2. Failure-bundle regression coverage now proves stale serial-wait synthetic
   snapshots do not survive behind spread-satisfied operation progress.
3. Topology-settling planning now uses a normalized decision table. Explicit
   priority recovery operation creation may bypass topology-settling deferral,
   including `topology_operations_in_flight`, unless the in-flight topology
   blocker already belongs to the same operation-creation target partition.
4. Rebalancer regression coverage now proves priority operation creation
   reaches evaluation through the topology-operations-in-flight gate while
   preserving the existing same-partition in-flight safety guard.
5. The representative rerun advanced past the terminal
   `eligible_but_no_operation_created` owner state. The final error reports
   `priorityRecovery=operation_created_but_no_step_transitions`, with
   `control_plane_publications-p1` stalled in target creation and
   `sql_write_operations-p1` waiting on the serial priority lane.
6. The representative path is therefore migrated into operation transition
   pressure / over-target trim ownership rather than remaining in startup
   snapshot coverage plus no-operation-created scheduling.
