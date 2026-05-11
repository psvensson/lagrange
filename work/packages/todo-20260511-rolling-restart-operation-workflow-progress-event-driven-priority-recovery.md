# Rolling Restart Operation Workflow Progress Event Driven Priority Recovery

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-11",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_workflow_progress_event_driven",
  "currentState": "The rebalancer-handoff retry package migrated the representative rolling-restart frontier back to operation_workflow_owner / workflow_progress on priority_recovery_partition_progress with recovering_in_flight and dominant source reason priority_recovery_workflow_progress_event_driven.",
  "nextAction": "Activate this package, review/fix the predecessor bookkeeping result, then build the smallest workflow-progress event-driven priority recovery probe before runtime changes.",
  "proof": [
    "npm run work:package:evidence-block -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-priority-recovery-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/todo-20260511-rolling-restart-operation-workflow-progress-event-driven-priority-recovery.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
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
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-fix.report.json",
    "expectedCausalModelChange": "The workflow-progress event-driven wait either advances, becomes bounded owner-internal retry state, or migrates to a new named owner boundary.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red until the migrated workflow-progress frontier is reduced or names the next owner boundary.",
    "crossBoundaryReview": "required-before-implementation; predecessor review found bookkeeping fixes handled before this package is activated."
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled.md"
}
-->

## Why

The latest representative rolling-restart artifact no longer selects
`operation_workflow_owner / rebalancer_handoff`. The first frontier migrated to
`operation_workflow_owner / workflow_progress` on
`priority_recovery_partition_progress` with dominant reason
`priority_recovery_workflow_progress_event_driven`.

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

## Validation

1. Evidence block, topology explain, and causal-model commands from metadata.
2. Focused workflow-progress and priority-recovery owner tests.
3. Touched-file static guardrails selected after activation.
4. `npm run work:validate -- --all` and `git diff --check`.
5. Representative `rolling-restart --fast-local` rerun with the new artifact path.
