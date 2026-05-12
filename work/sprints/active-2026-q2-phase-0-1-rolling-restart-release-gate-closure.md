# Phase 0.1 Rolling Restart Release Gate Closure Sprint

Status: active. This sprint is the active release-gate closure track
before `work/sprints/active-2026-q2-spec-led-runtime-modularization.md` was
activated by human direction on May 9, 2026. Its latest closed package and
representative evidence remain predecessor proof for the new sprint.

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
11. `test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`
12. `test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json`
13. `test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json`
14. `test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json`
15. `test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json`
16. `test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json`
17. `test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json`
18. `test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json`
19. `test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json`

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
11. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix/rolling-restart/`
12. `test-output/reports/.playback/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix/rolling-restart/`
13. `test-output/reports/.playback/rolling-restart-current-release-gate-after-publication-convergence-fix-v2/rolling-restart/`
14. `test-output/reports/.playback/rolling-restart-current-release-gate-after-event-driven-wait-fix/rolling-restart/`
15. `test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-fix/rolling-restart/`
16. `test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix/rolling-restart/`
17. `test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix/rolling-restart/`
18. `test-output/reports/.playback/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix/rolling-restart/`
19. `test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix/rolling-restart/`

## Current Blocker Snapshot

Latest package:

1. [Rolling Restart Operation Workflow Progress Event Driven Wait](../packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-wait.md)
2. [Rolling Restart Operation Workflow Rebalancer Handoff Retry Scheduled](../packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md)
3. [Rolling Restart Operation Workflow Progress Event Driven Priority Recovery](../packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md)
4. [Rolling Restart Operation Workflow Progress Dispatch Pending Step Timeout Contract](../packages/done-20260511-rolling-restart-operation-workflow-progress-dispatch-pending-step-timeout-contract.md)
5. [Rolling Restart Operation Workflow Progress Event Driven Residual Recovery](../packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-residual-recovery.md)
6. [Rolling Restart Operation Workflow Rebalancer Handoff Retry Scheduled V2](../packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled-v2.md)

Latest representative evidence:

1. Scenario: `rolling-restart`
2. Report total/passed/failed: `1/0/1`
3. Duration: approximately `132117ms`
4. Active gate: failed at `2/5` terminal progress
5. Snapshot coverage: `2/5`
6. Publication: `PUBLISHED`
7. Pending acknowledgements: `0`
8. Current frontier: `priority_recovery_partition_progress` under
   `operation_workflow_owner / workflow_progress`, state `retryable`, dominant
   source reason `priority_recovery_workflow_progress_event_driven`
   (`priority_recovery_event_driven_wait` in owner-contract summary).
9. Dominant witness: `control_plane_publications-p1`,
   `waitMode=event_driven`, `blockingBoundary=workflow_progress`,
   `actuationState=persisted_not_dispatched`, latest workflow step `PENDING`.
10. Blocked partitions: `control_plane_publications-p1` and
    `sql_transaction_participants-p1`.
11. Priority recovery invariants: `passed`
12. Representative outcome: migrated away from rebalancer-handoff
    retry-scheduled recovery; rebalancer-handoff is no longer the first
    normalized owner-boundary frontier.

The publication-convergence package reduced the prior
`topology_publication_owner / publication_convergence` blocker.
`publication_ack_convergence` is now satisfied/non-frontier for the published,
zero-ACK, zero-blocked-node, priority-spread-pending case without canonical
missing-active publication debt.

The rebalancer-handoff retry-scheduled V2 package added focused owner re-entry
for retry-scheduled dispatch-pending handoff snapshots when no bounded handoff
retry is active. Focused owner tests and touched runtime guardrails are green.
The representative rerun confirms `operation_workflow_owner / rebalancer_handoff`
is no longer the first frontier and restores `operation_workflow_owner /
workflow_progress` as the successor boundary.

Raw distributed-failure presentation for the same latest artifact reports
`publication_missing_active_node`; treat that as a presentation residual before
successor implementation, not as the canonical owner-boundary frontier, because
owner-contract evidence keeps `publication_ack_convergence` satisfied.

Startup active-gate snapshot coverage remains downstream until the
operation-workflow workflow-progress event-driven frontier is either green or
promoted by fresh representative evidence. The latest causal model keeps the
first critical path at `priority_recovery_partition_progress`; the next proof
must reduce event-driven dispatch-pending recovery for `control_plane_publications-p1`
and `sql_transaction_participants-p1`, or expose a new owner boundary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` under AGPL-owned rows:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Edition matrix status: Community / AGPL repo.

## In Scope

1. Keep `rolling-restart` as the primary representative release gate until it
   passes or migrates to a new named owner boundary.
2. The publication-convergence package is locally closed. Its representative
   rerun reduced `publication_ack_convergence` to satisfied/non-frontier and
   migrated the next focused successor back to `operation_workflow_owner /
   workflow_progress` on `priority_recovery_partition_progress`.
3. Preserve the completed priority recovery owner-path packages as predecessor
   proof, not as the current owner.
4. Keep sustained throughput and 7-node stress confirmation behind the current
   `rolling-restart` gate until this representative path is green.
5. Update tracker truth whenever the representative blocker closes or migrates.

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
4. Preserve the workflow-timeout stale-progress fix and representative rerun
   showing `control_plane_publications-p1` moved off `workflow_timeout`.
5. Preserve the serial-wait package rerun showing
   `priority_recovery_partition_progress` reduced to retryable/non-frontier and
   `publication_ack_convergence` became the first frontier.
6. Preserve the publication-convergence package rerun showing
   `publication_ack_convergence` satisfied/non-frontier and the representative
   migrated to retryable operation workflow progress.
7. Preserve the event-driven workflow-progress package rerun showing
    migration to `operation_workflow_owner / rebalancer_handoff`.
8. Preserve the rebalancer-handoff successor rerun showing active handoff retry
   is no longer the first frontier and the representative migrated to
   `operation_workflow_owner / workflow_progress`.
9. Preserve the workflow-progress priority recovery rerun showing the same
   owner boundary remains first frontier, with blocked partitions reduced from
   five to three and next proof at the operation workflow step-timeout contract.
10. Preserve the dispatch-pending step-timeout contract rerun showing focused
   owner probes green but `rolling-restart` same-frontier red on
   `operation_workflow_owner / workflow_progress`, dominant reason
   `priority_recovery_event_driven_wait`, blocked partitions
   `control_plane_publications-p1`, `replica_operations-p1`, and
   `sql_transactions-p1`.
11. If `rolling-restart` passes, run sustained throughput and 7-node stress
   confirmation for `0.1`.

## Validation Ladder

1. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json --explain priority_recovery_partition_progress`
3. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json`
4. Focused workflow-progress startup replay, target-creation, dispatch-skip
   retry, dispatch-pending timeout re-entry, serial-wait, and harness summary
   regressions.
5. Touched-file static guardrails selected by the implementation boundary.
6. `npm run work:current-blocker`
7. `npm run work:validate`
8. `git diff --check`
9. Representative `rolling-restart --fast-local` rerun.
10. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json`
11. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-sql-write-serial-wait-fix.report.json --explain publication_ack_convergence`
12. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json --fast-local --verbose`
13. `npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json`
14. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-publication-convergence-fix-v2.report.json --explain publication_ack_convergence`
15. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-event-driven-wait-fix.report.json --fast-local --verbose`
16. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json --fast-local --verbose`
17. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json --fast-local --verbose`
18. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json --fast-local --verbose`
19. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json --fast-local --verbose`
19. Sustained throughput and 7-node stress confirmation after
    `rolling-restart` passes.

## Done When

1. `rolling-restart` passes for the `0.1` release gate or migrates to one new
   named owner boundary with a focused successor package.
2. Priority recovery no longer reports stale priority operations without an
   owner dispatch, progress, retry, or timeout-reconcile path.
3. Publication convergence is either green or reduced to non-frontier before
   any successor operation-workflow package starts.
4. Current-blocker handoff names the latest representative evidence and next
   successor package action.
5. No Phase `0.5`, Phase `1.0`, or paid-edition queue item outranks the active
   `0.1` representative release gate.
