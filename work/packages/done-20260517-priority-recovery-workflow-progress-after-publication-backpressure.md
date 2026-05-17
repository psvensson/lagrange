# Priority Recovery Workflow Progress After Publication Backpressure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "Focused workflow-progress proof is green for the current residual shape. The added regression models control_plane_publications-p1 operation 96c522ac-95c7-4713-96da-a98010d295d9 as PENDING, persisted_not_dispatched, event_driven, timeoutReconcileDue=false, and completion blocked by active_operation_still_blocks_spread. Existing operation_workflow_owner code emits wake_remote_owner, does not drain while spread remains blocked, arms one bounded owner re-entry timer, and that timer wakes the canonical target owner. No runtime change was required; the reference representative artifact remains same-frontier because it was not rerun after test-only proof.",
  "nextAction": "Stop workflow_progress runtime edits in this package unless a fresh representative artifact changes owner, boundary, or required action. The current workflow_progress witness is bounded by retry/timer/wake proof; keep publication ACK, active-gate snapshot coverage, timeout budgets, admission, readiness, selected-source timeout, and rebalancer_handoff implementation frozen unless canonical evidence promotes them in a separate package.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-literals.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "node scripts/check-guideline-decision-boundaries.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md",
    "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
  ,
  "representativeResidual": {
    "status": "same-frontier-focused-proof",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Focused proof shows the workflow-progress witness has a bounded retry/timer/wake path for operation 96c522ac-95c7-4713-96da-a98010d295d9. Do not continue workflow_progress runtime edits or promote the rebalancer_handoff split without fresh canonical evidence or an explicit successor package."
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the current priority-recovery backpressure, dispatch_pending/planned operation 96c522ac-95c7-4713-96da-a98010d295d9 should have a bounded advance, retry, wake, or classification path without reopening publication ACK or active-gate snapshot coverage.",
    "stopConditionCheck": "Canonical extractors were run first, including npm run analyze:causal-model on the reference artifact; focused owner proof was added for the current workflow_progress witness. Agent Pascal (019e3703-c285-78f3-9099-ddd84b7422a5) implemented the proof. No runtime edits were made.",
    "expectedCausalModelChange": "Focused proof classifies the workflow_progress witness as bounded retry/timer/wake progress. Representative rolling-restart was not rerun because this package changed only focused test proof.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Publication convergence classified the remaining wait as priority-recovery backpressure. The workflow_progress witness is now proved bounded locally; the rebalancer_handoff residual remains a parked split and must not be edited inside this workflow_progress package unless canonical evidence promotes it.",
    "crossBoundaryReview": "Review work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md before implementation starts."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication handoff edge after publication classification",
    "phaseChain": [
      "consume closed publication-convergence classification proof",
      "use priority residual extraction to isolate workflow_progress versus rebalancer_handoff split",
      "run review and fix subagents before implementation starts",
      "run a fresh implementation subagent for workflow_progress only",
      "add focused owner proof for the workflow_progress witness",
      "rerun focused owner tests; skip representative rerun because no runtime code changed"
    ],
    "currentFirstFrontier": "publication_ack_convergence remains visible in test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json, but causal stop is classified_backpressure and the topology next expected frontier is operation_workflow_owner / workflow_progress.",
    "knownDownstreamBlockers": [
      "publicationStatus remains OPEN with seed-only publishedActiveNodeIds and missingPublishedCount 4",
      "publicationActiveGateHandoff is pending owner_reconcile_pending with count 2",
      "priority residual extraction reports workflow_progress persisted_not_dispatched/event_driven witness count 1",
      "priority residual extraction reports parked rebalancer_handoff dispatched_waiting_progress/retry_scheduled witness count 2",
      "active-gate snapshot coverage remains deferred at 3/5 behind publication and priority recovery"
    ],
    "missingCausalEdge": "The operation workflow owner has a dispatch_pending/planned priority recovery operation whose next action is advance_existing_operation, but representative evidence still times out with prioritySpread pending.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture",
    "boundedProgressProof": "Focused proof added in test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js: operation 96c522ac-95c7-4713-96da-a98010d295d9 on control_plane_publications-p1 remains PENDING and blocked while existing owner logic emits wake_remote_owner, does not drain, arms one bounded owner re-entry timer, and the timer wakes the target owner.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json plus npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "expectedObservableTransition": "Focused observable transition: persisted_not_dispatched/event_driven workflow_progress evidence advances to bounded owner re-entry timer and remote wake without changing publication-owner or active-gate code. Representative transition is same-frontier because no runtime change was made and no representative rerun was required.",
    "maxProgressBound": "one focused operation_workflow_owner / workflow_progress slice",
    "sameFrontierFallback": "Applied: workflow_progress remains the same representative artifact owner/action, but focused proof shows bounded progress. Stop as same-frontier instead of widening into publication ACK, active gate, timeout budgets, admission, readiness, selected-source timeout, or rebalancer_handoff implementation.",
    "expectedNextFrontier": "rebalancer_handoff only if a fresh representative artifact or explicit successor package promotes it; active_gate_snapshot_coverage only after publication and priority recovery stop blocking",
    "resultClassification": "same-frontier",
    "stopCondition": "bounded-non-frontier",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md / topology_publication_owner / publication_convergence / classification-only",
      "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout-after-publication-migration.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This successor is allowed because fresh causal and priority residual evidence selected operation_workflow_owner / workflow_progress after the publication package classified the remaining wait as priority recovery backpressure.",
    "handoffInvariant": "Publication ACK, publication owner evidence, active-gate snapshot coverage, timeout budgets, admission, readiness, selected-source timeout, and rebalancer_handoff remain frozen unless canonical evidence selects them."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "Fresh representative evidence after publication-owner canonicalization stops as classified priority-recovery backpressure and names operation_workflow_owner / workflow_progress as the topology next expected frontier.",
    "evidence": [
      "work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md"
}
-->

## Why

Fresh publication-convergence evidence still leaves rolling-restart red, but
the remaining wait is no longer a publication-owner code change. The causal
model classifies it as priority-recovery backpressure and the topology graph
names `operation_workflow_owner / workflow_progress` as the next expected
frontier.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: bounded representative owner-boundary successor
  on a single workflow-progress operation witness.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run review, fix if needed, and implementation subagents
sequentially before editing runtime files.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Banach (019e3700-53af-7922-9fc0-eca0346fd9e1) reviewed work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Pascal (019e3703-c285-78f3-9099-ddd84b7422a5) implemented work/packages/active-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. work/model-ledger.jsonl
5. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js

## Out Of Scope

1. topology_publication_owner implementation
2. startup_active_gate_owner implementation
3. timeout_budgets
4. active_gate_admission
5. readiness_support
6. selected_source_timeout
7. operation_workflow_owner / rebalancer_handoff implementation unless fresh canonical evidence promotes it

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Forbidden files: `topology_publication_owner implementation`, `startup_active_gate_owner implementation`, `timeout_budgets`, `active_gate_admission`, `readiness_support`, `selected_source_timeout`, `operation_workflow_owner / rebalancer_handoff implementation unless fresh canonical evidence promotes it`
- Frozen decisions: publication-convergence classification is closed; active-gate snapshot coverage is deferred; rebalancer_handoff is a parked split; this package owns workflow_progress only unless canonical evidence changes owner or boundary.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress`, `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
5. npm run analyze:owner-files -- operation_workflow_owner workflow_progress
6. npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff
7. npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
8. npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
9. node scripts/check-guideline-literals.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
10. node scripts/check-guideline-decision-boundaries.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js

## Focused Proof Result

Same-frontier focused proof. The workflow-progress residual for
`control_plane_publications-p1` operation
`96c522ac-95c7-4713-96da-a98010d295d9` is bounded by the existing
operation-owner re-entry path: the focused test keeps the row PENDING,
`persisted_not_dispatched`, event-driven, and blocked by active spread; the
owner outcome is `wake_remote_owner`, the operation does not drain, one bounded
owner re-entry timer is armed, and that timer wakes the canonical target owner.

No runtime file was changed. Representative rolling-restart was not rerun
because this package only added focused proof; the reference artifact remains
the same-frontier evidence until a runtime change or successor package produces
a fresh representative artifact.

## Commit And Push Ledger

1. Focused package commit: `bb96c3350a39820fab405512196f0847de9ae4b2`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
