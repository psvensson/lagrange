# Startup Active Gate Remaining Publication Visibility Target Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Canonical evidence refreshed on 2026-05-15 keeps active_gate_snapshot_coverage as the topology and causal first frontier with active=5/5, snapshotCoverage=2/5, producer publishedActiveNodeIds seed-only, missingPublishedCount=4, and pendingReconcileCount=1 for 11601fe0-72d6-5853-8590-ec2881853e72. The causal graph also records an operation_workflow_owner / workflow_progress wait with nextRequiredAction=advance_existing_operation, and priority-recovery residual extraction reports one unsplit operation_workflow_owner / workflow_progress group with three spread_satisfied_in_flight witnesses on control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1. Selected outcome: workflow-progress-migration.",
  "nextAction": "Stop runtime edits in this startup active-gate package and activate or continue the parked operation_workflow_owner / workflow_progress residual package for the three priority-recovery witnesses; keep active-gate admission strict and do not promote startup runtime files from this package.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md"
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
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-control-snapshot-readiness-diagnostics-methods.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md",
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
      "runtime ownership changes",
      "representative scenario evidence changes"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Causal-edge proof selected workflow-progress-migration: active-gate remains the visible timeout surface, but the bounded next owner path is operation_workflow_owner / workflow_progress for the three spread_satisfied_in_flight witnesses."
  },
  "causalGovernance": {
    "hypothesis": "The remaining red state is caused by one of three bounded edges: producer publication truth remains seed-only after handoff reconcile, active-gate observation samples a stale or partial publication projection after all nodes are active, or the subordinate workflow_progress witnesses block publication visibility and must be migrated.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, drains pendingReconcileCount to 0, reduces producer missingPublishedCount or snapshotCoverage debt, migrates to topology_publication_owner/publication_convergence or operation_workflow_owner/workflow_progress with owner-boundary proof, or records a bounded same-frontier successor.",
    "representativeOutcome": "migrated",
    "causalDebt": "The refreshed artifact still exposes active-gate timeout symptoms, but the producer handoff probe reports missingEdge=null and the residual extractor now reports one unsplit operation_workflow_owner / workflow_progress group with three spread_satisfied_in_flight witnesses. This package records migration proof instead of promoting startup active-gate runtime files.",
    "crossBoundaryReview": "Review, fix, and implementation proof are recorded with real subagent identities. No startup active-gate runtime files were promoted because the causal edge selected workflow-progress migration."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / remaining publication visibility target after active-gate observation selector reduction",
    "phaseChain": [
      "consume handoff reconcile fallback reduced proof",
      "rerun canonical evidence on the latest artifact",
      "complete the causal edge table for producer truth, active-gate observation, and workflow_progress",
      "promote exact runtime files only after review/fix proof and owner selection",
      "prove focused owner behavior and representative rolling-restart"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the first representative frontier in test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json, but the causal-edge proof selects operation_workflow_owner / workflow_progress as the next bounded owner because the active-gate surface is fed by an operation workflow wait and three unsplit priority-recovery witnesses.",
    "knownDownstreamBlockers": [
      "producer publication convergence still reports publishedActiveNodeIds as seed-only and missingPublishedCount=4",
      "consumer handoff contract is narrowed to pendingReconcileCount=1 for 11601fe0-72d6-5853-8590-ec2881853e72 and runtimePromotionAllowed=false",
      "selected snapshot coverage remains 2/5 with repair_deferred/deferred_refresh/deferred/deferred/retry and cache_stale_watermark|discovery_node_coverage_gap|stale_replica_operations_in_flight",
      "priority-recovery residual extraction reports three subordinate operation_workflow_owner / workflow_progress witnesses on control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1 with semantic state spread_satisfied_in_flight and Split required: false",
      "causal-model wait priority_recovery:event_driven is active under operation_workflow_owner / workflow_progress with nextRequiredAction=advance_existing_operation and workflow_step_timeout observed at 33560ms/30000ms"
    ],
    "missingCausalEdge": "The remaining publication visibility target is not promoted as producer durable truth or startup observation work in this package; it migrates to operation_workflow_owner / workflow_progress because the canonical residual group is unsplit and owns the bounded advance_existing_operation path.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "Canonical residual extraction identifies one operation_workflow_owner / workflow_progress group with three spread_satisfied_in_flight witnesses and no split required; causal-model wait evidence names advance_existing_operation as the bounded progress mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
    "expectedObservableTransition": "Activate the parked operation_workflow_owner / workflow_progress package and prove the three spread_satisfied_in_flight witnesses advance, drain, split, or expose a narrower workflow owner boundary; do not edit startup active-gate runtime files in this package.",
    "maxProgressBound": "one metadata/proof-only startup_active_gate_owner / snapshot_coverage slice ending in owner-boundary migration proof; no timeout increases, active-gate admission relaxation, diagnostics-only success path, or startup runtime promotion",
    "sameFrontierFallback": "not used; this package records workflow-progress migration proof rather than another same-frontier startup active-gate runtime slice.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress parked successor",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-startup-active-gate-remaining-publication-lag-proof.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260515-startup-active-gate-seed-publication-visibility-proof.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "workflow_progress is visible as three subordinate residual witnesses and is now selected by ownerBoundaryMigrationProof; implementation belongs in the parked operation_workflow_owner / workflow_progress package, not this startup active-gate package.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "The active-gate handoff probe still reports pending reconcile symptoms for 11601fe0-72d6-5853-8590-ec2881853e72, but canonical priority-recovery residual extraction reports one unsplit operation_workflow_owner / workflow_progress group with three spread_satisfied_in_flight witnesses, and causal-model wait evidence names advance_existing_operation under operation_workflow_owner / workflow_progress.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown",
      "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown"
    ]
  },
  "predecessor": "work/packages/done-20260515-startup-active-gate-final-owner-publication-target-proof.md",
  "closed": "2026-05-15",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md"
}
-->

## Why

The active-gate observation selector slice made the scenario materially
healthier: all five nodes now report ACTIVE. The representative run is still
red because selected publication coverage is seed-only, snapshot coverage is
`2/5`, and the handoff contract has one remaining reconcile target:
`11601fe0-72d6-5853-8590-ec2881853e72`.

This package owns the causal-edge proof boundary. The refreshed evidence
selects `workflow-progress-migration`: startup active-gate remains the visible
timeout surface, but the bounded next owner is `operation_workflow_owner /
workflow_progress` for the three `spread_satisfied_in_flight` priority-recovery
witnesses.

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

1. work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md
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

- [x] Review subagent recorded:
      Agent Pasteur (019e2d72-0d99-7ac2-9eb8-f2b0f8092371) reviewed
      `work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Goodall (019e2d73-ff17-7320-8cfe-13e7fcad3dd4) fixed
      `work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md`.
- [x] Implementation subagent recorded:
      Agent Carver (019e2d76-b68c-7d32-a337-c0e2ca43a95e) implemented
      `work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md`.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `timeout increases`, `active-gate admission relaxation while runtimePromotionAllowed=false`, `workflow-progress implementation unless canonical extractors promote it`, `broad diagnostics-only success path`, `Pro or Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown
8. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json
9. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
10. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown

## Causal Edge Table

Complete this table before promoting runtime files from `candidateRuntimeFiles`
into `writeScope`.

| Surface | Expected truth | Observed truth | Owner / boundary | Evidence command | Runtime promotion rule |
| --- | --- | --- | --- | --- | --- |
| Producer durable publication truth | Published active membership includes the remaining owner target and expected active cohort. | `publishedActiveNodeIds` is seed-only; `missingPublishedCount=4`; `publicationOwnerFreshnessFence=consumer_lag`; `publicationOwnerStreamOutcome=stale`. | `topology_publication_owner / publication_convergence` | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --handoff-probe` | Promote publication owner files only if this surface is stale or incomplete after source review. |
| Active-gate observation | Active-gate consumes durable truth and reaches full snapshot coverage. | `active=5/5`, `snapshotCoverage=2/5`, `pendingReconcileCount=1`, pending node `11601fe0-72d6-5853-8590-ec2881853e72`, repair deferred retry. | `startup_active_gate_owner / snapshot_coverage` | `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json` | Promote active-gate/admin observation files only if producer truth is correct but this surface samples stale or partial truth. |
| Workflow progress | Workflow progress remains subordinate unless it blocks publication visibility or active-gate observation. | Selected outcome: `workflow-progress-migration`. Three `operation_workflow_owner / workflow_progress` witnesses on `control_plane_publications-p1`, `replica_operations-p1`, and `sql_transaction_participants-p1`, semantic state `spread_satisfied_in_flight`, `Split required: false`; causal wait `priority_recovery:event_driven` requires `advance_existing_operation`. | `operation_workflow_owner / workflow_progress` | `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json --markdown`; `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-handoff-reconcile-fallback-20260515-codex.report.json` | Do not promote startup runtime files. Continue in the parked `operation_workflow_owner / workflow_progress` package or a narrower successor. |

## Runtime Promotion Gate

This package starts with metadata-only write scope. The review/fix/implementation
sequence must refresh the evidence commands above and record one of these
outcomes before adding runtime files to `writeScope` or `commitScope`:

1. `producer-publication-truth`: promote only publication-owner files and fix
   durable membership publication write/read visibility.
2. `active-gate-observation`: promote only active-gate/admin observation files
   and fix stale or partial snapshot sampling after producer truth is proven
   correct.
3. `workflow-progress-migration`: record `ownerBoundaryMigrationProof` and move
   the work to the parked workflow-progress package or a narrower successor.
4. `architecture-gap`: stop runtime edits and open a causal handoff package
   when the table cannot identify a single owner.

No runtime patch is allowed until the table selects the canonical owner
mechanism.

## Commit And Push Ledger

1. Focused package commit: 64954c7d
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
