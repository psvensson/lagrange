# Startup Active Gate Snapshot Coverage Deferred Refresh Discovery Gap

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Fresh same-frontier rolling-restart evidence keeps active_gate_snapshot_coverage blocked at 2/5. The selected source is 11601fe0-72d6-5853-8590-ec2881853e72, selected snapshot observation is repair_deferred/deferred_refresh/deferred/retry with retryAfterMs=2909, and reason codes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight. Publication ACK and priority recovery remain satisfied by canonical extractors.",
  "nextAction": "Prove whether deferred_refresh discovery_node_coverage_gap is owned by snapshot-source selection, forced repair stall, authoritative nodes query pressure, or inherited readiness support; then reduce that exact edge without reopening publication ACK, priority recovery, timeout budgets, or active-gate admission.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md",
    "test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "test/admin/admin-control-snapshot.test.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js"
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
    "status": "live-red-same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Separate deferred_refresh discovery_node_coverage_gap from snapshot-source selection, forced repair stall, authoritative nodes query pressure, and inherited readiness support."
  },
  "causalGovernance": {
    "hypothesis": "The remaining representative edge is active-gate snapshot coverage. The selected snapshot source is 11601fe0-72d6-5853-8590-ec2881853e72 and the selected snapshot observation now reports deferred_refresh/retry with discovery_node_coverage_gap.",
    "stopConditionCheck": "Run entry validation, handoff/snapshot probe, npm run analyze:causal-model on fresh evidence, focused admin snapshot tests, focused owner tests for promoted runtime files, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "Focused proof should identify which of the four named causes owns deferred_refresh discovery_node_coverage_gap, then reduce that edge or migrate to the next canonical frontier.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK and priority recovery remain satisfied by canonical extractors. Active-gate snapshot coverage is 2/5, pendingReconcileCount is 3, selected snapshot next action is retry, and authoritative nodes query pressure appears in the failure evidence.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budgets, or active-gate admission unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after owner-reconcile selected-evidence handoff fix",
    "phaseChain": [
      "consume same-frontier owner-reconcile handoff proof",
      "separate snapshot-source selection from forced repair stall",
      "separate authoritative control snapshot nodes query pressure",
      "confirm readiness support remains inherited from active-gate no progress",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "priority_recovery_partition_progress is satisfied with zero residual witnesses",
      "publication_ack_convergence is satisfied by canonical handoff probe",
      "active_gate_snapshot_coverage is blocked with snapshotCoverageNodeCount=2 and expectedNodeCount=5",
      "selected source is 11601fe0-72d6-5853-8590-ec2881853e72",
      "selected snapshot observation is repair_deferred/deferred_refresh/deferred/retry with retryAfterMs=2909",
      "reason codes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "readiness support remains inherited_active_gate_no_progress"
    ],
    "missingCausalEdge": "Prove whether deferred_refresh discovery_node_coverage_gap is caused by bad snapshot-source selection, forced repair path stalls, authoritative control snapshot nodes query pressure, or inherited readiness support.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The predecessor preserved selected missing publication evidence and revealed a three-node reconcile cohort, but the representative rerun stayed on active_gate_snapshot_coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
    "expectedObservableTransition": "Focused proof should reduce deferred_refresh discovery_node_coverage_gap or migrate to the next canonical edge without reopening frozen decisions.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, split by the exact selected subcause and preserve the four-cause evidence table.",
    "expectedNextFrontier": "representative green, reduced discovery_node_coverage_gap residual, readiness_startup_support, or another canonical frontier after snapshot coverage improves",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This same-frontier package is allowed because fresh representative evidence changed the active-gate subcause from stale_usable/wait to deferred_refresh/retry with discovery_node_coverage_gap.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md"
}
-->

## Why

Fresh representative evidence stayed on `active_gate_snapshot_coverage`, but it
now exposes a narrower selected-snapshot subcause:
`deferred_refresh` / `discovery_node_coverage_gap` for source
`11601fe0-72d6-5853-8590-ec2881853e72`. This package owns separating that edge
from the other possible causes before any runtime edit.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart
topology workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative first frontier stayed on
  startup active-gate snapshot coverage, but the selected subcause changed and
  must be separated before another runtime change.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  listed candidate files, a frozen decision must be reopened, or
  representative evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
- [ ] Implementation subagent recorded: pending-before-implementation-resumes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. test/admin/admin-control-snapshot.test.js

## Out Of Scope

1. publication-ack-convergence
2. priority_recovery_partition_progress
3. operation_workflow_owner
4. timeout_budgets
5. active_gate_admission

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: publication ACK, priority recovery, timeout budgets, and
  active-gate admission remain closed unless canonical evidence selects them.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --explain active_gate_snapshot_coverage
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
