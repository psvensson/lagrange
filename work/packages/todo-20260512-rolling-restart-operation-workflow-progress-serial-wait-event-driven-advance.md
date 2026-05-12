# Rolling Restart Operation Workflow Progress Serial Wait Event Driven Advance

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-12",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Fresh representative evidence after the coordinator-excludes-node fix removes coordination_mismatch. priority_recovery_partition_progress remains first under operation_workflow_owner / workflow_progress with recovering_in_flight persisted_not_dispatched advance_existing_operation witnesses for control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1, plus sql_transactions-p1 and sql_write_operations-p1 as priority_operation_serial_wait dependents.",
  "nextAction": "Prove why event-driven advance-existing-operation workflow progress leaves priority partitions in serial wait, then reduce the direct workflow-progress residual or record the next named frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown",
    "focused operation_workflow_owner / workflow_progress tests selected by implementation package",
    "representative rolling-restart rerun or explicit classification proof"
  ],
  "touchedFiles": [
    "work/packages/todo-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "predecessor": "work/packages/active-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## In Scope

1. work/packages/todo-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md

## Out Of Scope

1. startup active-gate implementation
2. publication-convergence implementation
3. harness timeout increases
4. Pro or Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/todo-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md`
- Forbidden files: `startup active-gate implementation`, `publication-convergence implementation`, `harness timeout increases`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown`, `focused operation_workflow_owner / workflow_progress tests selected by implementation package`, `representative rolling-restart rerun or explicit classification proof`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --explain priority_recovery_partition_progress
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-coordinator-excludes-node-fix.report.json --markdown
4. focused operation_workflow_owner / workflow_progress tests selected by implementation package
5. representative rolling-restart rerun or explicit classification proof
