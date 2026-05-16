# Startup Active Gate Forced Repair Row Source Unavailable

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused replay for selected source 11601fe0-72d6-5853-8590-ec2881853e72 reproduced forced authoritative repair row-source unavailability and the runtime fix resolved the late authoritative gateway before declaring authoritative_row_source_unavailable. The representative rolling-restart rerun stayed red, but the forced repair row-source edge is reduced: all five nodes reached active, snapshot coverage improved to 2/5, selectedSnapshotError is unknown, and canonical extractors now select priority_recovery_partition_progress under operation_workflow_owner / workflow_progress with one control_plane_publications-p1 residual witness in spread_satisfied_in_flight.",
  "nextAction": "Commit and push this focused forced-repair reduction, then open the generated successor package for the priority recovery operation_workflow_owner / workflow_progress residual selected by canonical evidence.",
  "proof": [
    "npm run work:context",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --markdown",
    "npm test -- test/admin/admin-service-discovery.test.js (red before runtime fix: focused late-owner replay failed with authoritative_row_source_unavailable)",
    "npm test -- test/admin/admin-service-discovery.test.js (pass after runtime fix)",
    "npm test -- test/admin/admin-control-snapshot.test.js",
    "npx eslint src/admin/admin-service-discovery-readiness-methods.js test/admin/admin-service-discovery.test.js --ignore-pattern 'test/.gitkeep'",
    "node scripts/check-guideline-literals.js src/admin/admin-service-discovery-readiness-methods.js",
    "node scripts/check-guideline-decision-boundaries.js src/admin/admin-service-discovery-readiness-methods.js",
    "npm run audit:runtime-grammar:file -- src/admin/admin-service-discovery-readiness-methods.js",
    "npm run work:validate -- --pre-impl work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --markdown",
    "npm run work:model-ledger -- record --package work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason migrated-to-operation-workflow-progress --outcome migrated --validation-status focused-green-representative-migrated --correction-loops 1 --review-findings 1 --notes \"Forced repair row-source edge reduced: late authoritative gateway fixture passes, representative moved to priority_recovery_partition_progress with one control_plane_publications-p1 spread_satisfied_in_flight residual.\""
  ],
  "writeScope": [
    "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "test/admin/admin-service-discovery.test.js",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
    "test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/admin/admin-service-discovery-readiness-methods.js",
    "src/admin/admin-service-discovery-repair-methods.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/control-plane/control-plane-snapshot-owner.js",
    "src/diagnostics/topology-convergence-graph.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/admin/admin-service-discovery-readiness-methods.js",
    "test/admin/admin-service-discovery.test.js",
    "work/model-ledger.jsonl"
  ],
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Open the generated successor package for the single control_plane_publications-p1 residual witness in spread_satisfied_in_flight."
  },
  "causalGovernance": {
    "hypothesis": "The remaining red gate is caused by forced authoritative repair being unable to obtain a row source for selected active-gate snapshot coverage after query-pressure timeout propagation reduced the prior edge.",
    "stopConditionCheck": "Run npm run analyze:causal-model and npm run analyze:topology-convergence on the fresh artifact, then run required subagents before promoting exact runtime files.",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, obtains snapshot coverage, keeps the same frontier with a narrower forced repair row-source edge, or migrates to startup readiness support after coverage improves.",
    "representativeOutcome": "migrated",
    "causalDebt": "Focused proof reduced the forced repair row-source unavailable edge for selected source 11601fe0-72d6-5853-8590-ec2881853e72 by resolving the late authoritative gateway path before declaring authoritative_row_source_unavailable. The fresh representative rerun no longer selects row-source unavailability: canonical evidence selects priority_recovery_partition_progress with one operation_workflow_owner / workflow_progress witness on control_plane_publications-p1.",
    "crossBoundaryReview": "Publication ACK remains closed because the topology handoff probe reports publication_ack_convergence satisfied. Priority recovery is no longer frozen because the fresh canonical evidence selects operation_workflow_owner / workflow_progress again. Timeout budgets and active-gate admission remain closed."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after admin snapshot query pressure reduction",
    "phaseChain": [
      "consume predecessor query-pressure reduction proof",
      "classify forced_repair_path_stall as the current selected owner edge",
      "run review, fix if required, and implementation subagents before runtime edits",
      "promote exact owner files only after subagent proof and focused probes",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress in test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json, owned by operation_workflow_owner / workflow_progress.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied in the topology handoff extractor",
      "all five nodes reached active in the representative rerun",
      "snapshot coverage improved from 0/5 to 2/5 and selectedSnapshotError is unknown",
      "active-gate handoff remains pending on owner_reconcile_pending with two pending reconcile nodes",
      "priority recovery residual extraction reports one operation_workflow_owner / workflow_progress witness on control_plane_publications-p1 with semantic state spread_satisfied_in_flight"
    ],
    "missingCausalEdge": "The forced repair row-source edge is reduced; the selected successor edge is priority_recovery_partition_progress with one event-driven wait witness on control_plane_publications-p1.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --handoff-probe plus a focused replay fixture before runtime edits.",
    "boundedProgressProof": "The predecessor drained the query timeout owner edge, this package resolved the late authoritative gateway path, and the representative rerun moved from forced authoritative_row_source_unavailable with 0/5 coverage to selectedSnapshotError=unknown with 2/5 coverage and a priority recovery workflow-progress first frontier.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
    "expectedObservableTransition": "Successor work should resolve or split the control_plane_publications-p1 priority recovery workflow-progress residual without reopening publication ACK, timeout budgets, or active-gate admission.",
    "maxProgressBound": "one focused startup active-gate forced-repair package slice after required subagent sequencing; no timeout increases, active-gate admission relaxation, publication ACK rewrites, or priority recovery rewrites.",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, preserve the selected source and forced repair row-source evidence instead of widening to frozen edges.",
    "expectedNextFrontier": "priority recovery workflow-progress residual, then active-gate snapshot coverage or representative green",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This is a permitted migration, not an arbitrary reopen: the forced repair row-source edge reduced and fresh canonical extractors selected priority_recovery_partition_progress as the first frontier.",
    "handoffInvariant": "Publication ACK convergence, timeout budgets, and active-gate admission stay closed; priority recovery is reopened only because canonical evidence selected it again."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "operation_workflow_owner",
    "toBoundary": "workflow_progress",
    "reason": "The focused forced-repair row-source fixture passed after resolving the late authoritative gateway. The representative rerun removed authoritative_row_source_unavailable, improved snapshot coverage to 2/5, and canonical extractors selected priority_recovery_partition_progress as first frontier.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --markdown"
    ]
  },
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "active-gate admission would be relaxed",
      "timeout budgets would be increased"
    ]
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md",
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md"
}
-->

## Why

The predecessor proved the active-gate snapshot timeout was not primarily bad
snapshot-source selection or authoritative query-pressure timeout after
bounded timeout propagation. The fresh representative artifact still blocks on
snapshot coverage, but the selected subcause is now forced repair row-source
unavailability for the same selected source.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative scenario remains red after the
  predecessor reduced the selected active-gate snapshot edge to a narrower
  forced repair path stall.
- Escalation trigger to a heavier lane: implementation requires timeout
  increases, active-gate admission relaxation, publication ACK rewrites,
  priority recovery rewrites, or a broader architecture change outside this
  forced repair row-source boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Hegel (019e3183-a7a0-7513-87aa-38fb8ff7d892) reviewed work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e3185-451d-7082-9420-73bfb06bfaca) fixed work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md.
- [x] Implementation subagent recorded: Agent Codex (019e3188-e01f-7a50-b0d8-9361cccc7cb7) implemented work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json
4. src/admin/admin-service-discovery-readiness-methods.js
5. test/admin/admin-service-discovery.test.js
6. work/model-ledger.jsonl

## Out Of Scope

1. publication ACK convergence
2. priority recovery workflow progress
3. representative timeout budgets
4. active-gate admission relaxation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/admin/admin-service-discovery-readiness-methods.js`, `test/admin/admin-service-discovery.test.js`, `work/model-ledger.jsonl`
- Forbidden files: `publication ACK convergence`, `priority recovery workflow progress`, `representative timeout budgets`, `active-gate admission relaxation`
- Frozen decisions: publication ACK convergence and priority recovery workflow progress remain closed; timeout budgets and active-gate admission remain frozen unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, active-gate admission would be relaxed, or timeout budgets would be increased.
- Focused proof: `npm run work:context`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --markdown`
- Model ledger advisory: `escalate`

## Implementation Proof

- Focused replay: `test/admin/admin-service-discovery.test.js` now includes selected source `11601fe0-72d6-5853-8590-ec2881853e72` with an authoritative gateway attached after `AdminServiceDiscovery` construction.
- Red proof before runtime edit: `npm test -- test/admin/admin-service-discovery.test.js` failed at `readAuthoritativeSystemTableRows` with `authoritative_row_source_unavailable`.
- Runtime fix: `src/admin/admin-service-discovery-readiness-methods.js` resolves the authoritative read owner from the direct gateway first, then from the late SQL engine or rebalance-owner gateway path, and only then reports row-source unavailable.
- Result classification: focused `reduced`, representative `migrated` to `operation_workflow_owner / workflow_progress`.
- Frozen edges preserved: publication ACK, timeout budgets, and active-gate admission were not changed; priority recovery was only reopened by fresh canonical evidence and was not edited in this package.
- Representative result: `rolling-restart-after-forced-repair-row-source-20260516.report.json` is red, but forced row-source unavailability is gone, all five nodes are active, snapshot coverage improved to 2/5, and canonical evidence selects priority recovery workflow progress.

## Validation

1. npm run work:context
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --markdown
6. npm test -- test/admin/admin-service-discovery.test.js - red before runtime fix: focused late-owner replay failed with `authoritative_row_source_unavailable`.
7. npm test -- test/admin/admin-service-discovery.test.js - pass after runtime fix.
8. npm test -- test/admin/admin-control-snapshot.test.js - pass.
9. npx eslint src/admin/admin-service-discovery-readiness-methods.js test/admin/admin-service-discovery.test.js --ignore-pattern 'test/.gitkeep' - pass.
10. node scripts/check-guideline-literals.js src/admin/admin-service-discovery-readiness-methods.js - pass, 0 new violations.
11. node scripts/check-guideline-decision-boundaries.js src/admin/admin-service-discovery-readiness-methods.js - pass, 0 violations.
12. npm run audit:runtime-grammar:file -- src/admin/admin-service-discovery-readiness-methods.js - pass, 0 violations.
13. npm run work:validate -- --pre-impl work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md - pass.
14. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --verbose - red; migrated to priority recovery workflow progress after reducing forced repair row-source debt.
15. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json - first frontier `priority_recovery_partition_progress`, owner `operation_workflow_owner`, boundary `workflow_progress`.
16. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json - topology root cause with all nodes active and snapshot coverage 2/5.
17. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --handoff-probe - publication ACK satisfied, active-gate handoff pending owner reconcile.
18. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json - dominant failure class `priority_recovery_event_wait`.
19. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --markdown - one witness in `operation_workflow_owner / workflow_progress`, partition `control_plane_publications-p1`, semantic state `spread_satisfied_in_flight`.
20. npm run work:model-ledger -- record --package work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason migrated-to-operation-workflow-progress --outcome migrated --validation-status focused-green-representative-migrated --correction-loops 1 --review-findings 1 --notes "Forced repair row-source edge reduced: late authoritative gateway fixture passes, representative moved to priority_recovery_partition_progress with one control_plane_publications-p1 spread_satisfied_in_flight residual." - recorded.

## Commit And Push Ledger

1. Focused package commit: 1030e95c
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
