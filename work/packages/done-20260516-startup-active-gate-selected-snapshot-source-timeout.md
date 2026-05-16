# Startup Active Gate Selected Snapshot Source Timeout

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused forced-repair owner proof now sends late active-gate repair probes through direct authoritative snapshot repair without changing lane or timeout budget. The representative rerun stayed red on active_gate_snapshot_coverage with snapshotCoverageNodeCount=0/5, but selected_snapshot_source_timeout disappeared. The selected error now reports authoritative control snapshot repair failing on nodes because connection to seed 7493b0ab-a054-5fad-a91b-5e331db29304 closed. Publication ACK and priority recovery remain satisfied.",
  "nextAction": "Open the successor authoritative-repair participant failure slice; keep publication ACK, priority recovery, timeout budgets, and active-gate admission frozen unless canonical evidence selects them again.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md",
    "test-output/reports/rolling-restart-after-visible-owner-refresh-20260516T205633Z.report.json",
    "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-5.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-7-class-2.js",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js"
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
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduce authoritative control snapshot repair participant failure after selected_snapshot_source_timeout disappeared."
  },
  "causalGovernance": {
    "hypothesis": "The package proved the selected source timeout was owned by the late forced active-gate repair path, not publication ACK, priority recovery, readiness support, or timeout budget policy. Direct authoritative repair removed selected_snapshot_source_timeout from representative evidence; the remaining red edge is authoritative nodes repair failing because seed connectivity closed.",
    "stopConditionCheck": "Run entry validation, selected-source timeout replay/probe, npm run analyze:causal-model on fresh evidence, focused owner tests for the selected runtime file, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "selected_snapshot_source_timeout disappears while publication ACK and priority recovery stay satisfied; the remaining edge exposes authoritative control snapshot repair participant failure.",
    "representativeOutcome": "reduced",
    "causalDebt": "Publication ACK and priority recovery are satisfied. Active-gate snapshot coverage remains 0/5; the selected error is now authoritative control snapshot repair failure on nodes due to connection to seed 7493b0ab-a054-5fad-a91b-5e331db29304 closing.",
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
    "missingCausalEdge": "Reduce authoritative control snapshot repair participant failure after selected_snapshot_source_timeout disappeared.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The focused owner path now advances the late forced active-gate snapshot retry through direct authoritative repair; the representative rerun removed selected_snapshot_source_timeout.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json",
    "expectedObservableTransition": "selected_snapshot_source_timeout disappeared from canonical representative evidence and the next selected subcause is authoritative control snapshot repair participant failure.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "Open a same-frontier successor focused on authoritative control snapshot repair participant failure.",
    "expectedNextFrontier": "representative green, reduced selected_snapshot_source_timeout residual, readiness_startup_support, or another canonical frontier after snapshot coverage improves",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md / startup_active_gate_owner / snapshot_coverage / same-frontier",
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This successor is allowed because representative evidence changed the selected subcause from deferred_refresh discovery_node_coverage_gap to selected_snapshot_source_timeout.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budgets, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md",
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260516-startup-active-gate-authoritative-repair-participant-failure.md"
}
-->

## Why

The previous slice was metric-moving: `discovery_node_coverage_gap` disappeared
from representative rolling-restart evidence. The gate is still red on
`active_gate_snapshot_coverage`; this package owned the next replayable
decision for source `11601fe0-72d6-5853-8590-ec2881853e72`.

The focused fixture selected the forced repair path. Runtime now sends late
active-gate forced repair probes through direct authoritative snapshot repair
without changing the snapshot lane or timeout budget. The representative rerun
stayed red, but `selected_snapshot_source_timeout` disappeared. The next
remaining edge is authoritative control snapshot repair failing on a participant
connection to seed `7493b0ab-a054-5fad-a91b-5e331db29304`, so this package is
closed as `reduced`.

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

- [x] Review subagent recorded: Agent Descartes (019e32a3-4e7e-7e00-8f87-3cf2d09381e2) reviewed work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Aristotle (019e32a6-066e-7702-b2ab-3ef105f5fb4c) fixed work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md.
- [x] Implementation subagent recorded: Agent Beauvoir (019e32a8-6f49-77d2-ad9a-d23a48b14ce1) implemented work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

Fallback note: canonical evidence extractors selected the representative
frontier and selected error, but did not expose per-node `probeWitnesses` for
the selected source. A focused report inspection found no recorded
`probeWitnesses`, so the replayable decision was encoded as the narrow harness
unit fixture instead of raw report-driven surgery.

## In Scope

1. work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. test/distributed/harness/cluster-segment-7-class-5.js
6. test/distributed/harness/__tests__/cluster.test-part-5.js

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
- Owned files: `work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `test/distributed/harness/cluster-segment-7-class-5.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `operation_workflow_owner`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npm run work:validate -- --entry work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md`
2. PASS - `npm run work:validate -- --pre-impl work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md`
3. PASS - `npm test -- test/distributed/harness/__tests__/cluster.test-part-5.js`
4. PASS - `node --check test/distributed/harness/cluster-segment-7-class-5.js && node --check test/distributed/harness/__tests__/cluster.test-part-5.js`
5. PASS - `node scripts/check-guideline-decision-boundaries.js test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js`
6. PASS - `node scripts/check-guideline-literals.js test/distributed/harness/cluster-segment-7-class-5.js`
7. PASS - `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js`
8. PASS - `npx eslint --no-ignore test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js`
9. PASS - `git diff --check -- work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json test/distributed/harness/cluster-segment-7-class-5.js test/distributed/harness/__tests__/cluster.test-part-5.js`
10. REDUCED - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --verbose`
11. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`
12. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --explain active_gate_snapshot_coverage`
13. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --handoff-probe`
14. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`
15. PASS - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json --markdown`
16. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-authoritative-repair-probe-20260516T214000Z.report.json`
17. LIMITED - broad literal guardrail on the large test fixture reports inherited test-file findings; package closure uses runtime literal guardrail plus decision-boundary, grammar, eslint, and diff guardrails for the promoted runtime file and focused fixture.

## Commit And Push Ledger

1. Focused package commit: `59899c54`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
