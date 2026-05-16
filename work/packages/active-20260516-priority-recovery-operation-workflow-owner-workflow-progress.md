# Priority Recovery Operation Workflow Owner Workflow Progress

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The forced-repair row-source package reduced the selected active-gate snapshot edge. The fresh representative rolling-restart artifact is still red, but canonical evidence now selects priority_recovery_partition_progress under operation_workflow_owner / workflow_progress with one residual witness on control_plane_publications-p1 in semantic state spread_satisfied_in_flight. Publication ACK is satisfied in the topology handoff extractor, timeout budgets and active-gate admission remain frozen, and priority recovery is reopened only because canonical evidence selected it again.",
  "nextAction": "Run the required review/fix/implementation subagent sequence, then prove or split the control_plane_publications-p1 spread_satisfied_in_flight workflow-progress residual without touching publication ACK, timeout budgets, or active-gate admission.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md",
    "test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/replica-operation-liveness.js",
    "src/workflow/durable-workflow-coordinator.js",
    "src/workflow/owner-key-reconcile-queue.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Prove or split the single control_plane_publications-p1 workflow-progress residual before another representative rerun."
  },
  "causalGovernance": {
    "hypothesis": "The current rolling-restart red edge is no longer forced active-gate repair row-source unavailability; it is a priority recovery workflow-progress residual where control_plane_publications-p1 remains in spread_satisfied_in_flight and waits for event-driven operation advancement.",
    "stopConditionCheck": "Run npm run analyze:causal-model on fresh evidence, canonical priority residual extraction, owner-file analysis, focused workflow owner tests, and one representative rerun after the runtime owner proof.",
    "expectedCausalModelChange": "Focused proof either advances the existing operation and makes rolling-restart green, reduces priority_recovery_partition_progress to a narrower workflow owner subedge, or migrates back to active-gate snapshot coverage after priority recovery drains.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh evidence reports one operation_workflow_owner / workflow_progress witness on control_plane_publications-p1 with semantic state spread_satisfied_in_flight. The previous forced row-source edge is reduced, publication ACK is satisfied in topology convergence, and timeout budgets plus active-gate admission remain frozen.",
    "crossBoundaryReview": "Do not reopen publication ACK, timeout budgets, or active-gate admission. Priority recovery is eligible only because canonical evidence selected it again; active-gate snapshot coverage remains downstream until this residual is resolved or split."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after forced repair row-source reduction",
    "phaseChain": [
      "consume forced repair row-source migration proof",
      "classify priority_recovery_partition_progress as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "promote exact workflow owner files only after subagent proof and focused probes",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress in test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json, owned by operation_workflow_owner / workflow_progress.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied in the topology handoff extractor",
      "active_gate_snapshot_coverage remains blocked downstream with owner_reconcile_pending and snapshot_repair_deferred",
      "readiness support remains inherited from active-gate no progress",
      "priority recovery residual extraction reports one control_plane_publications-p1 witness in spread_satisfied_in_flight"
    ],
    "missingCausalEdge": "Operation workflow owner must advance or explain the control_plane_publications-p1 spread_satisfied_in_flight priority recovery witness.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --markdown plus focused workflow owner tests selected by analyze:owner-files.",
    "boundedProgressProof": "Fresh canonical evidence moved the release gate from forced active-gate repair row-source unavailability to one priority recovery workflow-progress witness. No timeout increase, publication ACK rewrite, or active-gate admission relaxation is allowed.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json",
    "expectedObservableTransition": "Focused proof should drain control_plane_publications-p1 from spread_satisfied_in_flight, reduce to a narrower operation workflow subedge, migrate back to active-gate coverage, or make rolling-restart green.",
    "maxProgressBound": "one focused operation_workflow_owner / workflow_progress package slice after required subagent sequencing",
    "sameFrontierFallback": "If priority_recovery_partition_progress remains first frontier, preserve the control_plane_publications-p1 witness and split by exact workflow owner cause instead of reopening closed ACK or timeout edges.",
    "expectedNextFrontier": "representative green, reduced workflow-progress residual, or active-gate snapshot coverage after priority recovery drains",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md / operation_workflow_owner / workflow_progress / migrated"
    ],
    "oscillationCheck": "This priority recovery package is allowed because fresh canonical evidence selected priority_recovery_partition_progress after the forced repair row-source edge reduced. It is not a broad representative rerun or speculative reopen.",
    "handoffInvariant": "Publication ACK convergence, timeout budgets, and active-gate admission stay closed unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-forced-repair-row-source-unavailable.md"
}
-->

## Why

The fresh representative `rolling-restart` artifact moved off the forced
active-gate repair row-source edge and now selects one priority recovery
workflow-progress witness. This package owns that exact
`control_plane_publications-p1` residual and must not broaden into publication
ACK, timeout budgets, or active-gate admission.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: adjacent owner-boundary fixes have not closed the
  representative gate, and canonical evidence migrated the first frontier back
  to operation workflow progress after a focused active-gate reduction.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  selected workflow-progress residual, a frozen edge must be reopened, or the
  residual requires an architecture change instead of bounded owner progress.

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

1. work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json

## Out Of Scope

1. publication-ack-convergence
2. representative-timeout-budget
3. active-gate-admission-relaxation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Forbidden files: `publication-ack-convergence`, `representative-timeout-budget`, `active-gate-admission-relaxation`
- Frozen decisions: publication ACK, timeout budgets, and active-gate admission stay closed unless canonical evidence selects them again; priority recovery is open only for the selected workflow-progress residual.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --markdown
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-forced-repair-row-source-20260516.report.json
