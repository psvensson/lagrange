# Priority Recovery operation_workflow_owner workflow_progress Control Plane Publication Pending

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Activated after work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md closed as reduced. Fresh rolling-restart evidence still has active_gate_snapshot_coverage as the outer red surface, but priority-recovery residual extraction now reports one remaining operation_workflow_owner / workflow_progress witness on control_plane_publications-p1. Focused raw fallback identifies operation 0a3b14cf-b731-4279-a07b-3a755ead1a17 as PENDING, persisted_not_dispatched, dispatch_pending, timeoutReconcileDue=true, target 11601fe0-72d6-5853-8590-ec2881853e72, targetVisibilityState=absent.",
  "nextAction": "Prove or split the remaining control_plane_publications-p1 PENDING persisted_not_dispatched workflow-progress witness without relaxing active-gate admission, rewriting publication handoff truth, or increasing timeouts.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:doctor -- --suggest work/packages/active-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "node - <<'NODE' ... priorityRecoveryDecisionSnapshots witness extraction ... NODE"
  ],
  "writeScope": [
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md",
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/replica-operation-repository-mutation-methods.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
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
    "artifact": "test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Prove or split the single remaining control_plane_publications-p1 dispatch-pending workflow-progress witness."
  },
  "causalGovernance": {
    "hypothesis": "The previous workflow-progress slice reduced stale operation progress to one remaining control_plane_publications-p1 dispatch-pending operation. Active-gate snapshot coverage stays red because publication membership cannot complete while this operation remains PENDING/persisted_not_dispatched on the workflow owner path.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green, the single workflow-progress witness drains, active-gate snapshot coverage or producer publication coverage improves, or fresh evidence splits to a narrower repository, dispatch, or diagnostics owner.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Leaving the single control_plane_publications-p1 workflow witness unresolved keeps active-gate snapshot repair deferred on stale replica operation progress and leaves four active nodes missing from published membership.",
    "crossBoundaryReview": "Do not relax active-gate admission, rewrite publication handoff truth, or increase timeouts. Runtime promotion is limited to the operation workflow owner path selected by focused evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / priority recovery control_plane_publications-p1 workflow_progress residual",
    "phaseChain": [
      "consume workflow-progress reduced proof",
      "prepare subagent sequencing ledger with real review/fix/implementation agents",
      "inspect the single remaining control_plane_publications-p1 PENDING witness",
      "promote exact runtime/test files only after review/fix proof is clean",
      "implement one bounded workflow-progress fix if evidence stays local",
      "prove focused owner tests and static guardrails",
      "rerun representative rolling-restart until green, reduced, migrated, or split"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage remains the outer topology frontier in test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json, while the focused residual is operation_workflow_owner / workflow_progress on control_plane_publications-p1.",
    "knownDownstreamBlockers": [
      "priority-recovery residual extraction reports split required false with one workflow_progress witness",
      "the witness partition is control_plane_publications-p1 with semantic state spread_satisfied_in_flight",
      "raw witness fallback shows operation 0a3b14cf-b731-4279-a07b-3a755ead1a17 is PENDING, persisted_not_dispatched, dispatch_pending, timeoutReconcileDue=true, stepAgeMs=33637, stepTimeoutMs=30000, target 11601fe0-72d6-5853-8590-ec2881853e72, targetVisibilityState=absent",
      "topology convergence handoff probe reports pendingReconcileCount=4 and runtimePromotionAllowed=false",
      "active-gate snapshot observation remains repair_deferred with cache_stale_watermark, discovery_node_coverage_gap, and stale_replica_operations_in_flight"
    ],
    "missingCausalEdge": "The operation workflow owner must advance, dispatch, complete, or split the control_plane_publications-p1 PENDING persisted-not-dispatched operation.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --markdown",
    "boundedProgressProof": "The package must prove bounded workflow-owner dispatch-pending progress for operation 0a3b14cf-b731-4279-a07b-3a755ead1a17, or split to a narrower repository, dispatch, completion, or diagnostics owner with concrete evidence.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json",
    "expectedObservableTransition": "The control_plane_publications-p1 workflow-progress witness drains or reduces, representative rolling-restart becomes green, active-gate snapshot or producer publication coverage improves, or a narrower owner is recorded.",
    "maxProgressBound": "one control_plane_publications-p1 workflow-progress owner package slice; no timeout increases, active-gate admission relaxation, publication handoff rewrites, or bridge simplification implementation",
    "sameFrontierFallback": "If workflow_progress remains, record whether dispatch scheduling, repository mutation, completion persistence, remote wake-up, or diagnostics classification failed before broadening scope.",
    "expectedNextFrontier": "startup active-gate snapshot coverage or publication convergence only after this final workflow-progress witness is green, reduced, migrated, split, or proven non-frontier",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / reduced",
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md / operation_workflow_owner / rebalancer_handoff / reduced",
      "work/packages/done-20260515-startup-active-gate-remaining-publication-visibility-target-proof.md / startup_active_gate_owner / snapshot_coverage / migrated"
    ],
    "oscillationCheck": "This package narrows the same workflow-progress residual from the previous package and does not reopen active-gate admission or publication handoff ownership.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  },
  "predecessor": "work/packages/done-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md"
}
-->

## Why

Fresh representative evidence after the previous workflow-progress slice is
still red, but the residual narrowed to one `control_plane_publications-p1`
operation. This package owns that single dispatch-pending workflow-progress
witness before active-gate or publication-handoff ownership can be reopened.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: canonical residual evidence names one owner
  boundary and one remaining operation witness.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or
  representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Inspect the single remaining workflow-progress witness with canonical
   extractors.
2. Promote exact runtime/test files into `writeScope` only after focused owner
   evidence and review/fix proof are clean.
3. Implement one bounded workflow-progress fix, or split/migrate with concrete
   operation, repository, dispatch, completion, or diagnostics evidence.
4. Rerun focused tests, static guardrails, and representative
   `rolling-restart`.

## Out Of Scope

1. Timeout increases.
2. Active-gate admission relaxation.
3. Publication handoff contract rewrites.
4. Publication-active-gate bridge simplification implementation.
5. Pro or Enterprise behavior.

## Raw Evidence Fallback

Canonical extractors were run first:
`npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json`,
`npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --markdown`,
`npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --handoff-probe`,
and `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json`.

Focused raw JSON extraction was used only after those tools identified the
owner, boundary, semantic state, and witness partition but did not expose the
operation id, source and target nodes, workflow step/status, timeout-due state,
or target visibility needed to select the exact runtime files. The fallback
selected `control_plane_publications-p1` operation
`0a3b14cf-b731-4279-a07b-3a755ead1a17`: `PENDING`,
`persisted_not_dispatched`, `dispatch_pending`,
`timeoutReconcileDue=true`, target node
`11601fe0-72d6-5853-8590-ec2881853e72`, target visibility `absent`.

## Subagent Sequencing Ledger

Required on activation because this is a causal-escalation runtime package.

- [ ] Review subagent recorded: pending-before-implementation-resumes
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review
- [ ] Implementation subagent recorded: pending-before-implementation-resumes

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md`,
  `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`,
  `work/sprints/current-blocker.md`, and `work/sprints/current-blocker.json`.
  Runtime files are promoted only after review/fix proof is clean and focused
  owner evidence selects the exact bounded implementation path.
- Forbidden files: timeout increases, active-gate admission relaxation,
  publication handoff contract rewrites, bridge simplification implementation,
  Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:doctor -- --suggest work/packages/active-20260515-priority-recovery-operation-workflow-owner-control-plane-publication-pending.md
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --markdown
6. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json --handoff-probe
7. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-reentry-20260515-codex.report.json
8. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
