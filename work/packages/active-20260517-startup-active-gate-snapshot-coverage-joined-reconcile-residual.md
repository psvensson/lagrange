# Startup Active Gate Snapshot Coverage Joined Reconcile Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The predecessor preserved joined pending reconcile node ids after publication ACK closure and improved representative snapshot coverage from 3/5 to 4/5. The representative gate remains red at active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, publicationActiveGateHandoffState=pending, owner_reconcile_pending, pendingReconcileCount=3, runtimePromotionAllowed=false, and nextAction=reconcile_owner_membership_publication. Publication ACK and priority recovery remain satisfied/frozen.",
  "nextAction": "Continue locally on the active-gate owner-reconcile snapshot coverage path after joined pending reconcile ids improved snapshot coverage to 4/5; reconcile the remaining owner membership publication cohort while publication ACK and priority recovery remain frozen.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
    "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md",
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
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
    "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md"
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
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
    "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md",
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
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
    "artifact": "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue locally on active-gate owner-reconcile after the joined-id preservation reduction: coverage is 4/5, pendingReconcileCount=3, runtimePromotionAllowed=false, and nextAction=reconcile_owner_membership_publication."
  },
  "causalGovernance": {
    "hypothesis": "The remaining blocker is active-gate snapshot coverage after joined pending reconcile ids are preserved: snapshotCoverageNodeCount=4/5, activeGateState=timed_out, publicationActiveGateHandoffState=pending, owner_reconcile_pending, pendingReconcileCount=3, runtimePromotionAllowed=false, and nextAction=reconcile_owner_membership_publication.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, replay fixture, npm run analyze:causal-model, distributed-failure, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "active_gate_snapshot_coverage becomes satisfied, pendingReconcileCount decreases, snapshot coverage improves to 5/5, representative rolling-restart turns green, or canonical evidence migrates to a new owner boundary.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK and priority recovery are satisfied in the causal graph and remain frozen unless canonical evidence selects them again. Timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless selected.",
    "crossBoundaryReview": "Do not absorb publication ACK or priority workflow evidence into this package; this package owns only the selected startup active-gate snapshot coverage owner-reconcile handoff."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate joined reconcile rerun",
    "phaseChain": [
      "consume the reduced joined pending reconcile id proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, distributed failure summary, and owner-files on the latest representative artifact",
      "build or reuse the narrowest active-gate owner-reconcile fixture for pendingReconcileCount=3 and runtimePromotionAllowed=false",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected active-gate owner path after exact runtime files are promoted",
      "rerun focused active-gate owner tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverageNodeCount=4/5, and pendingReconcileCount=3.",
    "knownDownstreamBlockers": [
      "readiness_startup_support is deferred behind active_gate_snapshot_coverage as inherited active-gate no progress",
      "publication_ack_convergence is satisfied with publicationStatus=PUBLISHED and pendingAckCount=0",
      "priority_recovery_partition_progress is satisfied and must remain frozen unless reselected",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight"
    ],
    "missingCausalEdge": "The selected edge is the active-gate owner-reconcile handoff: owner membership publication reconcile remains pending for three nodes while runtime promotion is not allowed.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe",
    "boundedProgressProof": "Pending before the next focused bounded active-gate proof and representative rerun; the selected progress mechanism is owner membership publication reconcile.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json",
    "expectedObservableTransition": "Focused proof should satisfy active_gate_snapshot_coverage, reduce pendingReconcileCount, improve snapshotCoverageNodeCount to 5/5, migrate to a canonical successor owner, or turn representative rolling-restart green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage joined-reconcile residual slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains on the same active_gate_snapshot_coverage frontier with no metric or evidence movement, stop as same-frontier instead of widening into frozen publication, priority, timeout, or readiness edges.",
    "expectedNextFrontier": "active_gate_snapshot_coverage satisfied, reduced to narrower owner-reconcile evidence, representative green, or canonical migration to a successor owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "Allowed because the predecessor made monotonic metric movement on the same owner boundary: snapshot coverage improved from 3/5 to 4/5 while publication ACK remained satisfied.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md"
}
-->

## Why

The predecessor proved a bounded reduction at the active-gate handoff: joined
pending reconcile node ids now survive ACK-closed handoff selection, and the
representative rerun improved snapshot coverage from `3/5` to `4/5`.

The gate is still red on the same canonical first frontier:
`startup_active_gate_owner / snapshot_coverage` with
`owner_reconcile_pending`, `pendingReconcileCount=3`, and
`runtimePromotionAllowed=false`. This package owns only that remaining
active-gate owner-reconcile residual.

## Scope Basis

Continuation of the active rolling-restart green-gate closure sprint after a
metric-moving reduction at the same owner boundary.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  the first frontier selected by canonical evidence is a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-review.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
- [ ] Implementation subagent recorded: pending-before-implementation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md
2. work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md
3. work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md
4. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
5. work/sprints/current-blocker.md
6. work/sprints/current-blocker.json
7. work/model-ledger.jsonl
8. src/control-plane/publication-active-gate-handoff-contract.js
9. src/control-plane/membership-publication-planning.js
10. test/control-plane/publication-active-gate-handoff-contract.test.js
11. test/admin/admin-control-snapshot.test.js
12. test/distributed/harness/__tests__/active-gate-closure-classification.test.js

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md`, `work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md`, `work/packages/active-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/membership-publication-planning.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/admin/admin-control-snapshot.test.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json
5. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-joined-reconcile-20260517T091454Z.report.json
6. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
