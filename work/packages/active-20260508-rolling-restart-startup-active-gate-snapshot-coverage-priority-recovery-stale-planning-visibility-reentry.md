# Rolling Restart Startup Active Gate Snapshot Coverage Priority Recovery Stale Planning Visibility Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z/rolling-restart/",
  "owner": "Startup active-gate snapshot coverage after sql_write priority operation execution",
  "boundary": "startup_active_gate_owner / snapshot_coverage / priority_recovery_progress_visibility",
  "dominantReason": "snapshot_coverage_incomplete_after_priority_move_execution",
  "currentState": "The direct sql_write_operations-p1 scheduling seam advanced during the representative rerun: playback logs show the rebalancer started and executed a replace move at 2026-05-08T07:24:53Z. The failure bundle's dominant sql_write_operations-p1 witness was captured earlier at 2026-05-08T07:24:42Z and still reports operation_unknown, operationCount=0, and visibilityState=none, while the scenario times out at startup active-gate snapshot coverage 2/5 under PUBLISHED epoch 4.",
  "nextAction": "Review the just-closed operation-scheduling package, then extract one focused stale-planning visibility witness proving the failure bundle keeps a pre-move priority-recovery snapshot after move execution and repair or classify the planning-only reconstruction path that feeds startup snapshot coverage.",
  "proof": [
    "Focused stale-planning visibility witness tying pre-move snapshot capture to post-move playback execution",
    "Focused regression or blocker probe for planning-only priority recovery reconstruction after move execution",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun",
    "Failure-report and topology-convergence analysis"
  ],
  "touchedFiles": [
    "work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md",
    "work/model-ledger.jsonl",
    "work/sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md"
}
-->

Opened on May 8, 2026 after
[Rolling Restart Priority Recovery Operation Scheduling Sql Write Needs Operation Reentry](./done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md)
closed by migration. The representative rerun still times out with
`snapshot_coverage=2/5`, but playback now shows the direct
`sql_write_operations-p1` rebalancer executing a replace move after the stale
failure-bundle witness was captured, so the next seam is stale priority
recovery visibility feeding startup active-gate coverage rather than raw move
creation.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded:
      Agent <name> (<agent-id>) reviewed
      `work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md`;
      result <clean|fixes-required>.
- [ ] Fix subagent recorded or explicitly not needed:
      Agent <name> (<agent-id>) fixed
      `work/packages/done-20260508-rolling-restart-priority-recovery-operation-scheduling-sql-write-needs-operation-reentry.md`, or
      `not-needed` only when review result is `clean`.
- [ ] Implementation subagent recorded:
      Agent <name> (<agent-id>) implemented
      `work/packages/active-20260508-rolling-restart-startup-active-gate-snapshot-coverage-priority-recovery-stale-planning-visibility-reentry.md`.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-sql-write-operation-scheduling-repair-20260508T000000Z/rolling-restart/`.
3. Result: failed after `143.1s`.
4. `npm run analyze:distributed-failure` still classifies the report as
   `topology / priority_recovery_operation_scheduling_event_driven`.
5. `npm run analyze:topology-convergence --` on both the report and playback
   failure bundle still selects `rebalancer_leader / operation_scheduling`,
   but the next expected frontier remains
   `startup_active_gate_owner / snapshot_coverage`.
6. Playback logs for node `7493b0ab-a054-5fad-a91b-5e331db29304` show
   `sql_write_operations-p1` starting rebalancing at
   `2026-05-08T07:24:53.480Z`, passing pre-execution handoff at
   `2026-05-08T07:24:53.482Z`, and executing one `replace` move immediately
   after.
7. The failure bundle's dominant `sql_write_operations-p1` witness reports
   `snapshotCapturedAt=1778225082298` (`2026-05-08T07:24:42.298Z`),
   `operation_unknown`, `operationCount=0`, and `visibilityState=none`, which
   predates the later move execution by about `11s`.
8. The strongest stale path now runs through planning-snapshot readers and
   planning-only decision reconstruction:
   `getPriorityRecoveryPlanningSnapshot()`,
   `getPriorityRecoveryPlanningSnapshotSync()`,
   `getCurrentPriorityRecoveryFollowUpDecisionSnapshot()`,
   `buildPriorityRecoveryFollowUpDecisionSnapshotFromPlanning()`, and
   `buildPriorityRecoveryOperationCreationPlanningGateSnapshot()`.

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

- [ ] Review the just-closed predecessor package on the same sprint boundary.
- [ ] Fix any predecessor-review findings before implementation resumes.
- [ ] Extract the focused stale-planning visibility witness and its supporting
      post-move playback evidence.
- [ ] Add the focused regression or blocker probe for the selected visibility
      seam.
- [ ] Repair the planning-only visibility path or migrate again with proof.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary.
- [ ] File-scoped baseline recorded before production edits for the touched
      source and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file decision-boundary, literal-owner, or diff hygiene
      violation remains.
- [ ] Representative rerun proof completed before package closure.
