# Startup Active Gate Owner Reconcile Write Deferred Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json",
  "playback": "none",
  "predecessor": "work/packages/done-20260517-startup-active-gate-owner-reconcile-after-query-pressure-fallback.md",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused owner reconcile proof is green: reconcileActiveGateMembershipPublication now accepts an owner-visible desired publication after a stale write/readback result instead of enqueueing another write_deferred retry. The representative rerun stayed red but migrated the first frontier to publication_ack_convergence under topology_publication_owner / publication_convergence with pending_acks_present.",
  "nextAction": "Open a successor for the canonical migrated frontier: topology_publication_owner / publication_convergence, dominant reason pending_acks_present, from test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json. Publication ACK is selected again by canonical evidence; other frozen edges stay closed unless selected.",
  "proof": [
    "npx tap test/control-plane/membership-publication-coordinator-main-stage-2.js --grep \"owner-visible publication after stale write readback\"",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json"
  ],
  "writeScope": [
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-owner-reconcile-after-query-pressure-fallback.md",
    "test-output/reports/rolling-restart-owner-reconcile-refresh-retention-20260517T073616Z.report.json",
    "test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/membership-publication-coordinator.test.js"
  ],
  "commitScope": [
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md",
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
    "artifact": "test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "pending_acks_present",
    "nextAction": "Open a successor for topology_publication_owner / publication_convergence. Publication ACK is selected again by canonical evidence after this owner-reconcile package migrated."
  },
  "causalGovernance": {
    "hypothesis": "The remaining active-gate snapshot coverage gap is now concentrated in owner membership publication reconciliation: the representative artifact reports handoff state pending, reason owner_reconcile_pending, nextAction reconcile_owner_membership_publication, pendingReconcileCount=2, and handoffOutcome write_deferred.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, npm run analyze:causal-model, distributed-failure, and owner-files before runtime edits; then run the required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Achieved for this package: focused owner reconcile proof is green and representative evidence migrated the first frontier to publication_ack_convergence / topology_publication_owner / publication_convergence.",
    "representativeOutcome": "migrated",
    "causalDebt": "Publication ACK is selected again by canonical evidence in the new representative artifact. Priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "This package should stop at the migrated frontier instead of reopening additional frozen edges inside the owner-reconcile slice."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart owner reconcile refresh retention rerun",
    "phaseChain": [
      "consume the reduced owner handoff refresh-retention proof",
      "use work:evidence-summary and handoff probe on the reduced representative artifact",
      "use owner-files to select the narrow remaining owner reconcile write-deferred path",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected owner path after exact owner files are promoted",
      "rerun focused owner tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json, owned by topology_publication_owner / publication_convergence with publicationStatus=OPEN and pending_acks_present.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is selected again by canonical representative evidence",
      "priority_recovery_workflow_progress is frozen unless canonical evidence selects it again",
      "snapshotCoverageNodeCount is 2 of expectedNodeCount 5 but active-gate coverage is deferred behind publication_ack_convergence",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "publicationActiveGateHandoffState is pending with reason owner_reconcile_pending and nextAction reconcile_owner_membership_publication",
      "publicationActiveGateHandoffPendingReconcileCount is 3 in the migrated artifact, but the first frontier is publication_ack_convergence",
      "readiness_startup_support remains deferred as inherited active-gate no progress"
    ],
    "missingCausalEdge": "The owner reconcile write_deferred stale-readback edge is fixed; the remaining representative edge is publication ACK pending.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused owner reconcile test is green: stale write/readback no longer enqueues another retry when the desired publication is owner-visible, and representative rolling-restart migrated to topology_publication_owner / publication_convergence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json",
    "expectedObservableTransition": "Successor should target publication_ack_convergence because canonical evidence selected it again.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage owner-reconcile write-deferred slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains at active_gate_snapshot_coverage with the same pending reconcile count and no metric movement, stop as same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence",
    "resultClassification": "migrated",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-priority-closure.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260517-startup-active-gate-owner-reconcile-after-query-pressure-fallback.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor reduced pending owner reconciliation from 3 nodes to 2 at the same owner boundary.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Focused owner reconcile stale-readback proof closed the selected write_deferred edge locally, and the representative rerun selected publication_ack_convergence as the first frontier with pending_acks_present.",
    "evidence": [
      "npx tap test/control-plane/membership-publication-coordinator-main-stage-2.js --grep \"owner-visible publication after stale write readback\"",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json"
    ]
  }
}
-->

## Why

The previous package made metric-moving progress at the same first frontier:
pending owner reconciliation moved from three nodes to two. The representative
run still fails at `active_gate_snapshot_coverage`, and canonical handoff
evidence selects `startup_active_gate_owner / snapshot_coverage` with
`owner_reconcile_pending` for nodes
`11601fe0-72d6-5853-8590-ec2881853e72` and
`35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.

This package owns the next narrow proof for the remaining `write_deferred`
owner-reconcile edge. It must improve the metric, remove
`discovery_node_coverage_gap`, migrate to a genuinely new owner boundary, or
turn the representative rolling-restart run green. Publication ACK, priority
recovery, timeout budgets, active-gate admission, selected-source selection,
forced repair timeout handling, authoritative query-pressure fallback, and
readiness support remain frozen unless canonical evidence selects them again.

## Scope Basis

Continuation of the active rolling-restart green-gate closure sprint after the
bounded owner handoff refresh-retention slice classified as `reduced`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Ohm (019e34ea-a900-7ec2-9daa-ccb35654a330) reviewed work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Planck (019e34ec-e188-7360-98b4-83139c93351a) fixed work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md.
- [x] Implementation subagent recorded: Agent Erdos (019e34f0-6a2a-78a0-931c-2136cfbcac2e) implemented work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. src/control-plane/membership-publication-coordinator-class-stage-2.js
2. test/control-plane/membership-publication-coordinator-main-stage-2.js
3. work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md
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

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`, `work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `publication_ack_convergence`, `priority_recovery_workflow_progress`, `timeout_budgets`, `active_gate_admission`, `selected_snapshot_source_selection`, `forced_repair_timeout_handling`, `authoritative_query_pressure_fallback`, `readiness_support`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-refresh-retention-20260517T073616Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-refresh-retention-20260517T073616Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-refresh-retention-20260517T073616Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-owner-reconcile-refresh-retention-20260517T073616Z.report.json`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npx tap test/control-plane/membership-publication-coordinator-main-stage-2.js --grep "owner-visible publication after stale write readback"`
2. PASS - `npx tap test/control-plane/membership-publication-coordinator-main-stage-2.js`
3. PASS - `node --check src/control-plane/membership-publication-coordinator-class-stage-2.js`
4. PASS - `node --check test/control-plane/membership-publication-coordinator-main-stage-2.js`
5. PASS - `node scripts/check-guideline-literals.js src/control-plane/membership-publication-coordinator-class-stage-2.js ./test/control-plane/membership-publication-coordinator-main-stage-2.js`
6. PASS - `node scripts/check-guideline-decision-boundaries.js src/control-plane/membership-publication-coordinator-class-stage-2.js test/control-plane/membership-publication-coordinator-main-stage-2.js`
7. PASS - `npm run audit:runtime-grammar:file -- src/control-plane/membership-publication-coordinator-class-stage-2.js`
8. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json`
9. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json --handoff-probe`
10. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json`
11. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json`
12. PASS - `npm run work:validate -- --pre-impl work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md`
13. PASS - `git diff --check`

Representative result: red but migrated. First frontier moved to
`publication_ack_convergence` under `topology_publication_owner /
publication_convergence` with dominant reason `pending_acks_present`.
