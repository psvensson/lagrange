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
  "currentState": "The active-gate owner cohort package cleared the prior consumer frontier: publication is PUBLISHED, pendingAckCount=0, missingPublished=0, published membership is 5/5, and snapshot coverage is 5/5 in the latest representative artifact. Canonical evidence now selects priority_recovery_partition_progress as the first frontier under operation_workflow_owner / workflow_progress with dominant reason priority_recovery_event_driven_wait. Priority residual extraction reports seven witnesses and split required; the first owner-boundary group has four workflow-progress witnesses across replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1 with semantic states coordination_mismatch and needs_operation.",
  "nextAction": "Prove or split the priority recovery workflow-progress residual without timeout increases or active-gate admission relaxation.",
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
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Priority residual extraction reports four operation_workflow_owner / workflow_progress witnesses across replica_operations-p1, sql_transaction_participants-p1, sql_transactions-p1, and sql_write_operations-p1 while active-gate snapshot coverage is satisfied.",
    "crossBoundaryReview": "The predecessor package closed startup_active_gate_owner / snapshot_coverage as migrated. This package must not reopen publication ACK or active-gate admission unless canonical evidence selects those edges again."
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
    "expectedNextFrontier": "representative green, reduced workflow-progress residual, or a narrower priority recovery owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-topology-publication-count-only-ack-closure.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260516-topology-publication-convergence-frontier-causal-edge.md / topology_publication_owner / publication_convergence / classification-only"
    ],
    "oscillationCheck": "This package is allowed because the immediately preceding active-gate owner package satisfied active_gate_snapshot_coverage and canonical evidence selected operation_workflow_owner / workflow_progress as the new first frontier.",
    "handoffInvariant": "Publication ACK convergence and active-gate snapshot coverage stay closed unless canonical evidence selects them again; this package must prove or split priority recovery workflow progress only."
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

- [ ] Review subagent recorded:
- [ ] Fix subagent recorded or explicitly not needed:
- [ ] Implementation subagent recorded:

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
- Owned files: `work/packages/active-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/tracks/topology-convergence.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
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
