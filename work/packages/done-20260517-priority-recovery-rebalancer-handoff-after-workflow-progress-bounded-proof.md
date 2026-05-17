# Priority Recovery Rebalancer Handoff After Workflow Progress Bounded Proof

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
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Classification-only focused proof is green for the rebalancer_handoff split after workflow_progress bounded proof. Canonical residual extraction still reports two duplicate dispatched_waiting_progress/retry_scheduled witnesses for control_plane_publications-p1 operation 96c522ac-95c7-4713-96da-a98010d295d9 with nextRequiredAction wait_for_operation_progress, and the focused regression proves that duplicate witnesses preserve one active bounded remote handoff retry without duplicate remote wakes.",
  "nextAction": "Stop rebalancer_handoff runtime edits for this same-artifact residual unless fresh canonical evidence changes owner, boundary, or required action. The retry-scheduled handoff witness is bounded by the existing remote handoff retry lane; publication ACK, active-gate snapshot coverage, timeout budgets, admission, readiness, selected-source timeout, and workflow_progress implementation remain frozen.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress",
    "npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-literals.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-decision-boundaries.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md",
    "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
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
  },
  "representativeResidual": {
    "status": "classification-only-focused-proof",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Focused proof shows the duplicate retry-scheduled rebalancer_handoff witnesses preserve one bounded remote handoff retry and do not duplicate remote wakes. Do not reopen workflow_progress or frozen upstream decisions without fresh canonical evidence."
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / rebalancer_handoff owns the remaining priority recovery split, the retry-scheduled dispatched_waiting_progress witnesses should have a bounded wake, retry, drain, classification, or migration path without reopening publication ACK, active-gate snapshot coverage, or workflow_progress.",
    "stopConditionCheck": "Use work:evidence-summary, priority residual extraction, topology replay, npm run analyze:causal-model, owner-files for rebalancer_handoff and workflow_progress, then required review/fix/implementation subagents before runtime edits.",
    "expectedCausalModelChange": "Focused proof classifies the rebalancer_handoff witness as bounded retry-scheduled backpressure. Representative rolling-restart was not rerun because this package changed only focused test proof.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Workflow_progress is bounded by focused proof in the predecessor. Publication ACK, active-gate snapshot coverage, timeout budgets, admission, readiness, selected-source timeout, and workflow_progress implementation remain frozen unless fresh canonical evidence selects them.",
    "crossBoundaryReview": "Review work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md before implementation starts."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication handoff edge after workflow_progress bounded proof",
    "phaseChain": [
      "consume closed publication-convergence classification proof",
      "consume workflow_progress bounded owner re-entry proof",
      "use priority residual extraction to isolate rebalancer_handoff retry-scheduled witnesses",
      "run review and fix subagents before implementation starts",
      "run a fresh implementation subagent for rebalancer_handoff only",
      "add focused owner proof for the rebalancer_handoff duplicate retry-scheduled witnesses",
      "rerun focused owner tests; skip representative rolling-restart rerun because no runtime code changed"
    ],
    "currentFirstFrontier": "publication_ack_convergence remains visible in test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json, but causal analysis classifies priority recovery backpressure and priority residual extraction leaves a rebalancer_handoff split.",
    "knownDownstreamBlockers": [
      "publicationStatus remains OPEN with seed-only publishedActiveNodeIds and missingPublishedCount 4",
      "publicationActiveGateHandoff is pending owner_reconcile_pending with count 2",
      "rebalancer_handoff reports two dispatched_waiting_progress/retry_scheduled witnesses",
      "workflow_progress reports one persisted_not_dispatched/event_driven witness now bounded by predecessor proof",
      "active-gate snapshot coverage remains deferred at 3/5 behind publication and priority recovery"
    ],
    "missingCausalEdge": "Determine whether retry-scheduled rebalancer_handoff witnesses for operation 96c522ac-95c7-4713-96da-a98010d295d9 should wake/drain, classify as bounded backpressure, or migrate to another owner boundary.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "boundedProgressProof": "Focused proof added in test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js: control_plane_publications-p1 operation 96c522ac-95c7-4713-96da-a98010d295d9 with duplicate dispatched_waiting_progress/retry_scheduled handoff witnesses preserves one active remote handoff retry, returns no duplicate scheduling action, emits no duplicate remote wake, and keeps exactly one bounded retry timer.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json plus npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "Focused observable transition: duplicate retry-scheduled rebalancer_handoff evidence classifies to bounded existing remote handoff retry state without changing publication-owner, active-gate, or workflow_progress code. Representative transition is classification-only because no runtime change was made and no representative rerun was required.",
    "maxProgressBound": "one focused operation_workflow_owner / rebalancer_handoff slice",
    "sameFrontierFallback": "Applied: rebalancer_handoff remains selected with the same operation and action in the reference artifact, but focused proof shows bounded retry-scheduled backpressure. Stop as classification-only instead of widening into publication ACK, active gate, timeout budgets, admission, readiness, selected-source timeout, or workflow_progress implementation.",
    "expectedNextFrontier": "active_gate_snapshot_coverage only after publication and priority recovery stop blocking",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md / operation_workflow_owner / workflow_progress / same-frontier",
      "work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md / topology_publication_owner / publication_convergence / classification-only"
    ],
    "oscillationCheck": "This successor is allowed because the predecessor bounded the workflow_progress witness and the same canonical priority residual extraction still reports a distinct rebalancer_handoff split.",
    "handoffInvariant": "Publication ACK, publication owner evidence, active-gate snapshot coverage, timeout budgets, admission, readiness, selected-source timeout, and workflow_progress remain frozen unless canonical evidence selects them."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "rebalancer_handoff",
    "reason": "The predecessor focused proof bounded the workflow_progress persisted_not_dispatched/event_driven witness, while priority residual extraction still reports two retry-scheduled rebalancer_handoff witnesses for the same operation.",
    "evidence": [
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md",
  "successor": "work/packages/active-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The predecessor bounded the workflow-progress witness without changing runtime
code. Canonical priority residual extraction still reports a distinct
retry-scheduled rebalancer-handoff split for the same operation, so this
package owns that boundary before any active-gate or publication work resumes.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run review, fix if needed, and implementation subagents
sequentially before editing runtime files.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Ampere (019e3714-defc-7a93-9d80-4c898a978c53) reviewed work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Harvey (019e3717-ef90-7af0-874f-e8dcbd0c82c4) implemented work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. work/model-ledger.jsonl
5. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js

## Out Of Scope

1. topology_publication_owner
2. startup_active_gate_owner
3. timeout_budgets
4. active_gate_admission
5. readiness_support
6. selected_source_timeout
7. operation_workflow_owner/workflow_progress

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Forbidden files: `topology_publication_owner`, `startup_active_gate_owner`, `timeout_budgets`, `active_gate_admission`, `readiness_support`, `selected_source_timeout`, `operation_workflow_owner/workflow_progress`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress`, `npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `node scripts/check-guideline-literals.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `node scripts/check-guideline-decision-boundaries.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
5. npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff
6. npm run analyze:owner-files -- operation_workflow_owner workflow_progress
7. npm test -- test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
8. npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
9. node scripts/check-guideline-literals.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
10. node scripts/check-guideline-decision-boundaries.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js

## Focused Proof Result

Classification-only focused proof. The `rebalancer_handoff` residual for
`control_plane_publications-p1` operation
`96c522ac-95c7-4713-96da-a98010d295d9` is bounded by the existing remote
handoff retry lane: duplicate `dispatched_waiting_progress` /
`retry_scheduled` witnesses with `wait_for_operation_progress` preserve the
active retry, do not emit duplicate remote wakes, and leave exactly one bounded
handoff retry timer armed.

No runtime file was changed. Representative rolling-restart was not rerun
because this package only added focused proof; the reference artifact remains
same-artifact evidence while this boundary stops as bounded retry-scheduled
backpressure.

## Commit And Push Ledger

1. Focused package commit: `ca22d4770605ae41a67cd3a6a8d95aa43b2e0461`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
