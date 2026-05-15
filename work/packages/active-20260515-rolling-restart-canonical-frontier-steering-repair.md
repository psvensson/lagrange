# Rolling Restart Canonical Frontier Steering Repair

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Representative evidence selects active_gate_snapshot_coverage as the first frontier with startup_active_gate_owner / snapshot_coverage. The priority-recovery extractor still reports one operation_workflow_owner / workflow_progress witness, but causal and topology extractors keep it subordinate to the active-gate snapshot coverage blocker.",
  "nextAction": "Refresh sprint, track, release, and current-blocker source of truth; park workflow-progress as a dependency/sub-frontier; require real review subagent proof before any runtime owner-boundary package resumes.",
  "proof": [
    "npm run work:context",
    "npm run work:llm-start",
    "npm run work:package:schema",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "npm run work:current-blocker -- --write",
    "npm run work:validate -- --entry work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md",
    "git diff --check -- work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/tracks/topology-convergence.md work/releases/0.1-stabilization.md work/releases/0.1-dependency-map.md work/model-ledger.jsonl"
  ],
  "writeScope": [
    "work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md",
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-stabilization.md",
    "work/releases/0.1-dependency-map.md",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md",
    "work/packages/todo-20260515-publication-active-gate-reconcile-bridge-simplification.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md",
    "work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/tracks/topology-convergence.md",
    "work/releases/0.1-stabilization.md",
    "work/releases/0.1-dependency-map.md",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "metadata-steering-repair",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "sprint-steering/canonical-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Keep the sprint source of truth on active-gate snapshot coverage, park the workflow-progress residual as dependent evidence, and resume runtime work only after the active package has real review subagent proof."
  },
  "causalGovernance": {
    "hypothesis": "The representative blocker is still active-gate snapshot coverage; the workflow-progress witness is subordinate dependency evidence and should not own the active runtime package without migration proof.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "expectedCausalModelChange": "current-blocker and sprint state name startup_active_gate_owner / snapshot_coverage as the active frontier; workflow_progress is parked unless fresh evidence promotes it.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Leaving the active package on workflow_progress would let the sprint implement a subordinate witness while active-gate snapshot coverage remains the canonical first frontier.",
    "crossBoundaryReview": "Do not edit runtime code, relax active-gate admission, change publication handoff semantics, or claim representative progress. This package only repairs steering and source-of-truth metadata."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / canonical frontier steering repair",
    "phaseChain": [
      "consume rebalancer_handoff reduced evidence",
      "compare work:evidence-summary and causal-model against priority-recovery residual extraction",
      "park workflow_progress as dependent sub-frontier evidence",
      "refresh sprint, track, release, and current-blocker state",
      "validate metadata-only steering repair"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage is the first representative frontier in test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json, owned by startup_active_gate_owner / snapshot_coverage.",
    "knownDownstreamBlockers": [
      "topology convergence handoff probe reports pendingReconcileCount=4 and runtimePromotionAllowed=false",
      "active-gate snapshot observation remains repair_deferred with stale_replica_operations_in_flight",
      "priority-recovery residual extraction reports split required false with one workflow_progress witness",
      "workflow-progress package is parked until migration proof promotes it",
      "publication-active-gate bridge simplification remains parked until fresh context confirms it is the next bounded runtime concern"
    ],
    "missingCausalEdge": "The next runtime package must prove whether startup active-gate reconcile bridge work, snapshot coverage work, or a promoted workflow-progress dependency owns the actual implementation fix.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe",
    "boundedProgressProof": "This package proves bounded steering convergence only: current-blocker, sprint, track, and release state must agree on the canonical first frontier and the next runtime package must keep the reconcile mechanism explicit.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json",
    "expectedObservableTransition": "The active package becomes a metadata-only steering repair; current-blocker names startup_active_gate_owner / snapshot_coverage; runtime work resumes only with real review subagent proof.",
    "maxProgressBound": "metadata-only steering repair; no runtime source edits, timeout increases, active-gate admission relaxation, or publication handoff rewrites",
    "sameFrontierFallback": "If fresh context still selects active_gate_snapshot_coverage after this repair, activate a startup active-gate runtime package rather than the parked workflow-progress package.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage, with publication_reconcile_bridge as a candidate only after fresh context confirms it remains the next bounded runtime concern",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260515-priority-recovery-operation-workflow-owner-rebalancer-handoff.md / operation_workflow_owner / rebalancer_handoff / reduced",
      "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-closure.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / parked-sub-frontier"
    ],
    "oscillationCheck": "This package prevents owner-boundary oscillation by requiring the active package to match the canonical first frontier before runtime work resumes.",
    "handoffInvariant": "Active-gate admission stays strict while runtimePromotionAllowed=false; publication handoff truth remains owned by the canonical contract."
  }
}
-->

## Why

The previous package reduced the operation workflow residual and then stopped
after push, but the active sprint still drifted toward treating the remaining
priority-recovery witness as the current implementation package. Fresh
canonical evidence does not support that as the sprint source of truth:
`work:evidence-summary` and `analyze:causal-model` both select
`active_gate_snapshot_coverage` with
`startup_active_gate_owner / snapshot_coverage` as the first frontier.

This package owns the steering repair only. It parks the workflow-progress
package as dependent evidence, refreshes the sprint/release/current-blocker
state, and records that any next runtime package needs real subagent sequence
proof now that delegation has been explicitly authorized.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, under topology workflow
stabilization, failure simulations, and production guarantees.

Edition scope: Community / AGPL repo only. No Pro or Enterprise behavior is in
scope.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the validator requires causal-escalation because
  this sprint has recently oscillated between adjacent topology boundaries, but
  this package remains metadata-only and does not promote or edit runtime files.
- Escalation trigger to a heavier lane: the steering correction expands into
  runtime code, changes publication/active-gate semantics, or new
  representative evidence names a different first frontier.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Park
   `work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md`
   by owning its status-prefix delete/rename into
   `work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md`
   as a dependency/sub-frontier, not the active implementation package.
2. Make the sprint, topology track, release program, dependency map, and
   generated current-blocker state agree that the canonical first frontier is
   `startup_active_gate_owner / snapshot_coverage`.
3. Preserve the priority-recovery witness as dependency evidence:
   one `operation_workflow_owner / workflow_progress` witness on
   `control_plane_publications-p1`, `split required: false`.
4. Record that runtime implementation resumes only after a real review
   subagent has reviewed the relevant active runtime package.
5. Validate package shape, current-blocker generation, and diff scope.

## Out Of Scope

1. Runtime edits under `src/`.
2. Test edits under `test/`.
3. Timeout increases.
4. Active-gate admission relaxation while `runtimePromotionAllowed=false`.
5. Publication handoff contract rewrites.
6. Representative rerun claims beyond the cited artifact.

## Evidence Summary

`test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`
is the source artifact for this steering repair.

Canonical extractors agree on this shape:

1. `work:evidence-summary` selects `active_gate_snapshot_coverage` as the
   first frontier with owner boundary
   `startup_active_gate_owner / snapshot_coverage`.
2. The dominant reason is `active_gate_timed_out`; reasons include
   `owner_reconcile_pending`, `snapshot_coverage_incomplete`, and
   `snapshot_repair_deferred`.
3. The handoff probe reports
   `nextAction=reconcile_owner_membership_publication`,
   `pendingReconcileCount=4`, and `runtimePromotionAllowed=false`.
4. The selected snapshot observation is `repair_deferred` with
   `stale_replica_operations_in_flight`.
5. `analyze:priority-recovery-residuals` still reports one subordinate
   `operation_workflow_owner / workflow_progress` witness, but the causal
   model marks `topology:active_gate_snapshot_coverage` as the first critical
   path node.

## Runtime Resume Gate

After this steering package is applied, the next runtime owner-boundary or
scenario-release-gate package must start with:

1. Fresh `npm run work:context` and `npm run work:llm-start`.
2. A real review subagent recorded in that package, because delegation has been
   explicitly authorized.
3. A clean review or a separate fix subagent before implementation.
4. Runtime file promotion from `candidateRuntimeFiles` into `writeScope` and
   `commitScope` only after focused owner evidence confirms the boundary.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Heisenberg (019e2c5f-b801-71c0-934f-7d1668f69ef5) reviewed work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md; result fixes-required`
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Euclid (019e2c62-a62e-7c92-b859-b12a58bcd81d) fixed work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md`
- [x] Implementation subagent recorded:
      `Agent Codex (019e2c67-2115-7dd0-817b-e48392351a21) implemented work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md`

## Model Fit

- Package class: `metadata-steering-repair`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `sprint-steering/canonical-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md`, `work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md`, `work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/tracks/topology-convergence.md`, `work/releases/0.1-stabilization.md`, `work/releases/0.1-dependency-map.md`, `work/model-ledger.jsonl`
- Forbidden files: `src`, `test`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:context`, `npm run work:llm-start`, `npm run work:package:schema`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json`, `npm run work:current-blocker -- --write`, `npm run work:validate -- --entry work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md`, `git diff --check -- work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/tracks/topology-convergence.md work/releases/0.1-stabilization.md work/releases/0.1-dependency-map.md work/model-ledger.jsonl`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:context
2. npm run work:llm-start
3. npm run work:package:schema
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --markdown
6. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json --handoff-probe
7. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-create-in-progress-owner-progress-20260515-codex.report.json
8. npm run work:current-blocker -- --write
9. npm run work:validate -- --entry work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md
10. git diff --check -- work/packages/active-20260515-rolling-restart-canonical-frontier-steering-repair.md work/packages/active-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/packages/todo-20260515-priority-recovery-operation-workflow-owner-workflow-progress.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/tracks/topology-convergence.md work/releases/0.1-stabilization.md work/releases/0.1-dependency-map.md work/model-ledger.jsonl
