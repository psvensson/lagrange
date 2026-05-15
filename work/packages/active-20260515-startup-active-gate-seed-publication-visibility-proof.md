# Startup Active Gate Seed Publication Visibility Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The final reconcile readback slice is pushed as same-frontier evidence. The latest representative artifact still selects active_gate_snapshot_coverage with snapshot coverage 2/5, seed-only published membership, missingPublishedCount=4, pendingReconcileCount=4, runtimePromotionAllowed=false, and subordinate operation_workflow_owner / workflow_progress witnesses that are not the first frontier.",
  "nextAction": "Prove why durable membership publication visibility remains seed-only after awaited non-deferred diagnostics readback reconcile; identify whether the missing edge is publication owner write visibility, active-gate snapshot observation, or canonical workflow-progress promotion before any runtime edit.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/owners/control-plane-publications-owner.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-stage-2.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/control-plane-system-table-gateway.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md",
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
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Prove why durable membership publication visibility remains seed-only after awaited diagnostics-grade reconcile readback while topology and causal summaries still select active-gate snapshot coverage."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate owner still observes seed-only durable published membership because the reconciled publication target is not becoming consumer-visible before the active-gate snapshot owner samples coverage, or because canonical evidence should now promote the subordinate workflow-progress witness.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, reduces pendingReconcileCount or snapshot coverage debt, migrates to a narrower durable publication visibility boundary, or records owner-boundary migration proof to workflow_progress.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The readback slice tightened the admin catch-up bridge but the representative run regressed to four pending reconcile nodes and seed-only published membership; another runtime edit must prove the exact missing visibility edge before broadening.",
    "crossBoundaryReview": "Do not edit runtime files until review/fix proof is clean and exact runtime write-scope promotion is recorded."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / seed-only durable membership publication visibility after final reconcile readback",
    "phaseChain": [
      "consume final reconcile readback same-frontier proof",
      "rerun canonical evidence on the final readback artifact",
      "prove whether publication owner write visibility, active-gate snapshot observation, or workflow_progress owns the next progress edge",
      "promote exact runtime files only after review/fix proof",
      "prove focused owner behavior and representative rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication handoff remains pending with pendingReconcileCount=4 and runtimePromotionAllowed=false",
      "publishedActiveNodeIds remains seed-only while missingPublishedCount=4",
      "selected snapshot coverage is 2/5 with repair_deferred/deferred_refresh/deferred/deferred/retry",
      "priority-recovery residual extraction reports three operation_workflow_owner / workflow_progress witnesses, but work:evidence-summary and causal-model still keep active_gate_snapshot_coverage as first frontier"
    ],
    "missingCausalEdge": "The package must prove whether awaited publication reconcile writes are not durable-visible, active-gate snapshot observation is sampling the wrong publication surface, or workflow_progress has become the true promoted owner boundary.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Use focused source and owner-file evidence to prove the reconcile visibility mechanism before another representative rerun; active-gate admission remains strict while runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json",
    "expectedObservableTransition": "pendingReconcileCount reaches 0, snapshotCoverage moves toward 5/5, durable published membership includes the expected active cohort, or canonical extraction migrates to a narrower owner boundary with concrete next action.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage package slice; no timeout increases, active-gate admission relaxation, diagnostics-only success path, or workflow-progress implementation without canonical promotion",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains red after focused proof, record whether seed-only publication visibility stayed local or migrated before opening another runtime slice.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence or a canonical workflow_progress migration",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md / startup_active_gate_owner / publication_reconcile_bridge / same-frontier-reduced",
      "work/packages/done-20260515-rolling-restart-canonical-frontier-steering-repair.md / startup_active_gate_owner / snapshot_coverage / classification-only"
    ],
    "oscillationCheck": "workflow_progress is visible again as subordinate evidence but is not promoted by topology or causal summaries; do not implement it from this package without owner-boundary migration proof.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md"
}
-->

## Why

The final reconcile readback package tightened the admin catch-up bridge and
proved the focused tests, but the representative gate stayed red on the same
canonical first frontier. The new artifact shows a sharper problem: durable
published membership is still seed-only, the handoff has four pending reconcile
targets, and workflow-progress witnesses are subordinate rather than promoted.

This package owns the next bounded proof surface. It must identify whether the
missing edge is publication owner write visibility, active-gate snapshot
observation, or a canonical workflow-progress migration before any runtime edit.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the original representative scenario remains
  red after a focused same-frontier package, and this package must prove the
  next causal edge before widening runtime scope.
- Escalation trigger to a heavier lane: canonical evidence promotes
  workflow_progress, publication convergence, readiness support, or an
  architecture stop ahead of startup active-gate snapshot coverage.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md
2. work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. work/model-ledger.jsonl

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. workflow-progress implementation unless canonical extractors promote it
4. broad diagnostics-only success path
5. Pro or Enterprise behavior

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [x] Review subagent recorded: Agent Laplace (019e2d18-978d-7f11-ae07-752c58250da3) reviewed work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e2d1a-6841-7060-82f7-7de60ca8846c) fixed work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md.
- [ ] Implementation subagent recorded: pending-on-clean-review

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md`, `work/packages/done-20260515-startup-active-gate-snapshot-coverage-final-reconcile-target.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `workflow-progress implementation unless canonical extractors promote it`, `broad diagnostics-only success path`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --markdown`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-seed-publication-visibility-proof.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-final-reconcile-readback-20260515-codex.report.json --markdown
8. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
