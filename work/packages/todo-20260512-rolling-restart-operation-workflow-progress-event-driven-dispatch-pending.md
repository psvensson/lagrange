# Rolling Restart Operation Workflow Progress Event Driven Dispatch Pending

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-12",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "The rebalancer-handoff retry-scheduled V2 package migrated rolling-restart away from operation_workflow_owner / rebalancer_handoff and restored operation_workflow_owner / workflow_progress as the first priority recovery frontier. The latest evidence is event-driven dispatch-pending progress on control_plane_publications-p1 and sql_transaction_participants-p1; active gate and snapshot coverage remain downstream at 2/5.",
  "nextAction": "Activate this package and reduce the restored operation_workflow_owner / workflow_progress event-driven dispatch-pending priority recovery frontier while preserving the rebalancer-handoff retry-scheduled reduction.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-current-release-gate-after-workflow-progress-event-driven-dispatch-pending-fix.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/todo-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md",
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
      "event-driven dispatch-pending proof requires changes outside operation_workflow_owner",
      "representative proof restores topology_publication_owner or startup_active_gate_owner as the direct blocker",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If workflow-progress event-driven dispatch-pending recovery is repaired or classified, priority_recovery_partition_progress should reduce, converge, or migrate away from operation_workflow_owner / workflow_progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-current-release-gate-after-rebalancer-handoff-retry-scheduled-v2-fix.report.json",
    "expectedCausalModelChange": "The event-driven dispatch-pending frontier either advances, becomes classified bounded backpressure, or exposes a new named owner boundary.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Rolling-restart remains red on workflow-progress event-driven dispatch-pending priority recovery for control_plane_publications-p1 and sql_transaction_participants-p1.",
    "crossBoundaryReview": "required-before-implementation; review the rebalancer-handoff retry-scheduled V2 predecessor before runtime changes."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart workflow-progress event-driven dispatch-pending probe",
    "phaseChain": [
      "publication convergence",
      "operation workflow dispatch and retry",
      "startup active-gate presentation"
    ],
    "currentFirstFrontier": "operation_workflow_owner / workflow_progress / priority_recovery_event_driven_wait on control_plane_publications-p1 and sql_transaction_participants-p1",
    "knownDownstreamBlockers": [
      "startup_active_gate_owner snapshot coverage remains downstream at 2/5",
      "publication_missing_active_node is presentation evidence while publication_ack_convergence remains satisfied"
    ],
    "missingCausalEdge": "workflow-progress dispatch-pending retry wake must be proven before downstream active-gate closure is pursued",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "boundedProgressProof": "Focused owner tests must prove dispatch-pending wake, retry, timeout, and dispatch advance through bounded owner progress rather than prose-only classification.",
    "boundedProgressProofArtifact": "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js; test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "Before: control_plane_publications-p1 and sql_transaction_participants-p1 stay dispatch-pending workflow_progress; after: they advance through retry/timeout dispatch or are classified bounded non-frontier with named evidence.",
    "maxProgressBound": "one owner wake/retry/timeout dispatch cycle per blocked partition before same-frontier fallback",
    "sameFrontierFallback": "keep operation_workflow_owner / workflow_progress active and do not pursue startup active-gate closure",
    "expectedNextFrontier": "workflow_progress reduces, becomes bounded non-frontier, or migrates to a named downstream owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-20260511-rolling-restart-operation-workflow-rebalancer-handoff-retry-scheduled-v2.md"
}
-->

## Why

The latest representative `rolling-restart` rerun migrated away from
`operation_workflow_owner / rebalancer_handoff` and restored
`operation_workflow_owner / workflow_progress` as the first priority recovery
frontier. The dominant evidence is event-driven dispatch-pending progress on
`control_plane_publications-p1` and `sql_transaction_participants-p1`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees in the Community / AGPL repo.

## Scenario Causal Closure Handoff

- Focused missing edge probe: `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Proof artifact expectation: `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`; `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Observable transition: before, `control_plane_publications-p1` and `sql_transaction_participants-p1` stay dispatch-pending in `workflow_progress`; after, they advance through retry/timeout dispatch or are classified bounded non-frontier with named evidence.
- Max progress bound: one owner wake/retry/timeout dispatch cycle per blocked partition before same-frontier fallback.
- Same-frontier fallback: keep `operation_workflow_owner / workflow_progress` active and do not pursue startup active-gate closure.

## In Scope

1. Preserve the rebalancer-handoff retry-scheduled reduction as predecessor
   proof.
2. Focus on event-driven dispatch-pending workflow progress for the named
   blocked partitions.
3. Split to a new owner boundary only if fresh evidence names one.
4. Rerun focused owner tests and one representative `rolling-restart` gate.

## Out Of Scope

1. Startup active-gate, publication-convergence, harness timeout, Pro, or
   Enterprise behavior.
2. Presentation-only relabeling that hides owner-boundary evidence.
