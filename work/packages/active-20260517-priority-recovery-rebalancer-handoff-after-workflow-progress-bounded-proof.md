# Priority Recovery Rebalancer Handoff After Workflow Progress Bounded Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Active successor from the workflow_progress bounded-proof package. The same representative artifact still contains a priority recovery split for control_plane_publications-p1 operation 96c522ac-95c7-4713-96da-a98010d295d9: workflow_progress has one persisted_not_dispatched/event_driven witness now proved bounded by owner re-entry, while rebalancer_handoff has two dispatched_waiting_progress/retry_scheduled witnesses with nextRequiredAction wait_for_operation_progress. This package owns only the parked rebalancer_handoff split.",
  "nextAction": "Prove or split the retry-scheduled rebalancer-handoff residual for control_plane_publications-p1 operation 96c522ac-95c7-4713-96da-a98010d295d9 after workflow_progress bounded proof; keep publication ACK, active-gate snapshot coverage, timeout budgets, admission, readiness, selected-source timeout, and workflow_progress implementation frozen unless fresh canonical evidence selects them.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress"
  ],
  "writeScope": [
    "work/packages/active-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "work/packages/active-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Prove or split the retry-scheduled rebalancer-handoff residual for control_plane_publications-p1 operation 96c522ac-95c7-4713-96da-a98010d295d9; do not reopen workflow_progress unless fresh evidence invalidates its bounded owner re-entry proof."
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / rebalancer_handoff owns the remaining priority recovery split, the retry-scheduled dispatched_waiting_progress witnesses should have a bounded wake, retry, drain, classification, or migration path without reopening publication ACK, active-gate snapshot coverage, or workflow_progress.",
    "stopConditionCheck": "Use work:evidence-summary, priority residual extraction, topology replay, npm run analyze:causal-model, owner-files for rebalancer_handoff and workflow_progress, then required review/fix/implementation subagents before runtime edits.",
    "expectedCausalModelChange": "The rebalancer_handoff witness drains, reduces, classifies as bounded retry-scheduled backpressure, migrates to another named owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
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
      "rerun focused owner tests and one representative rolling-restart run with a real timestamp when runtime changes occur"
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
    "boundedProgressProof": "pending-before-probe: identify whether the retry-scheduled handoff path is already bounded for the selected operation or needs a focused operation_workflow_owner / rebalancer_handoff repair.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json plus pending focused operation_workflow_owner / rebalancer_handoff proof",
    "expectedObservableTransition": "priority_recovery_partition_progress should drain, reduce witness count, classify as bounded rebalancer-handoff backpressure, migrate to a named owner boundary, or turn rolling-restart green without changing publication-owner, active-gate, or workflow_progress code.",
    "maxProgressBound": "one focused operation_workflow_owner / rebalancer_handoff slice",
    "sameFrontierFallback": "If rebalancer_handoff remains selected with the same operation and action after focused proof, stop as same-frontier or classification-only instead of widening into publication ACK, active gate, timeout budgets, admission, readiness, selected-source timeout, or workflow_progress implementation.",
    "expectedNextFrontier": "active_gate_snapshot_coverage only after publication and priority recovery stop blocking",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
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
  "predecessor": "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md"
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

- [ ] Review subagent recorded: pending-before-implementation.
- [ ] Fix subagent recorded or explicitly not needed: pending-review-result.
- [ ] Implementation subagent recorded: pending-before-implementation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. work/model-ledger.jsonl

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
- Owned files: `work/packages/active-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner`, `startup_active_gate_owner`, `timeout_budgets`, `active_gate_admission`, `readiness_support`, `selected_source_timeout`, `operation_workflow_owner/workflow_progress`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
5. npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff
6. npm run analyze:owner-files -- operation_workflow_owner workflow_progress
