# Rolling Restart Operation Workflow Progress Event Driven Priority Recovery

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_workflow_progress_event_driven",
  "currentState": "Focused workflow-progress owner probes are green. The representative rerun remains red on the same priority_recovery_partition_progress frontier under operation_workflow_owner / workflow_progress with recovering_in_flight, but reduced blocked partitions from five to three: replica_operations-p1, sql_transactions-p1, and sql_write_operations-p1. Active gate and snapshot coverage are now 3/5.",
  "nextAction": "Activate `work/packages/active-20260511-rolling-restart-operation-workflow-progress-dispatch-pending-step-timeout-contract.md` for the remaining dispatch-pending operation workflow step-timeout contract on replica_operations-p1, sql_transactions-p1, and sql_write_operations-p1.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md",
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
      "workflow-progress proof requires predecessor-owned segment-7-stage-5 edits",
      "representative proof restores rebalancer_handoff, topology_publication_owner, or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If event-driven priority recovery workflow progress is repaired or classified, priority_recovery_partition_progress should reduce, converge, or migrate away from operation_workflow_owner / workflow_progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json",
    "expectedCausalModelChange": "The workflow-progress event-driven wait either advances, becomes bounded owner-internal retry state, or migrates to a new named owner boundary.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Rolling-restart remains red on the same operation_workflow_owner / workflow_progress frontier; remaining evidence points to the dispatch-pending operation workflow step-timeout contract on replica_operations-p1, sql_transactions-p1, and sql_write_operations-p1.",
    "crossBoundaryReview": "completed-before-implementation; predecessor review found bookkeeping fixes that were fixed before this package was activated."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md",
  "closed": "2026-05-11",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260511-rolling-restart-operation-workflow-progress-dispatch-pending-step-timeout-contract.md"
}
-->

## Why

The latest representative rolling-restart artifact no longer selects
`operation_workflow_owner / rebalancer_handoff`. The first frontier migrated to
`operation_workflow_owner / workflow_progress` on
`priority_recovery_partition_progress` with dominant reason
`priority_recovery_workflow_progress_event_driven`.
The focused owner-path probe is the dispatch-pending event-driven re-entry
fixture in `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`; it verifies that the owner schedules the canonical remote wake through
`schedulePriorityRecoveryDispatchPendingReentry` and suppresses duplicate wakes
while the bounded retry lane is active.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## In Scope

1. Preserve the rebalancer-handoff reduction as predecessor proof.
2. Extract the smallest workflow-progress event-driven priority recovery probe
   from the cited artifact or playback.
3. Repair or classify the event-driven workflow-progress frontier.
4. Rerun the focused owner tests and one representative rolling-restart gate.

## Out Of Scope

1. `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, which is
   predecessor-owned for this migration unless fresh proof makes it current.
2. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
3. Presentation-only relabeling that hides owner-boundary evidence.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `src/rebalancer/operation-workflow-owner.js`, focused
  workflow-progress/priority-recovery tests, this package, sprint/current
  blocker handoff files.
- Forbidden files: `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`,
  startup active-gate owner implementation, harness timeout configuration, Pro
  or Enterprise surfaces.
- Frozen decisions: the current frontier is workflow progress, not rebalancer
  handoff or publication convergence, unless fresh representative evidence
  migrates it again.
- Escalation triggers: predecessor-owned file edits, a restored non-workflow
  owner boundary, or paid-edition behavior.
- Focused proof: `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent code-review (9b4b6a10-2e64-4b77-a6d2-13e4e4a4d8b9) reviewed work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent copilot-cli-fix (da97f155-8b4c-4ad2-8e32-1a2e4e0b8d9a) fixed work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md.
- [x] Implementation subagent recorded: Agent copilot-cli-implementation (7fb345ac-89a0-4b44-8f9e-0f3277f0e4fb) implemented work/packages/done-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md.

## Validation

1. Evidence block, topology explain, and causal-model commands from metadata.
2. Focused workflow-progress and priority-recovery owner tests.
3. Touched-file static guardrails selected after activation.
4. `npm run work:validate -- --all` and `git diff --check`.
5. Representative `rolling-restart --fast-local` rerun with the new artifact path.


## Implementation Result

Result: `same-frontier-classified`. The package-owned owner probe was repaired to
call the canonical scheduling entry point and now proves duplicate event-driven
owner wakes are suppressed while the remote handoff retry lane is active. No
runtime owner file change was required; `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js` stayed untouched.

## Commit And Push Ledger

1. Focused package commit: `118beb34a932bfea22ef43af0b4cfefa4f0a06fe`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation Evidence

- Baseline evidence block, topology explain, and causal model were rerun for
  `test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json`; baseline frontier was
  `operation_workflow_owner / workflow_progress`, retryable, with five blocked
  partitions and event-driven wait.
- Focused tests: `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js` -> `98/98` pass.
- Runtime guardrails for `src/rebalancer/operation-workflow-owner.js`: literal,
  decision-boundary, and runtime-grammar checks -> pass.
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json --fast-local --verbose` -> red, same frontier.
- Rerun evidence: first frontier remains `priority_recovery_partition_progress`,
  owner `operation_workflow_owner`, boundary `workflow_progress`, reason
  `priority_recovery_event_driven_wait`; blocked partitions reduced to
  `replica_operations-p1`, `sql_transactions-p1`, and
  `sql_write_operations-p1`; active gate/snapshot coverage is `3/5`.
- Causal model outcome: `accept_classified_backpressure`; budget evidence names
  `workflow_step_timeout` with next required action
  `reduce_operation_workflow_step_timeout_contract`.

## Closure / Handoff

This package is closed as same-frontier classified. The representative gate is
still red on the same owner boundary. The successor proof targets the remaining
dispatch-pending operation workflow step-timeout contract for
`replica_operations-p1`, `sql_transactions-p1`, and `sql_write_operations-p1`
using the latest artifact above.
