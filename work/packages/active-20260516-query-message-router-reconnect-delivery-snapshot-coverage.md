# Query Message Router Reconnect Delivery Snapshot Coverage

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z/rolling-restart/",
  "owner": "query_message_router_owner",
  "boundary": "reconnect_delivery",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The CDC fallback slice is closed as migrated: message-only Query timeout after 3000ms now enters bounded SQL fallback, but the representative remains red at active_gate_snapshot_coverage with snapshotCoverageNodeCount=0/5. The selected repair records readSource=sql_query_engine and fails on SELECT * FROM nodes while message-router repeatedly waits for reconnect to restarted seed 7493b0ab-a054-5fad-a91b-5e331db29304.",
  "nextAction": "Prove routed SELECT * FROM nodes under reconnect pressure falls through to an eligible live candidate or returns typed retryable evidence without increasing timeout budgets, then rerun rolling-restart for coverage movement or green.",
  "proof": [
    "npm run work:validate -- --entry work/packages/active-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json",
    "npm run analyze:owner-files -- query_message_router_owner reconnect_delivery --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/transport/message-router-segment-3.js",
    "src/query/query-executor-segment-2-part-1.js",
    "src/query/distributed/parallel-query-coordinator.js",
    "src/query/sql-query-engine-segment-6.js",
    "test/transport/message-router-main-stage-1.js",
    "test/query/query-executor.test-part-6.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md",
    "test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json",
    "test-output/reports/.playback/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z/rolling-restart/"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/transport/message-router-segment-3.js",
    "src/query/query-executor-segment-2-part-1.js",
    "src/query/distributed/parallel-query-coordinator.js",
    "src/query/sql-query-engine-segment-6.js",
    "test/transport/message-router-main-stage-1.js",
    "test/query/query-executor.test-part-6.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/transport/message-router-segment-3.js",
    "src/query/query-executor-segment-2-part-1.js",
    "src/query/distributed/parallel-query-coordinator.js",
    "src/query/sql-query-engine-segment-6.js",
    "test/transport/message-router-main-stage-1.js",
    "test/query/query-executor.test-part-6.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "representative evidence reselects publication ACK, priority recovery, timeout budgets, or active-gate admission"
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
    "nextAction": "Reduce routed SQL delivery loss under message-router reconnect pressure while keeping timeout budgets and active-gate admission frozen."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate coverage gap is now owned by routed SQL delivery pressure, not CDC owner-RPC fallback. SQL fallback reaches SELECT * FROM nodes, but parallel query delivery waits behind repeated message-router reconnect attempts to a restarted seed until the existing 3000ms query budget expires.",
    "stopConditionCheck": "Run entry validation, handoff/snapshot probe on the CDC fallback representative, npm --silent run analyze:causal-model on fresh evidence, focused query/message-router reconnect tests, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, the authoritative nodes query timeout disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The query executor and message-router reconnect path must not spend the full SQL query budget waiting on a reconnecting seed when another live candidate can answer or when the legal outcome is a typed retryable/deferred delivery result.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budget increases, or active-gate admission unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after CDC query timeout fallback",
    "phaseChain": [
      "consume the closed CDC fallback migration proof",
      "separate query/message-router reconnect delivery from admin degradation and CDC fallback",
      "build focused routed SELECT nodes tests under reconnect pressure",
      "edit only the selected query/message-router owner path after subagent proof is clean",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json, canonically owned by startup_active_gate_owner / snapshot_coverage with internal evidence pointing to query_message_router_owner / reconnect_delivery.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied by canonical evidence",
      "priority_recovery_partition_progress is satisfied by canonical evidence",
      "discovery_node_coverage_gap is absent",
      "selected snapshot source remains 11601fe0-72d6-5853-8590-ec2881853e72 and is admin-ready",
      "authoritative repair records readSource=sql_query_engine before timing out on nodes",
      "message-router repeatedly logs reconnect timeout to 7493b0ab-a054-5fad-a91b-5e331db29304"
    ],
    "missingCausalEdge": "Prove routed SELECT * FROM nodes under reconnect pressure falls through to another active candidate or returns typed retryable/deferred evidence before the SQL query budget is exhausted.",
    "missingCausalEdgeProbe": "npx tap test/query/query-executor.test-part-6.js -g \"reconnect delivery\"",
    "boundedProgressProof": "Metric-moving proof only: snapshotCoverage above 2/5, authoritative nodes query timeout gone, genuinely new owner boundary, or representative green.",
    "boundedProgressProofArtifact": "test/transport/message-router-main-stage-1.js and test/query/query-executor.test-part-6.js",
    "expectedObservableTransition": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap stays absent, representative rolling-restart turns green, or the frontier migrates to a genuinely new owner boundary after routed SQL delivery is reduced.",
    "maxProgressBound": "one focused query_message_router_owner / reconnect_delivery slice after required subagent sequencing",
    "sameFrontierFallback": "If focused tests pass but the representative stays same-frontier without metric movement, stop and classify same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "representative green or a new owner boundary past query/message-router reconnect delivery",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed because the predecessor proved CDC owner-RPC fallback now reaches sql_query_engine and the remaining evidence is message-router reconnect delivery, not a reopened publication ACK, priority recovery, timeout budget, or active-gate admission edge.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budget increases, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md"
}
-->

## Why

The previous slice improved the owner evidence but did not move the visible
coverage metric: representative rolling-restart still reports
`snapshotCoverageNodeCount=0/5`. The useful new fact is that the selected
repair now reaches `readSource=sql_query_engine`; the remaining timeout is
inside routed SQL delivery while message-router is reconnecting to the
restarted seed.

This package is allowed only if it moves one of the requested targets:
snapshot coverage above `2/5`, disappearance of the authoritative nodes query
timeout, migration to a new owner boundary, or representative green.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red after
  a bounded owner migration and now needs a focused runtime owner proof before
  the next representative rerun.
- Escalation trigger to a heavier lane: selected runtime ownership expands
  beyond query/message-router reconnect delivery, a frozen edge must be
  reopened, or representative evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-review.
- [ ] Fix subagent recorded or explicitly not needed: pending-review-result.
- [ ] Implementation subagent recorded: pending-before-implementation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/active-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/transport/message-router-segment-3.js
7. src/query/query-executor-segment-2-part-1.js
8. src/query/distributed/parallel-query-coordinator.js
9. src/query/sql-query-engine-segment-6.js
10. test/transport/message-router-main-stage-1.js
11. test/query/query-executor.test-part-6.js

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
- Owned files: `work/packages/active-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/transport/message-router-segment-3.js`, `src/query/query-executor-segment-2-part-1.js`, `src/query/distributed/parallel-query-coordinator.js`, `src/query/sql-query-engine-segment-6.js`, `test/transport/message-router-main-stage-1.js`, `test/query/query-executor.test-part-6.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: publication ACK, priority recovery, timeout budgets, and active-gate admission stay closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/active-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json`, focused query/message-router tests, static guardrails, and one representative rolling-restart rerun.
- Model ledger advisory: `escalate`

## Validation

1. Pending - `npm run work:validate -- --entry work/packages/active-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`
2. Pending - `npm run work:evidence-summary -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json`
3. Pending - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --explain active_gate_snapshot_coverage`
4. Pending - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json --handoff-probe`
5. Pending - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-cdc-query-timeout-fallback-20260516T233948Z.report.json`
6. Pending - focused query/message-router reconnect tests.
7. Pending - static guardrails.
8. Pending - representative rolling-restart rerun.
