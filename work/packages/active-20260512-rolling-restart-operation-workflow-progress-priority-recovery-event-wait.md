# Rolling Restart Operation Workflow Progress Priority Recovery Event Wait

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-12",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "Focused workflow-progress proof first failed because active coordinator-created rebalancer handoff retries were flattened into generic event-driven workflow progress. The runtime fix lets active handoff retries pass through the operation workflow adapter, producing the canonical wait_for_rebalancer_handoff_retry owner observation while the existing scheduler prevents duplicate wakes. Focused tests and owner guardrails are green. The representative rerun remains red, but the normalized frontier migrated from operation_workflow_owner / workflow_progress to operation_workflow_owner / rebalancer_handoff with retryable priority_recovery_event_driven_wait and source dominantReason priority_recovery_rebalancer_handoff_retry_scheduled on control_plane_publications-p1, replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1. Publication ACK convergence remains satisfied. Startup active-gate snapshot coverage remains downstream at 2/5.",
  "nextAction": "Treat the workflow-progress edge as reduced and continue from the migrated operation_workflow_owner / rebalancer_handoff boundary. Prove the retry-scheduled remote handoff backpressure drains, stays explicitly bounded, or exposes a new owner boundary. Do not reopen startup active-gate or publication convergence from this package.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-5-stage-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/active-20260512-rolling-restart-operation-workflow-progress-priority-recovery-event-wait.md",
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
      "focused proof requires reopening rebalancer_leader operation scheduling",
      "proof requires startup active-gate implementation or harness timeout increases",
      "representative proof restores publication_ack_convergence as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If operation workflow progress owns the recovering_in_flight priority recovery wait, the selected operations should advance, remain explicitly bounded retryable work, reduce the priority recovery frontier, or migrate to a new owner boundary.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-leader-operation-scheduling-priority-recovery-fix.report.json",
    "expectedCausalModelChange": "The priority_recovery_event_driven_wait frontier either remains classified bounded backpressure, reduces, converges, or exposes a new named owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "Rolling-restart remains red while priority recovery rebalancer handoff retry-scheduled work is retryable and active-gate snapshot coverage remains downstream at 2/5.",
    "crossBoundaryReview": "required-before-implementation through a fresh review of work/packages/done-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart operation workflow progress priority recovery event wait probe",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation scheduling",
      "operation workflow dispatch and retry",
      "startup active-gate presentation"
    ],
    "currentFirstFrontier": "operation_workflow_owner / rebalancer_handoff / priority_recovery_event_driven_wait with retry-scheduled handoff evidence on control_plane_publications-p1, replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner snapshot coverage remains downstream at 2/5",
      "publication_ack_convergence remains satisfied with PUBLISHED and zero pending ACKs"
    ],
    "missingCausalEdge": "operation workflow owner must either drain retry-scheduled remote handoff backpressure to visible progress, keep it explicitly bounded, or migrate to a new named owner boundary.",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "boundedProgressProof": "Focused workflow-progress proof shows the active handoff retry is classified by the canonical operation owner outcome; representative proof migrated the remaining wait to the rebalancer_handoff boundary.",
    "boundedProgressProofArtifact": "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js; test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js; test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "recovering_in_flight operations advance, stay explicitly bounded as retryable rebalancer handoff wait, reduce blocked partition count, or migrate to another named owner boundary.",
    "maxProgressBound": "one workflow-progress owner cycle or focused timeout/progress probe for the selected priority recovery operation set",
    "sameFrontierFallback": "continue from operation_workflow_owner / rebalancer_handoff and do not pursue startup active-gate closure",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage after priority recovery progress is satisfied or explicitly non-frontier",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "predecessor": "work/packages/done-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md"
}
-->

## Why

The rebalancer-leader scheduling fix reduced the prior `needs_operation`
frontier. Fresh representative evidence now shows priority recovery operations
exist and are `recovering_in_flight`, so the remaining first frontier belongs to
operation workflow progress, not operation scheduling.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: operation workflow owner progress/timeout files, focused
  workflow-progress tests, this package, generated current-blocker files,
  `work/model-ledger.jsonl`, and the active sprint file only if current-blocker
  truth requires it.
- Forbidden files and behavior: rebalancer leader operation scheduling unless
  fresh proof regresses to that owner, startup active-gate implementation,
  topology publication convergence implementation, harness timeout increases,
  Pro or Enterprise behavior.
- Frozen decisions: publication ACK convergence is satisfied/non-frontier;
  rebalancer leader operation scheduling has created recovery work and is not
  the current owner boundary; startup active-gate remains downstream.
- Escalation triggers: focused proof requires reopening scheduling, startup
  active-gate, publication convergence, or broad architecture/budget behavior.
- Focused proof: `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Pascal (019e1bf1-8c62-79a1-9f78-94508c6c657f) reviewed
      `work/packages/done-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Volta (019e1bf6-d12a-7a60-a185-c96094be1c8f) fixed
      `work/packages/done-20260512-rolling-restart-rebalancer-leader-operation-scheduling-priority-recovery.md`.
- [x] Implementation subagent recorded:
      Agent Dirac (019e1bfb-56ef-7020-ae64-d41ab296ca97) implemented
      `work/packages/active-20260512-rolling-restart-operation-workflow-progress-priority-recovery-event-wait.md`.

## In Scope

1. Review the closed rebalancer-leader operation scheduling package before
   activation.
2. Classify or own the `recovering_in_flight` priority recovery workflow
   progress wait.
3. Add or extend focused tests that prove dispatch, retry, timeout, progress, or
   bounded wait classification.
4. Rerun selected static guardrails for touched operation-workflow owner files.
5. Rerun one representative `rolling-restart --fast-local` gate or classify the
   unchanged frontier with focused proof.

## Out Of Scope

1. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
2. Rebalancer leader operation scheduling changes unless fresh focused evidence
   proves regression to `needs_operation`.
3. Presentation-only relabeling that hides owner-boundary evidence.

## Implementation Notes

- Focused proof initially failed in
  `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`:
  active handoff retries were normalized as generic `workflow_progress`
  / `event_driven` waits with no operation-owner observation.
- Runtime change:
  `src/rebalancer/operation-workflow-owner.js` now allows
  `REBALANCER_HANDOFF_RETRY_ACTIVE` through dispatch-pending owner snapshot
  normalization. The existing operation workflow adapter emits the canonical
  `wait_for_rebalancer_handoff_retry` outcome, and the existing re-entry
  scheduler keeps duplicate remote wakes closed while a bounded handoff retry
  is active.
- No changes were made to rebalancer leader operation scheduling, startup
  active-gate, publication convergence, harness timeouts, or paid-edition
  behavior.

## Validation Notes

- Failed before fix:
  `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
  failed 4 assertions in the scheduled handoff retry snapshot probe.
- Passed after fix:
  `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
  with `177` passing assertions.
- Passed after fix:
  `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`
  reported `0` new literal-guideline violations and `0` inherited baseline
  violations.
- Passed after fix:
  `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`
  reported `0` decision-boundary violations.
- Passed after fix:
  `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-5-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`
  reported `0` runtime-grammar-contract violations.
- Representative rerun:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-operation-workflow-progress-priority-recovery-event-wait-fix.report.json --fast-local --verbose`
  failed the rolling-restart gate, but the normalized topology evidence
  migrated the frontier from `operation_workflow_owner / workflow_progress`
  to `operation_workflow_owner / rebalancer_handoff`.
- Evidence summary for the representative rerun:
  `priority_recovery_partition_progress` remains `retryable`; owner
  `operation_workflow_owner`; boundary `rebalancer_handoff`; source
  dominantReason `priority_recovery_rebalancer_handoff_retry_scheduled`;
  causal stop condition `classified_backpressure`; failed invariant count `0`.
