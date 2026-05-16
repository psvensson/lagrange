# Startup Active Gate Forced Repair Row Source Unavailable

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "The predecessor package reduced the selected active-gate snapshot edge: publication ACK is satisfied, priority recovery residual extraction reports zero witnesses, selected source remains 11601fe0-72d6-5853-8590-ec2881853e72, selected snapshot-source timeout is no longer selected, authoritative control snapshot query timeout is no longer selected, and the fresh handoff probe selects activeGateSnapshotOwnerEdge=forced_repair_path_stall because forced authoritative repair reports authoritative_row_source_unavailable.",
  "nextAction": "Use the fresh handoff probe from rolling-restart-after-admin-snapshot-query-pressure-20260516 to build a replayable forced-repair row-source unavailable fixture for selected source 11601fe0-72d6-5853-8590-ec2881853e72, then prove or fix the forced repair path stall without reopening publication ACK, priority recovery, timeout budgets, or active-gate admission.",
  "proof": [
    "npm run work:context",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-startup-active-gate-forced-repair-row-source-unavailable.md"
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
    "work/packages/active-20260516-startup-active-gate-forced-repair-row-source-unavailable.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Build the forced-repair row-source unavailable fixture for selected source 11601fe0-72d6-5853-8590-ec2881853e72 and prove whether the forced repair path stalls before runtime edits."
  },
  "causalGovernance": {
    "hypothesis": "The remaining red gate is caused by forced authoritative repair being unable to obtain a row source for selected active-gate snapshot coverage after query-pressure timeout propagation reduced the prior edge.",
    "stopConditionCheck": "Run npm run analyze:causal-model and npm run analyze:topology-convergence on the fresh artifact, then run required subagents before promoting exact runtime files.",
    "expectedCausalModelChange": "Focused proof either makes rolling-restart green, obtains snapshot coverage, keeps the same frontier with a narrower forced repair row-source edge, or migrates to startup readiness support after coverage improves.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh canonical evidence selects active_gate_snapshot_coverage with forced_repair_path_stall on selected source 11601fe0-72d6-5853-8590-ec2881853e72. Publication ACK is satisfied, priority recovery residual extraction has zero witnesses, and the frozen timeout-budget and active-gate admission edges are not selected.",
    "crossBoundaryReview": "Publication ACK convergence, priority recovery workflow progress, timeout budgets, and active-gate admission remain closed unless canonical evidence selects them again. This package owns only startup active-gate forced repair row-source evidence."
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
    "currentFirstFrontier": "active_gate_snapshot_coverage in test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied and pendingAckCount=0",
      "priority recovery residual extraction reports zero witnesses",
      "activeGateState=timed_out, activeNodeCount=4, expectedNodeCount=5, snapshotCoverageNodeCount=0",
      "selectedSnapshotError reports forced authoritative repair row-source unavailability for 11601fe0-72d6-5853-8590-ec2881853e72",
      "readiness support remains inherited from active-gate no progress"
    ],
    "missingCausalEdge": "Forced repair path stall: selected source 11601fe0-72d6-5853-8590-ec2881853e72 reaches the snapshot lane but forced authoritative repair reports authoritative_row_source_unavailable.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --handoff-probe plus a focused replay fixture before runtime edits.",
    "boundedProgressProof": "The predecessor drained the query timeout owner edge through bounded timeout propagation and the fresh probe now selects forced repair path stall as the concrete progress mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json",
    "expectedObservableTransition": "Focused proof should show why forced authoritative repair has no row source, then either obtain snapshot coverage, expose a narrower repair/read-source owner edge, migrate to startup readiness support after coverage improves, or go green.",
    "maxProgressBound": "one focused startup active-gate forced-repair package slice after required subagent sequencing; no timeout increases, active-gate admission relaxation, publication ACK rewrites, or priority recovery rewrites.",
    "sameFrontierFallback": "If active_gate_snapshot_coverage remains first frontier, preserve the selected source and forced repair row-source evidence instead of widening to frozen edges.",
    "expectedNextFrontier": "representative green, reduced forced repair row-source debt, or a narrower startup active-gate owner boundary",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md / startup_active_gate_owner / snapshot_coverage / reduced",
      "work/packages/done-20260516-priority-recovery-workflow-progress-after-active-gate-cohort.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-owner-cohort-recovery-closure.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package is allowed because the immediate predecessor reduced the selected subcause from authoritative query pressure to forced repair row-source unavailability without reopening closed publication ACK or priority recovery edges.",
    "handoffInvariant": "Publication ACK convergence, priority recovery workflow progress, timeout budgets, and active-gate admission stay closed unless canonical evidence selects them again."
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
  "predecessor": "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md"
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

1. work/packages/active-20260516-startup-active-gate-forced-repair-row-source-unavailable.md
2. work/sprints/current-blocker.md
3. work/sprints/current-blocker.json

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
- Owned files: `work/packages/active-20260516-startup-active-gate-forced-repair-row-source-unavailable.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Forbidden files: `publication ACK convergence`, `priority recovery workflow progress`, `representative timeout budgets`, `active-gate admission relaxation`
- Frozen decisions: publication ACK convergence and priority recovery workflow progress remain closed; timeout budgets and active-gate admission remain frozen unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, active-gate admission would be relaxed, or timeout budgets would be increased.
- Focused proof: `npm run work:context`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-snapshot-query-pressure-20260516.report.json --markdown
