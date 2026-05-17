# Topology Publication ACK Pending After Active Gate Drain Migration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "The active-gate handoff selector package migrated the representative first frontier to publication_ack_convergence under topology_publication_owner / publication_convergence. The drained-handoff report has publicationStatus=OPEN, pendingAckCount=1, pendingAckNodeIds=[], prioritySpreadPending=true, publicationOwnerAckState=unavailable, publicationOwnerFreshnessFence=publishing, publicationOwnerRecoveryOutcome=waiting_for_publication, and publicationOwnerStreamOutcome=publishing. Active-gate snapshot coverage is deferred behind publication ACK with snapshotCoverageNodeCount=2/7 and pendingReconcileCount=5. Priority residual extraction reports one subordinate operation_workflow_owner / workflow_progress witness on control_plane_publications-p1 with recovering_in_flight, persisted_not_dispatched, event_driven, and nextRequiredAction=advance_existing_operation.",
  "nextAction": "Classify the publication ACK/open frontier from the drained active-gate handoff run; keep the operation_workflow_owner / workflow_progress witness subordinate unless canonical evidence promotes it.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md"
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
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
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
    "artifact": "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "pending_acks_present",
    "nextAction": "Classify the publication ACK/open frontier while keeping the single operation_workflow_owner / workflow_progress witness subordinate unless canonical evidence promotes it."
  },
  "causalGovernance": {
    "hypothesis": "The selected blocker is publication ACK/open convergence after the active-gate handoff selector drained stale progress: publicationStatus=OPEN, pendingAckCount=1, prioritySpreadPending=true, publicationOwnerAckState=unavailable, freshnessFence=publishing, recoveryOutcome=waiting_for_publication, and streamOutcome=publishing. The priority recovery workflow-progress witness may explain the publication backpressure, but this package starts from the canonical first frontier.",
    "stopConditionCheck": "Use work:evidence-summary, topology convergence handoff probe, replay fixture, npm run analyze:causal-model, priority recovery residuals, distributed-failure, and owner-files before runtime edits; then run required review/fix/implementation subagents before changing promoted runtime files.",
    "expectedCausalModelChange": "publication_ack_convergence becomes satisfied, the first frontier migrates to operation_workflow_owner / workflow_progress or another canonical owner, representative rolling-restart turns green, or canonical evidence classifies the publication ACK blocker as accepted backpressure.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Active-gate snapshot coverage is deferred behind publication ACK and remains frozen unless canonical evidence selects it again. Priority recovery has one workflow-progress witness and is subordinate unless canonical evidence promotes it. Timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless selected.",
    "crossBoundaryReview": "Do not absorb active-gate selector work into this package; it closed as migrated. Promote operation_workflow_owner / workflow_progress only if the canonical extractors select that as the actionable owner boundary."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active-gate drained handoff rerun",
    "phaseChain": [
      "consume the migrated active-gate handoff selector proof",
      "use evidence-summary, handoff probe, replay fixture, causal model, priority residual extraction, distributed failure summary, and owner-files on the drained-handoff artifact",
      "classify the publication ACK/open edge before runtime edits",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected owner path after exact runtime files are promoted",
      "rerun focused owner tests and one representative rolling-restart run"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json, owned by topology_publication_owner / publication_convergence with publicationStatus=OPEN, pendingAckCount=1, pendingAckNodeIds=[], and pending_acks_present.",
    "knownDownstreamBlockers": [
      "priority_recovery_partition_progress is retryable and subordinate with one operation_workflow_owner / workflow_progress witness on control_plane_publications-p1",
      "active_gate_snapshot_coverage is deferred behind publication_ack_convergence with snapshotCoverageNodeCount=2/7 and pendingReconcileCount=5",
      "selectedSnapshotObservationMode is repair_deferred with state deferred_refresh and nextAction retry",
      "selectedSnapshotObservationReasonCodes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readiness_startup_support remains deferred as inherited active-gate no progress"
    ],
    "missingCausalEdge": "Publication ACK/open convergence remains pending while priority spread is pending and one control_plane_publications-p1 workflow-progress witness is event-driven persisted_not_dispatched.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe plus npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "boundedProgressProof": "Pending before focused publication ACK / priority backpressure classification and representative rerun; the candidate bounded progress mechanisms are publication owner reconcile/ACK advance and the subordinate workflow dispatch/advance witness.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json",
    "expectedObservableTransition": "Focused proof should satisfy publication_ack_convergence, promote the operation_workflow_owner / workflow_progress witness as the next owner boundary, classify accepted backpressure, migrate to another canonical owner, or turn representative rolling-restart green.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence successor slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence remains on publication_ack_convergence with pendingAckCount=1 and no publication owner or priority witness movement, stop as same-frontier instead of widening into active-gate, timeout, or readiness edges.",
    "expectedNextFrontier": "publication_ack_convergence satisfied, operation_workflow_owner / workflow_progress promoted, representative green, or canonical migration to a successor owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-topology-publication-ack-pending-after-owner-reconcile-migration.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-after-publication-ack-closure.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor produced a focused active-gate selector proof and fresh representative evidence selected a different first frontier.",
    "handoffInvariant": "Active-gate snapshot coverage, timeout budgets, active-gate admission, selected-source selection, forced repair timeout handling, authoritative query-pressure fallback, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-startup-active-gate-snapshot-coverage-joined-reconcile-residual.md"
}
-->

## Why

The drained active-gate handoff run moved the representative first frontier
back to `publication_ack_convergence`. Publication is still `OPEN` with
`pendingAckCount=1`, no concrete pending ACK node ids, and priority spread
pending.

This package owns that publication ACK/open classification. The single
`operation_workflow_owner / workflow_progress` witness is recorded as
subordinate evidence and may be promoted only if canonical extractors select it.

## Scope Basis

Continuation of the rolling-restart green-gate closure sprint after the
active-gate handoff selector package closed as migrated.

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

1. work/packages/active-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-owner-evidence.js
7. src/control-plane/publication-owner-decision.js
8. src/control-plane/publication-recovery-gate.js
9. src/control-plane/publication-recovery-evidence.js
10. test/control-plane/publication-owner-stream.test.js
11. test/control-plane/publication-recovery-gate.test.js
12. test/control-plane/publication-recovery-evidence.test.js

## Out Of Scope

1. timeout_budgets
2. active_gate_admission
3. selected_snapshot_source_selection
4. forced_repair_timeout_handling
5. authoritative_query_pressure_fallback
6. readiness_support

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-topology-publication-ack-pending-after-active-gate-drain-migration.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `timeout_budgets`, `active_gate_admission`, `selected_snapshot_source_selection`, `forced_repair_timeout_handling`, `authoritative_query_pressure_fallback`, `readiness_support`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --handoff-probe
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json --replay-fixture
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-active-gate-drained-handoff-20260517T095943Z.report.json
