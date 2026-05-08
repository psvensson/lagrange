# Phase 0.1 Rolling Restart Release Gate Closure Sprint

## Goal

Get to the `0.1` release by closing the representative `rolling-restart`
distributed harness gate, or by migrating each remaining failure to one named
owner-boundary package with replayable proof.

The current representative gate is `rolling-restart`. The current release-gate
artifact is:

1. `test-output/reports/rolling-restart-current-release-gate-20260508T194848Z.report.json`
2. `test-output/reports/rolling-restart-current-release-gate-next.report.json`
3. `test-output/reports/rolling-restart-current-release-gate-after-observed-progress-lane-held.report.json`
4. `test-output/reports/rolling-restart-current-release-gate-after-persisted-not-dispatched.report.json`
5. `test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress.report.json`
6. `test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json`
7. `test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json`

The matching playback is:

1. `test-output/reports/.playback/rolling-restart-current-release-gate-20260508T194848Z/rolling-restart/`
2. `test-output/reports/.playback/rolling-restart-current-release-gate-next/rolling-restart/`
3. `test-output/reports/.playback/rolling-restart-current-release-gate-after-observed-progress-lane-held/rolling-restart/`
4. `test-output/reports/.playback/rolling-restart-current-release-gate-after-persisted-not-dispatched/rolling-restart/`
5. `test-output/reports/.playback/rolling-restart-current-release-gate-after-target-creation-progress/rolling-restart/`
6. `test-output/reports/.playback/rolling-restart-current-release-gate-after-target-creation-progress-rerun/rolling-restart/`
7. `test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-skip-retry/rolling-restart/`

## Current Blocker Snapshot

Active package:

1. [Rolling Restart Operation Workflow Progress Persisted Not Dispatched](../packages/active-20260508-rolling-restart-operation-workflow-progress-persisted-not-dispatched.md)

Latest representative evidence:

1. Scenario: `rolling-restart`
2. Report total/passed/failed: `1/0/1`
3. Duration: approximately `133215ms`
4. Active gate: failed because only `3/5` nodes reached ACTIVE before
   `120000ms`
5. Snapshot coverage: `3/5`
6. Publication: `PUBLISHED`
7. Pending acknowledgements: `0`
8. Priority spread: `pending#gap=5`
9. Priority recovery invariants: `passed`

The normalized first frontier is
`operation_workflow_owner / rebalancer_handoff` with dominant reason
`priority_recovery_rebalancer_handoff_retry_scheduled`. Startup replay
contracted the first `PENDING` / `persisted_not_dispatched` blocker,
the target-creation observed-progress fix contracted the `CREATING` /
`dispatched_waiting_progress` blocker, and dispatch-skip retry contracted the
timed-out `sql_transactions-p1` persisted-not-dispatched witness. The fresh
blocked partitions are `sql_transaction_participants-p1` and
`sql_write_operations-p1`, with unresolved semantic states
`needs_operation,recovering_in_flight`.

`startup_active_gate_owner / snapshot_coverage` remains downstream until the
priority operation workflow progresses or migrates.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Keep `rolling-restart` as the primary representative release gate until it
   passes or migrates to a new named owner boundary.
2. Execute the active operation-workflow workflow-progress package first, then
   resume the migrated rebalancer-handoff retry-scheduled boundary.
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
3. Freeze the current timed-out `PENDING` / `persisted_not_dispatched` witness
   from the latest report and playback.
4. Repair the remaining dispatch wake or timeout-reconcile gap for cached
   `PENDING` operations with no timeline transitions.
5. Rerun focused owner tests, touched-file static guardrails, and
   `rolling-restart --fast-local`.
6. If `rolling-restart` passes, run sustained throughput and 7-node stress
   confirmation for `0.1`.
7. If the blocker migrates, open exactly one successor package for the new
   named owner boundary. The current migration target is
   `operation_workflow_owner / rebalancer_handoff`.

## Validation Ladder

1. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-target-creation-progress-rerun.report.json --explain priority_recovery_partition_progress`
3. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json`
4. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-skip-retry.report.json --explain priority_recovery_partition_progress`
5. Focused workflow-progress startup replay, target-creation, and
   dispatch-skip retry regressions.
6. Touched-file static guardrails selected by the implementation boundary.
7. `npm run work:validate`
8. `git diff --check`
9. Representative `rolling-restart --fast-local` rerun.
10. Sustained throughput and 7-node stress confirmation after
   `rolling-restart` passes.

## Done When

1. `rolling-restart` passes for the `0.1` release gate or migrates to one new
   named owner boundary with a focused successor package.
2. Priority recovery no longer reports persisted priority `PENDING` operations
   without an owner dispatch or retry path.
3. Startup active-gate snapshot coverage is either green or promoted as the
   next direct frontier after priority progress closes.
4. Current-blocker handoff is generated from the active package.
5. No Phase `0.5`, Phase `1.0`, or paid-edition queue item outranks the active
   `0.1` representative release gate.
