# Rolling Restart Startup Active Gate Snapshot Coverage Priority Recovery Stale Planning Visibility Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z/rolling-restart/",
  "owner": "Startup active-gate snapshot coverage after sql_write priority operation execution",
  "boundary": "startup_active_gate_owner / snapshot_coverage / priority_recovery_progress_visibility",
  "dominantReason": "priority_recovery_workflow_timeout_transition_deferred",
  "currentState": "The stale planning-visibility seam is closed enough to stop spending package effort on startup snapshot-coverage reconstruction. The closure-driving rerun advanced snapshot coverage from 2/5 to 3/5, replaced the stale sql_write_operations-p1 eligible_but_no_operation_created witness, and now promotes sql_transaction_participants-p1 as the dominant operation_workflow_owner / workflow_timeout blocker under operation_created_but_no_step_transitions while startup active-gate coverage remains downstream only.",
  "nextAction": "Review the just-closed stale-planning-visibility package, then extract one focused epoch-2 PUBLISHED workflow-timeout witness for sql_transaction_participants-p1 and repair or classify why the operation workflow owner leaves it at operation_created_but_no_step_transitions under dispatch_pending without reopening the closed stale-planning-visibility package.",
  "proof": [
    "Focused stale-planning visibility witness tying pre-move snapshot capture to post-move playback execution",
    "Focused regression or blocker probe for planning-only priority recovery reconstruction after move execution",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4-stage-1.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-2.js",
    "src/rebalancer/unified-rebalancer-segment-5.js",
    "test/rebalancer/priority-recovery-stale-planning-visibility.test.js",
    "work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260508-rolling-restart-topology-priority-recovery-workflow-timeout-sql-transaction-participants-dispatch-pending-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Priority Recovery Operation Scheduling Sql Write Needs Operation Reentry](./done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md)
closed by migration. The focused stale-planning visibility repair removed the
stale `sql_write_operations-p1` `eligible_but_no_operation_created` witness
and improved startup snapshot coverage from `2/5` to `3/5`, but the
representative rerun still times out because the frontier has moved again to
`sql_transaction_participants-p1` under
`operation_workflow_owner / workflow_timeout`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent `Russell` (`019e068a-ac97-7812-b394-de2c05aba22c`) reviewed
      `work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent `Feynman` (`019e068c-cdb4-7283-b49b-848a7e72a30f`) fixed
      `work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md`.
- [x] Implementation subagent recorded:
      Agent `McClintock` (`019e0692-c3a3-72d3-9072-0413bb544f10`) implemented
      `work/packages/done-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md`.

## Commit And Push Ledger

- Focused package commit: `ac207b9d`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z/rolling-restart/`.
3. Result: failed after `132.0s`.
4. `npm run analyze:distributed-failure` now classifies the rerun as
   `topology / priority_recovery_workflow_timeout_transition_deferred`.
5. `npm run analyze:topology-convergence --` on both the report and playback
   failure bundle now selects
   `operation_workflow_owner / workflow_timeout` as the first frontier, with
   `startup_active_gate_owner / snapshot_coverage` reduced to the next
   expected frontier.
6. The dominant witness is now `sql_transaction_participants-p1` with
   `semanticState=operation_stalled`,
   `progressClass=operation_created_but_no_step_transitions`,
   `nextRequiredAction=reconcile_stale_operation_progress`,
   `workflowProgressPhaseId=dispatch_pending`,
   `waitMode=timeout_reconcile_due`, `stepAgeMs=39749`, and
   `stepTimeoutMs=30000`.
7. Supporting context keeps `replica_operations-p1` on
   `recovering_in_flight / workflow_progress`,
   `sql_transactions-p1` on `needs_operation / priority_operation_serial_wait`,
   and `sql_write_operations-p1` on the same `priority_operation_serial_wait`
   lane, while startup active-gate coverage remains downstream at `3/5`.
8. The stale `sql_write_operations-p1` `eligible_but_no_operation_created`
   witness is gone from the closure-driving rerun, so the stale planning-only
   reconstruction seam no longer dominates package effort.
9. Focused regression `test/rebalancer/priority-recovery-stale-planning-visibility.test.js`
   now replays the stale explicit-snapshot shape against a cache-visible
   in-flight `REPLACE` row and proves:
   - async current follow-up reads prefer the coordinator-owned
     `recovering_in_flight` snapshot over stale planning-only
     `needs_operation`;
   - planning-only reconstruction drops
     `eligible_but_no_operation_created` once live replace progress is
     visible;
   - sync planning-gate snapshots stop advertising operation creation for the
     same partition once that replace is in flight.
10. Representative rerun artifact:
    `test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json`.
11. The representative rerun still failed after `132.0s`, but the failure
    moved the dominant witness away from stale operation creation:
    `snapshotCoverage` improved from `2/5` to `3/5`, the active-gate message
    now reports `priorityRecovery=operation_created_but_no_step_transitions`,
    and the normalized report selects
    `operation_workflow_owner / workflow_timeout` with dominant reason
    `priority_recovery_workflow_timeout_transition_deferred`.
12. `npm run analyze:topology-convergence --` on both the rerun report and its
    playback failure bundle now selects the first frontier edge
    `priority_recovery_partition_progress` under
    `operation_workflow_owner / workflow_timeout`, with startup
    `active_gate_snapshot_coverage` reduced to the next expected frontier.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Review the just-closed predecessor package before implementation resumes.
2. Extract one focused stale-planning visibility witness tying pre-move
   snapshot capture to post-move playback execution.
3. Add one focused regression or blocker probe for stale planning-only
   priority recovery reconstruction after move execution.
4. Repair or classify the planning-only visibility seam without reopening the
   closed operation-scheduling package.
5. Run focused tests, touched-file static guardrails, and one representative
   `rolling-restart` rerun.

## Out Of Scope

1. Reopening the closed sql-write operation-scheduling package unless fresh
   evidence shows the move-execution playback was a false lead.
2. Broad startup or publication refactors outside stale priority recovery
   visibility and its snapshot-coverage consumers.
3. Harness timeout changes that hide the current active-gate timeout.

## Boundary Contract

Semantic owners:

1. `startup_active_gate_owner / snapshot_coverage` is the next runtime frontier
   once the direct sql-write move executes.
2. `rebalancer_leader / operation_scheduling` remains the stale artifact
   presentation surface until the priority recovery snapshot reflects the later
   move execution.
3. The planning snapshot readers and planning-only reconstruction path must not
   recreate `eligible_but_no_operation_created` after move execution has
   already advanced the same partition.

Canonical contract shape:

1. If a priority recovery move executes after a snapshot is captured, later
   blocker reporting must not keep advertising `operation_unknown` for that
   partition.
2. Planning-only reconstruction must not outrank fresher move-execution
   evidence for the same partition and epoch.
3. This package closes only after a representative rerun proves either startup
   snapshot coverage advances or a new named owner boundary dominates.

## Residual Closure Inventory

- [x] Review the just-closed predecessor package on the same sprint boundary.
- [x] Fix any predecessor-review findings before implementation resumes.
- [x] Extract the focused stale-planning visibility witness and its supporting
      post-move playback evidence.
- [x] Add the focused regression or blocker probe for the selected visibility
      seam.
- [x] Repair the planning-only visibility path or migrate again with proof.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary.
- [x] File-scoped baseline recorded before production edits for the touched
      source and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file decision-boundary, literal-owner, or diff hygiene
      violation remains.
- [x] Representative rerun proof completed before package closure.

## Implementation Notes

1. `src/rebalancer/unified-rebalancer-segment-4-stage-1.js` now prefers the
   coordinator workflow owner's canonical priority-recovery decision snapshot
   when current follow-up reads ask for the active partition, so stale
   planning-only `needs_operation` snapshots no longer outrank fresher
   workflow-progress evidence.
2. `src/rebalancer/unified-rebalancer-segment-4-stage-2.js` now rebuilds
   planning-only follow-up assessments with cache-visible in-flight
   replica-operation contexts for the target partition and exposes one
   resolver that can replace stale explicit planning snapshots when the cache
   proves the partition has already advanced.
3. `src/rebalancer/unified-rebalancer-segment-5.js` now routes the sync
   operation-creation planning gate through that resolver so startup gate
   bypass logic no longer recreates `eligible_but_no_operation_created` for a
   partition with live replace progress.

## Validation

1. Focused tests:
   - `node --test test/rebalancer/priority-recovery-stale-planning-visibility.test.js`
     -> pass
   - `node --test test/rebalancer/unified-rebalancer-part-5-2-stage-2.js`
     -> pass
2. Touched-file baseline before edits:
   - `wc -l src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-2.js src/rebalancer/unified-rebalancer-segment-5.js`
     -> `550`, `555`, `1906`
3. Touched-file after-state:
   - `wc -l src/rebalancer/unified-rebalancer-segment-4-stage-1.js src/rebalancer/unified-rebalancer-segment-4-stage-2.js src/rebalancer/unified-rebalancer-segment-5.js test/rebalancer/priority-recovery-stale-planning-visibility.test.js`
     -> `630`, `641`, `1906`, `278`
4. Static guardrails:
   - `npm run guard:guideline:constant-names:file -- ...`
     -> pass before and after
   - `npm run guard:guidelines:file -- ...`
     -> blocked before and after by the same repository-local invalid API key
        (`401 incorrect_api_key`), so no touched-file drift increase was
        introduced by this package
   - `git diff --check -- ...`
     -> pass
5. Representative rerun:
   - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json --fast-local --verbose`
     -> fail after `132.0s`, but `snapshotCoverage` advanced to `3/5` and the
        stale `eligible_but_no_operation_created` witness was replaced by
        `priority_recovery_workflow_timeout_transition_deferred`
   - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json`
     -> `dominantReason=priority_recovery_workflow_timeout_transition_deferred`
   - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z.report.json`
     -> first frontier `operation_workflow_owner / workflow_timeout`;
        next expected frontier remains
        `startup_active_gate_owner / snapshot_coverage`
   - `npm run analyze:topology-convergence -- test-output/reports/.playback/rolling-restart-after-stale-priority-planning-visibility-20260508T000000Z/rolling-restart/failure-bundle.json`
     -> same frontier and dominant witness as the report
