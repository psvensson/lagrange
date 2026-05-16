# Startup Active Gate Authoritative Repair Participant Failure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Representative selected_snapshot_source_timeout is gone after direct authoritative repair for late forced active-gate snapshot probes. The gate remains red on active_gate_snapshot_coverage with snapshotCoverageNodeCount=0/5; the selected error is authoritative control snapshot repair failure on nodes because connection to seed 7493b0ab-a054-5fad-a91b-5e331db29304 closed. Publication ACK and priority recovery remain satisfied.",
  "nextAction": "Build the narrow fixture/probe that separates authoritative repair participant connection failure from readiness support inherited active-gate no-progress and authoritative nodes query pressure, then edit only the selected owner path.",
  "proof": [
    "npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md",
    "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json"
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
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-service-discovery.test.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
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
    "artifact": "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduce authoritative control snapshot repair participant failure without reopening publication ACK, priority recovery, timeout budgets, or active-gate admission."
  },
  "causalGovernance": {
    "hypothesis": "The representative frontier is no longer a selected snapshot-source timeout. The active edge is now authoritative control snapshot repair failing while querying nodes because the connection to seed 7493b0ab-a054-5fad-a91b-5e331db29304 closed. A replayable fixture must separate participant connectivity from inherited readiness no-progress and authoritative nodes query pressure before runtime edits.",
    "stopConditionCheck": "Run entry validation, authoritative repair participant fixture/probe, npm run analyze:causal-model on fresh evidence, focused owner tests for the selected runtime file, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, the representative frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK and priority recovery are satisfied. Active-gate snapshot coverage remains incomplete; the remaining selected error is authoritative control snapshot repair failure on nodes due to a closed seed connection.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budgets, or active-gate admission unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after direct authoritative repair probe",
    "phaseChain": [
      "consume reduced selected-source timeout proof",
      "build the narrow authoritative repair participant replay/probe",
      "separate participant connection failure from inherited readiness no-progress",
      "separate participant connection failure from authoritative nodes query pressure",
      "promote only the selected owner runtime file after the proof selects one",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied by canonical evidence",
      "priority_recovery_partition_progress is satisfied by canonical evidence",
      "snapshotCoverageNodeCount is 0 and expectedNodeCount is 5",
      "selected_snapshot_source_timeout is absent from canonical reasons",
      "selected snapshot error is authoritative control snapshot repair failure on nodes",
      "authoritative repair failed because connection to seed 7493b0ab-a054-5fad-a91b-5e331db29304 closed",
      "readiness support remains inherited_active_gate_no_progress with no_progress_terminal evidence"
    ],
    "missingCausalEdge": "Prove whether authoritative repair participant failure is owned by the repair path, readiness support, or authoritative nodes query pressure before runtime edits.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The next proof must advance a bounded authoritative repair retry so snapshotCoverage improves above 2/5, the frontier migrates to a genuinely new owner boundary, or rolling-restart turns green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "expectedObservableTransition": "snapshotCoverage improves above 2/5, the selected authoritative repair participant failure disappears with a new owner frontier, or representative rolling-restart turns green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "If the representative stays same-frontier without metric movement, stop and record the fixture evidence instead of reopening frozen edges.",
    "expectedNextFrontier": "representative green, improved active-gate snapshot coverage above 2/5, or a new canonical owner boundary selected by fresh evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md / startup_active_gate_owner / snapshot_coverage / same-frontier"
    ],
    "oscillationCheck": "This successor is allowed because representative evidence changed the selected subcause from selected_snapshot_source_timeout to authoritative control snapshot repair participant failure.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md"
}
-->

## Why

The prior package removed `selected_snapshot_source_timeout` from the
representative rolling-restart evidence. The active gate still times out with
`snapshotCoverageNodeCount=0/5`, but the selected error is now authoritative
control snapshot repair failing while querying nodes because the connection to
seed `7493b0ab-a054-5fad-a91b-5e331db29304` closed.

This package owns the next metric-moving decision. It must prove whether that
edge belongs to the authoritative repair participant path, inherited readiness
no-progress, or authoritative nodes query pressure before runtime edits.
Success must improve snapshot coverage above `2/5`, migrate the frontier to a
genuinely new owner boundary, or turn representative rolling-restart green.

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

1. work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md
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
- Owned files: `work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json
6. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
