# Priority Recovery Workflow Progress After Active Gate Cohort

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The focused workflow-progress implementation now drains the package-owned priority recovery residual: the latest representative rerun reports zero priority recovery residual witnesses and canonical causal evidence marks priority_recovery_partition_progress satisfied. The scenario remains red, but the first frontier migrated to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage because the selected admin snapshot query timed out and snapshot coverage stayed 0/5.",
  "nextAction": "Commit and push this focused operation_workflow_owner package slice, then open a successor package for startup_active_gate_owner / snapshot_coverage using test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json.",
  "proof": [
    "npm run work:context",
    "npm run work:package:doctor -- --suggest work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md",
    "npm run work:validate -- --entry work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "npm run work:subagent-prompt -- --role review --package work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md",
    "npm run work:subagent-prompt -- --role fix --package work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md",
    "npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md"
  ],
  "writeScope": [
    "work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md",
    "test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/priority-recovery-diagnostics-constants.js",
    "src/control-plane/priority-recovery-snapshot-stage-1.js",
    "src/control-plane/priority-recovery-snapshot-stage-2.js",
    "src/control-plane/priority-recovery-snapshot-stage-3.js",
    "src/control-plane/priority-recovery-snapshot-stage-4.js",
    "src/control-plane/priority-recovery-snapshot-stage-5.js",
    "src/control-plane/priority-recovery-snapshot-stage-6.js",
    "src/control-plane/priority-recovery-snapshot-stage-7.js",
    "src/control-plane/priority-recovery-snapshot-stage-8.js",
    "src/control-plane/priority-recovery-snapshot-stage-9.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "src/control-plane/priority-recovery-snapshot-stage-11.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-1.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-2.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-3.js",
    "src/control-plane/priority-recovery-observation-snapshot-stage-4.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "src/workflow/durable-workflow-coordinator.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-stale-planning-visibility.test.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/control-plane/priority-recovery-tracked-summary-selection.test.js",
    "test/scripts/priority-recovery-current-artifact-fixture.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/tracks/topology-convergence.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime ownership changes",
      "representative scenario evidence changes",
      "active-gate admission would be relaxed",
      "timeout budgets would be increased"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Prove or split the four-witness workflow-progress residual while preserving the satisfied publication and active-gate edges."
  },
  "causalGovernance": {
    "hypothesis": "The remaining red gate is caused by priority recovery workflow progress backpressure after publication and active-gate snapshot coverage have converged.",
    "stopConditionCheck": "Run npm run analyze:causal-model and npm run analyze:priority-recovery-residuals on the latest artifact, then run required subagents before promoting exact runtime files.",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, reduces or drains workflow-progress witnesses, splits to rebalancer_handoff or rebalancer_leader operation_scheduling, or migrates to a narrower owner boundary selected by canonical extractors.",
    "representativeOutcome": "migrated",
    "causalDebt": "The package-owned workflow-progress residual is drained in test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json: priority recovery residual extraction reports zero witnesses and causal evidence marks priority_recovery_partition_progress satisfied. The remaining red gate is active_gate_snapshot_coverage because the selected admin snapshot query timed out and snapshot coverage stayed 0/5.",
    "crossBoundaryReview": "The predecessor package closed startup_active_gate_owner / snapshot_coverage as migrated. The latest representative evidence selects active_gate_snapshot_coverage again only after priority recovery drained; successor work may reopen that owner boundary without reopening publication ACK convergence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after active-gate owner cohort recovery closure",
    "phaseChain": [
      "consume active-gate owner cohort migration proof",
      "classify priority_recovery_partition_progress as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "promote exact owner files only after subagent proof and focused probes",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress in test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json, owned by operation_workflow_owner / workflow_progress.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied with publicationStatus=PUBLISHED and pendingAckCount=0",
      "active_gate_snapshot_coverage is satisfied with snapshotCoverageNodeCount=5 and expectedNodeCount=5",
      "prioritySpreadPending=true and prioritySpreadGap=5",
      "priority recovery residual extraction reports seven witnesses and split required",
      "first residual group is operation_workflow_owner / workflow_progress with four witnesses",
      "secondary residual groups are operation_workflow_owner / rebalancer_handoff and rebalancer_leader / operation_scheduling"
    ],
    "missingCausalEdge": "The workflow owner is not producing enough priority recovery progress for eligible partitions after publication and coverage have converged.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --markdown",
    "boundedProgressProof": "The canonical residual extractor names concrete partitions and owner-boundary groups, and the causal model classifies the first critical path as retryable priority_recovery_event_driven_wait requiring workflow dispatch, delivery, or advance progress.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json",
    "expectedObservableTransition": "The next representative rerun should drain or reduce workflow-progress witnesses, split to rebalancer_handoff or operation_scheduling with concrete evidence, or go green.",
    "maxProgressBound": "one focused operation workflow owner package slice after required subagent sequencing; no timeout increases, active-gate admission relaxation, or publication ACK rewrites.",
    "sameFrontierFallback": "If priority_recovery_partition_progress remains first frontier, preserve concrete witness partitions and split by canonical residual owner-boundary group instead of widening scope.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage selected by the latest representative rerun",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-topology-publication-count-only-ack-closure.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260516-topology-publication-convergence-frontier-causal-edge.md / topology_publication_owner / publication_convergence / classification-only"
    ],
    "oscillationCheck": "This package is allowed because the immediately preceding active-gate owner package satisfied active_gate_snapshot_coverage and canonical evidence selected operation_workflow_owner / workflow_progress as the new first frontier.",
    "handoffInvariant": "Publication ACK convergence stays closed unless canonical evidence selects it again. Active-gate snapshot coverage may reopen in a successor only because the latest canonical evidence selected it after priority recovery drained."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md"
}
-->

## Why

The active-gate package moved the representative red gate out of publication
and snapshot coverage. The current first frontier is priority recovery workflow
progress: publication and active-gate coverage are converged, but priority
spread is still pending with concrete workflow-progress residual witnesses.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative scenario is red on a runtime
  workflow-progress owner boundary after a canonical owner migration.
- Escalation trigger to a heavier lane: canonical evidence promotes a different
  owner, implementation requires timeout increases or active-gate admission
  relaxation, or the runtime write scope expands beyond this package.

## Subagent Sequencing Requirement

Required before implementation because this is a scenario-driven runtime
owner-boundary package.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e3136-a952-7313-97db-0c6c6d8b9a4b) reviewed work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md; result clean.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Codex (019e313a-1498-7fc1-8db2-c042dd05cf74) implemented work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Work package, sprint, track, current-blocker, and model ledger handoff files.
2. Candidate runtime files only after required subagent proof promotes exact
   write ownership.

## Out Of Scope

1. Representative timeout budget changes
2. Active-gate admission relaxation
3. Publication ACK convergence rewrites unless canonical evidence selects it
   again
4. Startup active-gate snapshot coverage rewrites unless canonical evidence
   selects it again

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md`, `src/control-plane/priority-recovery-snapshot-stage-10.js`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/tracks/topology-convergence.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `representative-timeout-budget`, `active-gate-admission-relaxation`
- Frozen decisions: publication ACK convergence and active-gate snapshot coverage remain closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, active-gate admission would be relaxed, or timeout budgets would be increased.
- Focused proof: `npm run work:context`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`, required subagent sequencing, focused owner tests, static guardrails, and representative rerun after implementation.
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:package:doctor -- --suggest work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md
3. npm run work:validate -- --entry work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json
5. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --handoff-probe
6. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json
7. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-active-gate-owner-cohort-recovery-closure-20260516.report.json --markdown
8. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
9. npm run work:subagent-prompt -- --role review --package work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md
10. npm run work:subagent-prompt -- --role fix --package work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md
11. npm run work:subagent-prompt -- --role implementation --package work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md
12. npm test -- test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js
13. npm test -- test/control-plane/priority-recovery-snapshot.test.js
14. npm test -- test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
15. npx eslint src/control-plane/priority-recovery-snapshot-stage-10.js --ignore-pattern 'test/.gitkeep'
16. node scripts/check-guideline-literals.js src/control-plane/priority-recovery-snapshot-stage-10.js
17. node scripts/check-guideline-decision-boundaries.js src/control-plane/priority-recovery-snapshot-stage-10.js
18. npm run audit:runtime-grammar:file -- src/control-plane/priority-recovery-snapshot-stage-10.js
19. npm run work:validate -- --pre-impl work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md
20. git diff --check -- src/control-plane/priority-recovery-snapshot-stage-10.js work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md
21. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --verbose
22. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json
23. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json
24. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --handoff-probe
25. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json
26. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json --markdown
27. npm run work:model-ledger -- record --package work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md --model gpt-5 --reasoning-effort high --output-profile medium --task-class causal-escalation --package-class representative-frontier-closure --intended-minimum-model gpt-5.3-codex --scope-shape owner-boundary-contraction/current-frontier --escalated true --bailout-reason none --outcome migrated --validation-status passed --correction-loops 1 --review-findings 0 --notes "Priority workflow residual drained; representative rerun migrated to startup_active_gate_owner snapshot_coverage after zero priority recovery witnesses."

## Implementation Result

The direct priority recovery decision snapshot now keeps the general
`coordination_mismatch` exclusion for out-of-cohort in-flight work, but uses an
explicit diagnostic-owner decision table to allow `PENDING` dispatch witnesses
to attach operation-owner observation. That preserves the existing SENDING
classification while letting persisted-but-not-dispatched operation witnesses
normalize to the workflow-progress recovery path.

## Migration Result

- From: `operation_workflow_owner / workflow_progress`
- To: `startup_active_gate_owner / snapshot_coverage`
- Reason: representative rerun
  `test-output/reports/rolling-restart-after-workflow-progress-pending-coordination-gate-20260516.report.json`
  reports zero priority recovery residual witnesses and canonical causal
  evidence marks `priority_recovery_partition_progress` satisfied. The scenario
  remains red because `active_gate_snapshot_coverage` is blocked with
  `active_gate_timed_out`, snapshot coverage `0/5`, and selected admin snapshot
  query timeout evidence.
- Successor should start from the active-gate snapshot coverage handoff probe:
  `startup_active_gate_owner / snapshot_coverage` with dominant reason
  `active_gate_timed_out`, without reopening publication ACK convergence.
