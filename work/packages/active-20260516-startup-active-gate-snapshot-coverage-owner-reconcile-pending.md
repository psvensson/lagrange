# Startup Active Gate Snapshot Coverage Owner Reconcile Pending

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The predecessor priority recovery repeat package drained workflow-progress witnesses to zero. Fresh rolling-restart evidence now selects active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage. The active gate timed out with snapshotCoverageNodeCount=2/5, selected snapshot observation repair_deferred/stale_usable, and owner_reconcile_pending for node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7.",
  "nextAction": "Reduce or split owner_reconcile_pending snapshot coverage after priority recovery is satisfied.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md",
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/startup-authority-snapshot-owner.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js"
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
    "work/packages/active-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md",
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/startup-authority-snapshot-owner.js",
    "src/control-plane/control-plane-readiness-service-segment-4-stage-5.js"
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
    "artifact": "test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Reduce or split owner_reconcile_pending snapshot coverage with priority recovery still satisfied."
  },
  "causalGovernance": {
    "hypothesis": "The current representative edge is startup active-gate snapshot coverage. Priority recovery is satisfied, publication ACK is satisfied, and the selected remaining blocker is owner_reconcile_pending with snapshot coverage stuck at 2/5.",
    "stopConditionCheck": "Run the required subagent sequence, npm run analyze:causal-model on fresh evidence, explain active_gate_snapshot_coverage, focused startup active-gate owner tests, static guardrails for touched runtime files, and one representative rolling-restart rerun after implementation.",
    "expectedCausalModelChange": "Focused proof should reduce or split owner_reconcile_pending snapshot coverage, then either make rolling-restart green or migrate to the next canonical frontier.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Priority recovery has zero witnesses and remains satisfied. Publication ACK has pendingAckCount=0. Active gate snapshot coverage is 2/5 and selected snapshot repair is deferred because of cache_stale_watermark and stale_replica_operations_in_flight.",
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
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "priority_recovery_partition_progress is satisfied with zero residual witnesses",
      "publication_ack_convergence is satisfied with pendingAckCount=0",
      "active_gate_snapshot_coverage is blocked with snapshotCoverageNodeCount=2 and expectedNodeCount=5",
      "owner_reconcile_pending targets node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
      "selected snapshot observation is repair_deferred/stale_usable with cache_stale_watermark and stale_replica_operations_in_flight"
    ],
    "missingCausalEdge": "Prove whether owner_reconcile_pending should advance the active-gate publication handoff for the remaining node or split by a narrower snapshot coverage cause.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "The predecessor proved the dispatch-pending priority recovery drain path, reduced priority recovery to zero witnesses, and canonical evidence selected active-gate snapshot coverage again.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-priority-workflow-progress-20260516T180829Z.report.json",
    "expectedObservableTransition": "Focused proof should reduce owner_reconcile_pending snapshot coverage or migrate to the next canonical edge without reopening priority recovery.",
    "maxProgressBound": "one focused startup_active_gate_owner / snapshot_coverage package slice after required subagent sequencing",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, preserve owner_reconcile_pending and split by exact snapshot coverage cause.",
    "expectedNextFrontier": "representative green, reduced active-gate snapshot coverage residual, readiness_startup_support, or another canonical frontier after snapshot coverage improves",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This active-gate package is allowed because the immediately preceding priority recovery package produced fresh representative evidence selecting active_gate_snapshot_coverage again.",
    "handoffInvariant": "Priority recovery and publication ACK remain closed unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md"
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

- [ ] Review subagent recorded: pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
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

1. work/packages/active-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md
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
- Owned files: `work/packages/active-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md`, `work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress-repeat.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/startup-authority-snapshot-owner.js`, `src/control-plane/control-plane-readiness-service-segment-4-stage-5.js`
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
5. Pending - `npm run work:validate -- --entry work/packages/active-20260516-startup-active-gate-snapshot-coverage-owner-reconcile-pending.md`
