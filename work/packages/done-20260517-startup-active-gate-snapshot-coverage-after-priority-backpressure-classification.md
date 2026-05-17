# Startup Active Gate Snapshot Coverage After Priority Backpressure Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "owner_reconcile_pending",
  "currentState": "Focused proof is classification-only for the deferred startup_active_gate_owner / snapshot_coverage evidence. The reference artifact still shows snapshotCoverageNodeCount=3 of expectedNodeCount=5, publicationActiveGateHandoffState=pending, publicationActiveGateHandoffReasonCode=owner_reconcile_pending, nextAction=reconcile_owner_membership_publication, runtimePromotionAllowed=false, and two pending reconcile nodes 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7; the focused admin regression proves the existing OPEN-publication flattened active-gate handoff path queues the narrow owner reconcile and surfaces a bounded write_deferred owner outcome without local promotion, publication-truth conversion, or a visibility rebuild.",
  "nextAction": "Stop runtime edits for this same-artifact active-gate handoff slice. Treat the two pending active-gate owner reconcile nodes as advancing through the existing bounded owner-command queue; parent closure may record the implementation subagent ledger, then keep publication, priority-recovery, timeout, admission, readiness, selected-source timeout, workflow_progress, and rebalancer_handoff frozen unless fresh canonical evidence selects them.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
    "npx tap --grep \"AdminControlSnapshot no-attempt path queues flattened OPEN active-gate handoff reconcile\" test/admin/admin-control-snapshot.test.js",
    "npx tap --grep \"publication active-gate selector accepts flattened active-gate progress handoff\" test/control-plane/publication-active-gate-handoff-contract.test.js",
    "node scripts/check-guideline-literals.js test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-decision-boundaries.js test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-constant-names.js test/admin/admin-control-snapshot.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md",
    "test/admin/admin-control-snapshot.test.js",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md",
    "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md",
    "work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md",
    "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md",
    "test/admin/admin-control-snapshot.test.js",
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
      "representative scenario evidence changes",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "classification-only-focused-proof",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "owner_reconcile_pending",
    "nextAction": "Focused proof classifies the two pending owner reconcile nodes as advancing through the existing bounded owner-command queue; representative rolling-restart was not rerun because no runtime code changed."
  },
  "causalGovernance": {
    "hypothesis": "After the publication and priority-recovery slices stopped as classification-only bounded backpressure, the next local proof surface is the deferred startup active-gate owner-reconcile handoff with two pending publication membership nodes.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence explain and handoff probes, npm run analyze:causal-model, priority residual extraction, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Focused proof classifies the active-gate owner reconcile wait as bounded. Representative rolling-restart was not rerun because this package changed only focused regression proof.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Publication convergence and priority recovery remain same-artifact classification-only evidence. The active-gate owner-command queue is bounded by focused proof. Timeout budgets, active-gate admission, readiness support, selected-source timeout handling, workflow_progress, and rebalancer_handoff stay frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "Review the completed rebalancer_handoff and workflow_progress packages before implementation starts; do not reopen topology_publication_owner or operation_workflow_owner inside this package without fresh canonical evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication handoff edge after priority backpressure classification",
    "phaseChain": [
      "consume publication convergence classification-only proof",
      "consume workflow_progress bounded owner re-entry proof",
      "consume rebalancer_handoff bounded retry-scheduled proof",
      "use topology active-gate explain and handoff probe to isolate owner_reconcile_pending evidence",
      "run review, fix if required, and implementation subagents before runtime edits",
      "promote exact startup active-gate owner or focused harness files only after the probe selects them",
      "rerun focused active-gate tests and classify representative movement only if runtime or harness behavior changes"
    ],
    "currentFirstFrontier": "publication_ack_convergence remains visible in the same artifact, but completed packages classify publication and priority-recovery backpressure as bounded. The deferred next proof surface is active_gate_snapshot_coverage owned by startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending, snapshotCoverageNodeCount=3/5, and two pending reconcile nodes.",
    "knownDownstreamBlockers": [
      "snapshotCoverageNodeCount is 3 of expectedNodeCount 5",
      "publicationActiveGateHandoffState is pending",
      "publicationActiveGateHandoffReasonCode is owner_reconcile_pending",
      "publicationActiveGateHandoffNextAction is reconcile_owner_membership_publication",
      "publicationActiveGateHandoffRuntimePromotionAllowed is false",
      "publicationActiveGateHandoffPendingReconcileCount is 2",
      "pending reconcile nodes are 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes are cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "activeGateOwnerCohortReasonCode is owner_reconcile_pending with missingPublishedCount=2 and pendingReconcileCount=2",
      "publication and priority-recovery evidence remain frozen same-artifact classification-only context"
    ],
    "missingCausalEdge": "Determine whether the two pending active-gate owner reconcile nodes should be advanced by owner membership publication, classified as bounded waiting state, or migrated to another owner boundary after upstream backpressure is no longer locally actionable.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused proof added in test/admin/admin-control-snapshot.test.js: an OPEN publication with flattened active-gate progress, runtimePromotionAllowed=false, and two pending reconcile nodes queues only the selected owner reconcile cohort, does not rebuild until the owner outcome is visible, preserves original snapshot coverage while reconcile waits, does not convert publication truth locally, and surfaces write_deferred/enqueued owner outcome.",
    "boundedProgressProofArtifact": "npx tap --grep \"AdminControlSnapshot no-attempt path queues flattened OPEN active-gate handoff reconcile\" test/admin/admin-control-snapshot.test.js plus npx tap --grep \"publication active-gate selector accepts flattened active-gate progress handoff\" test/control-plane/publication-active-gate-handoff-contract.test.js",
    "expectedObservableTransition": "Focused observable transition: the two pending active-gate owner reconcile nodes advance through the existing bounded owner-command queue without local promotion or runtime changes. Representative transition is classification-only because no runtime file changed and no representative rerun was required.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage owner-reconcile slice",
    "sameFrontierFallback": "Applied: canonical evidence remains at active_gate_snapshot_coverage with pendingReconcileCount=2 and coverage 3/5 in the reference artifact, but focused proof shows bounded owner-command queueing for the OPEN-publication flattened handoff shape. Stop as classification-only instead of reopening frozen publication, priority, timeout-budget, admission, selected-source timeout, workflow_progress, rebalancer_handoff, or readiness edges.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage unless owner reconciliation drains and canonical evidence selects a new boundary",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md / operation_workflow_owner / rebalancer_handoff / classification-only",
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-backpressure.md / operation_workflow_owner / workflow_progress / same-frontier",
      "work/packages/done-20260517-topology-publication-convergence-after-selected-snapshot-lane-reset-migration.md / topology_publication_owner / publication_convergence / classification-only"
    ],
    "oscillationCheck": "This successor is allowed because the rebalancer_handoff package intentionally stopped the priority split as bounded, and canonical active-gate explain evidence selects a different owner boundary and next required action.",
    "handoffInvariant": "Topology publication owner, operation workflow owner, timeout budgets, active-gate admission, readiness support, and selected-source timeout handling remain frozen unless canonical evidence selects them again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "rebalancer_handoff",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The predecessor focused proof classified the remaining rebalancer_handoff retry-scheduled witnesses as bounded backpressure, while topology active-gate explain evidence exposes owner_reconcile_pending with required action reconcile_owner_membership_publication.",
    "evidence": [
      "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --explain active_gate_snapshot_coverage",
      "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage"
    ]
  },
  "predecessor": "work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The predecessor classified the remaining priority-recovery rebalancer handoff
split as bounded retry-scheduled backpressure without runtime changes. The
same artifact still carries deferred active-gate owner-reconcile evidence with
two pending publication membership nodes, so this package owns the next
startup active-gate snapshot coverage proof surface.

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

- [x] Review subagent recorded: Agent Boyle (019e3726-de80-7e00-bb3b-a56cfea41358) reviewed work/packages/done-20260517-priority-recovery-rebalancer-handoff-after-workflow-progress-bounded-proof.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Hegel (019e3747-18a0-7cc2-bc25-9ff58422f02a) implemented work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md
2. test/admin/admin-control-snapshot.test.js
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. topology_publication_owner
2. operation_workflow_owner
3. timeout_budgets
4. active_gate_admission
5. readiness_support
6. selected_source_timeout

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-backpressure-classification.md`, `test/admin/admin-control-snapshot.test.js`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `topology_publication_owner`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`, `readiness_support`, `selected_source_timeout`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`, `npx tap --grep "AdminControlSnapshot no-attempt path queues flattened OPEN active-gate handoff reconcile" test/admin/admin-control-snapshot.test.js`, `npx tap --grep "publication active-gate selector accepts flattened active-gate progress handoff" test/control-plane/publication-active-gate-handoff-contract.test.js`, `node scripts/check-guideline-literals.js test/admin/admin-control-snapshot.test.js`, `node scripts/check-guideline-decision-boundaries.js test/admin/admin-control-snapshot.test.js`, `node scripts/check-guideline-constant-names.js test/admin/admin-control-snapshot.test.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --explain active_gate_snapshot_coverage
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-handoff-edge-20260517T171610Z.report.json
6. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
7. npx tap --grep "AdminControlSnapshot no-attempt path queues flattened OPEN active-gate handoff reconcile" test/admin/admin-control-snapshot.test.js
8. npx tap --grep "publication active-gate selector accepts flattened active-gate progress handoff" test/control-plane/publication-active-gate-handoff-contract.test.js
9. node scripts/check-guideline-literals.js test/admin/admin-control-snapshot.test.js
10. node scripts/check-guideline-decision-boundaries.js test/admin/admin-control-snapshot.test.js
11. node scripts/check-guideline-constant-names.js test/admin/admin-control-snapshot.test.js

## Focused Proof Result

Classification-only focused proof. The two pending active-gate owner reconcile
nodes should advance through the existing bounded owner-command queue, not by a
new runtime patch in publication, priority recovery, timeout, admission,
readiness, selected-source timeout, workflow_progress, or rebalancer_handoff.

The focused admin regression proves that an `OPEN` publication with flattened
active-gate handoff progress, `runtimePromotionAllowed=false`, and two pending
reconcile nodes queues only the selected owner reconcile cohort, does not
locally promote active gate, does not convert publication truth, does not run a
visibility rebuild before the owner outcome is visible, and surfaces a
`write_deferred`/enqueued owner outcome. Representative rolling-restart was not
rerun because no runtime code changed.

Known validation residual: `npm test -- test/admin/admin-control-snapshot.test.js`
still fails an existing unrelated priority-recovery observation assertion in
`AdminControlSnapshot exports publication convergence gate from live priority
recovery readiness`; the focused new regression passes under `npx tap --grep`.
