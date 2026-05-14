# Topology Priority Recovery Residual Drain

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "non_frontier_priority_recovery_residual",
  "currentState": "Activated after contract integration classified focused contracts as not ready for ship. The representative artifact still has one bounded operation_workflow_owner / workflow_progress wait, while the latest rebalance gate reports zero priority recovery witnesses. Publication convergence remains the representative first frontier.",
  "nextAction": "Run priority residual extractors against the representative and latest rebalance artifacts and classify whether a live operation workflow residual remains before final ship confirmation. Do not fix operation workflow, publication, active-gate, or rolling-restart runtime behavior without explicit re-scope.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-priority-recovery-residual-drain.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "work/packages/done-20260514-topology-contract-integration-reconciliation.md",
    "work/packages/done-20260514-topology-rebalance-disruption-recovery-gate.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260514-topology-priority-recovery-residual-drain.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Keep the representative residual live; priority recovery is a non-frontier residual to classify before final ship confirmation."
  },
  "causalGovernance": {
    "hypothesis": "operation_workflow_owner / workflow_progress evidence should reduce, migrate, or classify non_frontier_priority_recovery_residual without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "non_frontier_priority_recovery_residual becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until operation_workflow_owner / workflow_progress is classified, the sprint representative residual stays open at topology_publication_owner / publication_convergence. Runtime fixes remain out of scope.",
    "crossBoundaryReview": "Required before closure through the runtime-owner-boundary subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / operation_workflow_owner / workflow_progress",
    "phaseChain": [
      "canonical evidence extraction",
      "operation_workflow_owner / workflow_progress focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier operation_workflow_owner / workflow_progress; sprint representative frontier remains topology_publication_owner / publication_convergence until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven operation_workflow_owner / workflow_progress causal edge for non_frontier_priority_recovery_residual",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown",
    "boundedProgressProof": "Focused evidence must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for operation_workflow_owner / workflow_progress, or classify that no live priority residual remains.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "non_frontier_priority_recovery_residual resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep operation_workflow_owner / workflow_progress active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "classification-only-stop"
  }
}
-->

## Why

Priority recovery is not the first frontier in the latest rolling-restart
artifact, but residual extraction still reports
`control_plane_publications-p1` in `spread_satisfied_in_flight`. Final ship
evidence cannot contain ambiguous coordinator-created operation residue or a
critical recovery state that is effectively waiting on event delivery.

This package owns observe/classify handling for the non-frontier
`operation_workflow_owner / workflow_progress` residual. It should classify
whether a live residual remains; runtime repair requires explicit re-scope.

## Scope Basis

AGPL topology convergence item: fix the current ship blocker first and ensure
coordinator-created operations never wait only on event delivery. Prior focused
proof exists, but the representative artifact still carries a residual witness.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package is constrained to one
  `operation_workflow_owner / workflow_progress` residual after active-gate
  first-frontier work is addressed.
- Escalation trigger to a heavier lane: the operation residual becomes a
  distributed scenario failure involving remote handoff delivery, missed ACK
  semantics, or a new coordinator-owner contract.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Identify exact operation IDs, partitions/message groups, owner node, remote
   owner if any, attempt count, next-attempt timestamp, and current state from
   canonical residual extraction.
2. Ensure the operation workflow owner can progress from
   `spread_satisfied_in_flight` to durable completion, retry, or terminal
   degraded classification without relying only on event delivery.
3. If owner is remote, prove wakeup delivery is not the authority; durable
   operation state and retry schedule are.
4. Record whether the residual is absent, bounded non-frontier, or still needs
   a remote handoff/missed ACK gate package.
5. Keep final ship confirmation blocked until this classification is recorded.

## Out Of Scope

1. active-gate-runtime-changes-without-frontier-evidence
2. harness-timeout-increases
3. Changing publication projection semantics unless the residual owner evidence
   proves publication is the operation blocker.
4. Broad operation workflow refactors outside the named residual state.
5. Runtime operation workflow repair in this sprint segment.

## Entry Evidence

1. Residual extractor reports `control_plane_publications-p1`.
2. State is `spread_satisfied_in_flight`.
3. The residual is non-frontier while active-gate snapshot coverage remains red.
4. Ship criterion requires no `priority_recovery_event_driven_wait` and no
   ambiguous priority recovery residuals.

## Owner Contract To Prove

`operation_workflow_owner` must treat durable operation intent as authority. For
each coordinator-created operation it must record:

1. Affected partition/message group/replica operation identity.
2. Current owner and remote owner if ownership moved.
3. Last durable progress snapshot.
4. Wakeup delivery result if attempted.
5. Bounded retry window, next-attempt timestamp, and attempt counter.
6. Terminal degraded reason when stale beyond budget.

Event delivery can wake the owner, but it cannot be the final live state.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-priority-recovery-residual-drain.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-1.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-4.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a runtime owner-boundary
package.

1. [x] Review subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-priority-recovery-residual-drain-review
2. [x] Fix subagent recorded or explicitly not needed:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-priority-recovery-residual-drain-fix
3. [x] Implementation subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-priority-recovery-residual-drain-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-priority-recovery-residual-drain.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `active-gate-runtime-changes-without-frontier-evidence`, `harness-timeout-increases`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-priority-recovery-residual-drain.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-priority-recovery-residual-drain.md
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown
5. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-rebalance-disruption-recovery-gate.report.json --markdown
6. npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown
7. node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
8. node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
9. npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
10. npm run work:validate -- --entry work/packages/active-20260514-topology-priority-recovery-residual-drain.md
11. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-priority-recovery-residual-drain.md
12. npm run work:validate -- --closure work/packages/active-20260514-topology-priority-recovery-residual-drain.md
13. git diff --check -- work/packages/active-20260514-topology-priority-recovery-residual-drain.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
14. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If the residual requires distributed remote coordinator failure proof,
   activate `done-20260514-topology-remote-coordinator-handoff-gate.md`.
2. If the residual is a missed ACK publication problem, activate
   `todo-20260514-topology-missed-handoff-ack-gate.md`.
3. If active-gate remains first frontier, keep this package pending and record
   it as non-frontier residue rather than broadening active-gate work.

## Acceptance Criteria

1. Focused operation workflow tests prove durable progress, retry, or terminal
   classification for the residual state.
2. Residual extractor no longer reports `priority_recovery_event_driven_wait`
   or ambiguous `spread_satisfied_in_flight` ship residue after representative
   rerun, or this package records a narrower gate owner.
3. Owner decision snapshot names affected operation, owner, remote owner,
   next-attempt, attempt count, and terminal/degraded reason.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
