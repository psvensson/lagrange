# Phase 0.1 Rolling Restart Release Gate Closure Sprint

## Goal

Get to the `0.1` release by closing the representative `rolling-restart`
distributed harness gate, or by migrating each remaining failure to one named
owner-boundary package with replayable proof.

The current representative gate is `rolling-restart`. The release-gate artifact
trail is:

1. `test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json`
2. `test-output/reports/rolling-restart-current-release-gate-next.report.json`
3. `test-output/reports/rolling-restart-current-release-gate-after-observed-progress-lane-held.report.json`
4. `test-output/reports/rolling-restart-current-release-gate-after-persisted-not-dispatched.report.json`
5. `test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress.report.json`
6. `test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json`
7. `test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json`
8. `test-output/reports/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix.report.json`
9. `test-output/reports/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix.report.json`
10. `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix.report.json`

The matching playback is:

1. `test-output/reports/.playback/rolling-restart-current-release-gate-20260508T194848Z/rolling-restart/`
2. `test-output/reports/.playback/rolling-restart-current-release-gate-next/rolling-restart/`
3. `test-output/reports/.playback/rolling-restart-current-release-gate-after-observed-progress-lane-held/rolling-restart/`
4. `test-output/reports/.playback/rolling-restart-current-release-gate-after-persisted-not-dispatched/rolling-restart/`
5. `test-output/reports/.playback/rolling-restart-current-release-gate-after-target-creation-progress/rolling-restart/`
6. `test-output/reports/.playback/rolling-restart-current-release-gate-after-target-creation-progress-rerun/rolling-restart/`
7. `test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-skip-retry/rolling-restart/`
8. `test-output/reports/.playback/rolling-restart-current-release-gate-after-remote-handoff-retry-stale-fix/rolling-restart/`
9. `test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-scheduling-sql-transaction-participants-fix/rolling-restart/`
10. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-dispatch-pending-fix/rolling-restart/`

## Current Blocker Snapshot

Active package:

1. [Rolling Restart Operation Workflow Timeout Control Plane Publications Stale Progress Reconcile](../packages/active-20260509-rolling-restart-operation-workflow-timeout-control-plane-publications-stale-progress-reconcile.md)

Latest representative evidence:

1. Scenario: `rolling-restart`
2. Report total/passed/failed: `1/0/1`
3. Duration: approximately `132188ms`
4. Active gate: failed at `2/5` terminal progress, with best observed progress
   `3/5`
5. Snapshot coverage: `3/5`
6. Publication: `PUBLISHED`
7. Pending acknowledgements: `0`
8. Blocked partitions: `control_plane_publications-p1` and
   `sql_transaction_participants-p1`
9. Priority recovery invariants: `passed`

The normalized first frontier is
`operation_workflow_owner / workflow_timeout` with dominant reason
`priority_recovery_workflow_timeout_transition_deferred`. Startup replay
contracted the first `PENDING` / `persisted_not_dispatched` blocker, the
target-creation observed-progress fix contracted the `CREATING` /
`dispatched_waiting_progress` blocker, dispatch-skip retry contracted the
timed-out `sql_transactions-p1` persisted-not-dispatched witness, stale
remote-handoff retry plus participant scheduling removed the
`operation_workflow_owner / rebalancer_handoff` and
`sql_transaction_participants-p1` selected witnesses, and the workflow-progress
dispatch-pending fix moved `sql_write_operations-p1` to
`spread_satisfied_in_flight`. The fresh dominant witness is
`control_plane_publications-p1` with operation
`9cc14694-88ba-47df-9c72-ecc301be8312`, semantic state `operation_stalled`,
workflow phase `dispatch_pending`, latest step `SENDING`, latest status
`pending`, actuation state `transition_deferred`, wait mode
`timeout_reconcile_due`, and next action
`reconcile_stale_operation_progress`.

`startup_active_gate_owner / snapshot_coverage` remains downstream until the
priority recovery timeout frontier progresses or migrates.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Keep `rolling-restart` as the primary representative release gate until it
   passes or migrates to a new named owner boundary.
2. The operation-scheduling package is locally closed, and the active
   workflow-progress successor migrated to `workflow_timeout`; the focused
   slice is committed and pushed, so the timeout successor owns the current
   boundary.
3. Preserve the completed core topology control-plane rewrite as predecessor
   proof, not as the current owner.
4. Keep sustained throughput and 7-node stress confirmation behind the
   current `rolling-restart` gate until this representative path is green.
5. Update tracker truth whenever the representative blocker closes or
   migrates.

## Out Of Scope

1. Phase `0.5` deployment, CLI, package naming, or service-platform work.
2. Phase `1.0` service manifest, catalog, lifecycle, or platform API work.
3. Pro or Enterprise behavior, operator flows, or control surfaces.
4. Harness timeout increases or presentation-only relabeling.
5. Reopening old rolling-restart residual packages unless a fresh artifact
   restores their owner boundary as the first frontier.

## Execution Order

1. Preserve the contracted workflow-progress startup-replay proof from the
   predecessor rerun.
2. Preserve the target-creation observed-progress proof and regression.
3. Preserve the workflow-progress dispatch-pending fix and representative rerun
   showing `sql_write_operations-p1` as `spread_satisfied_in_flight`.
4. Keep exactly one active successor package for
   `operation_workflow_owner / workflow_timeout` and target
   `reconcile_stale_operation_progress` for operation
   `9cc14694-88ba-47df-9c72-ecc301be8312`.
5. Rerun focused owner tests, touched-file static guardrails, and
   `rolling-restart --fast-local`.
6. If `rolling-restart` passes, run sustained throughput and 7-node stress
   confirmation for `0.1`.

## Validation Ladder

1. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json --explain priority_recovery_partition_progress`
3. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json`
4. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --explain priority_recovery_partition_progress`
5. Focused workflow-progress startup replay, target-creation, dispatch-skip
   retry, and dispatch-pending timeout re-entry regressions.
6. Touched-file static guardrails selected by the implementation boundary.
7. `npm run work:validate`
8. `git diff --check`
9. Representative `rolling-restart --fast-local` rerun.
10. Sustained throughput and 7-node stress confirmation after
   `rolling-restart` passes.

## Done When

1. `rolling-restart` passes for the `0.1` release gate or migrates to one new
   named owner boundary with a focused successor package.
2. Priority recovery no longer reports stale priority operations without an
   owner dispatch, progress, retry, or timeout-reconcile path.
3. Startup active-gate snapshot coverage is either green or promoted as the
   next direct frontier after priority progress closes.
4. Current-blocker handoff is generated from the active package.
5. No Phase `0.5`, Phase `1.0`, or paid-edition queue item outranks the active
   `0.1` representative release gate.
