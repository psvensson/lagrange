# Rolling Restart Rebalancer Leader Operation Scheduling Control Plane Publications Create Recovery Operation

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo",
  "intent": {
    "opened": "2026-05-12",
    "lane": "scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
    "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix/rolling-restart/",
    "owner": "rebalancer_leader",
    "boundary": "operation_scheduling",
    "dominantReason": "eligible_but_no_operation_created",
    "currentState": "Parked split successor from the needs_operation / coordination_mismatch classification. The latest artifact has one direct operation-scheduling witness: control_plane_publications-p1 is needs_operation, eligible_but_no_operation_created, action_required, rebalancer_leader / operation_scheduling, event_driven, and next action create_recovery_operation.",
    "nextAction": "Keep parked until the workflow-progress coordinator-excludes-node successor is fixed, reduced, or fresh evidence promotes this operation-scheduling witness as the first selected owner boundary. When activated, determine why control_plane_publications-p1 remains eligible without a created recovery operation.",
    "predecessor": "work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-needs-operation-coordination-mismatch-classification.md"
  },
  "scope": {
    "writeScope": [],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": []
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "Parked split successor from the needs_operation / coordination_mismatch classification. The latest artifact has one direct operation-scheduling witness: control_plane_publications-p1 is needs_operation, eligible_but_no_operation_created, action_required, rebalancer_leader / operation_scheduling, event_driven, and next action create_recovery_operation."
  },
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/parked-split-successor",
    "outputProfile": "medium",
    "escalationTriggers": [
      "workflow-progress direct blockers remain unresolved and still dominate the selected successor order",
      "the fix requires startup active-gate, publication convergence, harness timeout, Pro, or Enterprise behavior",
      "fresh evidence changes the witness from operation scheduling to workflow progress"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json",
        "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled-fix.report.json --explain priority_recovery_partition_progress",
        "jq residual semantic-state extraction for needs_operation and coordination_mismatch partitions",
        "focused rebalancer_leader / operation_scheduling tests selected by implementation package",
        "representative rolling-restart rerun or explicit migration proof"
      ]
    }
  },
  "touchedFiles": [
    "work/packages/todo-20260512-rolling-restart-rebalancer-leader-operation-scheduling-control-plane-publications-create-recovery-operation.md"
  ]
}
-->

## Why

The classification package split the residual. This parked successor owns the
single direct `rebalancer_leader / operation_scheduling` witness:
`control_plane_publications-p1` is eligible but has no recovery operation
created, and its next required action is `create_recovery_operation`.

This package is intentionally parked behind the workflow-progress successor
because the latest artifact also has two direct workflow-progress
coordination-mismatch witnesses and two serial-wait dependents of those
operations.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/parked-split-successor`
- Owned files: this package when activated, selected
  `rebalancer_leader / operation_scheduling` runtime and test files named by
  the implementation package, active sprint handoff, generated current-blocker
  files, and `work/model-ledger.jsonl`.
- Forbidden files and behavior: operation workflow coordinator-excludes-node
  fixes, retry-scheduled handoff runtime code, startup active-gate
  implementation, topology publication convergence implementation, harness
  timeout increases, Pro or Enterprise behavior.
- Frozen decisions: workflow-progress coordinator-excludes-node is the first
  selected split successor; this package remains parked until that successor is
  fixed, reduced, or fresh evidence promotes operation scheduling.
- Escalation triggers: the package becomes active before workflow-progress
  direct blockers are handled, the fix requires out-of-scope behavior, or fresh
  evidence changes the semantic owner.
- Focused proof: evidence summary, topology explain, residual semantic-state
  extraction, focused operation-scheduling owner tests, package doctor, work
  validation, and representative rerun or migration proof.

## Residual Evidence

1. `control_plane_publications-p1`: `needs_operation`,
   `eligible_but_no_operation_created`, `action_required`,
   `rebalancer_leader / operation_scheduling`, next action
   `create_recovery_operation`.

## Out Of Scope

1. `replica_operations-p1` and `sql_transaction_participants-p1`
   coordinator-excludes-node workflow-progress work.
2. `sql_transactions-p1` and `sql_write_operations-p1` serial-wait dependents
   of workflow-progress operations.
3. More retry-scheduled handoff runtime code.
4. Startup active-gate, publication-convergence, harness timeout, Pro, or
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
