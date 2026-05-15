# Priority Recovery operation_workflow_owner rebalancer_handoff Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Fresh rolling-restart evidence after the active-gate owner reconcile slice reports a split priority-recovery residual. The first split group is operation_workflow_owner / rebalancer_handoff with three recovering_in_flight witnesses across control_plane_publications-p1 and sql_transaction_participants-p1. Raw fallback after canonical extractors showed the control-plane publication replica CREATE_REPLICA wake reaches the handler, but duplicate create handling reports service status creating while the replica state machine times out in pending.",
  "nextAction": "Prove or split the rebalancer_handoff residual by focusing the replica lifecycle idempotency/progress path for recovering_in_flight control-plane publication and transaction participant replicas.",
  "proof": [
    "npm run work:context",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/node/replica-handler-class-part-1.js",
    "src/node/replica-handler-runtime-methods.js",
    "src/node/replica-state-machine.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md",
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
    "artifact": "test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_progress_blocked",
    "nextAction": "Prove or split recovering_in_flight rebalancer handoff witnesses before starting workflow_progress."
  },
  "causalGovernance": {
    "hypothesis": "The remaining active-gate snapshot timeout is blocked by operation workflow recovery handoff progress: recovering_in_flight replicas receive remote handoff wake-ups but do not advance their replica lifecycle out of pending/creating quickly enough to clear priority recovery.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "expectedCausalModelChange": "rolling-restart becomes representative-green, the residual reduces to operation_workflow_owner / workflow_progress only, or this package splits to a narrower replica lifecycle owner with concrete operation and handler evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The predecessor moved stale operation dispatch out of the active-gate owner path. This package owns the remaining handoff/progress gap for recovering_in_flight replicas so active-gate coverage is not forced to wait on an opaque lifecycle stall.",
    "crossBoundaryReview": "Do not reopen publication handoff truth, owner-key membership reconcile, or active-gate admission. The only runtime candidates are operation workflow handoff and replica lifecycle progress for the recovered replicas named by canonical residual evidence."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / priority recovery operation workflow rebalancer handoff residual",
    "phaseChain": [
      "freeze predecessor migration evidence",
      "prepare subagent sequencing ledger under environment-policy constraints",
      "inspect rebalancer handoff owner files and replica lifecycle idempotency path",
      "implement one bounded handoff or lifecycle progress fix if evidence stays local",
      "prove focused owner tests and static guardrails",
      "rerun representative rolling-restart until green, reduced, or split"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress split residual under operation_workflow_owner / rebalancer_handoff and operation_workflow_owner / workflow_progress in test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / rebalancer_handoff has three recovering_in_flight witnesses",
      "control_plane_publications-p1 direct wake-up reaches CREATE_REPLICA handling but lifecycle remains pending/creating until timeout",
      "operation_workflow_owner / workflow_progress has paired spread_satisfied_in_flight witnesses and remains parked behind this first split package",
      "active-gate admission must remain strict while publication handoff remains partial"
    ],
    "missingCausalEdge": "Recovered replica handoff must either advance duplicate CREATE_REPLICA lifecycle progress or classify a narrower replica lifecycle state-machine blocker.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown",
    "boundedProgressProof": "The package must prove bounded handoff progress through wake, retry, dispatch, timeout, or lifecycle advance evidence for recovering_in_flight replicas, or split to the narrower lifecycle owner with a concrete operation id and handler state.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json",
    "expectedObservableTransition": "Recovering_in_flight handoff witnesses drain, rerun evidence reduces to workflow_progress only, representative rolling-restart becomes green, or a narrower lifecycle blocker is recorded.",
    "maxProgressBound": "one rebalancer_handoff owner package slice; no timeout increases, active-gate admission relaxation, or publication handoff rewrites",
    "sameFrontierFallback": "If rebalancer_handoff remains, record whether wake delivery, duplicate create idempotency, state-machine progress, or persistence failed; do not start workflow_progress until the direct handoff blocker is reduced or split.",
    "expectedNextFrontier": "operation_workflow_owner / workflow_progress after rebalancer_handoff drains, or a narrower replica lifecycle owner if canonical/focused evidence promotes it",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-active-gate-handoff-contract-consolidation.md / topology_publication_owner / publication_active_gate_handoff_contract / reduced",
      "work/packages/done-20260512-rolling-restart-operation-workflow-rebalancer-handoff-priority-recovery-retry-scheduled.md / operation_workflow_owner / rebalancer_handoff / reduced"
    ],
    "oscillationCheck": "This package follows a canonical split from priority-recovery residual evidence, not a return to publication or active-gate handoff ownership.",
    "handoffInvariant": "The package must preserve strict active-gate admission and the canonical publication-active-gate handoff contract while focusing only operation workflow handoff progress."
  }
}
-->

## Why

Fresh representative evidence split the remaining red residual after the
active-gate owner reconcile package. This package owns the first split group:
`operation_workflow_owner / rebalancer_handoff` with `recovering_in_flight`
witnesses.

The observed control-plane publication operation is no longer a lost wake-up:
the direct CREATE_REPLICA wake reaches the handler. The remaining handoff
question is whether duplicate create idempotency should advance the replica
lifecycle out of pending/creating, or whether that evidence promotes a narrower
replica lifecycle owner.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the package starts from canonical representative
  split evidence and owns one runtime owner boundary.
- Escalation trigger to a heavier lane: focused evidence promotes a separate
  replica lifecycle owner, requires timeout increases, or reopens publication
  handoff truth.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Freeze the predecessor migration evidence.
2. Inspect the operation workflow rebalancer handoff files and replica
   lifecycle idempotency path named by residual evidence.
3. Promote exact runtime/test files into `writeScope` only after focused owner
   evidence confirms the local boundary.
4. Implement one bounded wake, retry, dispatch, timeout, or lifecycle-advance
   fix, or split to a narrower lifecycle owner with concrete evidence.
5. Rerun focused tests, static guardrails, and representative
   `rolling-restart`.

## Out Of Scope

1. Timeout increases.
2. Active-gate admission relaxation.
3. Publication handoff contract rewrites.
4. Starting `operation_workflow_owner / workflow_progress` before this direct
   rebalancer handoff residual is reduced or split.
5. Pro or Enterprise behavior.

## Subagent Sequencing Ledger

Required because this is a causal-escalation runtime package. Subagent
execution is blocked in this host unless the user explicitly asks for
delegation.

- [x] Review subagent recorded:
      blocked-by-environment-policy; reason: developer policy allows spawning
      subagents only when the user explicitly asks for delegation.
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy; reason: review role is blocked by the
      same environment policy, so no separate fix role can be truthfully run.
- [x] Implementation subagent recorded:
      blocked-by-environment-policy; reason: developer policy allows spawning
      subagents only when the user explicitly asks for delegation.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`; candidate runtime files stay gated until focused owner evidence promotes exact paths.
- Forbidden files: timeout increases, active-gate admission relaxation, publication handoff contract rewrites, Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-replica-operation-router-replace-pending-20260515-codex.report.json --markdown
4. npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff --markdown
