# Rolling Restart Operation Workflow Rebalancer Handoff Retry Scheduled V2

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The residual workflow-progress package migrated rolling-restart back to operation_workflow_owner / rebalancer_handoff. The priority recovery frontier remains first with retry_scheduled evidence on control_plane_publications-p1, active gate and snapshot coverage are 2/5, and startup active-gate coverage remains downstream.",
  "nextAction": "Activate this package, review the residual workflow-progress predecessor, then focus on the rebalancer-handoff retry-scheduled priority recovery frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/todo-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled-v2.md",
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
      "handoff retry proof requires changes outside operation_workflow_owner",
      "representative proof restores topology_publication_owner or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If rebalancer-handoff retry scheduling is repaired or classified, priority_recovery_partition_progress should reduce, converge, or migrate away from operation_workflow_owner / rebalancer_handoff.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-event-driven-residual-recovery-fix.report.json",
    "expectedCausalModelChange": "The retry_scheduled handoff either advances, becomes bounded non-frontier retry state, or exposes a new named owner boundary.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red on rebalancer-handoff retry scheduling for priority recovery.",
    "crossBoundaryReview": "required-before-implementation; review the migrated residual workflow-progress predecessor before runtime changes."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-residual-recovery.md"
}
-->

## Why

The latest representative `rolling-restart` rerun migrated from workflow-progress
event-driven wait back to `operation_workflow_owner / rebalancer_handoff`.
Priority recovery remains the first frontier with retry-scheduled evidence on
`control_plane_publications-p1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## In Scope

1. Preserve the residual workflow-progress reduction as predecessor proof.
2. Focus on the retry-scheduled rebalancer-handoff priority recovery frontier.
3. Repair or classify the handoff retry without reopening workflow-progress
   event-driven residuals unless fresh evidence restores them.
4. Rerun focused owner tests and one representative `rolling-restart` gate.

## Out Of Scope

1. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
2. Presentation-only relabeling that hides owner-boundary evidence.
