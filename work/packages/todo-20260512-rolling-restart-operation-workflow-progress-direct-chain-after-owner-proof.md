# Rolling Restart Operation Workflow Progress Direct Chain After Owner Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-12",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Fresh representative proof after the serial-wait event-driven advance classification remains red. The first frontier stays priority_recovery_partition_progress under operation_workflow_owner / workflow_progress, with direct event-driven advance witnesses for control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1, serial-wait dependents sql_transaction_participants-p1 and sql_write_operations-p1, and a secondary non-promoted rebalancer_handoff witness for control_plane_publications-p1.",
  "nextAction": "Prove why the direct workflow-progress chain remains event-driven after owner re-entry proof, then reduce the direct workflow-progress residual or record the next named owner-boundary migration.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --markdown",
    "focused operation_workflow_owner / workflow_progress tests selected by implementation package",
    "representative rolling-restart rerun or explicit migration proof"
  ],
  "touchedFiles": [
    "work/packages/todo-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
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
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-progress-serial-wait-event-driven-advance.md"
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

1. work/packages/todo-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md
2. work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/todo-20260512-rolling-restart-operation-workflow-progress-direct-chain-after-owner-proof.md`, `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --explain priority_recovery_partition_progress`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --markdown`, `focused operation_workflow_owner / workflow_progress tests selected by implementation package`, `representative rolling-restart rerun or explicit migration proof`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --explain priority_recovery_partition_progress
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-serial-wait-event-driven-advance-proof.report.json --markdown
4. focused operation_workflow_owner / workflow_progress tests selected by implementation package
5. representative rolling-restart rerun or explicit migration proof
