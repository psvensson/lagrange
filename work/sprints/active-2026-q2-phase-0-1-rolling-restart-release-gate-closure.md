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

## Current Blocker Snapshot

Latest package:

1. [Rolling Restart Topology Publication Convergence Published Pending](../packages/done-20260511-rolling-restart-topology-publication-convergence-published-pending.md)

Latest representative evidence:

1. Scenario: `rolling-restart`
2. Report total/passed/failed: `1/0/1`
3. Duration: approximately `131804ms`
4. Active gate: failed at `3/5` terminal progress
5. Snapshot coverage: `3/5`
6. Publication: `PUBLISHED`
7. Pending acknowledgements: `0`
8. Publication ACK convergence: `satisfied` / non-frontier with
   `publicationPending=false` and
   `recoveryProtocolState=priority_spread_pending`
9. Current frontier: `priority_recovery_partition_progress` under
   `operation_workflow_owner / workflow_progress`, state `retryable`, dominant
   reason `priority_recovery_event_driven_wait`
10. Priority recovery invariants: `passed`

The publication-convergence package reduced the prior
`topology_publication_owner / publication_convergence` blocker.
`publication_ack_convergence` is now satisfied/non-frontier for the published,
zero-ACK, zero-blocked-node, priority-spread-pending case without canonical
missing-active publication debt.

The normalized first frontier migrated back to `operation_workflow_owner /
workflow_progress` on edge `priority_recovery_partition_progress`, state
`retryable`, dominant reason `priority_recovery_event_driven_wait`. The dominant
witness is `sql_write_operations-p1`, `recovering_in_flight`,
`persisted_not_dispatched`, `event_driven`, and `advance_existing_operation`.

Raw distributed-failure presentation for the same latest artifact still reports
`publication_convergence_blocked` / `publication_missing_active_node`; treat that
as a presentation residual before successor implementation, not as the canonical
owner-boundary frontier.

Startup active-gate snapshot coverage remains downstream until operation
workflow progress is either green or promoted by fresh representative evidence.

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
7. Open the operation-workflow successor; the focused publication-convergence
   implementation commit `fe7ae399` and closure metadata commit `870f3037` are
   already pushed.
8. If `rolling-restart` passes, run sustained throughput and 7-node stress
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
15. Sustained throughput and 7-node stress confirmation after
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
