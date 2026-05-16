# Startup Active Gate Selected Snapshot Source Timeout

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The visible owner-publication refresh slice removed discovery_node_coverage_gap, but representative rolling-restart remains red on active_gate_snapshot_coverage with snapshotCoverageNodeCount=0/5, selected source 11601fe0-72d6-5853-8590-ec2881853e72, selectedSnapshotSourceCause=selected_snapshot_source_timeout, and selectedSnapshotTimeoutMs=3340. Publication ACK and priority recovery are satisfied.",
  "nextAction": "Build the narrow replayable selected-source timeout proof for source 11601fe0-72d6-5853-8590-ec2881853e72, separate snapshot source selection from snapshot query timeout and forced repair timeout, then edit only the selected owner path if the proof selects one.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-selected-snapshot-source-timeout.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md",
    "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-5.js",
    "test/distributed/harness/cluster-segment-7-class-2.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-startup-active-gate-selected-snapshot-source-timeout.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
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
    "artifact": "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduce selected_snapshot_source_timeout for selected source 11601fe0-72d6-5853-8590-ec2881853e72 without reopening publication ACK, priority recovery, timeout budgets, or active-gate admission."
  },
  "causalGovernance": {
    "hypothesis": "The representative frontier is no longer deferred_refresh discovery_node_coverage_gap. The selected owner edge is now source 11601fe0-72d6-5853-8590-ec2881853e72 timing out on the selected snapshot query, with forced repair also timing out. A replayable fixture must distinguish bad snapshot-source selection from a real admin snapshot query timeout and forced repair timeout before runtime edits.",
    "stopConditionCheck": "Run entry validation, selected-source timeout replay/probe, npm run analyze:causal-model on fresh evidence, focused owner tests for the selected runtime file, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "Either snapshotCoverage improves above 0/5, discovery_node_coverage_gap stays gone and selected_snapshot_source_timeout disappears, the frontier migrates to a new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK and priority recovery are satisfied. The active red edge is selected_snapshot_source_timeout with selectedSnapshotTimeoutMs=3340 and snapshotCoverageNodeCount=0/5.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budgets, or active-gate admission unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after visible owner publication refresh",
    "phaseChain": [
      "consume reduced deferred-refresh discovery-gap proof",
      "build the narrow selected-source timeout replay/probe for source 11601fe0-72d6-5853-8590-ec2881853e72",
      "separate snapshot-source selection from selected admin snapshot query timeout",
      "separate forced repair timeout from the primary selected-source query timeout",
      "promote only the selected owner runtime file after the proof selects one",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied by canonical evidence",
      "priority_recovery_partition_progress is satisfied by canonical evidence",
      "snapshotCoverageNodeCount is 0 and expectedNodeCount is 5",
      "selected source is 11601fe0-72d6-5853-8590-ec2881853e72",
      "selectedSnapshotSourceCause is selected_snapshot_source_timeout",
      "selectedSnapshotTimeoutMs is 3340",
      "selected snapshot error includes primary selected-source timeout and forced repair snapshot timeout"
    ],
    "missingCausalEdge": "Prove whether selected_snapshot_source_timeout is bad snapshot-source selection, a primary admin snapshot query timeout, or a forced repair timeout before runtime edits.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The predecessor used one bounded refresh after visible owner publication and removed discovery_node_coverage_gap from representative evidence; this package must move a metric, remove selected_snapshot_source_timeout, migrate to a new owner boundary, or turn rolling-restart green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "expectedObservableTransition": "snapshotCoverage improves above 0/5, selected_snapshot_source_timeout disappears, the frontier migrates to a new owner boundary, or rolling-restart turns green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "If selected_snapshot_source_timeout remains after a focused owner fix, classify same-frontier with the replay/probe evidence instead of reopening frozen edges.",
    "expectedNextFrontier": "representative green, reduced selected_snapshot_source_timeout residual, readiness_startup_support, or another canonical frontier after snapshot coverage improves",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This successor is allowed because representative evidence changed the selected subcause from deferred_refresh discovery_node_coverage_gap to selected_snapshot_source_timeout.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md"
}
-->

## Why

The previous slice was metric-moving: `discovery_node_coverage_gap` disappeared
from representative rolling-restart evidence. The gate is still red on
`active_gate_snapshot_coverage`, but the selected edge is now a source-specific
snapshot query timeout:
`selected_snapshot_source_timeout` on
`11601fe0-72d6-5853-8590-ec2881853e72`.

This package owns the next replayable decision. It must prove whether the edge
comes from bad selected-source choice, the primary admin snapshot query timing
out, or the forced repair query timing out, then edit only the selected owner
path.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red after a
  metric-moving owner-boundary reduction and now requires a focused causal
  replay/probe before another runtime edit.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  listed candidate files, a frozen decision must be reopened, or
  representative evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent pending-before-implementation.
- [ ] Fix subagent pending-before-review-result.
- [ ] Implementation subagent pending-before-review-fix-clean.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260516-startup-active-gate-selected-snapshot-source-timeout.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json

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
- Owned files: `work/packages/active-20260516-startup-active-gate-selected-snapshot-source-timeout.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --explain active_gate_snapshot_coverage
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
6. PASS - `npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-selected-snapshot-source-timeout.md`
