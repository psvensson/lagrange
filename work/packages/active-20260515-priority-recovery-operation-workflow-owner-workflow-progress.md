# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Activated by owner-boundary migration proof from work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md. The latest representative artifact still exposes active_gate_snapshot_coverage as the outer timeout surface, but the startup active-gate package selected workflow-progress-migration. Priority-recovery residual extraction now reports one unsplit operation_workflow_owner / workflow_progress group with three spread_satisfied_in_flight witnesses on control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1; causal wait evidence names advance_existing_operation.",
  "nextAction": "Run the required review/fix/implementation sequence, then prove or split the three spread_satisfied_in_flight workflow-progress witnesses without relaxing active-gate admission, rewriting publication handoff truth, or increasing timeouts.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md",
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
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/replica-operation-repository-mutation-methods.js",
    "test/rebalancer/rebalance-coordinator-outcome-routing.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
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
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Prove or split the three spread_satisfied_in_flight workflow-progress witnesses that block active-gate repair and publication visibility."
  },
  "causalGovernance": {
    "hypothesis": "The prior startup active-gate slice proved the visible snapshot-coverage timeout is gated by unresolved workflow progress. Three spread_satisfied_in_flight workflow-progress witnesses remain long enough for active-gate snapshot repair to defer on stale replica operation progress.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green, active-gate snapshot coverage or producer publication coverage improves after workflow drain, the residual reduces to fewer workflow-progress witnesses, or fresh evidence splits to a narrower workflow/repository/dispatch owner.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Leaving the three spread_satisfied_in_flight workflow witnesses unresolved keeps the active-gate owner dependent on stale operation progress and prevents durable publication visibility from reaching the remaining handoff target.",
    "crossBoundaryReview": "Do not relax active-gate admission or rewrite publication handoff truth. This package may only promote runtime files after focused owner evidence shows workflow progress, repository mutation, or dispatch progress is the relevant local boundary."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / priority recovery operation workflow workflow_progress residual",
    "phaseChain": [
      "consume startup active-gate owner-boundary migration proof",
      "prepare subagent sequencing ledger with real review/fix/implementation agents",
      "inspect workflow_progress owner files and the three current witnesses",
      "implement one bounded workflow progress fix if evidence stays local",
      "prove focused owner tests and static guardrails",
      "rerun representative rolling-restart until green, reduced, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the outer topology frontier in test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json, while owner-boundary migration proof selects operation_workflow_owner / workflow_progress as the active implementation boundary.",
    "knownDownstreamBlockers": [
      "priority-recovery residual extraction reports split required false with one workflow_progress group and three witnesses",
      "the witness partitions are control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1 with semantic state spread_satisfied_in_flight",
      "topology convergence handoff probe reports pendingReconcileCount=1 for 11601fe0-72d6-5853-8590-ec2881853e72 and runtimePromotionAllowed=false",
      "active-gate snapshot observation remains repair_deferred with stale_replica_operations_in_flight",
      "producer publication visibility remains seed-only until workflow progress drains or splits"
    ],
    "missingCausalEdge": "The operation workflow owner must either advance the three spread_satisfied_in_flight witnesses, classify them as non-frontier, or split the remaining red evidence to a narrower workflow/repository/dispatch owner with concrete operation evidence.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown",
    "boundedProgressProof": "The package must prove bounded workflow progress through dispatch, persistence, retry, completion, or a canonical non-frontier classification for the control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1 witnesses.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "expectedObservableTransition": "The workflow_progress witnesses drain or reduce, representative rolling-restart becomes green, active-gate snapshot or producer publication coverage improves, or a narrower workflow/repository/dispatch owner is recorded.",
    "maxProgressBound": "one workflow_progress owner package slice; no timeout increases, active-gate admission relaxation, publication handoff rewrites, or bridge simplification implementation inside this package",
    "sameFrontierFallback": "If workflow_progress remains, record whether dispatch, repository mutation, completion persistence, retry wake-up, or diagnostics classification failed before broadening scope.",
    "expectedNextFrontier": "startup active-gate snapshot coverage or publication convergence only after workflow_progress is green, reduced, migrated, split, or proven non-frontier",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md / operation_workflow_owner / rebalancer_handoff / reduced",
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md / topology_publication_owner / publication_active_gate_handoff_contract / reduced"
    ],
    "oscillationCheck": "This package is the parked paired split that became eligible only after rebalancer_handoff drained. It must not reopen the active-gate bridge unless focused evidence proves workflow progress is non-frontier.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md"
}
-->

## Why

The previous startup active-gate proof selected
`workflow-progress-migration`. Fresh representative evidence is still red on
the visible active-gate surface, but the bounded implementation owner is now
`operation_workflow_owner / workflow_progress`.

The current residual is an unsplit group of three
`spread_satisfied_in_flight` witnesses on `control_plane_publications-p1`,
`replica_operations-p1`, and `sql_transaction_participants-p1`. This package
must prove whether those operations advance, drain, or split to a narrower
workflow/repository/dispatch owner.

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

## Activation Evidence

This package is active because
`work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md`
records owner-boundary migration proof from
`startup_active_gate_owner / snapshot_coverage` to
`operation_workflow_owner / workflow_progress`.

Before runtime editing:

1. Run a real review subagent and record the result.
2. Record a fix subagent or explicit not-needed result.
3. Promote exact runtime/test files from `candidateRuntimeFiles` into
   `writeScope` and `commitScope`.
4. Run a real implementation subagent for the selected bounded slice.

## Subagent Sequencing Ledger

Required on activation because this is a causal-escalation runtime package.
The user has explicitly authorized delegation, so placeholder environment
blocks are not valid closure proof for this package.

- [ ] Review subagent recorded: pending-before-implementation-resumes
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review
- [ ] Implementation subagent recorded: pending-before-implementation-resumes

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md`,
  `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`,
  `work/sprints/current-blocker.md`, and `work/sprints/current-blocker.json`.
  Runtime files are promoted only after review/fix proof is clean and focused
  owner evidence selects the exact bounded implementation path.
- Forbidden files: timeout increases, active-gate admission relaxation,
  publication handoff contract rewrites, bridge simplification implementation,
  Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
7. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
