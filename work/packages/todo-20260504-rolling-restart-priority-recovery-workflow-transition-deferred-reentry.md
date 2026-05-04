# Rolling Restart Priority Recovery Workflow Transition Deferred Reentry

Opened on May 4, 2026 as the migrated blocker from
[Rolling Restart Startup Snapshot Reachability Operation Workflow Progress Reentry](./done-20260504-rolling-restart-startup-snapshot-reachability-operation-workflow-progress-reentry.md).

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-startup-snapshot-workflow-progress-reentry-fastlocal-20260504-codex.report.json`.
2. Failure bundle:
   `test-output/reports/.playback/rolling-restart-startup-snapshot-workflow-progress-reentry-fastlocal-20260504-codex/rolling-restart/failure-bundle.json`.
3. Result: failed, `0/1` passed after `133.3s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Startup selected snapshot is reachable by `admin_health`; readiness failure is
   `no_progress_terminal`, not `snapshot_reachability_timeout`.
6. Publication remains closed:
   `PUBLISHED`, pending ACK count `0`, blocked node count `0`, and missing
   published count `0` in the normalized bundle.
7. Active-gate selected snapshot coverage remains incomplete at `2/5`.
8. Dominant failure classification:
   `priority_recovery_progress_blocked` with dominant reason
   `priority_recovery_workflow_progress_transition_deferred`.
9. Dominant witness:
   `sql_transactions-p1` at
   `operation_workflow_owner / workflow_progress / wait_for_operation_progress`
   with actuation state `transition_deferred`.
10. Supporting unresolved partitions include `replica_operations-p1` at
    `operation_scheduling / create_recovery_operation` and
    `sql_write_operations-p1` at
    `workflow_progress / wait_for_operation_progress`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

## In Scope

1. Determine whether `transition_deferred` workflow progress is the current
   owner boundary or supporting evidence for operation scheduling.
2. Preserve publication ACK closure and active-gate snapshot coverage
   classification.
3. Keep `priority_operation_serial_wait`, `eligible_but_no_operation_created`,
   `needs_operation`, and `operation_stalled` evidence normalized through one
   canonical priority-recovery progress outcome.
4. Decide whether `sql_transactions-p1` and `sql_write_operations-p1` should
   wait, dispatch, or reconcile without increasing harness timeouts.

## Out Of Scope

1. Harness timeout increases.
2. Post-active over-target trim until the representative path reaches that
   boundary again.
3. Reopening publication ACK or startup selected-snapshot reachability unless
   new evidence shows they are current debt.
4. Pro or Enterprise behavior.

## Residual Closure Inventory

- [ ] Classify `transition_deferred` workflow progress as dominant owner
      evidence or supporting operation-scheduling evidence.
- [ ] Trace `sql_transactions-p1` and `sql_write_operations-p1` serial-wait
      witnesses through dispatch, wait, or timeout reconciliation.
- [ ] Trace `replica_operations-p1` `eligible_but_no_operation_created` through
      operation scheduling without reopening publication debt.
- [ ] Prove the failure bundle reports one canonical owner state for the
      migrated priority-recovery blocker.
- [ ] Run focused owner/static checks and one representative
      `rolling-restart --fast-local` rerun.

## Validation

1. Focused fixture for priority recovery workflow `transition_deferred` plus
   operation scheduling.
2. Failure-bundle playback/regeneration for the final representative report.
3. Static guardrails for touched files.
4. One representative `rolling-restart --fast-local` rerun.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates to one
   newly named owner boundary.
2. Publication ACK closure and startup selected-snapshot reachability remain
   closed while priority recovery progress is classified through one canonical
   outcome.
