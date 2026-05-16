# Startup Active Gate Snapshot Coverage Owner Reconcile Pending

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "This package preserved nested selected active-gate publication evidence in the handoff contract. Fresh rolling-restart evidence remains red on active_gate_snapshot_coverage, but the owner-reconcile cohort is now the selected three-node set and the selected source 11601fe0-72d6-5853-8590-ec2881853e72 reports repair_deferred/deferred_refresh with discovery_node_coverage_gap.",
  "nextAction": "Open the same-frontier successor focused on deferred_refresh discovery_node_coverage_gap for the selected snapshot source while publication ACK and priority recovery remain frozen.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md",
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/startup-authority-snapshot-owner.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md",
    "test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/startup-authority-snapshot-owner.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md",
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/startup-authority-snapshot-owner.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "priority recovery residuals reappear"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Same-frontier successor should reduce deferred_refresh discovery_node_coverage_gap on selected source 11601fe0-72d6-5853-8590-ec2881853e72 with priority recovery still satisfied."
  },
  "causalGovernance": {
    "hypothesis": "The current representative edge is startup active-gate snapshot coverage. Priority recovery is satisfied, publication ACK is satisfied, and the selected remaining blocker is owner_reconcile_pending with snapshot coverage stuck at 2/5.",
    "stopConditionCheck": "Run the required subagent sequence, npm run analyze:causal-model on fresh evidence, explain active_gate_snapshot_coverage, focused startup active-gate owner tests, static guardrails for touched runtime files, and one representative rolling-restart rerun after implementation.",
    "expectedCausalModelChange": "Focused proof revealed the selected owner-reconcile cohort and kept the representative on the same frontier; the next package should reduce deferred_refresh discovery_node_coverage_gap.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Priority recovery has zero witnesses and remains satisfied. Canonical handoff probe keeps publication ACK satisfied. Active gate snapshot coverage is 2/5, selected source is 11601fe0-72d6-5853-8590-ec2881853e72, selected snapshot repair is deferred_refresh/retry, pending reconcile count is 3, and reason codes include cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight.",
    "crossBoundaryReview": "Publication ACK and priority recovery stay frozen unless canonical evidence selects them again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after priority workflow-progress repeat fix",
    "phaseChain": [
      "consume priority recovery repeat migration proof",
      "classify active_gate_snapshot_coverage as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "reduce or split owner_reconcile_pending snapshot coverage",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "priority_recovery_partition_progress is satisfied with zero residual witnesses",
      "publication_ack_convergence is satisfied with pendingAckCount=0",
      "active_gate_snapshot_coverage is blocked with snapshotCoverageNodeCount=2 and expectedNodeCount=5",
      "owner_reconcile_pending targets nodes 11601fe0-72d6-5853-8590-ec2881853e72, 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, and ebc4aa0b-06c6-506d-93ea-1dd2deca3f58",
      "selected snapshot observation is repair_deferred/deferred_refresh with cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight"
    ],
    "missingCausalEdge": "Prove why deferred_refresh discovery_node_coverage_gap remains after the selected owner-reconcile cohort is preserved in the active-gate handoff contract.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The predecessor proved the dispatch-pending priority recovery drain path, reduced priority recovery to zero witnesses, and canonical evidence selected active-gate snapshot coverage again.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json",
    "expectedObservableTransition": "The package changed pendingReconcileCount from 1 to the selected three-node cohort and converted the selected snapshot action from wait/stale_usable to retry/deferred_refresh.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "Open a same-frontier successor focused on deferred_refresh discovery_node_coverage_gap for selected source 11601fe0-72d6-5853-8590-ec2881853e72.",
    "expectedNextFrontier": "representative green, reduced deferred_refresh discovery_node_coverage_gap residual, readiness_startup_support, or another canonical frontier after snapshot coverage improves",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This active-gate package is allowed because the immediately preceding priority recovery package produced fresh representative evidence selecting active_gate_snapshot_coverage again.",
    "handoffInvariant": "Priority recovery and publication ACK remain closed unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md",
  "closed": "2026-05-16",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260516-startup-active-gate-snapshot-coverage-deferred-refresh-discovery-gap.md"
}
-->

## Why

Fresh rolling-restart evidence after the priority recovery repeat fix selects
`active_gate_snapshot_coverage` as the first frontier. This package owns the
focused `startup_active_gate_owner / snapshot_coverage` residual with
`owner_reconcile_pending` and snapshot coverage stuck at 2/5.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative first frontier migrated from
  priority recovery back to startup active-gate snapshot coverage, so this
  package must prove the current owner-reconcile edge before runtime edits.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  listed startup active-gate files, priority recovery reopens, or
  representative evidence contradicts the selected owner boundary.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e324f-9b92-7152-ba50-59b1a261190d) reviewed work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Newton (019e3252-8bf5-7613-9320-308aa5ed70e9) implemented work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md
2. work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. src/control-plane/publication-active-gate-handoff-contract.js
7. src/control-plane/startup-authority-snapshot-owner.js
8. src/control-plane/control-plane-readiness-service-segment-4-stage-5.js

## Out Of Scope

1. publication-ack-convergence
2. priority_recovery_partition_progress
3. operation_workflow_owner

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md`, `work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/startup-authority-snapshot-owner.js`, `src/control-plane/control-plane-readiness-service-segment-4-stage-5.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`
- Forbidden files: `publication-ack-convergence`, `priority_recovery_partition_progress`, `operation_workflow_owner`
- Frozen decisions: publication ACK and priority recovery remain closed unless
  canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime
  ownership changes, representative scenario evidence changes, or priority
  recovery residuals reappear.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json`
2. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --explain active_gate_snapshot_coverage`
3. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json`
4. PASS - `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
5. PASS - `node test/control-plane/publication-active-gate-handoff-contract.test.js`
6. PASS - `node test/admin/admin-control-snapshot.test.js`
7. PASS - `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/startup-authority-snapshot-owner.js src/control-plane/control-plane-readiness-service-segment-4-stage-5.js test/control-plane/publication-active-gate-handoff-contract.test.js`
8. PASS - `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/startup-authority-snapshot-owner.js src/control-plane/control-plane-readiness-service-segment-4-stage-5.js test/control-plane/publication-active-gate-handoff-contract.test.js`
9. PASS - `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/startup-authority-snapshot-owner.js src/control-plane/control-plane-readiness-service-segment-4-stage-5.js`
10. PASS - `npx eslint src/control-plane/publication-active-gate-handoff-contract.js test/control-plane/publication-active-gate-handoff-contract.test.js --ignore-pattern 'test/.gitkeep'`
11. PASS - `npm run work:validate -- --entry work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md`
12. PASS - `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json` (red same-frontier)
13. PASS - `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json`
14. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --handoff-probe`
15. PASS - `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json`
16. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --explain active_gate_snapshot_coverage`
17. PASS - `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json --markdown`
18. PASS - `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-owner-reconcile-selected-evidence-20260516T195857Z.report.json`
19. PASS - `npm run work:model-ledger -- record --package work/packages/done-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md --model gpt-5-codex --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason same-frontier-deferred-refresh-discovery-gap --outcome same-frontier --validation-status focused-green-representative-same-frontier --correction-loops 1 --review-findings 0 --notes "Preserved nested active-gate selected publication evidence; representative rerun stayed on active_gate_snapshot_coverage with pendingReconcileCount=3 and deferred_refresh discovery_node_coverage_gap."`

## Implementation Result

The publication active-gate handoff contract now collects nested active-gate
publication evidence (`activeGateProgress`, `activeGateBestProgress`, and
`activeGate.progress`) when deriving expected and missing publication cohorts.
The selected snapshot's `selectedMissingPublishedNodeIds` therefore remains in
the owner-owned reconcile target instead of being narrowed to the single
top-level pending node. The focused probe with the representative
`selectedMissingPublishedNodeIds` shape now produces `expectedNodeCount=5`.
The representative rerun stayed on the same frontier, with
`pendingReconcileCount=3`, selected source
`11601fe0-72d6-5853-8590-ec2881853e72`, and a narrower
`deferred_refresh` / `discovery_node_coverage_gap` residual while active-gate
admission remains strict.
