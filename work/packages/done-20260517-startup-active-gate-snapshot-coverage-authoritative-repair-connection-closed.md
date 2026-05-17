# Startup Active Gate Snapshot Coverage Authoritative Repair Connection Closed

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-17",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z/rolling-restart/",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The focused forced-repair fallback fixture is implemented and focused admin snapshot tests pass. The representative rerun did not improve snapshotCoverage above 0/5, but canonical evidence no longer selects active_gate_snapshot_coverage as the first frontier; it selects publication_ack_convergence under topology_publication_owner / publication_convergence, with the active-gate edge deferred on selected_snapshot_source_timeout.",
  "nextAction": "Migrate to the freshly selected topology_publication_owner / publication_convergence frontier using test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json.",
  "proof": [
    "npm run work:validate -- --entry work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown",
    "npm run work:validate -- --pre-impl work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md",
    "npx tap test/admin/admin-control-snapshot.test.js -g \"forced participant repair failure returns a usable fallback snapshot\"",
    "npx tap test/admin/admin-control-snapshot.test.js",
    "node --check src/admin/admin-control-snapshot-class-part-2.js",
    "node --check test/admin/admin-control-snapshot.test.js",
    "node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js",
    "node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js",
    "npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js",
    "git diff --check -- src/admin/admin-control-snapshot-class-part-2.js test/admin/admin-control-snapshot.test.js work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --handoff-probe",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --replay-fixture",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
    "test-output/reports/.playback/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z/rolling-restart/"
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
    "test/admin/admin-service-discovery.test.js",
    "test/control-plane/control-plane-snapshot-owner.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "representative evidence selects query participant routing or reconnect delivery instead of startup active-gate snapshot coverage"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Decide whether selected source repair failure is owned by snapshot-source selection, forced repair stall, authoritative nodes query pressure/participant closed, or inherited readiness support."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The predecessor drained the WAIT_FOR_OPERATION_PROGRESS priority recovery residual; representative evidence reports priority_recovery_partition_progress satisfied and priority residual witnessCount=0, leaving active_gate_snapshot_coverage as the first frontier.",
    "evidence": [
      "work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md",
      "test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The representative active-gate snapshot edge is blocked because the selected source reaches admin health but authoritative control snapshot repair for nodes fails on participant 7493b0ab-a054-5fad-a91b-5e331db29304 closing during repair.",
    "stopConditionCheck": "Run entry validation, topology explain plus handoff/replay fixture, npm run analyze:causal-model on the representative artifact, focused admin/control snapshot tests for the selected owner file only after subagent proof is clean, static guardrails, and one representative rolling-restart rerun.",
    "expectedCausalModelChange": "snapshotCoverage improves above 2/5, active_gate_snapshot_coverage disappears, the frontier migrates to a genuinely new owner boundary, or representative rolling-restart turns green.",
    "representativeOutcome": "migrated",
    "causalDebt": "Resolved for this package boundary: the focused fixture proves forced participant/timeout repair failure returns a structured repair_deferred local snapshot without re-entering authoritative repair. Representative evidence did not move snapshotCoverage above 0/5; instead it canonically migrated first frontier to publication_ack_convergence while active_gate_snapshot_coverage became deferred with selected_snapshot_source_timeout.",
    "crossBoundaryReview": "Do not reopen publication ACK, priority recovery workflow progress, timeout budgets, active-gate admission, CDC fallback, message-router reconnect delivery, or query participant routing unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after priority workflow-progress wait drain",
    "phaseChain": [
      "consume the closed priority recovery workflow-progress proof",
      "use topology explain, handoff probe, and replay fixture to classify the selected active-gate snapshot coverage edge",
      "separate snapshot-source selection, forced repair stall, authoritative nodes query pressure/participant closed, and inherited readiness support",
      "edit only the selected startup_active_gate_owner / snapshot_coverage owner path after subagent proof is clean",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or contradictory"
    ],
    "currentFirstFrontier": "publication_ack_convergence in test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json, owned by topology_publication_owner / publication_convergence with reason publication_pending.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is selected again by canonical evidence in test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json",
      "priority_recovery_partition_progress is satisfied",
      "priority recovery residual witnessCount=0",
      "snapshotCoverageNodeCount remains 0 and expectedNodeCount=5",
      "selected snapshot source 11601fe0-72d6-5853-8590-ec2881853e72 is adminReady=true via admin_health",
      "selectedSnapshotRepairDeferred=false",
      "selected snapshot error changed to selected snapshot source timeout after 3000ms",
      "active_gate_snapshot_coverage is deferred rather than first frontier",
      "readiness_startup_support is retryable with snapshot_timeout"
    ],
    "missingCausalEdge": "Decide whether the selected snapshot repair failure is a snapshot-source selection issue, forced repair stall, authoritative control snapshot nodes query pressure/participant closed, or only inherited readiness support.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --replay-fixture",
    "boundedProgressProof": "Bounded migration proof achieved: active_gate_snapshot_coverage disappeared as the first frontier and canonical evidence migrated to topology_publication_owner / publication_convergence. Snapshot coverage did not improve and the representative remains red.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json plus the focused forced-repair fallback fixture selected by this package.",
    "expectedObservableTransition": "The successor package must treat publication_ack_convergence as reopened only because canonical evidence selected it again, without changing timeout budgets, active-gate admission, CDC fallback, reconnect delivery, query participant routing, or inactive participant routing.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice",
    "sameFrontierFallback": "If the representative stays same-frontier without metric movement, stop and record same-frontier instead of widening into frozen edges.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260517-join-message-group-service-activation-candidate-publication.md / join_message_group_activation_owner / service_row_activation_publication / migrated",
      "work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This package is allowed because the immediately preceding representative evidence satisfied priority recovery and selected startup_active_gate_owner / snapshot_coverage as the first frontier.",
    "handoffInvariant": "Publication ACK, priority recovery workflow progress, timeout budget increases, active-gate admission, CDC fallback, message-router reconnect delivery, query participant routing, and join service activation remain frozen unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260517-priority-recovery-operation-workflow-owner-workflow-progress.md",
  "closed": "2026-05-17",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The priority-recovery slice moved the release gate: canonical evidence now
reports `priority_recovery_partition_progress` satisfied and no priority
recovery residual witnesses. The representative failure is back on active-gate
snapshot coverage, but with a concrete selected repair error rather than a
broad discovery gap.

This package owns one replayable decision for that edge. It must separate bad
snapshot-source selection, forced repair path stall, authoritative control
snapshot nodes query pressure/participant closed, and inherited readiness
support, then edit only the selected owner path.

Result: the forced repair fallback path is covered by a replayable focused
fixture and does not re-enter authoritative repair when the selected source is
already in a repair failure. The representative rerun stayed red and
`snapshotCoverage` remained `0/5`, but canonical evidence moved the first
frontier off `active_gate_snapshot_coverage` to
`topology_publication_owner / publication_convergence`.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is required: the representative release gate is still red and
  canonical evidence selected a startup active-gate runtime owner boundary.
- Escalation trigger to a heavier lane: the replay fixture selects a frozen
  edge, runtime ownership expands beyond the candidate files, or representative
  evidence contradicts this owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Gibbs (019e3341-adb5-7490-ae08-935b867423ac) reviewed work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e33ab-6fe3-78f1-a121-e8eab202489c) fixed work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md.
- [x] Implementation subagent recorded: Agent Codex (019e33b1-ad24-7f63-8c0f-e2aeb5c693d3) implemented work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/admin/admin-control-snapshot-class-part-2.js
7. test/admin/admin-control-snapshot.test.js

## Out Of Scope

1. publication-ack-convergence
2. priority_recovery_partition_progress
3. timeout_budgets
4. active_gate_admission
5. CDC_fallback
6. query_message_router_owner/reconnect_delivery
7. query_participant_failure/inactive_participant_routing

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/admin/admin-control-snapshot-class-part-2.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `timeout_budgets`, `active_gate_admission`, `CDC_fallback`, `query_message_router_owner/reconnect_delivery`, `query_participant_failure/inactive_participant_routing`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:validate -- --entry work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --handoff-probe`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --replay-fixture`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:validate -- --entry work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --explain active_gate_snapshot_coverage
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --handoff-probe
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json --replay-fixture
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-wait-drain-20260517T014714Z.report.json
7. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
8. npm run work:validate -- --pre-impl work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md
9. npx tap test/admin/admin-control-snapshot.test.js -g "forced participant repair failure returns a usable fallback snapshot"
10. npx tap test/admin/admin-control-snapshot.test.js
11. node --check src/admin/admin-control-snapshot-class-part-2.js
12. node --check test/admin/admin-control-snapshot.test.js
13. node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js
14. node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js
15. npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js
16. git diff --check -- src/admin/admin-control-snapshot-class-part-2.js test/admin/admin-control-snapshot.test.js work/packages/done-20260517-startup-active-gate-snapshot-coverage-authoritative-repair-connection-closed.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json

Representative rerun:

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-reference-projection-20260517T023552Z.report.json --verbose`
2. Result: red but metric-moving by owner-boundary migration. Canonical evidence reports first frontier `publication_ack_convergence` under `topology_publication_owner / publication_convergence`, active-gate snapshot coverage deferred with `selected_snapshot_source_timeout`, `snapshotCoverageNodeCount=0/5`, and priority residual `witnessCount=0`.

## Commit And Push Ledger

1. Focused package commit: pending-post-commit
2. Pushed to: pending-post-push
3. Commit contains only package-owned files/package-status/allowed sprint handoff: pending-post-commit
