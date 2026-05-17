# Startup Active Gate Snapshot Coverage Owner Reconcile After ACK Drain

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Publication ACK is satisfied after the focused count-only projection fix. The latest representative rolling-restart artifact is red on active_gate_snapshot_coverage with snapshotCoverageNodeCount=6/7, activeGateState=timed_out, owner_reconcile_pending, snapshot_repair_deferred, and publicationActiveGateHandoffPendingReconcileCount=5.",
  "nextAction": "Target the active-gate owner reconcile pending handoff from the latest artifact. Success must reduce pending reconcile, improve snapshot coverage beyond 6/7, drain the handoff, migrate to a new owner boundary, or turn rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
    "git diff --check"
  ],
  "writeScope": [
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md",
    "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md"
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
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md",
    "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/control-plane/authoritative-node-evidence-reconciler.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
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
    "artifact": "test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Target owner_reconcile_pending with publicationActiveGateHandoffPendingReconcileCount=5 and snapshotCoverageNodeCount=6/7."
  },
  "causalGovernance": {
    "hypothesis": "Publication ACK and priority recovery are satisfied. The current first frontier is active-gate snapshot coverage, where the selected owner handoff is pending owner membership publication reconciliation for five nodes and snapshot coverage remains 6/7.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, replay fixture, npm run analyze:causal-model, priority residual extraction, distributed-failure summary, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Reduce pending owner reconciliation, improve snapshot coverage beyond 6/7, drain the active-gate handoff, migrate to another canonical owner boundary, or turn representative rolling-restart green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK and priority recovery are satisfied and frozen unless canonical evidence selects them again. Timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless selected.",
    "crossBoundaryReview": "Do not reopen topology_publication_owner / publication_convergence or operation_workflow_owner / workflow_progress inside this package; canonical evidence currently selects startup_active_gate_owner / snapshot_coverage."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication ACK classified rerun",
    "phaseChain": [
      "consume the migrated publication ACK package proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, priority residual extraction, distributed failure summary, and owner-files on the latest representative artifact",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected startup active-gate owner path after exact runtime files are promoted",
      "rerun focused active-gate owner tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json, owned by startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverageNodeCount=6/7, owner_reconcile_pending, snapshot_repair_deferred, and publicationActiveGateHandoffPendingReconcileCount=5.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied with publicationStatus=PUBLISHED and pendingAckCount=0",
      "priority_recovery_partition_progress is satisfied and priority residual extraction reports zero witnesses",
      "publicationActiveGateHandoffState is pending with reason owner_reconcile_pending and nextAction reconcile_owner_membership_publication",
      "publicationActiveGateHandoffPendingReconcileCount is 5",
      "snapshotCoverageNodeCount is 6 of expectedNodeCount 7",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readiness_startup_support remains deferred as inherited active-gate no progress"
    ],
    "missingCausalEdge": "The active-gate owner reconcile handoff remains pending after publication ACK drains, preventing complete snapshot coverage.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --handoff-probe",
    "boundedProgressProof": "Pending before focused owner reconcile implementation; the required bounded mechanism is reconcile_owner_membership_publication and active-gate handoff drain for five pending reconcile nodes.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json",
    "expectedObservableTransition": "Focused proof should reduce pending reconcile, improve snapshot coverage beyond 6/7, drain the handoff, migrate to a new owner boundary, or turn rolling-restart green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage owner-reconcile slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains at active_gate_snapshot_coverage with pendingReconcileCount=5 and no snapshot coverage movement, stop as same-frontier instead of widening into frozen publication, priority, timeout, or readiness edges.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage unless owner reconciliation drains and canonical evidence selects a new owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "Allowed because the predecessor closed the selected publication ACK count-only projection and fresh representative evidence satisfied publication ACK before selecting active_gate_snapshot_coverage again.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md"
}
-->

## Why

The latest representative run satisfies `publication_ack_convergence`, but the
release gate remains red on `active_gate_snapshot_coverage`. The active-gate
handoff reports `owner_reconcile_pending`, `snapshotCoverageNodeCount=6/7`, and
five pending reconcile nodes, so this package owns the next startup active-gate
owner boundary.

## Scope Basis

Continuation of the rolling-restart green-gate closure sprint after the
publication ACK count-only projection package closed as migrated.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  canonical evidence selects a runtime owner boundary.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package. Run review, fix if needed, and implementation
subagents before editing runtime files.

## Subagent Sequencing Ledger

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

- [x] Review subagent recorded: Agent Faraday (019e3597-f55f-7333-a602-473a79157cf3) reviewed work/packages/active-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (af9e824b-e1ca-4322-b9f7-d331266a7709) fixed work/packages/active-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md.
- [x] Implementation subagent recorded: Agent Hume (019e35a0-4b97-71b2-a46a-f59b98a1dd1b) implemented work/packages/active-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md
2. work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md
3. work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md
4. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
5. work/sprints/current-blocker.md
6. work/sprints/current-blocker.json
7. work/model-ledger.jsonl
8. src/admin/admin-control-snapshot-class-part-2.js
9. src/admin/admin-control-snapshot-class-part-3.js
10. src/control-plane/publication-active-gate-handoff-contract.js
11. src/control-plane/membership-publication-planning.js
12. src/control-plane/control-plane-snapshot-owner.js
13. src/control-plane/authoritative-node-evidence-reconciler.js
14. test/admin/admin-control-snapshot.test.js
15. test/control-plane/publication-active-gate-handoff-contract.test.js
16. test/distributed/harness/__tests__/active-gate-closure-classification.test.js

## Out Of Scope

1. topology_publication_owner
2. operation_workflow_owner
3. timeout_budgets
4. readiness_support

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-startup-active-gate-snapshot-coverage-owner-reconcile-after-ack-drain.md`, `work/packages/done-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md`, `work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/membership-publication-planning.js`, `src/control-plane/control-plane-snapshot-owner.js`, `src/control-plane/authoritative-node-evidence-reconciler.js`, `test/admin/admin-control-snapshot.test.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Forbidden files: `topology_publication_owner`, `operation_workflow_owner`, `timeout_budgets`, `readiness_support`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`, `git diff --check`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-ack-classified-20260517T104704Z.report.json
7. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
8. git diff --check
