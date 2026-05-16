# Startup Active Gate Snapshot Timeout Handoff Fixture

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The handoff/snapshot fixture split the active_gate_snapshot_coverage edge: selected source 11601fe0-72d6-5853-8590-ec2881853e72 times out on the snapshot lane after 100ms, forced repair also times out, the legacy artifact owner edge is authoritative_control_snapshot_query_pressure, and readiness support remains inherited from active-gate no progress. The representative rerun improved active-gate coverage to 2/5 and selected priority_recovery_partition_progress under operation_workflow_owner / workflow_progress as the first frontier with priority_recovery_event_driven_wait.",
  "nextAction": "Commit and push this focused handoff fixture slice, then open the successor priority recovery workflow-progress package because canonical representative evidence selected that edge again. Do not touch publication ACK, timeout budgets, or active-gate admission unless canonical evidence selects them again.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --markdown",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown",
    "npm run work:model-ledger -- record --package work/packages/active-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason next-frontier-priority-recovery-workflow-progress --outcome migrated --validation-status focused-green-representative-migrated --correction-loops 1 --review-findings 1 --notes \"Handoff fixture split selected snapshot source timeout, forced repair timeout, authoritative query pressure, and inherited readiness support; representative improved active-gate coverage to 2/5 but migrated first frontier to priority_recovery_partition_progress with event-driven workflow wait residuals.\""
  ],
  "writeScope": [
    "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-service-discovery.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md",
    "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/admin/admin-control-snapshot.test.js",
    "test/admin/admin-service-discovery.test.js",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "runtime implementation is needed after the replay fixture"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Open the successor priority recovery workflow-progress package for the representative residual selected by canonical evidence."
  },
  "causalGovernance": {
    "hypothesis": "The current rolling-restart red edge is an active-gate snapshot coverage fixture edge rather than publication ACK or priority recovery. The selected snapshot source 11601fe0-72d6-5853-8590-ec2881853e72 times out on the direct snapshot lane, forced repair then times out while reading nodes through authoritative control snapshot repair, legacy evidence owns the edge as authoritative_control_snapshot_query_pressure, and readiness support inherits active-gate no progress.",
    "stopConditionCheck": "Run npm --silent run analyze:causal-model on fresh evidence, the handoff probe, focused admin snapshot tests, focused owner tests for any promoted runtime file, static guardrails, and one representative rolling-restart rerun after implementation.",
    "expectedCausalModelChange": "Focused proof separates bad snapshot-source selection, forced repair path stalls, authoritative control snapshot query pressure, and readiness inherited from active-gate no progress. The representative rerun migrated to priority_recovery_partition_progress with event-driven workflow wait residuals.",
    "representativeOutcome": "migrated",
    "causalDebt": "The representative rerun reports publication_ack_convergence satisfied, active_gate_snapshot_coverage downstream with coverage improved to 2/5 and snapshot_repair_deferred, and first frontier priority_recovery_partition_progress under operation_workflow_owner / workflow_progress with priority_recovery_event_driven_wait.",
    "crossBoundaryReview": "Publication ACK, timeout budgets, and active-gate admission remain closed. Priority recovery is reopened only because fresh canonical representative evidence selected priority_recovery_partition_progress again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after priority workflow-progress reduction",
    "phaseChain": [
      "consume priority recovery workflow-progress migration proof",
      "classify active_gate_snapshot_coverage as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "build a replayable handoff/snapshot fixture for selected source 11601fe0-72d6-5853-8590-ec2881853e72",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress in test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json, owned by operation_workflow_owner / workflow_progress.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied",
      "active_gate_snapshot_coverage improved to 2/5 and is now downstream of priority recovery",
      "selected snapshot observation is repair_deferred with cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight",
      "priority_recovery_partition_progress has three workflow-progress witnesses across control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1",
      "readiness support remains inherited from active-gate no progress"
    ],
    "missingCausalEdge": "Separated for the active-gate fixture: selected snapshot-source selection and forced repair timeout are present, the legacy artifact owner edge is authoritative_control_snapshot_query_pressure, and readiness support remains inherited downstream evidence. The successor edge is priority_recovery_partition_progress.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown",
    "boundedProgressProof": "This package proves the active-gate snapshot timeout and forced repair reconcile subedge with replayable handoff/snapshot fixtures. The representative rerun migrates to priority recovery workflow-progress residuals.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "expectedObservableTransition": "Successor work should prove or split priority_recovery_event_driven_wait without reopening publication ACK, timeout budgets, or active-gate admission.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "If active_gate_snapshot_coverage returns as first frontier, preserve selected source 11601fe0-72d6-5853-8590-ec2881853e72 and split by the exact snapshot/repair/query/readiness subcause.",
    "expectedNextFrontier": "representative green, reduced priority recovery workflow-progress residual, or active-gate snapshot coverage after priority recovery drains",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This migration is allowed because this package split the active-gate evidence, improved coverage, and fresh canonical representative evidence selected priority_recovery_partition_progress again.",
    "handoffInvariant": "Publication ACK, timeout budgets, and active-gate admission remain closed unless canonical evidence selects them again. Priority recovery is reopened by fresh canonical evidence only."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "The focused handoff fixture passed and the representative rerun improved active-gate snapshot coverage to 2/5 while selecting priority_recovery_partition_progress as the first frontier.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown"
    ]
  },
  "predecessor": "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md"
}
-->

## Why

The priority recovery edge is reduced and the representative gate moved back to
active-gate snapshot coverage. This package owns the replayable
handoff/snapshot fixture for selected source
`11601fe0-72d6-5853-8590-ec2881853e72` and must split the selected snapshot
source timeout, forced repair timeout, authoritative control snapshot nodes
query timeout, and inherited readiness support.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative scenario remains red after
  priority recovery reduced, and canonical evidence moved the first frontier
  back to startup active-gate snapshot coverage.
- Escalation trigger to a heavier lane: implementation requires timeout
  increases, publication ACK rewrites, priority recovery rewrites, active-gate
  admission relaxation, or a broader architecture change outside the snapshot
  fixture boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e31bd-4f1f-7e23-b0f8-106a1a01592f) reviewed work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e31bf-2426-7841-81a9-d9648470bd4c) fixed work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md.
- [x] Implementation subagent recorded: Agent Hume (019e31cf-e9b9-7e13-87ab-13dd9f6acf47) implemented work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. src/admin/admin-control-snapshot-class-part-2.js
6. src/admin/admin-control-snapshot-class-part-3.js
7. src/admin/admin-control-snapshot-class-part-5.js
8. src/admin/admin-control-snapshot-class-part-6.js
9. src/admin/admin-service-discovery-readiness-methods.js
10. src/admin/admin-service-discovery-repair-methods.js
11. src/control-plane/control-plane-snapshot-owner.js
12. src/diagnostics/topology-convergence-graph.js
13. test/admin/admin-control-snapshot.test.js
14. test/admin/admin-service-discovery.test.js
15. work/model-ledger.jsonl

## Out Of Scope

1. publication-ack-convergence
2. priority-recovery-workflow-progress
3. representative-timeout-budget
4. active-gate-admission-relaxation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/admin/admin-control-snapshot-class-part-2.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/admin/admin-control-snapshot-class-part-6.js`, `src/admin/admin-service-discovery-readiness-methods.js`, `src/admin/admin-service-discovery-repair-methods.js`, `src/control-plane/control-plane-snapshot-owner.js`, `src/diagnostics/topology-convergence-graph.js`, `test/admin/admin-control-snapshot.test.js`, `test/admin/admin-service-discovery.test.js`, `work/model-ledger.jsonl`
- Forbidden files: `publication-ack-convergence`, `priority-recovery-workflow-progress`, `representative-timeout-budget`, `active-gate-admission-relaxation`
- Frozen decisions: publication ACK, timeout budgets, and active-gate admission stay closed unless canonical evidence selects them again; priority recovery is reopened only for the successor package because the representative rerun selected it again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, active-gate admission would be relaxed, or timeout budgets would be increased.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md`
2. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-workflow-progress-20260516.report.json --handoff-probe`; consumer reasons include `selected_snapshot_source_timeout`, `forced_repair_snapshot_timeout`, and `authoritative_control_snapshot_query_pressure`, with readiness inherited downstream.
3. PASS - `npm test -- test/admin/admin-control-snapshot.test.js --grep "forced repair failures preserve"`
4. PASS - `npm test -- test/admin/admin-control-snapshot.test.js --grep "Topology convergence replay separates"`
5. PASS - `npm test -- test/admin/admin-control-snapshot.test.js`
6. PASS - `npm test -- test/scripts/analyze-topology-convergence.test.js`
7. PASS - `npm test -- test/admin/admin-service-discovery.test.js`
8. PASS - `node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js`
9. PASS - `node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js`
10. PASS - `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js`
11. PASS - `npx eslint src/admin/admin-control-snapshot-class-part-2.js src/diagnostics/topology-convergence-graph.js test/admin/admin-control-snapshot.test.js`
12. PASS - `git diff --check`
13. Fallback note: canonical evidence summary and handoff probe did not enumerate every selected-snapshot source path, so a bounded Node JSON inspection was used only to confirm selected snapshot source `11601fe0-72d6-5853-8590-ec2881853e72` and timeout evidence paths before the canonical handoff probe became the durable proof.
14. RED/MIGRATED - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --verbose`; active-gate snapshot coverage improved to 2/5 and representative first frontier migrated to `priority_recovery_partition_progress`.
15. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`; first frontier `priority_recovery_partition_progress`, owner `operation_workflow_owner`, boundary `workflow_progress`.
16. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --handoff-probe`; publication ACK remains satisfied and active-gate snapshot coverage is downstream with `snapshot_repair_deferred`.
17. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`; outcome `accept_classified_backpressure`, dominant failure class `priority_recovery_event_wait`.
18. PASS - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown`; three workflow-progress witnesses under `operation_workflow_owner / workflow_progress`.
19. PASS - `npm run work:model-ledger -- record --package work/packages/active-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason next-frontier-priority-recovery-workflow-progress --outcome migrated --validation-status focused-green-representative-migrated --correction-loops 1 --review-findings 1 --notes "Handoff fixture split selected snapshot source timeout, forced repair timeout, authoritative query pressure, and inherited readiness support; representative improved active-gate coverage to 2/5 but migrated first frontier to priority_recovery_partition_progress with event-driven workflow wait residuals."`

## Commit And Push Ledger

1. Focused package commit: fb7ad15c
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
4. Split commit note: 11fb8d24 carried the focused snapshot timeout handoff
   fixture implementation and proof; fb7ad15c finalized the done package state
   and activated the successor priority recovery residual package in the
   focused tracker handoff.
