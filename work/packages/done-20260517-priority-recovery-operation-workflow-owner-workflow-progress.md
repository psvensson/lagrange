# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The focused workflow-progress fixture closed the persisted_not_dispatched WAIT_FOR_OPERATION_PROGRESS priority recovery residual; representative rerun moved the first frontier to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage.",
  "nextAction": "Migrate to the selected startup_active_gate_owner / snapshot_coverage edge using the representative rerun artifact.",
  "proof": [
    "npm run work:validate -- --entry work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "npm run work:validate -- --pre-impl work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "npx tap test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js -g \"WAIT_FOR_OPERATION_PROGRESS|spread-satisfied priority PENDING dispatch waits drain\"",
    "npx tap test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "npx tap test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "node --check src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "node --check test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md",
    "test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
    "test-output/reports/.playback/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z/rolling-restart/"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js"
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
    "reason": "The predecessor closed the join activation publication edge and the representative rerun moved the first frontier to priority_recovery_partition_progress with one operation_workflow_owner / workflow_progress witness.",
    "evidence": [
      "work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md",
      "test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The representative gate is now blocked by a priority recovery operation that is persisted but not dispatched: control_plane_publications-p1 is in spread_satisfied_in_flight with event-driven wait and nextRequiredAction=wait_for_operation_progress.",
    "stopConditionCheck": "Run entry validation, npm run analyze:priority-recovery-residuals and npm run analyze:causal-model on the representative artifact, the narrowest workflow-progress fixture that decides persisted_not_dispatched dispatch/progress ownership, focused owner tests for the promoted runtime file, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "priority_recovery_partition_progress disappears, snapshotCoverage improves above 2/5, discovery_node_coverage_gap disappears/stays absent, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Resolved for this boundary: focused tests prove WAIT_FOR_OPERATION_PROGRESS joins the same owner-progress reentry path as ADVANCE_EXISTING_OPERATION, drains the persisted_not_dispatched spread-satisfied priority operation, and leaves no priority recovery residual witnesses in the representative rerun.",
    "crossBoundaryReview": "Do not reopen publication ACK, timeout budget increases, active-gate admission, CDC fallback, message-router reconnect delivery, query participant routing, or join service activation unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after join/message-group service activation migration",
    "phaseChain": [
      "consume the closed join activation publication proof",
      "use priority recovery residual extractor to isolate the single workflow-progress witness",
      "build or reuse the narrowest workflow-progress fixture for persisted_not_dispatched event-driven wait",
      "edit only the selected operation_workflow_owner / workflow_progress path after subagent proof is clean",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json, canonically owned by startup_active_gate_owner / snapshot_coverage with reason active_gate_timed_out.",
    "knownDownstreamBlockers": [
      "publication ACK is satisfied",
      "join/message-group activation publication is closed as migrated",
      "active_gate_snapshot_coverage is no longer the first frontier",
      "representative active gate progress is active=5/5 and snapshot_coverage=2/5",
      "the predecessor residual had witnessCount=1 and splitRequired=false",
      "the focused fixture drains the selected control_plane_publications-p1 / spread_satisfied_in_flight / persisted_not_dispatched / event_driven WAIT_FOR_OPERATION_PROGRESS witness",
      "the representative rerun has priority recovery residual witnessCount=0",
      "priority_recovery_partition_progress is satisfied in the causal model",
      "the representative rerun is still red on active_gate_snapshot_coverage with snapshot_coverage=0/5 and selected snapshot repair error on 11601fe0-72d6-5853-8590-ec2881853e72"
    ],
    "missingCausalEdge": "Prove or split why the control_plane_publications-p1 priority recovery operation remains event-driven with actuationState=persisted_not_dispatched and nextRequiredAction=wait_for_operation_progress.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json",
    "boundedProgressProof": "Metric-moving drain proof achieved: priority_recovery_partition_progress disappeared as a frontier, priority recovery residual witnessCount is 0, and canonical evidence migrated to startup_active_gate_owner / snapshot_coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json plus the focused workflow-progress fixture selected by this package.",
    "expectedObservableTransition": "successor proof should improve snapshotCoverage above 2/5, remove active_gate_snapshot_coverage, migrate to a new owner boundary, or turn representative rolling-restart green.",
    "maxProgressBound": "one focused operation_workflow_owner / workflow_progress slice",
    "sameFrontierFallback": "If focused tests pass but representative evidence keeps the same priority recovery witness without metric movement, stop and classify same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260517-query-participant-failure-inactive-node-routing-coverage.md / query_participant_failure / inactive_participant_routing / migrated",
      "work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md / join_message_group_activation_owner / service_row_activation_publication / migrated"
    ],
    "oscillationCheck": "This package is allowed because canonical evidence selected priority_recovery_partition_progress after join activation moved the frontier, not because a closed publication ACK, timeout, active-gate admission, CDC, reconnect-delivery, query-routing, or join activation edge was reopened.",
    "handoffInvariant": "Publication ACK, timeout budget increases, active-gate admission, CDC fallback, message-router reconnect delivery, query participant routing, join service activation, and priority recovery workflow progress remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The representative gate moved past join/message-group service activation, but
now stops on one priority recovery workflow-progress witness. The residual is
not broad: `control_plane_publications-p1` is in
`spread_satisfied_in_flight`, `persisted_not_dispatched`,
`event_driven`, with `nextRequiredAction=wait_for_operation_progress`.

This package owns the replayable decision that proves whether that operation
should dispatch/progress locally or migrate to a different owner.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is required: the representative release gate is still red and
  canonical evidence selected one workflow-progress owner boundary.
- Escalation trigger to a heavier lane: the residual splits across multiple
  owner boundaries, a frozen edge must be reopened, or representative scenario
  evidence changes.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Chandrasekhar (019e333d-e81d-7492-a8ca-c31dffcc0a38) reviewed work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Wegener (019e3340-0c4b-7ec1-badf-cc4b2c979fe0) implemented work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
7. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js

## Out Of Scope

1. publication-ack-convergence
2. timeout_budgets
3. active_gate_admission
4. CDC_fallback
5. query_message_router_owner/reconnect_delivery
6. query_participant_failure/inactive_participant_routing

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Forbidden files: `publication-ack-convergence`, `timeout_budgets`, `active_gate_admission`, `CDC_fallback`, `query_message_router_owner/reconnect_delivery`, `query_participant_failure/inactive_participant_routing`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, a frozen decision must be reopened, or representative scenario evidence selects a different owner boundary.
- Focused proof: `npm run work:validate -- --entry work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md`, `npm run work:validate -- --pre-impl work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`, `npx tap test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js -g "WAIT_FOR_OPERATION_PROGRESS|spread-satisfied priority PENDING dispatch waits drain"`, `npx tap test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `npx tap test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `node --check src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `node --check test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md
2. npm run work:validate -- --pre-impl work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-join-service-activation-candidate-publication-20260517T011922Z.report.json
4. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
5. npx tap test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js -g "WAIT_FOR_OPERATION_PROGRESS|spread-satisfied priority PENDING dispatch waits drain"
6. npx tap test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
7. npx tap test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
8. node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
9. node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
10. npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
11. node --check src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
12. node --check test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
