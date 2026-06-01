# Query Participant Failure Inactive Node Routing Coverage

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-query-reconnect-delivery-20260517T001920Z/rolling-restart/",
  "owner": "query_participant_failure",
  "boundary": "inactive_participant_routing",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The predecessor closed as migrated: routed SQL delivery now returns typed reconnect-deferred evidence promptly, and the representative selected error moved from nodes:Query timeout after 3000ms to nodes:Connection to node 7493b0ab-a054-5fad-a91b-5e331db29304 closed. The focused query fixture proves inactive participant read failure already falls through to a live candidate when one exists. Scoped playback shows nodes-p1 has no live candidate rows; every nodes-p1 service row remains pinned to 7493b0ab-a054-5fad-a91b-5e331db29304 across all seven snapshots, so this package migrates the edge beyond query participant routing.",
  "nextAction": "Open the successor join/message-group service activation package selected by playback: live participants never become service candidates because join-created service activation falls back to seed HTTP registration and fails near shutdown with fetch failed.",
  "proof": [
    "npm run work:validate -- --entry work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "npm run analyze:owner-files -- query_participant_failure inactive_participant_routing --markdown",
    "npx tap test/query/query-executor.test-part-6.js -g \"inactive participant routing|participant failure fallthrough\"",
    "node --check test/query/query-executor.test-part-6.js"
  ],
  "writeScope": [
    "work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/query/query-executor.test-part-6.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
    "test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "test-output/reports/.playback/rolling-restart-query-reconnect-delivery-20260517T001920Z/rolling-restart/"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/query/query-executor-segment-2-part-2.js",
    "src/query/distributed/parallel-query-coordinator.js",
    "src/query/query-execution-budget.js",
    "test/query/query-executor.test-part-6.js",
    "test/query/parallel-query-coordinator.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/query/query-executor-segment-2-part-2.js",
    "src/query/distributed/parallel-query-coordinator.js",
    "src/query/query-execution-budget.js",
    "test/query/query-executor.test-part-6.js",
    "test/query/parallel-query-coordinator.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "representative evidence selects a different owner boundary"
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
    "nextAction": "Decide why authoritative SELECT * FROM nodes routes through inactive participant 7493b0ab-a054-5fad-a91b-5e331db29304, then edit only the selected query participant/routing owner path."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "query_message_router_owner",
    "fromBoundary": "reconnect_delivery",
    "toOwner": "query_participant_failure",
    "toBoundary": "inactive_participant_routing",
    "reason": "The predecessor's focused reconnect-delivery proof removed the selected nodes:Query timeout after 3000ms edge. Fresh representative evidence now fails authoritative SELECT * FROM nodes with ROUTER_CONNECTION_CLOSED for inactive participant 7493b0ab-a054-5fad-a91b-5e331db29304, so this package owns the bounded internal support edge while active_gate_snapshot_coverage remains the scenario frontier.",
    "evidence": [
      "work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
      "test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --explain active_gate_snapshot_coverage"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The remaining snapshot coverage gap is no longer query reconnect budget loss. Authoritative nodes repair reaches sql_query_engine, then the distributed SELECT * FROM nodes read for nodes-p1 selects inactive participant 7493b0ab-a054-5fad-a91b-5e331db29304 and fails with ROUTER_CONNECTION_CLOSED under DISTRIBUTED_PARTICIPANT_FAILURE/control_plane_backpressure.",
    "stopConditionCheck": "Run entry validation, canonical evidence extractors including npm run analyze:causal-model, a narrow participant-routing fixture/probe that decides whether inactive participant selection or participant failure classification owns the edge, focused owner tests for the promoted runtime file, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap stays absent/disappears, the participant-closed selected error disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "migrated",
    "causalDebt": "The replayable participant-routing decision is closed: query fallthrough works when a live candidate exists, but playback shows nodes-p1 never has a live candidate row. Successor causal debt moves to join/message-group service activation and service-row publication for live partition candidates.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery, timeout budget increases, active-gate admission, CDC fallback, or message-router reconnect delivery unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after query/message-router reconnect delivery migration",
    "phaseChain": [
      "consume the closed reconnect-delivery migration proof",
      "separate inactive participant routing from snapshot source selection, forced repair stalls, readiness support, and timeout budgets",
      "build the narrowest authoritative SELECT nodes participant-routing fixture for inactive node 7493b0ab-a054-5fad-a91b-5e331db29304",
      "edit only the selected participant/routing owner path after subagent proof is clean",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json, canonically owned by startup_active_gate_owner / snapshot_coverage with internal selected error now nodes:Connection to node 7493b0ab-a054-5fad-a91b-5e331db29304 closed.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied by canonical evidence",
      "priority_recovery_partition_progress is satisfied with zero residual witnesses",
      "selected snapshot source remains 11601fe0-72d6-5853-8590-ec2881853e72 and is admin-ready",
      "discovery_node_coverage_gap is absent",
      "authoritative nodes repair reaches readSource=sql_query_engine",
      "fresh selected error is DISTRIBUTED_PARTICIPANT_FAILURE with firstFailedParticipant node 7493b0ab-a054-5fad-a91b-5e331db29304 and errorCode ROUTER_CONNECTION_CLOSED"
    ],
    "missingCausalEdge": "Closed for query participant routing: authoritative SELECT * FROM nodes falls through when a live candidate exists. The missing edge is now why join-created services do not publish live nodes-p1 candidates before active-gate timeout.",
    "missingCausalEdgeProbe": "npx tap test/query/query-executor.test-part-6.js -g \"inactive participant routing|participant failure fallthrough\"",
    "boundedProgressProof": "Metric-moving proof only with retry/delivery progress: snapshotCoverage above 2/5, participant-closed selected error gone, genuinely new owner boundary, or representative green.",
    "boundedProgressProofArtifact": "test/query/query-executor.test-part-6.js plus scoped playback evidence from test-output/reports/.playback/rolling-restart-query-reconnect-delivery-20260517T001920Z/rolling-restart/snapshots.ndjson",
    "expectedObservableTransition": "frontier migrated past query participant routing to join/message-group service activation because the fixture proves fallthrough and playback proves live service candidates are absent.",
    "maxProgressBound": "one focused query_participant_failure / inactive_participant_routing slice after required subagent sequencing",
    "sameFrontierFallback": "If the fixture and focused owner tests pass but the representative keeps the same selected participant-closed edge without metric movement, stop and classify same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "join_message_group_activation_owner / service_row_activation_publication",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-authoritative-nodes-query-pressure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md / query_message_router_owner / reconnect_delivery / migrated"
    ],
    "oscillationCheck": "This package is allowed because the predecessor removed the query timeout/reconnect delivery edge and fresh evidence now selects typed participant connection closure, not a reopened publication ACK, priority recovery, timeout budget, active-gate admission, CDC fallback, or reconnect-delivery edge.",
    "handoffInvariant": "Publication ACK, priority recovery, timeout budget increases, active-gate admission, CDC fallback, and message-router reconnect delivery remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The predecessor made the next proof metric-moving: the representative no longer
fails on authoritative nodes query timeout. It now fails because authoritative
`SELECT * FROM nodes` reaches a participant that is inactive/unreachable and
returns `ROUTER_CONNECTION_CLOSED`.

This package owns one replayable decision: whether inactive participant
selection is allowed for the authoritative nodes read, whether the read path
must fall through to a live participant, or whether the owner must return a
structured deferred participant-routing outcome. It only succeeds if the
representative metric moves, the participant-closed edge disappears, the
frontier migrates to a new owner boundary, or rolling-restart turns green.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  this package may promote one runtime owner path after a replayable
  participant-routing fixture selects it.
- Escalation trigger to a heavier lane: selected runtime ownership expands
  beyond query participant/routing, a frozen edge must be reopened, or
  representative evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Archimedes (019e3313-51e7-71e1-8769-43672b3dc4ff) reviewed work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Tesla (019e3323-0acf-7a82-ba8f-c0bab30d7c03) fixed work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md.
- [x] Implementation subagent recorded: Agent Copernicus (019e332e-3a31-7461-a884-e859dab104f6) implemented work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. test/query/query-executor.test-part-6.js

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
- Owned files: `work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `test/query/query-executor.test-part-6.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `timeout_budgets`, `active_gate_admission`
- Frozen decisions: publication ACK, priority recovery, timeout budgets,
  active-gate admission, CDC fallback, and message-router reconnect delivery
  stay closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime
  ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json`, `npm run analyze:owner-files -- query_participant_failure inactive_participant_routing --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --explain active_gate_snapshot_coverage
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json --handoff-probe
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json
6. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json
7. npm run analyze:owner-files -- query_participant_failure inactive_participant_routing --markdown
8. npx tap test/query/query-executor.test-part-6.js -g "inactive participant routing|participant failure fallthrough"
9. node --check test/query/query-executor.test-part-6.js

## Result

Classification: `migrated`.

The focused fixture proves the query participant path is not the metric-moving
owner: an authoritative `SELECT * FROM nodes` read falls through from inactive
participant `7493b0ab-a054-5fad-a91b-5e331db29304` to live participant
`11601fe0-72d6-5853-8590-ec2881853e72` when both service rows exist.

Canonical extractors did not expose the `nodes-p1` service-candidate set, so the
package used a scoped playback fallback after running `work:evidence-summary`,
`analyze:topology-convergence`, `analyze:causal-model`,
`analyze:distributed-failure`, and `analyze:owner-files`. The fallback read only
`snapshots.ndjson` for `nodes-p1` and found all seven snapshots publish three
`nodes-p1` service rows, all on node
`7493b0ab-a054-5fad-a91b-5e331db29304`, with no live peer service row.

The successor owner boundary is
`join_message_group_activation_owner / service_row_activation_publication`.
Playback logs show join-created service activation later falls back to seed HTTP
registration and fails with `fetch failed` while activating message-group service
rows, which explains why live participants never become candidates without
reopening query reconnect delivery, publication ACK, priority recovery, timeout
budgets, or active-gate admission.

## Commit And Push Ledger

1. Focused package commit: `87575fc0ef66bb2590d80bfad4dd501059b72e02`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
