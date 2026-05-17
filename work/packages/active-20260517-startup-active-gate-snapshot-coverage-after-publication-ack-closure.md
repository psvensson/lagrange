# Startup Active Gate Snapshot Coverage After Publication ACK Closure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The publication ACK/open count-only slice closed: the representative rerun reports publication_ack_convergence satisfied with publicationStatus=PUBLISHED, pendingAckCount=0, and publicationOwnerAckState=not_required. The first frontier migrated to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverageNodeCount=3 of expectedNodeCount=5, publicationActiveGateHandoffState=pending, reason owner_reconcile_pending, pendingReconcileCount=2, and nextAction reconcile_owner_membership_publication.",
  "nextAction": "Continue locally on the active-gate owner-reconcile snapshot coverage path selected by the representative report; reconcile owner membership publication for the two pending nodes while keeping publication ACK and priority recovery frozen.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js"
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
    "artifact": "test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue locally on the active-gate owner-reconcile snapshot coverage path selected by canonical evidence; reconcile owner membership publication for the two pending nodes while publication ACK and priority recovery remain frozen."
  },
  "causalGovernance": {
    "hypothesis": "Publication ACK is now satisfied, and the remaining representative blocker is active-gate snapshot coverage: snapshotCoverageNodeCount=3/5, activeGateState=timed_out, publicationActiveGateHandoffState=pending, owner_reconcile_pending, pendingReconcileCount=2, runtimePromotionAllowed=false, and nextAction=reconcile_owner_membership_publication.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, replay fixture, npm run analyze:causal-model, distributed-failure, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "active_gate_snapshot_coverage becomes satisfied, pending owner reconcile count or snapshot coverage improves with focused owner proof, representative rolling-restart turns green, or canonical evidence migrates to a new owner boundary.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK and priority recovery are satisfied in the causal graph and remain frozen unless canonical evidence selects them again. Timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless selected.",
    "crossBoundaryReview": "Do not absorb publication ACK or priority workflow evidence into this package; this package owns only the selected startup active-gate snapshot coverage handoff."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication open count-only ACK rerun",
    "phaseChain": [
      "consume the migrated publication ACK closure proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, distributed failure summary, and owner-files on the new representative artifact",
      "build or reuse the narrowest active-gate owner-reconcile fixture for pendingReconcileCount=2 and runtimePromotionAllowed=false",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected active-gate owner path after exact runtime files are promoted",
      "rerun focused active-gate owner tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverageNodeCount=3/5, and pendingReconcileCount=2.",
    "knownDownstreamBlockers": [
      "readiness_startup_support is deferred behind active_gate_snapshot_coverage as inherited active-gate no progress",
      "publication_ack_convergence is satisfied with publicationStatus=PUBLISHED and pendingAckCount=0",
      "priority_recovery_partition_progress is satisfied and must remain frozen unless reselected",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight"
    ],
    "missingCausalEdge": "The selected edge is the active-gate owner-reconcile handoff: pending owner membership publication reconcile remains for two nodes while runtime promotion is not allowed.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --handoff-probe",
    "boundedProgressProof": "Pending before focused bounded active-gate proof and representative rerun; the selected progress mechanism is owner membership publication reconcile.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "expectedObservableTransition": "Focused proof should satisfy active_gate_snapshot_coverage, reduce pendingReconcileCount or increase snapshotCoverageNodeCount, migrate to a canonical successor owner, or turn representative rolling-restart green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage owner-reconcile slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains on the same active_gate_snapshot_coverage frontier with no metric or evidence movement, stop as same-frontier instead of widening into frozen publication, priority, timeout, or readiness edges.",
    "expectedNextFrontier": "active_gate_snapshot_coverage satisfied, reduced to narrower owner-reconcile evidence, representative green, or canonical migration to a successor owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "Allowed because fresh representative evidence satisfied publication ACK and selected active_gate_snapshot_coverage as the first frontier with improved snapshot coverage from 2/5 to 3/5 and pending reconcile reduced from 3 to 2.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md"
}
-->

## Why

The publication ACK package satisfied `publication_ack_convergence` in the
fresh representative run. The first remaining frontier is now
`active_gate_snapshot_coverage` with `snapshotCoverageNodeCount=3/5` and a
pending owner reconcile handoff for two nodes.

This package owns only that startup active-gate snapshot coverage handoff.
Publication ACK, priority recovery, timeout budgets, active-gate admission,
selected-source selection, forced repair timeout handling, authoritative
query-pressure fallback, and readiness support stay frozen unless canonical
evidence selects them again.

## Scope Basis

Continuation of the active rolling-restart green-gate closure sprint after
canonical evidence migrated from `topology_publication_owner /
publication_convergence` back to `startup_active_gate_owner /
snapshot_coverage`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  the first frontier selected by canonical evidence is a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. work/model-ledger.jsonl
5. src/control-plane/publication-active-gate-handoff-contract.js
6. src/control-plane/membership-publication-planning.js
7. test/control-plane/publication-active-gate-handoff-contract.test.js
8. test/admin/admin-control-snapshot.test.js
9. test/distributed/harness/__tests__/active-gate-closure-classification.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/membership-publication-planning.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot.test.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json
5. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json
6. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
