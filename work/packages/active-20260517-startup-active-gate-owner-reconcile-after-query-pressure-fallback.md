# Startup Active Gate Owner Reconcile After Query Pressure Fallback

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The predecessor selected authoritative_control_snapshot_query_pressure and moved representative snapshotCoverage from 0/5 to 4/5. The latest first frontier remains startup_active_gate_owner / snapshot_coverage with owner_reconcile_pending, snapshot_repair_deferred, discovery_node_coverage_gap, and three pending owner cohort nodes requiring reconcile_owner_membership_publication.",
  "nextAction": "Run the required review/fix/implementation subagent sequence, then target the narrow startup active-gate owner reconciliation path for pending nodes 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, 8be8d30f-4499-5eed-865c-71b4d529a67a, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58. Success must reduce pending reconcile, remove discovery_node_coverage_gap, improve snapshotCoverage to 5/5, migrate to a genuinely new owner boundary, or turn rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "work/packages/active-20260517-startup-active-gate-owner-reconcile-after-query-pressure-fallback.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md",
    "test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "work/packages/active-20260517-startup-active-gate-owner-reconcile-after-query-pressure-fallback.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "cross-boundary-causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "active-gate-snapshot-coverage/owner-reconcile",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Target reconcile_owner_membership_publication for three pending owner cohort nodes after predecessor moved snapshotCoverage to 4/5."
  },
  "causalGovernance": {
    "hypothesis": "The remaining active-gate snapshot coverage gap is owned by startup active-gate owner reconciliation: the projected fallback covers four nodes, but three owner cohort nodes remain pending owner membership publication reconciliation and discovery_node_coverage_gap remains in the deferred snapshot observation.",
    "stopConditionCheck": "Use npm run work:evidence-summary, npm run analyze:topology-convergence -- --handoff-probe, npm run analyze:owner-files, and npm run analyze:causal-model before runtime edits; then run required subagents before promoting exact owner files.",
    "expectedCausalModelChange": "Pending owner reconciliation is reduced, discovery_node_coverage_gap disappears, snapshotCoverage reaches 5/5, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support are frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "This package continues the same startup_active_gate_owner / snapshot_coverage frontier only because the predecessor moved coverage to 4/5 and canonical handoff evidence selected owner_reconcile_pending with required action reconcile_owner_membership_publication."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate projected fallback rerun",
    "phaseChain": [
      "consume the closed authoritative query-pressure fallback proof",
      "use work:evidence-summary and handoff probe on the 4/5 representative artifact",
      "use owner-files to select the narrow startup active-gate owner reconciliation path",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected owner reconciliation path after exact owner files are promoted",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with snapshotCoverage=4/5, owner_reconcile_pending, snapshot_repair_deferred, and discovery_node_coverage_gap.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied as producer state with publicationStatus=PUBLISHED and publicationOwnerAckState=not_required",
      "priority_recovery_partition_progress is satisfied and residual extraction reports zero witnesses",
      "snapshotCoverageNodeCount is 4 of expectedNodeCount 5",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "publicationActiveGateHandoffState is pending with reason owner_reconcile_pending and nextAction reconcile_owner_membership_publication",
      "publicationActiveGateHandoffPendingReconcileCount is 3 for nodes 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, 8be8d30f-4499-5eed-865c-71b4d529a67a, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58",
      "readiness_startup_support remains deferred as inherited active-gate no progress"
    ],
    "missingCausalEdge": "Decide the narrow owner reconciliation edge that keeps three owner cohort nodes pending after projected fallback coverage reached 4/5.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json --handoff-probe",
    "boundedProgressProof": "Entry bounded reconcile proof: predecessor improved coverage to 4/5 and the handoff probe selected reconcile_owner_membership_publication as the next required progress mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json",
    "expectedObservableTransition": "Pending owner reconciliation is reduced, discovery_node_coverage_gap disappears, snapshotCoverage reaches 5/5, a genuinely new owner boundary is selected, or representative rolling-restart turns green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage owner-reconcile slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains at active_gate_snapshot_coverage with the same pending reconcile count and no metric movement, stop as same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage unless owner reconciliation drains and readiness or a new boundary is selected",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-priority-recovery-workflow-progress-after-publication-handoff.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This package is allowed because the immediate predecessor made metric-moving progress at the same owner boundary, from snapshotCoverage=0/5 to 4/5, and canonical evidence selected a narrower owner reconciliation action.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md"
}
-->

## Why

The previous package moved the active-gate snapshot coverage metric from `0/5`
to `4/5`. The remaining red edge is no longer the four-cause snapshot-source
decision; canonical handoff evidence now selects active-gate owner
reconciliation for three pending cohort nodes.

This package owns that narrow reconcile path and must not reopen publication
ACK, priority recovery, timeout budgets, active-gate admission, selected-source
selection, forced repair timeout handling, authoritative query-pressure
fallback, or readiness support unless canonical evidence selects them again.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e34b4-f0af-7782-b395-7a68b2237c73) reviewed work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e34b7-787d-7251-8bed-e291ced5ab34) fixed work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md.
- [x] Implementation subagent recorded: Agent Pasteur (019e34d2-bd36-7701-bf1c-afc67f68e466) implemented work/packages/active-20260517-startup-active-gate-owner-reconcile-after-query-pressure-fallback.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-startup-active-gate-owner-reconcile-after-query-pressure-fallback.md
2. src/admin/admin-control-snapshot-class-part-2.js
3. test/admin/admin-control-snapshot.test.js
4. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
5. work/sprints/current-blocker.md
6. work/sprints/current-blocker.json
7. work/model-ledger.jsonl

## Out Of Scope

1. publication_ack_convergence
2. priority_recovery_workflow_progress
3. timeout_budgets
4. active_gate_admission
5. selected_snapshot_source_selection
6. forced_repair_timeout_handling
7. authoritative_query_pressure_fallback
8. readiness_support

## Model Fit

- Package class: `cross-boundary-causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `active-gate-snapshot-coverage/owner-reconcile`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-startup-active-gate-owner-reconcile-after-query-pressure-fallback.md`, `src/admin/admin-control-snapshot-class-part-2.js`, `test/admin/admin-control-snapshot.test.js`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `publication_ack_convergence`, `priority_recovery_workflow_progress`, `timeout_budgets`, `active_gate_admission`, `selected_snapshot_source_selection`, `forced_repair_timeout_handling`, `authoritative_query_pressure_fallback`, `readiness_support`
- Frozen decisions: publication ACK, priority recovery, timeout budgets,
  active-gate admission, selected-source selection, forced repair timeout
  handling, authoritative query-pressure fallback, and readiness support remain
  closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json
4. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown

## Implementation Notes

Focused refresh-retention proof implemented in the admin owner refresh path.
The new fixture first failed against the coverage-only retention rule:
`prepareVisibleMembershipPublicationHandoffRefresh()` discarded a refreshed
snapshot with flat `nodes.length` even though visible owner publication drained
handoff reconcile evidence. The fix adds a single comparison helper in
`src/admin/admin-control-snapshot-class-part-2.js` that retains refreshes when
coverage increases or owner handoff evidence improves. Improvement is limited
to decreased pending reconcile count, decreased pending reconcile node list,
movement away from `owner_reconcile_pending`, or runtime promotion becoming
allowed.

No publication ACK, priority recovery, timeout budget, active-gate admission,
selected-source, forced repair timeout, authoritative query-pressure fallback,
readiness support, or membership publication coordinator files were reopened.

## Validation Results

- `npm --silent test -- test/admin/admin-control-snapshot.test.js --grep "retains flat coverage refresh"` failed before the runtime fix with `refreshed=false` and stale pending reconcile evidence retained.
- `npm --silent test -- test/admin/admin-control-snapshot.test.js --grep "retains flat coverage refresh"` passed after the runtime fix.
- `npm --silent test -- test/admin/admin-control-snapshot.test.js --grep "visible owner publication|flat coverage refresh|preserves original snapshot after owner outcome"` passed.
- `node --check src/admin/admin-control-snapshot-class-part-2.js` passed.
- `node --check test/admin/admin-control-snapshot.test.js` passed.
- `node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js test/admin/admin-control-snapshot.test.js` passed with 0 new violations.
- `node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js test/admin/admin-control-snapshot.test.js` passed with 0 violations.
- `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js` passed with 0 violations.
- `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json` still reports first frontier `active_gate_snapshot_coverage`, owner `startup_active_gate_owner`, boundary `snapshot_coverage`.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json --handoff-probe` still reports handoff `owner_reconcile_pending` with 3 pending nodes in the existing representative artifact.
- `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-projected-fallback-20260517T063708Z.report.json` still classifies `active_gate_snapshot_coverage_incomplete` as a local runtime owner blocker in the existing representative artifact.
- `npm run work:validate -- --pre-impl` passed after regenerating `work/sprints/current-blocker.md` and `work/sprints/current-blocker.json`.
- `git diff --check` passed.
