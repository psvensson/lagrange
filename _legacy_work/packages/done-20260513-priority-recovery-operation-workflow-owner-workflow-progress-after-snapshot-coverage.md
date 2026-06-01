# Priority Recovery Workflow Progress After Snapshot Coverage

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Focused workflow-progress proof cleared the publication and priority recovery blocker enough for the latest representative to move back to active_gate_snapshot_coverage. The current first frontier is startup_active_gate_owner / snapshot_coverage with snapshotCoverage=2/5, publication=PUBLISHED, prioritySpread=ready, priorityRecovery=none, and missingPublished=4.",
  "nextAction": "Close this package as migrated and continue in the active-gate snapshot-coverage successor after workflow progress.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md",
    "test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json",
    "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/model-ledger.jsonl",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
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
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the latest priority recovery residual, needs_operation and recovering_in_flight partition operations must advance through one bounded owner wake, retry, timeout, dispatch, delivery, ACK, or terminal classification path instead of leaving publication convergence blocked.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "The priority recovery workflow-progress residual either converges, reduces to a narrower operation workflow runtime edge, or exposes a fresh publication owner boundary with canonical evidence.",
    "representativeOutcome": "migrated",
    "causalDebt": "The latest representative remains red, but this package moved publication ACK and priority recovery to satisfied in canonical evidence. The first frontier is now active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with snapshotCoverage=2/5 and priorityRecovery=none.",
    "crossBoundaryReview": "Review subagent Hooke (019e23a5-aa77-7f22-85b1-89f2cf2bb89e) reviewed predecessor work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md and found fixes required. Fix agent Codex (019e23a8-7118-7e51-9f7e-6d621611f5b0) reconciled predecessor proof docs, guardrail closure proof, migration wording, and successor sequencing before implementation resumes."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative after active-gate snapshot coverage repair",
    "phaseChain": [
      "startup active-gate snapshot coverage",
      "publication acknowledgement convergence",
      "priority recovery operation workflow progress"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage after focused workflow-progress proof.",
    "knownDownstreamBlockers": [
      "publication ACK and priority recovery are satisfied in canonical evidence",
      "active-gate snapshot coverage is now 2/5 with publishedActive=1/5 and missingPublished=4",
      "membership epoch, failure repair intent, rejoin reconciliation, partition descriptor epoch, placement capacity, anti-entropy, bounded budgets, and failure gates remain downstream"
    ],
    "missingCausalEdge": "Priority recovery workflow rows for sql_transactions-p1 and sql_write_operations-p1 must leave needs_operation or recovering_in_flight through a bounded owner progress path.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown",
    "boundedProgressProof": "Focused owner tests and guardrails prove bounded wake, retry, timeout, dispatch, delivery, ACK, and advance paths; representative rolling-restart moved publication ACK and priority recovery to satisfied, then exposed active_gate_snapshot_coverage as the next first frontier.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "Observed: publication convergence no longer delegates to the original priority recovery residual; startup_active_gate_owner / snapshot_coverage is now the first frontier.",
    "maxProgressBound": "one predecessor review subagent, one fix subagent if review finds fixes, one implementation subagent, focused owner proof, and one representative rolling-restart rerun",
    "sameFrontierFallback": "not used; the original workflow-progress residual no longer owns the representative first frontier.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage successor",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "Focused workflow-progress proof moved publication ACK and priority recovery to satisfied; the latest representative first frontier is active_gate_snapshot_coverage.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown"
    ]
  },
  "predecessor": "work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md",
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md"
}
-->

## Why

The latest representative moved off startup active-gate snapshot coverage but
remains red. Canonical evidence fronts publication convergence, and the focused
priority-recovery residual extractor narrows the implementation owner to
`operation_workflow_owner / workflow_progress` for `sql_transactions-p1` and
`sql_write_operations-p1`.

This package owns the next bounded workflow-progress proof or a split back to
publication convergence if operation workflow evidence no longer explains the
missing active publication nodes.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/active-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Hooke (019e23a5-aa77-7f22-85b1-89f2cf2bb89e) reviewed
      work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md;
      result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Codex (019e23a8-7118-7e51-9f7e-6d621611f5b0) fixed
      work/packages/done-20260513-topology-active-gate-snapshot-coverage-repair.md`.
- [x] Implementation subagent recorded:
      `Agent Codex (019e23ad-b2ae-75d3-91f7-a71d0bbfc665) implemented
      work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md`.

## In Scope

1. work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md
2. work/sprints/active-2026-q2-topology-convergence-ship-shape.md
3. work/sprints/current-blocker.json
4. work/sprints/current-blocker.md
5. work/model-ledger.jsonl
6. src/rebalancer/operation-workflow-owner-segment-1.js
7. src/rebalancer/operation-workflow-owner-segment-2.js
8. src/rebalancer/operation-workflow-owner-segment-4.js
9. src/rebalancer/operation-workflow-owner-segment-7-stage-1.js
10. src/rebalancer/operation-workflow-owner-segment-7-stage-3.js
11. src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js
12. src/rebalancer/operation-workflow-owner-shared.js
13. src/rebalancer/operation-workflow-owner.js
14. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
15. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
16. test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js

## Out Of Scope

1. publication-convergence runtime changes before residual proof delegates back upward
2. harness timeout increases
3. Pro behavior
4. Enterprise behavior

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/rebalancer/operation-workflow-owner-segment-1.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-4.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`, `src/rebalancer/operation-workflow-owner-shared.js`, `src/rebalancer/operation-workflow-owner.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
- Forbidden files: `publication-convergence runtime changes before residual proof delegates back upward`, `harness timeout increases`, `Pro behavior`, `Enterprise behavior`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`, static guardrails on touched operation-workflow owner files, and representative rerun `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --fast-local --verbose` with migrated outcome to startup active-gate snapshot coverage.
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
2. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --markdown
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json

## Implementation Ledger

- `Agent Codex (019e23ad-b2ae-75d3-91f7-a71d0bbfc665) implemented work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md`

## Commit And Push Ledger

1. Focused package commit: 227c242562abf79e6a0bf65517bee5f8e0f626ec
2. Closure ledger/model-ledger commit: 4e43b85fde0edf23e5700235556b90145c7cf38c
3. Pushed to: origin/codex/pending-ack-eligibility-filter
4. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Changed Files

1. `src/rebalancer/operation-workflow-owner-segment-1.js`
2. `src/rebalancer/operation-workflow-owner-segment-2.js`
3. `src/rebalancer/operation-workflow-owner-segment-4.js`
4. `src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`
5. `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`
6. `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`
7. `src/rebalancer/operation-workflow-owner-shared.js`
8. `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
9. `work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress-after-snapshot-coverage.md`
10. `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`
11. `work/model-ledger.jsonl`

## Focused Proof

- Evidence summary: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`
- Residual extraction: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json --markdown`
- Owner file index: `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
- Causal model: `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-repair-6.report.json`
- Focused owner tests: `node --test test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `node --test test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`, and `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
- Guardrails: `node scripts/check-guideline-literals.js ...operation-workflow-owner*.js`, `node scripts/check-guideline-decision-boundaries.js ...operation-workflow-owner*.js`, `npm run audit:runtime-grammar:file -- ...operation-workflow-owner*.js`, and package-scope `git diff --check`
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --fast-local --verbose`

## Implementation Notes

The bounded owner path now treats priority control-plane partitions as priority
recovery workflow-progress candidates instead of limiting dispatch rearm,
coordinator-created local priming, and timeout scans to only critical system
partitions. Target replica progress can re-enter the observed-progress owner
lane, in-progress create responses can reconcile target status and schedule a
bounded observed-progress retry, and timeout scans can supplement partial cache
visibility with one authoritative owner read for priority recovery operations.

## Representative Rerun

Latest representative artifact:
`test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`.

The run is still red, but this package achieved the bounded transition it
owned. Canonical evidence now marks `publication_ack_convergence` and
`priority_recovery_partition_progress` as satisfied. The first frontier moved
to `startup_active_gate_owner / snapshot_coverage`, where the active gate
selected an admin-ready snapshot with `snapshotCoverage=2/5`,
`publishedActive=1/5`, `missingPublished=4`, `prioritySpread=ready`, and
`priorityRecovery=none`.

Residual priority recovery extraction still reports one non-frontier
`operation_workflow_owner / workflow_progress` witness for
`control_plane_publications-p1` in `spread_satisfied_in_flight`, but the
causal model and topology summary no longer classify operation workflow as the
first blocker.
