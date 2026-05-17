# Priority Recovery Workflow Progress After Publication Handoff

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-17",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_event_driven_wait",
  "currentState": "Publication ACK is closed and snapshotCoverage improved to 4/5, but canonical evidence selects one retryable priority_recovery_partition_progress witness under operation_workflow_owner / workflow_progress for control_plane_publications-p1 in spread_satisfied_in_flight.",
  "nextAction": "Build or reuse the narrow workflow-progress fixture for control_plane_publications-p1 spread_satisfied_in_flight event-driven wait, run required review/fix/implementation subagents before runtime edits, then edit only the selected owner path with success defined as priority_recovery_partition_progress gone, snapshotCoverage above 4/5, discovery_node_coverage_gap gone, a new owner boundary migration, or representative rolling-restart green.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
    "npm run work:validate -- --entry"
  ],
  "writeScope": [
    "work/packages/active-20260517-priority-recovery-workflow-progress-after-publication-handoff.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md",
    "test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json"
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
    "work/packages/active-20260517-priority-recovery-workflow-progress-after-publication-handoff.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "cross-boundary-causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "publication-handoff/workflow-progress-successor",
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
    "artifact": "test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Prove or split the single control_plane_publications-p1 spread_satisfied_in_flight workflow-progress residual without reopening publication ACK or active-gate admission."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "The predecessor closed publication_ack_convergence and improved snapshotCoverage to 4/5. Canonical evidence now selects priority_recovery_partition_progress under operation_workflow_owner / workflow_progress.",
    "evidence": [
      "work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The remaining red gate is a single retryable workflow-progress priority recovery wait for control_plane_publications-p1 after publication ACK has closed and active-gate coverage has improved to 4/5.",
    "stopConditionCheck": "Use npm run work:evidence-summary, npm run analyze:priority-recovery-residuals, npm run analyze:owner-files, and npm run analyze:causal-model on the publication-handoff representative before runtime edits; then run required subagents before promoting exact owner files.",
    "expectedCausalModelChange": "priority_recovery_partition_progress disappears, snapshotCoverage improves above 4/5, discovery_node_coverage_gap disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "This package follows a metric-moving publication ACK migration. Publication ACK, timeout budgets, active-gate admission, selected-source selection, CDC fallback, reconnect delivery, query routing, and readiness support stay frozen unless canonical evidence selects them again.",
    "crossBoundaryReview": "The validation lane is causal-escalation because recent adjacent publication packages migrated without turning the representative green; this successor may edit only operation_workflow_owner / workflow_progress after focused proof selects an exact runtime path."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after publication handoff flat-progress migration",
    "phaseChain": [
      "consume the closed publication ACK handoff proof",
      "use priority recovery residual extraction to isolate the single workflow-progress witness",
      "use owner-files to select the narrow operation_workflow_owner / workflow_progress fixture and runtime file",
      "run review, fix if required, and implementation subagents before runtime edits",
      "edit only the selected owner path",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress in test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json, owned by operation_workflow_owner / workflow_progress with reason priority_recovery_event_driven_wait.",
    "knownDownstreamBlockers": [
      "publication ACK is satisfied with publicationStatus=PUBLISHED and pendingAckCount=0",
      "snapshotCoverage improved from 2/5 to 4/5",
      "priority recovery residual extraction reports one witness and splitRequired=false",
      "the residual group is operation_workflow_owner / workflow_progress",
      "partition control_plane_publications-p1 is in spread_satisfied_in_flight",
      "active_gate_snapshot_coverage remains downstream at snapshotCoverage=4/5 with discovery_node_coverage_gap"
    ],
    "missingCausalEdge": "Prove whether the control_plane_publications-p1 spread_satisfied_in_flight priority recovery operation should advance through operation workflow progress, or migrate to a new owner boundary selected by canonical evidence.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown",
    "boundedProgressProof": "Pending metric-moving workflow-progress dispatch, advance, or drain proof after publication ACK closure and 4/5 snapshot coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json",
    "expectedObservableTransition": "priority_recovery_partition_progress gone, snapshotCoverage above 4/5, discovery_node_coverage_gap gone, a genuinely new owner boundary selected, or representative rolling-restart green.",
    "maxProgressBound": "one focused operation_workflow_owner / workflow_progress causal-escalation slice",
    "sameFrontierFallback": "If focused tests pass but the representative keeps the same control_plane_publications-p1 workflow-progress witness without metric movement, stop and classify same-frontier instead of reopening frozen edges.",
    "expectedNextFrontier": "priority_recovery_partition_progress gone, active_gate_snapshot_coverage at 5/5 or a new owner boundary selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260517-startup-active-gate-selected-snapshot-source-timeout.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "Causal-escalation lane is required because adjacent publication and active-gate edges migrated without going green. This package is allowed only because fresh canonical evidence selects operation_workflow_owner / workflow_progress and the predecessor produced metric movement to 4/5.",
    "handoffInvariant": "Publication ACK, timeout budgets, active-gate admission, selected-source selection, CDC fallback, reconnect delivery, query routing, and readiness support remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-topology-publication-ack-pending-after-forced-repair-owner-command.md"
}
-->

## Why

The publication handoff slice removed the ACK frontier and improved coverage to
`4/5`. The representative is still red, but the first frontier is now a single
`operation_workflow_owner / workflow_progress` priority recovery witness for
`control_plane_publications-p1`.

This package owns the narrow decision for that workflow-progress residual. It
must move a metric or migrate to a new owner boundary; a same-frontier rerun
without movement stops this slice.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: adjacent active-gate and publication packages
  migrated without turning the representative green, so this successor must
  preserve a cross-boundary oscillation guard.
- Escalation trigger to a heavier lane: canonical evidence selects a frozen
  edge, runtime write scope expands beyond the selected owner path, or
  representative evidence contradicts the operation workflow boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-review-result.
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

1. work/packages/active-20260517-priority-recovery-workflow-progress-after-publication-handoff.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. publication_ack_convergence
2. timeout_budgets
3. active_gate_admission
4. CDC_fallback
5. reconnect_delivery
6. query_participant_routing
7. readiness_support

## Model Fit

- Package class: `cross-boundary-causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `publication-handoff/workflow-progress-successor`
- Output profile: `medium`
- Owned files: `work/packages/active-20260517-priority-recovery-workflow-progress-after-publication-handoff.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `publication_ack_convergence`, `timeout_budgets`, `active_gate_admission`, `CDC_fallback`, `reconnect_delivery`, `query_participant_routing`, `readiness_support`
- Frozen decisions: publication ACK, timeout budgets, active-gate admission,
  selected-source selection, CDC fallback, reconnect delivery, query routing,
  and readiness support stay closed unless canonical evidence selects them
  again.
- Escalation triggers: owned files expand beyond this package, a frozen
  decision must be reopened, or representative evidence selects a different
  owner boundary.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json`, `npm run work:validate -- --entry`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json --markdown
3. npm run analyze:owner-files -- operation_workflow_owner workflow_progress
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-handoff-flat-progress-20260517.report.json
5. npm run work:validate -- --entry
