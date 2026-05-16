# Startup Active Gate Authoritative Nodes Query Pressure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Representative rolling-restart remains red on active_gate_snapshot_coverage with snapshotCoverageNodeCount=0/5 after the predecessor removed discovery_node_coverage_gap and selected_snapshot_source_timeout. The selected error is authoritative control snapshot repair failing on nodes with Query timeout after 3000ms.",
  "nextAction": "Build a replayable authoritative nodes query pressure fixture for the selected source 11601fe0-72d6-5853-8590-ec2881853e72, then edit only the selected owner path without increasing timeout budgets.",
  "proof": [
    "npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
    "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-service-discovery.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md",
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
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduce authoritative control snapshot nodes query pressure without reopening publication ACK, priority recovery, timeout budget increases, or active-gate admission."
  },
  "causalGovernance": {
    "hypothesis": "The representative frontier remains active_gate_snapshot_coverage after discovery_node_coverage_gap disappeared. The selected subcause is authoritative control snapshot repair nodes query pressure: selected source 11601fe0-72d6-5853-8590-ec2881853e72 is reachable and admin-ready, but every active source probe reaches the same authoritative nodes query timeout after 3000ms.",
    "stopConditionCheck": "Run entry validation, replayable authoritative nodes query fixture/probe, npm run analyze:causal-model on fresh evidence, focused owner tests for the promoted runtime file, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap stays absent and the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK and priority recovery are satisfied. Active-gate snapshot coverage remains incomplete at 0/5. The selected error is authoritative control snapshot repair failing on nodes with Query timeout after 3000ms.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budget increases, or active-gate admission unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after forced repair local fallback",
    "phaseChain": [
      "consume reduced four-cause split proof",
      "build the narrow authoritative nodes query pressure replay/probe for source 11601fe0-72d6-5853-8590-ec2881853e72",
      "separate authoritative query pressure from source selection, forced repair stall, and inherited readiness support",
      "promote only the selected owner runtime file after the probe selects one",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied by canonical evidence",
      "priority_recovery_partition_progress is satisfied by canonical evidence",
      "selected_snapshot_source_timeout is absent from canonical reasons",
      "discovery_node_coverage_gap is absent from the latest representative report",
      "snapshotCoverageNodeCount is 0 and expectedNodeCount is 5",
      "selected snapshot error is authoritative control snapshot repair failure on nodes due to Query timeout after 3000ms",
      "readiness support remains inherited_active_gate_no_progress with no_progress_terminal evidence"
    ],
    "missingCausalEdge": "Prove the authoritative nodes query pressure owner path before runtime edits.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The predecessor bounded forced-repair retry and removed discovery_node_coverage_gap; this package must make the next metric-moving retry on authoritative nodes query pressure.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "expectedObservableTransition": "snapshotCoverage improves above 2/5, the authoritative nodes query timeout disappears with a new owner boundary, or representative rolling-restart turns green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "If the representative stays same-frontier without one of the metric-moving outcomes, stop and record the fixture evidence instead of reopening frozen edges.",
    "expectedNextFrontier": "representative green, improved active-gate snapshot coverage above 2/5, or authoritative control snapshot nodes query pressure reduced to a narrower owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This package is allowed because the predecessor selected authoritative control snapshot nodes query pressure after removing discovery_node_coverage_gap and selected_snapshot_source_timeout.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budget increases, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md"
}
-->

## Why

The predecessor separated the four proposed causes and removed
`discovery_node_coverage_gap` from representative evidence. The gate remains red
on `active_gate_snapshot_coverage` with `snapshotCoverageNodeCount=0/5`.

This package owns the selected successor path: authoritative control snapshot
repair reaches a nodes query timeout after `3000ms` from the selected source
`11601fe0-72d6-5853-8590-ec2881853e72`. The next proof must move a metric:
snapshot coverage improves above `2/5`, the authoritative query-pressure edge
migrates to a genuinely new owner boundary, or representative rolling-restart
turns green.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red after
  a metric-moving owner-boundary reduction and now requires a focused causal
  replay/probe before another runtime edit.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  listed candidate files, a frozen decision must be reopened, or
  representative evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Turing (019e32f6-7a1f-7b31-929e-81eb300f5fdd) reviewed work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Boole (019e32f9-0796-78b0-a38b-332516fc38fa) fixed work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md.
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

1. work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. publication-ack-convergence
2. priority_recovery_partition_progress
3. timeout_budgets
4. active_gate_admission

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-nodes-query-pressure.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --handoff-probe
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json
6. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
