# Topology Publication Convergence After Startup Reconcile Migration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Active successor from the migrated startup active-gate package. The latest representative artifact is red in load mode with first frontier publication_ack_convergence under topology_publication_owner / publication_convergence, dominant reason publication_pending. PublicationStatus is OPEN, publicationPending=true, recoveryProtocolState=publication_pending, publicationOwnerStreamOutcome=publishing, publicationOwnerRecoveryOutcome=waiting_for_publication, publishedActiveNodeIds contains only the seed, missingPublishedCount=4, and active-gate snapshot coverage is deferred behind publication convergence. Priority residual extraction reports one operation_workflow_owner / rebalancer_handoff witness on control_plane_publications-p1; use that extractor before splitting away from publication convergence.",
  "nextAction": "Use the new rolling-restart artifact to prove or repair publication OPEN/publishing convergence, while treating the active-gate snapshot edge as deferred and using the priority residual extractor before any operation_workflow_owner split.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff",
    "git diff --check"
  ],
  "writeScope": [
    "work/packages/active-20260517-topology-publication-convergence-after-startup-reconcile-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md",
    "test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "test/distributed/harness/publication-evidence-contract.js",
    "test/control-plane/publication-owner-decision.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-topology-publication-convergence-after-startup-reconcile-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
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
  }
  ,
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Prove or repair publication OPEN/publishing convergence, or deliberately split to operation_workflow_owner / rebalancer_handoff only if the focused publication probe shows publication is waiting on that residual."
  },
  "causalGovernance": {
    "hypothesis": "The publication owner stream is publishing and waiting_for_publication while only the seed is published active; a focused publication-convergence proof should either close publication_ack_convergence, expose the concrete operation_workflow_owner / rebalancer_handoff dependency, or migrate to a new canonical owner boundary.",
    "stopConditionCheck": "Use work:evidence-summary, topology handoff/replay probes, npm run analyze:causal-model, priority residual extraction, and owner-files before runtime edits. Runtime edits require the package's subagent sequencing proof or an explicit blocked-by-environment-policy ledger entry.",
    "expectedCausalModelChange": "publication_ack_convergence becomes satisfied, migrates to operation_workflow_owner / rebalancer_handoff with focused proof, or the representative turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Active-gate snapshot coverage is deferred behind publication convergence. Timeout budgets, active-gate admission, selected-source timeout handling, terminal-progress selection, readiness support, and the closed active-gate harness files remain frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "Review the closed startup active-gate package before implementation; do not reopen its harness proof in this publication-convergence package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication convergence after startup active-gate migration",
    "phaseChain": [
      "consume the migrated active-gate closure package",
      "refresh evidence-summary, topology handoff/replay probes, causal model, priority residuals, and owner-files on the latest representative artifact",
      "run or record required review/fix/implementation subagent sequencing before implementation",
      "build the narrowest publication-convergence probe for OPEN/publishing and waiting_for_publication",
      "edit only files selected by that focused proof",
      "rerun focused publication owner tests and one representative rolling-restart run with a real timestamp"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json, owned by topology_publication_owner / publication_convergence with publicationStatus=OPEN, publicationPending=true, recoveryProtocolState=publication_pending, prioritySpreadPending=true, publicationOwnerStreamOutcome=publishing, and publicationOwnerRecoveryOutcome=waiting_for_publication.",
    "knownDownstreamBlockers": [
      "priority residual extraction reports one operation_workflow_owner / rebalancer_handoff witness for control_plane_publications-p1",
      "active_gate_snapshot_coverage is deferred behind publication_ack_convergence and priority recovery",
      "active-gate progress remains snapshotCoverageNodeCount=3 of expectedNodeCount=5",
      "publicationActiveGateHandoffState remains pending owner_reconcile_pending with runtimePromotionAllowed=false",
      "readiness mode at failure is load with no_progress_terminal"
    ],
    "missingCausalEdge": "Determine whether publication_convergence owns the OPEN/publishing wait directly or is correctly waiting on operation_workflow_owner / rebalancer_handoff progress.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --replay-fixture",
    "boundedProgressProof": "Pending before implementation; the focused proof must identify the concrete publication retry, wake, dispatch, or bounded wait mechanism for the OPEN/publishing publication owner stream.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json",
    "expectedObservableTransition": "publication_ack_convergence satisfied, migrated to operation_workflow_owner / rebalancer_handoff with focused proof, or representative green.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains publication_ack_convergence with the same owner and action and no metric movement, stop as same-frontier or split a narrower edge instead of widening into active-gate, timeout, or readiness work.",
    "expectedNextFrontier": "publication_ack_convergence closure, operation_workflow_owner / rebalancer_handoff migration, or representative green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is the canonical successor because the latest representative evidence changed first frontier owner and boundary.",
    "handoffInvariant": "The closed active-gate harness proof, timeout budgets, active-gate admission, selected-source timeout handling, terminal-progress selection, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md"
}
-->

## Why

The previous startup active-gate package moved the representative failure out of
startup active-gate setup and into load-mode publication convergence. Canonical
evidence now selects `publication_ack_convergence` under
`topology_publication_owner / publication_convergence`; this package owns the
next publication-convergence proof and must decide whether the publication owner
can make progress directly or is correctly blocked behind the
`operation_workflow_owner / rebalancer_handoff` residual.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  canonical evidence selects a runtime owner boundary after a migrated package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-topology-publication-convergence-after-startup-reconcile-migration.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. test/distributed/harness/cluster-segment-7-class-4.js
2. test/distributed/harness/__tests__/cluster.test-part-5.js
3. timeout_budgets
4. active_gate_admission
5. readiness_support

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-topology-publication-convergence-after-startup-reconcile-migration.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`, `timeout_budgets`, `active_gate_admission`, `readiness_support`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence`, `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff`, `git diff --check`
- Model ledger advisory: `escalate`

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run the review/fix/implementation sequence before
runtime or test implementation edits.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e3672-1c0b-7662-b17d-69c6f0a8eb49) reviewed work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (a333baf6-7bc1-49b4-9f4e-5bf47b71ba39) fixed work/packages/done-20260517-startup-active-gate-remaining-handoff-reconcile-node.md.
- [ ] Implementation subagent recorded: pending-before-implementation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-owner-reconcile-stale-ack-20260517T143948Z.report.json
6. npm run analyze:owner-files -- topology_publication_owner publication_convergence
7. npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff
8. git diff --check
