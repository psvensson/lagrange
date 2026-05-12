# Rolling Restart Operation Workflow Progress Coordinator Excludes Node

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-12",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "publication_recovery_eligible_but_coordinator_excludes_node",
  "currentState": "Split successor from the needs_operation / coordination_mismatch classification. The latest artifact has direct coordination_mismatch witnesses for replica_operations-p1 and sql_transaction_participants-p1: both are operation_workflow_owner / workflow_progress, publication_recovery_eligible_but_coordinator_excludes_node, persisted_not_dispatched, event_driven, and latest workflow step PENDING. sql_transactions-p1 and sql_write_operations-p1 are priority_operation_serial_wait dependents of these workflow-progress operations.",
  "nextAction": "After the classification package closes, activate this package first. Determine why publication-recovery-eligible partitions are excluded by coordinator evidence while operation workflow has pending persisted operations, and keep the serial-wait partitions subordinate unless fresh evidence makes them direct blockers.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress",
    "jq residual semantic-state extraction for needs_operation and coordination_mismatch partitions",
    "focused operation_workflow_owner / workflow_progress tests selected by implementation package",
    "representative rolling-restart rerun or explicit migration proof"
  ],
  "touchedFiles": [
    "work/packages/todo-20260512-rolling-restart-operation-workflow-progress-coordinator-excludes-node.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "evidence promotes rebalancer_leader / operation_scheduling ahead of workflow progress",
      "the fix requires startup active-gate, publication convergence, harness timeout, Pro, or Enterprise behavior",
      "serial-wait dependents become independent direct blockers rather than downstream waits"
    ]
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md"
}
-->

## Why

The classification package split the residual. This successor owns the direct
`operation_workflow_owner / workflow_progress` witnesses:
`replica_operations-p1` and `sql_transaction_participants-p1` are
`publication_recovery_eligible_but_coordinator_excludes_node` while operation
workflow has pending persisted operations.

`sql_transactions-p1` and `sql_write_operations-p1` are in scope only as
serial-wait dependents of those workflow-progress operations. They are not a
separate owner package unless fresh evidence makes them direct blockers.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: this package when activated, selected
  `operation_workflow_owner / workflow_progress` runtime and test files named
  by the implementation package, active sprint handoff, generated
  current-blocker files, and `work/model-ledger.jsonl`.
- Forbidden files and behavior: retry-scheduled handoff runtime code, startup
  active-gate implementation, topology publication convergence
  implementation, harness timeout increases, Pro or Enterprise behavior, and
  the parked rebalancer-leader operation-scheduling successor.
- Frozen decisions: retry-scheduled handoff backpressure is bounded; startup
  active-gate remains downstream; `control_plane_publications-p1`
  operation-scheduling work is parked in its own successor.
- Escalation triggers: evidence promotes operation scheduling ahead of workflow
  progress, the fix requires out-of-scope behavior, or serial-wait dependents
  become independent direct blockers.
- Focused proof: evidence summary, topology explain, residual semantic-state
  extraction, focused workflow-progress owner tests, package doctor, work
  validation, and representative rerun or migration proof.

## Residual Evidence

1. `replica_operations-p1`: `coordination_mismatch`,
   `publication_recovery_eligible_but_coordinator_excludes_node`,
   `persisted_not_dispatched`, `operation_workflow_owner / workflow_progress`,
   latest operation `PENDING`.
2. `sql_transaction_participants-p1`: `coordination_mismatch`,
   `publication_recovery_eligible_but_coordinator_excludes_node`,
   `persisted_not_dispatched`, `operation_workflow_owner / workflow_progress`,
   latest operation `PENDING`.
3. `sql_transactions-p1`: `needs_operation`, `priority_operation_serial_wait`,
   `transition_deferred`, `operation_workflow_owner / workflow_progress`,
   serial-wait dependent.
4. `sql_write_operations-p1`: `needs_operation`,
   `priority_operation_serial_wait`, `transition_deferred`,
   `operation_workflow_owner / workflow_progress`, serial-wait dependent.

## Out Of Scope

1. `control_plane_publications-p1` recovery-operation creation; that belongs to
   the parked `rebalancer_leader / operation_scheduling` successor.
2. More retry-scheduled handoff runtime code.
3. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.

## Validation

1. Evidence summary:
   `npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json`
2. Topology explain:
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress`
3. Residual semantic-state extraction for `needs_operation` and
   `coordination_mismatch` partitions.
4. Focused owner tests selected by implementation.
5. Representative rolling-restart rerun or explicit migration proof.
6. Package doctor, work validation, and `git diff --check`.
