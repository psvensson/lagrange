# Join Message Group Service Activation Candidate Publication

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z/rolling-restart/",
  "owner": "join_message_group_activation_owner",
  "boundary": "service_row_activation_publication",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The query participant routing package closed as migrated: focused fixture proof shows authoritative SELECT * FROM nodes falls through from inactive participant 7493b0ab-a054-5fad-a91b-5e331db29304 to a live participant when a live nodes-p1 service row exists. Scoped playback shows all seven nodes-p1 snapshots publish only seed-node service rows, and playback logs show join-created message-group service activation later falls back to seed HTTP registration and fails with fetch failed.",
  "nextAction": "Build the narrowest join service activation fixture that reproduces activation fallback to seed HTTP registration after live nodes are admitted, then edit only the selected activation/publication owner path so live partition candidates become visible or the frontier migrates again.",
  "proof": [
    "npm run work:validate -- --entry work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md",
    "npm run work:validate -- --pre-impl work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md",
    "npx tap test/bootstrap/node-joining-service.test.js -g \"MOVE_REPLICA control-plane upsert|includes assignment_id|retries register-service on assignment token|surfaces repeated assignment token unknown|bypasses HTTP register-service\"",
    "npx tap test/bootstrap/message-group-service-activation.test.js",
    "node --check src/bootstrap/phases/create-message-group-phase.js",
    "node --check test/bootstrap/node-joining-service.test.js",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
    "git diff --check -- src/bootstrap/phases/create-message-group-phase.js test/bootstrap/node-joining-service.test.js work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl"
  ],
  "writeScope": [
    "work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md",
    "test-output/reports/rolling-restart-query-reconnect-delivery-20260517T001920Z.report.json",
    "test-output/reports/.playback/rolling-restart-query-reconnect-delivery-20260517T001920Z/rolling-restart/"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/bootstrap/phases/create-message-group-phase.js",
    "src/bootstrap/node-joining-service-segment-3.js",
    "src/bootstrap/shared/message-group-service-activation.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "test/bootstrap/message-group-service-activation.test.js",
    "test/bootstrap/node-joining-service.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/bootstrap/phases/create-message-group-phase.js",
    "src/bootstrap/node-joining-service-segment-3.js",
    "src/bootstrap/shared/message-group-service-activation.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "test/bootstrap/message-group-service-activation.test.js",
    "test/bootstrap/node-joining-service.test.js"
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
    "artifact": "test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Prove or split the event-driven workflow progress residual for control_plane_publications-p1 operation d5ffb401-f539-44d6-a23a-6365606ac232."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "join_message_group_activation_owner",
    "fromBoundary": "service_row_activation_publication",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "The focused MOVE_REPLICA control-plane upsert fixture closed the join activation publication edge. The representative rerun remains red, but canonical evidence moved the first frontier to priority_recovery_partition_progress under operation_workflow_owner / workflow_progress, with active_gate_snapshot_coverage no longer the first frontier and snapshot coverage present at 2/5.",
    "evidence": [
      "npx tap test/bootstrap/node-joining-service.test.js -g \"MOVE_REPLICA control-plane upsert|includes assignment_id|retries register-service on assignment token|surfaces repeated assignment token unknown|bypasses HTTP register-service\"",
      "test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "Snapshot coverage stayed 0/5 because live joiners were admitted but MOVE_REPLICA join-created message-group service activation still fell back to seed HTTP registration. Explicit control-plane upsert during preferred join metadata registration should publish the live service row while preserving assignment_id.",
    "stopConditionCheck": "Run entry validation, canonical evidence extractors including npm run analyze:causal-model, the narrowest join/message-group activation fixture that decides whether activation falls back to seed HTTP after live admission, focused owner tests for the selected runtime file, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, discovery_node_coverage_gap disappears/stays absent, the participant-closed selected error disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Resolved for this boundary: focused owner tests prove MOVE_REPLICA preferControlPlaneUpsert uses the join service-row upsert owner, avoids seed HTTP registration, preserves assignment_id, and retains join-time cache publication metadata.",
    "crossBoundaryReview": "Do not reopen publication ACK, timeout budget increases, active-gate admission, CDC fallback, message-router reconnect delivery, or query participant routing. Priority recovery is selected only because the representative rerun canonically moved the first frontier to operation_workflow_owner / workflow_progress."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after query participant routing migration",
    "phaseChain": [
      "consume the closed query participant fallthrough proof",
      "use scoped playback to prove live nodes-p1 service candidates are absent",
      "build the narrowest join/message-group service activation fixture for seed HTTP fallback after live admission",
      "edit only the selected activation/publication owner path after subagent proof is clean",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress in test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json, canonically owned by operation_workflow_owner / workflow_progress with reason priority_recovery_event_driven_wait and witness actuationState=persisted_not_dispatched.",
    "knownDownstreamBlockers": [
      "query participant fallthrough works when a live service candidate exists",
      "MOVE_REPLICA preferControlPlaneUpsert now uses join metadata service-row upsert and preserves assignment_id",
      "representative active gate progress moved to active=5/5 and snapshot_coverage=2/5",
      "active_gate_snapshot_coverage is blocked but not the first frontier in canonical evidence",
      "publication ACK remains satisfied with pendingAckCount=0",
      "timeout budgets and active-gate admission remain frozen",
      "message-router reconnect delivery and query participant routing remain frozen"
    ],
    "missingCausalEdge": "Prove or split why the control_plane_publications-p1 priority recovery operation remains event-driven with actuationState=persisted_not_dispatched and nextRequiredAction=wait_for_operation_progress.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
    "boundedProgressProof": "Metric-moving proof with dispatch/retry progress: the focused activation dispatch path now upserts through the control plane, representative coverage moved from 0/5 to 2/5, active_gate_snapshot_coverage is no longer the canonical first frontier, and the first frontier migrated to operation_workflow_owner / workflow_progress.",
    "boundedProgressProofArtifact": "test/bootstrap/node-joining-service.test.js plus representative rolling-restart report test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json.",
    "expectedObservableTransition": "successor proof should dispatch or otherwise progress the persisted_not_dispatched operation, raise snapshotCoverage above 2/5, remove the priority recovery event wait, migrate to a new owner boundary, or turn representative rolling-restart green.",
    "maxProgressBound": "one focused join_message_group_activation_owner / service_row_activation_publication slice",
    "sameFrontierFallback": "If the focused owner tests pass but representative evidence keeps the same participant-closed edge without metric movement, stop and classify same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress priority recovery residual for control_plane_publications-p1",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260516-query-message-router-reconnect-delivery-snapshot-coverage.md / query_message_router_owner / reconnect_delivery / migrated",
      "work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md / query_participant_failure / inactive_participant_routing / migrated"
    ],
    "oscillationCheck": "This package is allowed because the previous package proved query fallthrough and selected absent live service candidates; the new representative evidence selects operation_workflow_owner / workflow_progress rather than reopening publication ACK, timeout budgets, active-gate admission, CDC fallback, reconnect-delivery, or query-routing edges.",
    "handoffInvariant": "Publication ACK, timeout budget increases, active-gate admission, CDC fallback, message-router reconnect delivery, and query participant routing remain frozen. Priority recovery may be reopened only on the selected operation_workflow_owner / workflow_progress evidence."
  },
  "predecessor": "work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md"
}
-->

## Why

The previous slice proved the query path is not the owner when live service
candidates exist. The remaining representative failure has no live `nodes-p1`
candidate rows to route to, and playback points at join service activation
falling back to seed HTTP registration after live nodes are already admitted.

This package owns the narrow activation/publication decision needed to make live
partition candidates visible without reopening reconnect delivery, query
routing, publication ACK, priority recovery, timeout budgets, or active-gate
admission.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically rolling-restart topology
workflow stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative release gate remains red and
  this package may promote one runtime activation/publication owner path after a
  replayable fixture selects it.
- Escalation trigger to a heavier lane: selected ownership expands beyond join
  service activation/publication, a frozen edge must be reopened, or
  representative evidence contradicts this boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Archimedes (019e3313-51e7-71e1-8769-43672b3dc4ff) reviewed work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Tesla (019e3323-0acf-7a82-ba8f-c0bab30d7c03) fixed work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md.
- [x] Implementation subagent recorded: Agent Copernicus (019e332e-3a31-7461-a884-e859dab104f6) implemented work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. publication-ack-convergence
2. priority_recovery_partition_progress
3. timeout_budgets
4. active_gate_admission
5. query_message_router_owner/reconnect_delivery
6. query_participant_failure/inactive_participant_routing

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `timeout_budgets`, `active_gate_admission`, `query_message_router_owner/reconnect_delivery`, `query_participant_failure/inactive_participant_routing`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md`, `npm run work:validate -- --pre-impl work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md`, `npx tap test/bootstrap/node-joining-service.test.js -g "MOVE_REPLICA control-plane upsert|includes assignment_id|retries register-service on assignment token|surfaces repeated assignment token unknown|bypasses HTTP register-service"`, `npx tap test/bootstrap/message-group-service-activation.test.js`, `node --check src/bootstrap/phases/create-message-group-phase.js`, `node --check test/bootstrap/node-joining-service.test.js`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json`, `git diff --check -- src/bootstrap/phases/create-message-group-phase.js test/bootstrap/node-joining-service.test.js work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md
2. npm run work:validate -- --pre-impl work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md
3. npx tap test/bootstrap/node-joining-service.test.js -g "MOVE_REPLICA control-plane upsert|includes assignment_id|retries register-service on assignment token|surfaces repeated assignment token unknown|bypasses HTTP register-service"
4. npx tap test/bootstrap/message-group-service-activation.test.js
5. node --check src/bootstrap/phases/create-message-group-phase.js
6. node --check test/bootstrap/node-joining-service.test.js
7. npm run work:evidence-summary -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json
8. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json --explain active_gate_snapshot_coverage
9. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json
10. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json
11. git diff --check -- src/bootstrap/phases/create-message-group-phase.js test/bootstrap/node-joining-service.test.js work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl

Representative rerun:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json --verbose`
2. Result: red but metric-moving. Canonical evidence moved the first frontier to `priority_recovery_partition_progress` under `operation_workflow_owner / workflow_progress`; `active_gate_snapshot_coverage` is no longer the first frontier, active nodes reached `5/5`, and snapshot coverage reached `2/5`.

Static guardrails:

1. `npm run audit:runtime-grammar:file` failed only on existing unrelated fixed-hotspot files `src/control-plane/membership-publication-coordinator.js` and `src/rebalancer/operation-workflow-owner-segment-5.js`.
2. `npm run test:metrics:scoped -- src/bootstrap/phases/create-message-group-phase.js test/bootstrap/node-joining-service.test.js` exited 0 while reporting inherited complexity hotspots in `src/bootstrap/phases/create-message-group-phase.js`.

## Commit And Push Ledger

1. Focused package commit: `40e169ce752f94243f83d70dbc391f6b4857576c`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
