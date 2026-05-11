# Rolling Restart Operation Workflow Progress Dispatch Pending Step Timeout Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "The dispatch-pending step-timeout owner probes are green and classify timeout-due dispatch-pending snapshots through the stale-progress reconcile owner outcome, but the representative rolling-restart rerun remains red on priority_recovery_partition_progress under operation_workflow_owner / workflow_progress with recovering_in_flight. Blocked partitions are control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1; active gate and snapshot coverage remain 3/5; dominant reason is priority_recovery_event_driven_wait.",
  "nextAction": "Activate `work/packages/active-20260511-rolling-restart-operation-workflow-progress-event-driven-residual-recovery.md` to continue reducing operation_workflow_owner / workflow_progress event-driven recovery for control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/done-20260511-rolling-restart-operation-workflow-progress-dispatch-pending-step-timeout-contract.md",
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
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json",
    "expectedCausalModelChange": "The workflow_step_timeout causal edge either reduces, becomes classified bounded backpressure, or exposes a new named owner boundary.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Rolling-restart remains red on the same workflow-progress frontier after the dispatch-pending step-timeout owner probe; the next local proof must reduce event-driven recovery for control_plane_publications-p1, replica_operations-p1, and sql_transactions-p1 or expose a new owner boundary.",
    "crossBoundaryReview": "completed-before-implementation; predecessor review was clean before this package was activated."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md",
  "closed": "2026-05-11",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260511-rolling-restart-operation-workflow-progress-event-driven-residual-recovery.md"
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
   probe for `control_plane_publications-p1`, `replica_operations-p1`, and
   `sql_transactions-p1`.
3. Repair or classify the step-timeout contract without reopening rebalancer
   handoff unless fresh evidence restores it.
4. Rerun focused owner tests and one representative `rolling-restart` gate.

## Out Of Scope

1. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
2. Presentation-only relabeling that hides owner-boundary evidence.
3. Broad workflow coordinator rewrites unless the focused proof demonstrates the
   contract cannot be reduced inside operation workflow ownership.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: operation workflow owner workflow-progress step-timeout contract,
  focused workflow-progress and priority-recovery tests, this package,
  sprint/current-blocker handoff files, and model-ledger evidence.
- Forbidden files: startup active-gate owner implementation, topology
  publication convergence, harness timeout configuration, Pro or Enterprise
  surfaces.
- Frozen decisions: the current frontier remains operation workflow progress on
  priority recovery; rebalancer handoff and publication convergence stay
  predecessor proof unless fresh evidence restores them.
- Escalation triggers: the step-timeout proof requires broad workflow
  coordinator changes outside operation workflow ownership; representative proof
  restores another owner boundary; runtime implementation would need paid-edition
  behavior.
- Focused proof: causal-model step-timeout evidence, focused owner tests, touched
  file guardrails, and one representative rolling-restart rerun.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent code-review (9b4b6a10-2e64-4b77-a6d2-13e4e4a4d8b9) reviewed work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent copilot-cli-implementation (8d09056b-4044-4bb7-a5e1-2a3fe45f31e5) implemented work/packages/done-20260511-rolling-restart-operation-workflow-progress-dispatch-pending-step-timeout-contract.md.

## Validation

1. Evidence summary, topology explain, and causal-model commands from metadata.
2. Focused workflow-progress and priority-recovery owner tests.
3. Touched-file static guardrails selected after activation.
4. `npm run work:validate -- --all` and `git diff --check`.
5. Representative `rolling-restart --fast-local` rerun with the new artifact path.


## Implementation Result

Result: `same-frontier-classified`. The owner-path change lets the async
partition snapshot path consume the same dispatch-pending owner normalization as
the direct snapshot path. Timeout-due dispatch-pending snapshots now carry the
canonical `reconcile_stale_progress` owner outcome while preserving bounded
remote wake scheduling outside snapshot normalization.

Representative rerun:
`test-output/reports/rolling-restart-current-release-gate-after-dispatch-pending-step-timeout-contract-fix.report.json`
remained red. The normalized owner frontier is still
`priority_recovery_partition_progress` under
`operation_workflow_owner / workflow_progress`, state `retryable`, dominant
reason `priority_recovery_event_driven_wait`. Blocked partitions are
`control_plane_publications-p1`, `replica_operations-p1`, and
`sql_transactions-p1`; active gate and snapshot coverage remain `3/5`.

## Commit And Push Ledger

1. Focused package commit: `08e2ec8e657ed03f4ae456efb724e79dff992823`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes.

## Proof Run

- Baseline evidence summary/topology explain/causal-model commands: passed.
- Focused owner tests:
  `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
  passed (`98/98`).
- Touched runtime guardrails for
  `src/rebalancer/operation-workflow-owner.js` and
  `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`: literals,
  decision-boundaries, and runtime-grammar passed.
- `git diff --check`: passed.
- Representative `rolling-restart --fast-local`: red, same frontier, artifact
  above.

## Closure / Handoff

This package is closed as same-frontier classified. The successor proof should
continue reducing `operation_workflow_owner / workflow_progress` event-driven
recovery for `control_plane_publications-p1`, `replica_operations-p1`, and
`sql_transactions-p1`, or split only if fresh evidence names a new owner
boundary.
