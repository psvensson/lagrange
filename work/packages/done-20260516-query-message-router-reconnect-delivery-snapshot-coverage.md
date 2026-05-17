# Query Message Router Reconnect Delivery Snapshot Coverage

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-query-reconnect-delivery-20260517T001920Z/rolling-restart/",
  "owner": "query_message_router_owner",
  "boundary": "reconnect_delivery",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The query/message-router reconnect delivery slice is closed as migrated: routed SQL delivery no longer spends the full query budget waiting for a cold reconnect and focused tests prove reconnect-deferred candidates fall through inside the original query budget. Fresh representative evidence remains red at active_gate_snapshot_coverage with snapshotCoverageNodeCount=0/5, but the selected repair error moved from nodes:Query timeout after 3000ms to nodes:Connection to node 7493b0ab-a054-5fad-a91b-5e331db29304 closed with query_participant_failure/control_plane_backpressure evidence.",
  "nextAction": "Open the next owner-boundary package to decide why authoritative SELECT * FROM nodes routes through inactive participant 7493b0ab-a054-5fad-a91b-5e331db29304, then edit only the selected participant/routing owner path for coverage movement or green.",
  "proof": [
    "npm run work:validate -- --entry work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "npm run analyze:owner-files -- query_message_router_owner reconnect_delivery --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
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
    "work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
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
    "artifact": "test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduce inactive-participant routing for authoritative nodes reads while keeping timeout budgets and active-gate admission frozen."
  },
  "causalGovernance": {
    "hypothesis": "The active-gate coverage gap is now owned by routed SQL delivery pressure, not CDC owner-RPC fallback. SQL fallback reaches SELECT * FROM nodes, but parallel query delivery waits behind repeated message-router reconnect attempts to a restarted seed until the existing 3000ms query budget expires.",
    "stopConditionCheck": "Run entry validation, handoff/snapshot probe on the CDC fallback representative, npm --silent run analyze:causal-model on fresh evidence, focused query/message-router reconnect tests, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, the authoritative nodes query timeout disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Resolved for this boundary: the query executor and message-router reconnect path now return typed reconnect-deferred evidence promptly and read delivery falls through to another live candidate inside the original query budget.",
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
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json, canonically owned by startup_active_gate_owner / snapshot_coverage with internal evidence now pointing past query_message_router_owner / reconnect_delivery to participant connection closure under query_participant_failure/control_plane_backpressure.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied by canonical evidence",
      "priority_recovery_partition_progress is satisfied by canonical evidence",
      "discovery_node_coverage_gap is absent",
      "selected snapshot source remains 11601fe0-72d6-5853-8590-ec2881853e72 and is admin-ready",
      "authoritative repair records readSource=sql_query_engine before failing on nodes with Connection to node 7493b0ab-a054-5fad-a91b-5e331db29304 closed",
      "message-router reconnect delivery now returns typed ROUTER_CONNECTION_CLOSED promptly instead of consuming the full query budget"
    ],
    "missingCausalEdge": "Prove routed SELECT * FROM nodes under reconnect pressure falls through to another active candidate or returns typed retryable/deferred evidence before the SQL query budget is exhausted.",
    "missingCausalEdgeProbe": "npx tap test/query/query-executor.test-part-6.js -g \"reconnect delivery\"",
    "boundedProgressProof": "Metric-moving proof only: snapshotCoverage above 2/5, authoritative nodes query timeout gone, genuinely new owner boundary, or representative green.",
    "boundedProgressProofArtifact": "test/transport/message-router-main-stage-1.js and test/query/query-executor.test-part-6.js",
    "expectedObservableTransition": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap stays absent, representative rolling-restart turns green, or the frontier migrates to a genuinely new owner boundary after routed SQL delivery is reduced.",
    "maxProgressBound": "one focused query_message_router_owner / reconnect_delivery slice after required subagent sequencing",
    "sameFrontierFallback": "If focused tests pass but the representative stays same-frontier without metric movement, stop and classify same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "representative green or the participant/routing owner boundary for inactive node 7493b0ab-a054-5fad-a91b-5e331db29304",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "ownerBoundaryMigrationProof": {
      "fromOwnerBoundary": "query_message_router_owner / reconnect_delivery",
      "toOwnerBoundary": "query_participant_failure / control_plane_backpressure",
      "reason": "Fresh representative evidence eliminated the selected nodes:Query timeout after 3000ms edge and replaced it with nodes:Connection to node 7493b0ab-a054-5fad-a91b-5e331db29304 closed, with DISTRIBUTED_PARTICIPANT_FAILURE and ROUTER_CONNECTION_CLOSED evidence on nodes-p1.",
      "focusedEvidence": [
        "npx tap test/transport/message-router-main-stage-1.js -g \"reconnect\"",
        "npx tap test/query/query-executor.test-part-6.js -g \"reconnect delivery|multiple candidates\"",
        "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --verbose",
        "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --explain active_gate_snapshot_coverage"
      ]
    },
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-authoritative-repair-participant-failure.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed because the predecessor proved CDC owner-RPC fallback now reaches sql_query_engine and the remaining evidence is message-router reconnect delivery, not a reopened publication ACK, priority recovery, timeout budget, or active-gate admission edge.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budget increases, and active-gate admission remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The previous slice improved the owner evidence but did not move the visible
coverage metric: representative rolling-restart still reports
`snapshotCoverageNodeCount=0/5`. This package proved the next routed SQL
delivery edge: reconnecting targets now return a typed deferred delivery result
quickly enough for read delivery to fall through inside the caller's query
budget.

The metric-moving result is migration. The representative is still red, but the
selected authoritative nodes error is no longer `Query timeout after 3000ms`;
it is now `Connection to node 7493b0ab-a054-5fad-a91b-5e331db29304 closed`
with participant failure/backpressure evidence.

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

- [x] Review subagent recorded: Agent Chandrasekhar (019e333d-e81d-7492-a8ca-c31dffcc0a38) reviewed work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Wegener (019e3340-0c4b-7ec1-badf-cc4b2c979fe0) fixed work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md.
- [x] Implementation subagent recorded: Agent Gibbs (019e3341-adb5-7490-ae08-935b867423ac) implemented work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md.

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

1. work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md
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
- Owned files: `work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/transport/message-router-segment-3.js`, `src/query/query-executor-segment-2-part-1.js`, `src/query/distributed/parallel-query-coordinator.js`, `src/query/sql-query-engine-segment-6.js`, `test/transport/message-router-main-stage-1.js`, `test/query/query-executor.test-part-6.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: publication ACK, priority recovery, timeout budgets, and active-gate admission stay closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`, `npm run work:validate -- --pre-impl work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`, `npx tap test/transport/message-router-main-stage-1.js -g "reconnect"`, `npx tap test/query/query-executor.test-part-6.js -g "reconnect delivery|multiple candidates"`, static guardrails over the touched runtime files, and one representative rolling-restart rerun at `test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json`.
- Model ledger advisory: `escalate`

## Validation

1. Passed - `npm run work:validate -- --entry work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`
2. Passed - `npm run work:validate -- --pre-impl work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md`
3. Passed - `npx tap test/transport/message-router-main-stage-1.js -g "reconnect"`
4. Passed - `npx tap test/query/query-executor.test-part-6.js -g "reconnect delivery|multiple candidates"`
5. Passed - `node --check src/transport/message-router-segment-3.js`
6. Passed - `node --check src/query/query-executor-segment-2-part-1.js`
7. Passed - `node --check test/transport/message-router-main-stage-1.js`
8. Passed - `node --check test/query/query-executor.test-part-6.js`
9. Passed - `node scripts/check-guideline-decision-boundaries.js src/transport/message-router-segment-3.js src/query/query-executor-segment-2-part-1.js test/transport/message-router-main-stage-1.js test/query/query-executor.test-part-6.js`
10. Passed - `npm run audit:runtime-grammar:file -- src/transport/message-router-segment-3.js src/query/query-executor-segment-2-part-1.js`
11. Passed - `node scripts/check-guideline-literals.js src/transport/message-router-segment-3.js src/query/query-executor-segment-2-part-1.js`
12. Passed - `npm run work:evidence-summary -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json`
13. Passed - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --explain active_gate_snapshot_coverage`
14. Passed - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --handoff-probe`
15. Passed - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json`
16. Passed - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json`
17. Passed - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json`
18. Failed as expected for the representative gate, classified as migrated - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --verbose`
