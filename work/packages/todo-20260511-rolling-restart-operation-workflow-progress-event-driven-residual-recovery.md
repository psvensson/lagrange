# Rolling Restart Operation Workflow Progress Event Driven Residual Recovery

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "The dispatch-pending step-timeout contract package closed as same-frontier classified. Focused owner probes are green, but rolling-restart remains red on priority_recovery_partition_progress under operation_workflow_owner / workflow_progress with recovering_in_flight. Blocked partitions are control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1; active gate and snapshot coverage remain 3/5.",
  "nextAction": "Activate this package, review the step-timeout predecessor, then continue reducing operation_workflow_owner / workflow_progress event-driven recovery or split only if fresh evidence names a new owner boundary.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/todo-20260511-rolling-restart-operation-workflow-progress-event-driven-residual-recovery.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "event-driven residual proof requires broad workflow coordinator changes outside operation_workflow_owner",
      "representative proof restores rebalancer_handoff, topology_publication_owner, or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If residual event-driven recovery is repaired or classified, priority_recovery_partition_progress should reduce, converge, or migrate away from operation_workflow_owner / workflow_progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json",
    "expectedCausalModelChange": "The event-driven recovery frontier either reduces, becomes classified bounded backpressure, or exposes a new named owner boundary.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red on workflow-progress event-driven recovery for control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1.",
    "crossBoundaryReview": "required-before-implementation; review the same-frontier-classified step-timeout predecessor before runtime changes."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-progress-dispatch-pending-step-timeout-contract.md"
}
-->

## Why

The latest representative `rolling-restart` rerun stayed on
`operation_workflow_owner / workflow_progress` after the step-timeout contract
probe was classified. The remaining blocked partitions are
`control_plane_publications-p1`, `replica_operations-p1`, and
`sql_transactions-p1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## In Scope

1. Preserve the dispatch-pending step-timeout contract proof as predecessor
   evidence.
2. Continue reducing workflow-progress event-driven recovery for the remaining
   blocked partitions.
3. Split to a new owner boundary only if fresh evidence names one.
4. Rerun focused owner tests and one representative `rolling-restart` gate.

## Out Of Scope

1. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
2. Presentation-only relabeling that hides owner-boundary evidence.
3. Broad workflow coordinator rewrites unless the focused proof demonstrates the
   contract cannot be reduced inside operation workflow ownership.
