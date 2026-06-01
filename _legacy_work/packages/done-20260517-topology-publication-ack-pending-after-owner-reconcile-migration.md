# Topology Publication ACK Pending After Owner Reconcile Migration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Focused publication ACK/open count-only proof is green: OPEN with explicit empty pendingAckNodeIds no longer reports ACK lag from count-only pendingAckCount. The representative rerun satisfied publication_ack_convergence with publicationStatus=PUBLISHED, pendingAckCount=0, and publicationOwnerAckState=not_required, then migrated the first frontier to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverageNodeCount=3/5, and pendingReconcileCount=2.",
  "nextAction": "Open a successor for the canonical migrated frontier: startup_active_gate_owner / snapshot_coverage, dominant reason active_gate_timed_out, from test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json. Publication ACK and priority recovery are satisfied in the causal graph and stay frozen unless canonical evidence selects them again.",
  "proof": [
    "node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
    "work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md",
    "work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md",
    "test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json",
    "test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-planning.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md",
    "work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md",
    "work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js"
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
    "nextAction": "Open a successor for startup_active_gate_owner / snapshot_coverage. Publication ACK is satisfied and the remaining representative frontier is active-gate snapshot coverage with owner_reconcile_pending."
  },
  "causalGovernance": {
    "hypothesis": "The publication owner ACK/open count-only edge is closed: OPEN with explicit empty pendingAckNodeIds no longer turns count-only pendingAckCount into ACK lag, and the representative rerun reports publicationStatus=PUBLISHED with pendingAckCount=0.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, topology replay fixture, npm run analyze:causal-model, distributed-failure, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "Achieved for this package: publication_ack_convergence is satisfied, and representative evidence migrated the first frontier to active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage.",
    "representativeOutcome": "migrated",
    "causalDebt": "Active-gate snapshot coverage is selected again by canonical evidence in the new representative artifact. Publication ACK and priority recovery are satisfied in the causal graph and remain frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "This package stops at the migrated frontier instead of reopening additional frozen active-gate or timeout edges inside the publication ACK slice."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart owner reconcile visible-readback rerun",
    "phaseChain": [
      "consume the migrated owner-reconcile write-deferred proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, distributed failure summary, and owner-files on the migrated representative artifact",
      "build or reuse the narrowest publication owner fixture for publication OPEN with pendingAckCount=1, empty pendingAckNodeIds, ack_lag, and waiting_for_ack owner stream evidence",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected publication owner path after exact runtime files are promoted",
      "rerun focused publication owner tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json, owned by topology_publication_owner / publication_convergence with publicationStatus=OPEN, pendingAckCount=1, pendingAckNodeIds=[], and pending_acks_present.",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage is deferred behind publication_ack_convergence",
      "snapshotCoverageNodeCount is 2 of expectedNodeCount 5",
      "publicationActiveGateHandoffState is pending with owner_reconcile_pending and pendingReconcileCount=3",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readiness_startup_support remains deferred as inherited active-gate no progress",
      "priority_recovery_partition_progress is satisfied in the causal graph and must remain frozen unless reselected"
    ],
    "missingCausalEdge": "The selected edge is the publication owner ACK/open state: count-only pending ACK evidence exists without pendingAckNodeIds while the owner stream reports waiting_for_ack / ack_lag.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-owner-reconcile-visible-readback-20260517T081137Z.report.json --replay-fixture",
    "boundedProgressProof": "Focused publication owner tests are green, runtime guardrails pass, and the bounded ACK advance proof satisfied publication_ack_convergence with pendingAckCount=0 before migrating to active_gate_snapshot_coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
    "expectedObservableTransition": "Achieved: focused proof satisfied publication_ack_convergence and migrated the representative first frontier to active_gate_snapshot_coverage.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence ACK/open publication slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains on the same publication_ack_convergence frontier with no metric or evidence movement, stop as same-frontier instead of widening into frozen active-gate or timeout edges.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Allowed because fresh representative evidence satisfied publication_ack_convergence and selected active_gate_snapshot_coverage with metric movement: snapshot coverage improved from 2/5 to 3/5 and pending reconcile reduced from 3 to 2.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Focused publication ACK/open count-only proof closed the selected ACK lag edge locally, and the representative rerun selected active_gate_snapshot_coverage as the first frontier with active_gate_timed_out.",
    "evidence": [
      "node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md"
}
-->

## Why

Canonical evidence reselected `publication_ack_convergence` after the
owner-reconcile write-deferred slice closed its selected stale-readback edge.
The current representative artifact reports `publicationStatus=OPEN`,
`pendingAckCount=1`, `pendingAckNodeIds=[]`, `publicationOwnerAckState=waiting_for_ack`,
`publicationOwnerFreshnessFence=ack_lag`, and
`publicationOwnerStreamOutcome=waiting_for_ack`.

This package owns only that publication owner ACK/open edge. Active-gate
snapshot coverage, priority recovery, timeout budgets, selected snapshot-source
selection, forced repair timeout handling, authoritative query-pressure
fallback, and readiness support stay frozen unless the focused publication
proof selects them again.

## Scope Basis

Continuation of the active rolling-restart green-gate closure sprint after
canonical evidence migrated from `startup_active_gate_owner / snapshot_coverage`
to `topology_publication_owner / publication_convergence`.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and a
  recently frozen publication ACK frontier was reselected by canonical
  evidence.
- Escalation trigger to a heavier lane: focused proof selects multiple runtime
  owners, requires files outside the declared publication owner set, or
  reopens a frozen active-gate, priority, timeout, or readiness edge.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Aquinas (019e3510-2720-7143-b6d2-b616bbe732b2) reviewed work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Russell (019e3512-f16c-7691-9267-3e44d9c523a0) fixed work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md.
- [x] Implementation subagent recorded: Agent Codex (019e3514-d9d3-7d81-9b43-e34375e01a15) implemented work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md
2. work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md
3. work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md
4. work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md
5. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
6. work/sprints/current-blocker.md
7. work/sprints/current-blocker.json
8. work/model-ledger.jsonl
9. src/control-plane/publication-recovery-gate.js
10. src/control-plane/publication-recovery-evidence.js
11. src/control-plane/publication-owner-decision.js
12. src/control-plane/publication-owner-evidence.js
13. test/control-plane/publication-recovery-gate.test.js
14. test/control-plane/publication-recovery-evidence.test.js
15. test/control-plane/publication-owner-stream.test.js

## Out Of Scope

1. timeout_budgets
2. active_gate_admission
3. selected_snapshot_source_selection
4. forced_repair_timeout_handling
5. authoritative_query_pressure_fallback
6. readiness_support
7. priority_recovery_workflow_progress

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md`, `work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md`, `work/packages/active-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md`, `work/packages/done-20260517-startup-active-gate-owner-reconcile-write-deferred-residual.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-owner-evidence.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/control-plane/publication-owner-stream.test.js`
- Forbidden files: `timeout_budgets`, `active_gate_admission`, `selected_snapshot_source_selection`, `forced_repair_timeout_handling`, `authoritative_query_pressure_fallback`, `readiness_support`, `priority_recovery_workflow_progress`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`, `npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `node --test test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
2. PASS - `node scripts/check-guideline-literals.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
3. PASS - `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
4. PASS - `npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js`
5. PASS - `git diff --check`
6. RED/MIGRATED - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --verbose`
7. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`
8. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --handoff-probe`
9. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json --replay-fixture`
10. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`
11. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-publication-open-count-only-ack-20260517T084752Z.report.json`

Representative result: red but migrated. `publication_ack_convergence` is
satisfied with `publicationStatus=PUBLISHED` and `pendingAckCount=0`; the first
frontier moved to `active_gate_snapshot_coverage` under
`startup_active_gate_owner / snapshot_coverage` with `active_gate_timed_out`,
`snapshotCoverageNodeCount=3/5`, and `pendingReconcileCount=2`.

## Commit And Push Ledger

1. Focused package commit: `52a3d5b6f09648a94f267eff3ceb218a980b1b3b`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
