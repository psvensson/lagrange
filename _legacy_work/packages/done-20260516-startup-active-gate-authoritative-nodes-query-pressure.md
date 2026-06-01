# Startup Active Gate Authoritative Nodes Query Pressure

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "CDC owner-RPC fallback now treats message-only Query timeout after 3000ms as bounded SQL fallback evidence. Focused tests pass. Representative rolling-restart remains red at active_gate_snapshot_coverage with snapshotCoverageNodeCount=0/5, but the selected repair path now records readSource=sql_query_engine and fails inside SELECT * FROM nodes while message-router repeatedly waits on reconnect to 7493b0ab-a054-5fad-a91b-5e331db29304.",
  "nextAction": "Migrate the metric-moving successor slice to query/message-router reconnect delivery so routed SELECT * FROM nodes can fall through or return typed retryable evidence without increasing timeout budgets.",
  "proof": [
    "npm run work:validate -- --entry work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/cdc/cdc-integration-service-segment-1.js",
    "test/cdc/authoritative-owner-rpc-sql-fallback.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
    "test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json",
    "test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/cdc/cdc-integration-service-segment-1.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-service-discovery.test.js",
    "test/cdc/authoritative-owner-rpc-sql-fallback.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/cdc/cdc-integration-service-segment-1.js",
    "test/cdc/authoritative-owner-rpc-sql-fallback.test.js"
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
    "artifact": "test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Promote query/message-router reconnect delivery handling without reopening publication ACK, priority recovery, timeout budget increases, or active-gate admission."
  },
  "causalGovernance": {
    "hypothesis": "The representative frontier remains active_gate_snapshot_coverage after discovery_node_coverage_gap disappeared. The selected subcause is authoritative control snapshot repair nodes query pressure: selected source 11601fe0-72d6-5853-8590-ec2881853e72 is reachable and admin-ready, but every active source probe reaches the same authoritative nodes query timeout after 3000ms.",
    "stopConditionCheck": "Run entry validation, replayable authoritative nodes query fixture/probe, npm run analyze:causal-model on fresh evidence, focused owner tests for the promoted runtime file, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap stays absent and the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "migrated",
    "causalDebt": "The owner-RPC preferred SQL fallback path now retries message-only query timeout failures through the already allowed SQL fallback. The fresh representative proves the next pressure point is routed SQL delivery: readSource=sql_query_engine reaches SELECT * FROM nodes, then parallel query delivery times out while message-router repeatedly waits on reconnect to the restarted seed.",
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
    "missingCausalEdge": "Prove the CDC authoritative owner-read fallback treats message-only query timeout failures as bounded retryable SQL-fallback candidates when allowSqlFallback is true.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Pending focused CDC owner-read regression: message-only Query timeout after 3000ms owner-RPC failures should use SQL fallback and preserve the existing query timeout budget.",
    "boundedProgressProofArtifact": "test/cdc/authoritative-owner-rpc-sql-fallback.test.js",
    "expectedObservableTransition": "snapshotCoverage improves above 2/5, the authoritative nodes query timeout disappears with a new owner boundary, or representative rolling-restart turns green.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "If the representative stays same-frontier without one of the metric-moving outcomes, stop and record the fixture evidence instead of reopening frozen edges.",
    "expectedNextFrontier": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap stays absent, representative rolling-restart turns green, or the frontier migrates to a genuinely new owner boundary after authoritative nodes query pressure is reduced.",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-selected-snapshot-source-timeout.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This package is allowed because the predecessor selected authoritative control snapshot nodes query pressure after removing discovery_node_coverage_gap and selected_snapshot_source_timeout.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budget increases, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md",
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true
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

- [x] Review subagent recorded: Agent Turing (019e32f6-7a1f-7b31-929e-81eb300f5fdd) reviewed work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Boole (019e32f9-0796-78b0-a38b-332516fc38fa) fixed work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md.
- [x] Implementation subagent recorded: Agent Archimedes (019e3313-51e7-71e1-8769-43672b3dc4ff) implemented work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md; follow-on CDC owner-read implementation worker Agent Tesla (019e3323-0acf-7a82-ba8f-c0bab30d7c03) owns the promoted fallback slice.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/cdc/cdc-integration-service-segment-1.js
7. test/cdc/authoritative-owner-rpc-sql-fallback.test.js

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
- Owned files: `work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/cdc/cdc-integration-service-segment-1.js`, `test/cdc/authoritative-owner-rpc-sql-fallback.test.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npm run work:validate -- --entry work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md`
2. PASS - `npm run work:validate -- --pre-impl work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md`
3. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-local-fallback-20260516T224600Z.report.json --handoff-probe`
4. PASS - `npx tap test/cdc/authoritative-owner-rpc-sql-fallback.test.js`
5. PASS - `npx tap test/admin/admin-control-snapshot.test.js -g "forced query timeout preserves metric-moving local snapshot|forced repair failures preserve authoritative nodes query timeout replay evidence|Topology convergence replay separates authoritative nodes participant query pressure"`
6. PASS - `node --check src/cdc/cdc-integration-service-segment-1.js`
7. PASS - `node --check test/cdc/authoritative-owner-rpc-sql-fallback.test.js`
8. PASS - `node scripts/check-guideline-literals.js src/cdc/cdc-integration-service-segment-1.js test/cdc/authoritative-owner-rpc-sql-fallback.test.js`
9. PASS - `node scripts/check-guideline-decision-boundaries.js src/cdc/cdc-integration-service-segment-1.js test/cdc/authoritative-owner-rpc-sql-fallback.test.js`
10. PASS - `npm run audit:runtime-grammar:file -- src/cdc/cdc-integration-service-segment-1.js`
11. PASS - `git diff --check -- work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md work/sprints/current-blocker.md work/sprints/current-blocker.json src/cdc/cdc-integration-service-segment-1.js test/cdc/authoritative-owner-rpc-sql-fallback.test.js`
12. FAIL - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --verbose` (0/1 passed; `active_gate_snapshot_coverage` stayed red at `0/5`; `discovery_node_coverage_gap` stayed absent; selected repair now records `readSource=sql_query_engine` and fails on `SELECT * FROM nodes` with `Query timeout after 3000ms` while message-router reconnect to `7493b0ab-a054-5fad-a91b-5e331db29304` times out after `5000ms`.)
13. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json`
14. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --explain active_gate_snapshot_coverage`
15. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --handoff-probe`
16. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json`
17. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json`

Fallback note: the canonical extractors explain the first topology frontier but
do not expose per-owner SQL delivery attempts. A focused log search was used
only after those extractors to confirm the selected repair had already moved
from CDC owner-RPC fallback into `sql_query_engine` and message-router
reconnect delivery.

## Commit And Push Ledger

1. Focused package commit: `c0208f4d8e323e2b4e7e46e1feb866c8147de3a0`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
