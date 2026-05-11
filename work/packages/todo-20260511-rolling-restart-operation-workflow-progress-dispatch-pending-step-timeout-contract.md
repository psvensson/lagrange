# Rolling Restart Operation Workflow Progress Dispatch Pending Step Timeout Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_workflow_progress_event_driven",
  "currentState": "The workflow-progress priority recovery package closed as same-frontier classified: focused owner probes are green, but rolling-restart remains red on priority_recovery_partition_progress under operation_workflow_owner / workflow_progress with recovering_in_flight. Blocked partitions reduced to replica_operations-p1, sql_transactions-p1, and sql_write_operations-p1, active gate and snapshot coverage are 3/5, and causal evidence names workflow_step_timeout with next required action reduce_operation_workflow_step_timeout_contract.",
  "nextAction": "Activate this package, run predecessor review/fix sequencing, then build the smallest dispatch-pending operation workflow step-timeout contract probe for the remaining partitions.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/todo-20260511-rolling-restart-operation-workflow-progress-dispatch-pending-step-timeout-contract.md",
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
      "step-timeout proof requires broad workflow coordinator changes outside operation_workflow_owner",
      "representative proof restores rebalancer_handoff, topology_publication_owner, or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If the dispatch-pending operation workflow step-timeout contract is repaired or classified, priority_recovery_partition_progress should reduce, converge, or migrate away from operation_workflow_owner / workflow_progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json",
    "expectedCausalModelChange": "The workflow_step_timeout causal edge either reduces, becomes classified bounded backpressure, or exposes a new named owner boundary.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red on the same workflow-progress frontier until the remaining dispatch-pending step-timeout contract is reduced or migrated.",
    "crossBoundaryReview": "required-before-implementation; review the same-frontier-classified predecessor before activating runtime changes."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md"
}
-->

## Why

The latest representative `rolling-restart` rerun stayed on
`operation_workflow_owner / workflow_progress` but reduced the blocked partition
set from five to three. The causal model now names the remaining local proof as
`workflow_step_timeout` with next required action
`reduce_operation_workflow_step_timeout_contract`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## In Scope

1. Preserve the same-frontier classification from the predecessor.
2. Extract the smallest dispatch-pending operation workflow step-timeout contract
   probe for `replica_operations-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`.
3. Repair or classify the step-timeout contract without reopening rebalancer
   handoff unless fresh evidence restores it.
4. Rerun focused owner tests and one representative `rolling-restart` gate.

## Out Of Scope

1. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
2. Presentation-only relabeling that hides owner-boundary evidence.
3. Broad workflow coordinator rewrites unless the focused proof demonstrates the
   contract cannot be reduced inside operation workflow ownership.

## Validation

1. Evidence summary, topology explain, and causal-model commands from metadata.
2. Focused workflow-progress and priority-recovery owner tests.
3. Touched-file static guardrails selected after activation.
4. `npm run work:validate -- --all` and `git diff --check`.
5. Representative `rolling-restart --fast-local` rerun with the new artifact path.
