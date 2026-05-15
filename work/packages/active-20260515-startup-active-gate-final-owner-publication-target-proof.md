# Startup Active Gate Final Owner Publication Target Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The publication diagnostics fallback slice is pushed as reduced evidence. The latest representative artifact still selects active_gate_snapshot_coverage with snapshot coverage 2/5 and producer seed-only published membership; the consumer handoff is narrowed to pendingReconcileCount=1 for 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, runtimePromotionAllowed=false, and priority-recovery residual extraction reports one subordinate workflow_progress witness.",
  "nextAction": "Prove the final pending owner publication target: explain why 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 remains outside durable publication and selected snapshot coverage after stale readiness diagnostics no longer override the durable published fallback.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-final-owner-publication-target-proof.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-startup-active-gate-final-owner-publication-target-proof.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md"
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
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-startup-active-gate-final-owner-publication-target-proof.md",
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
    "artifact": "test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Complete the causal edge table for producer durable publication truth, active-gate observation, and subordinate workflow progress before promoting runtime files."
  },
  "causalGovernance": {
    "hypothesis": "The final pending owner publication target remains red because either producer durable publication truth is still seed-only, active-gate observation samples a stale projection despite durable truth, or the subordinate workflow_progress witness blocks publication visibility and must be promoted with owner-boundary proof.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, drains pendingReconcileCount to 0, reduces producer missingPublishedCount or snapshotCoverage debt, migrates to topology_publication_owner/publication_convergence or operation_workflow_owner/workflow_progress with owner-boundary proof, or records a same-frontier causal table that names the next bounded owner.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The previous slice proved stale readiness diagnostics were not the remaining blocker and reduced consumer reconcile debt to one pending owner/snapshot-source node, but producer published membership remains seed-only and snapshot coverage remains 2/5.",
    "crossBoundaryReview": "Do not edit runtime files until review/fix proof is clean, the causal edge table names one owner, and exact runtime write-scope promotion is recorded."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / final pending owner publication target after diagnostics fallback proof",
    "phaseChain": [
      "consume diagnostics fallback reduced proof",
      "rerun canonical evidence on the latest artifact",
      "complete the causal edge table for producer truth, active-gate observation, and workflow_progress",
      "promote exact runtime files only after review/fix proof and owner selection",
      "prove focused owner behavior and representative rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "producer publication convergence still reports publishedActiveNodeIds as seed-only and missingPublishedCount=4",
      "consumer handoff contract is narrowed to pendingReconcileCount=1 for 35a891b8-c1a0-5064-9c6e-2acfba61c2a7 and runtimePromotionAllowed=false",
      "selected snapshot coverage remains 2/5 with repair_deferred/stale_usable/pending/idle/wait and cache_stale_watermark",
      "priority-recovery residual extraction reports one subordinate operation_workflow_owner / workflow_progress witness on control_plane_publications-p1"
    ],
    "missingCausalEdge": "This package must prove whether the final pending owner reconcile target is caused by producer publication durable truth, active-gate snapshot observation, or promoted workflow progress before any runtime edit.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Use canonical evidence and focused owner-file review to identify the bounded reconcile, dispatch, or observation mechanism that owns the final pending target; active-gate admission remains strict while runtimePromotionAllowed=false.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json",
    "expectedObservableTransition": "pendingReconcileCount reaches 0, producer missingPublishedCount drops below 4, snapshotCoverage moves above 2/5, durable published membership includes the owner target, or canonical extraction migrates to a narrower owner boundary with concrete proof.",
    "maxProgressBound": "one startup_active_gate_owner / snapshot_coverage package slice unless the causal edge table records owner-boundary migration proof; no timeout increases, active-gate admission relaxation, diagnostics-only success path, or workflow-progress implementation without canonical promotion",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains red after focused proof, record whether producer durable truth, active-gate observation, or workflow_progress owns the next package before opening another runtime slice.",
    "expectedNextFrontier": "readiness_startup_support after active-gate coverage improves, otherwise same-frontier active-gate evidence or a canonical owner-boundary migration",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-publication-active-gate-reconcile-bridge-simplification.md / startup_active_gate_owner / publication_reconcile_bridge / same-frontier-reduced"
    ],
    "oscillationCheck": "workflow_progress is visible as one subordinate residual witness but is not first frontier in topology or causal summaries; do not implement it without ownerBoundaryMigrationProof.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md"
}
-->

## Why

The publication diagnostics fallback package made a real reduction, but the
representative gate is still red. The latest artifact keeps
`active_gate_snapshot_coverage` as the first frontier with snapshot coverage
`2/5`, producer published membership still seed-only, and one remaining
consumer handoff reconcile target:
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.

This package owns the final pending target proof. It must classify the causal
edge before editing runtime files: producer durable publication truth,
active-gate observation, or a canonical workflow-progress migration.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the representative scenario remains red on the
  same first frontier after a focused reduction, and this package must prove
  the next causal edge before runtime scope expands.
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

1. work/packages/active-20260515-startup-active-gate-final-owner-publication-target-proof.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. timeout increases
2. active-gate admission relaxation while runtimePromotionAllowed=false
3. workflow-progress implementation unless canonical extractors promote it
4. broad diagnostics-only success path
5. Pro or Enterprise behavior

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation runtime
owner-boundary package.

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
- [ ] Implementation subagent recorded: pending-before-implementation-resumes.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-startup-active-gate-final-owner-publication-target-proof.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `workflow-progress implementation unless canonical extractors promote it`, `broad diagnostics-only success path`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-final-owner-publication-target-proof.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/active-20260515-startup-active-gate-final-owner-publication-target-proof.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown
8. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json
9. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown

## Causal Edge Table

Complete this table before promoting runtime files from `candidateRuntimeFiles`
into `writeScope`.

| Surface | Expected truth | Observed truth | Owner / boundary | Evidence command | Runtime promotion rule |
| --- | --- | --- | --- | --- | --- |
| Producer durable publication truth | Published active membership includes the owner target and expected active cohort. | `publishedActiveNodeIds` is seed-only; `missingPublishedCount=4`. | `topology_publication_owner / publication_convergence` | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --handoff-probe` | Promote publication owner files only if this surface is stale or incomplete. |
| Active-gate observation | Active-gate consumes durable truth and reaches full snapshot coverage. | `pendingReconcileCount=1`, pending node `35a891b8-c1a0-5064-9c6e-2acfba61c2a7`, snapshot coverage `2/5`. | `startup_active_gate_owner / snapshot_coverage` | `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json` | Promote active-gate/admin observation files only if producer truth is correct but this surface samples stale or partial truth. |
| Workflow progress | Workflow progress remains subordinate unless it blocks publication visibility or active-gate observation. | One `operation_workflow_owner / workflow_progress` witness on `control_plane_publications-p1`. | `operation_workflow_owner / workflow_progress` | `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-diagnostics-fallback-20260515-codex.report.json --markdown` | Promote workflow files only with owner-boundary migration proof. |
