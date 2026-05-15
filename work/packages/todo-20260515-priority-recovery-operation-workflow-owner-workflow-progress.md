# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Paused by the canonical frontier steering repair. Fresh representative evidence still reports one operation_workflow_owner / workflow_progress witness on control_plane_publications-p1 with semantic state spread_satisfied_in_flight, but work:evidence-summary and the causal model select startup_active_gate_owner / snapshot_coverage as the first frontier. This package is parked as dependent evidence until focused proof promotes it back to the active implementation boundary.",
  "nextAction": "Do not implement while parked. On activation, rerun canonical extractors, record owner-boundary migration proof if workflow_progress becomes the first frontier, and run a real review subagent before runtime implementation starts.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown"
  ],
  "writeScope": [
    "work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/replica-operation-repository-mutation-methods.js",
    "test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
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
    "status": "parked-sub-frontier-dependency",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Remain parked until fresh canonical evidence promotes workflow_progress ahead of active_gate_snapshot_coverage or records owner-boundary migration proof."
  },
  "causalGovernance": {
    "hypothesis": "The direct rebalancer handoff is now drained, but one workflow_progress operation remains spread_satisfied_in_flight long enough for active-gate snapshot coverage to defer repair on stale replica operation progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green, active-gate snapshot coverage progresses after workflow drain, or fresh evidence migrates to startup_active_gate_owner / publication_reconcile_bridge with the workflow witness proven non-frontier.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Leaving the final spread_satisfied_in_flight workflow witness unresolved keeps the active-gate owner dependent on stale operation progress and risks starting bridge simplification before the operation owner has proven drain or non-frontier classification.",
    "crossBoundaryReview": "Do not relax active-gate admission or rewrite publication handoff truth. This package may only promote runtime files after focused owner evidence shows workflow progress, repository mutation, or dispatch progress is the relevant local boundary."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / priority recovery operation workflow workflow_progress residual",
    "phaseChain": [
      "consume rebalancer_handoff reduced evidence",
      "prepare subagent sequencing ledger under environment-policy constraints",
      "inspect workflow_progress owner files and the control_plane_publications-p1 witness",
      "implement one bounded workflow progress fix if evidence stays local",
      "prove focused owner tests and static guardrails",
      "rerun representative rolling-restart until green, reduced, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the outer topology frontier in test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json, while the focused priority-recovery extractor reports one operation_workflow_owner / workflow_progress witness.",
    "knownDownstreamBlockers": [
      "priority-recovery residual extraction reports split required false with one workflow_progress witness",
      "the witness partition is control_plane_publications-p1 and semantic state is spread_satisfied_in_flight",
      "topology convergence handoff probe reports pendingReconcileCount=4 and runtimePromotionAllowed=false",
      "active-gate snapshot observation remains repair_deferred with stale_replica_operations_in_flight",
      "publication-active-gate bridge simplification remains parked until workflow progress is proven, reduced, or superseded"
    ],
    "missingCausalEdge": "The operation workflow owner must either advance the spread_satisfied_in_flight witness, classify it as non-frontier, or migrate the remaining red evidence back to the active-gate bridge with proof that stale operation progress is no longer causal.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown",
    "boundedProgressProof": "The package must prove bounded workflow progress through dispatch, persistence, retry, completion, or a canonical non-frontier classification for the control_plane_publications-p1 witness.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "expectedObservableTransition": "The workflow_progress witness drains, representative rolling-restart becomes green, active-gate snapshot coverage moves to the bridge simplification boundary, or a narrower workflow/repository/dispatch owner is recorded.",
    "maxProgressBound": "one workflow_progress owner package slice; no timeout increases, active-gate admission relaxation, publication handoff rewrites, or bridge simplification implementation inside this package",
    "sameFrontierFallback": "If workflow_progress remains, record whether dispatch, repository mutation, completion persistence, retry wake-up, or diagnostics classification failed before broadening scope.",
    "expectedNextFrontier": "publication-active-gate bridge simplification only after workflow_progress is green, reduced, migrated, split, or proven non-frontier",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md / operation_workflow_owner / rebalancer_handoff / reduced",
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md / topology_publication_owner / publication_active_gate_handoff_contract / reduced"
    ],
    "oscillationCheck": "This package is the parked paired split that became eligible only after rebalancer_handoff drained. It must not reopen the active-gate bridge unless focused evidence proves workflow progress is non-frontier.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  }
}
-->

## Why

The previous package drained the direct `rebalancer_handoff` witnesses by
making duplicate create idempotency report owner progress. Fresh representative
evidence is still red, but the operation-workflow residual is now narrowed to
one `workflow_progress` witness on `control_plane_publications-p1`.

This package no longer owns the current active implementation slot. The
workflow-progress witness remains useful dependency evidence, but canonical
representative extractors keep the first frontier on
`startup_active_gate_owner / snapshot_coverage`.

It can be activated only if fresh evidence promotes
`operation_workflow_owner / workflow_progress` back to the current first
frontier, or if owner-boundary migration proof shows the active-gate blocker is
caused by this workflow-progress boundary and no narrower owner should own it.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: canonical residual evidence names one owner
  boundary and one semantic state.
- Escalation trigger to a heavier lane: the fix needs publication handoff
  semantics, active-gate admission changes, timeout changes, or broad bridge
  simplification.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Inspect the remaining workflow progress witness with canonical extractors.
2. Promote exact runtime/test files into `writeScope` only after focused owner
   evidence confirms the boundary.
3. Implement one bounded workflow progress fix, or split/migrate with concrete
   operation, repository, dispatch, or diagnostics evidence.
4. Rerun focused tests, static guardrails, and representative
   `rolling-restart`.

## Out Of Scope

1. Timeout increases.
2. Active-gate admission relaxation.
3. Publication handoff contract rewrites.
4. Publication-active-gate bridge simplification implementation.
5. Pro or Enterprise behavior.

## Activation Gate

This package is parked. Before it can move back to `active`:

1. `npm run work:context` and `npm run work:llm-start` must point at this
   package or a successor package.
2. `work:evidence-summary` and `analyze:causal-model` must either select
   `operation_workflow_owner / workflow_progress` as the first frontier or the
   active package must record owner-boundary migration proof.
3. `analyze:priority-recovery-residuals` must still show a focused
   workflow-progress witness that has not been reduced or superseded.
4. Runtime files must be promoted from `candidateRuntimeFiles` into
   `writeScope` and `commitScope` before editing.
5. A real review subagent must run before implementation because delegation has
   been explicitly authorized.

## Subagent Sequencing Ledger

Required on activation because this is a causal-escalation runtime package.
The user has explicitly authorized delegation, so placeholder environment
blocks are not valid closure proof for this package.

- [ ] Review subagent recorded: pending-on-activation
- [ ] Fix subagent recorded or explicitly not needed: pending-on-review
- [ ] Implementation subagent recorded: pending-on-clean-review

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: package/sprint handoff files; runtime files only after focused
  owner evidence promotes them.
- Forbidden files: timeout increases, active-gate admission relaxation,
  publication handoff contract rewrites, bridge simplification implementation,
  Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json
7. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
