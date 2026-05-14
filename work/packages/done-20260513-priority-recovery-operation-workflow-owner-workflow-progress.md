# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-13",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "Focused priority-recovery workflow proof is green after adding bounded SQL priority replica-operation dispatch delivery. The representative rerun moved the first frontier off operation_workflow_owner / workflow_progress and back to startup_active_gate_owner / snapshot_coverage with priorityRecovery=none and active_gate_snapshot_coverage blocked.",
  "nextAction": "Migrate this package to the existing startup_active_gate_owner / snapshot_coverage successor and continue rolling-restart from the latest active-gate artifact.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --markdown",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress",
    "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js",
    "node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
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
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-2.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-event-driven-dispatch-pending.md",
    "work/packages/done-20260512-rolling-restart-operation-workflow-progress-stage3-timeout-progression.md",
    "work/packages/superseded-20260513-rolling-restart-wake-retry-progress-closure.md",
    "test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json",
    "test-output/reports/.playback/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction/rolling-restart/failure-bundle.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner-segment-7-stage-1.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/operation-workflow-owner.js",
    "src/control-plane/replica-dispatch-service-segment-1.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-service-segment-3.js",
    "src/control-plane/replica-dispatch-service-segment-4.js"
  ],
  "commitScope": [
    "work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md",
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
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/control-plane/replica-dispatch-node-state-update.test-part-2.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "fresh canonical evidence promotes startup active gate, publication convergence, or another owner ahead of workflow progress",
      "the fix requires writes outside the owned rebalancer workflow path",
      "control-plane dispatch service changes become required beyond focused owner wake/retry proof",
      "scenario remains red after focused workflow-progress proof and one representative rerun"
    ]
  },
  "causalGovernance": {
    "hypothesis": "If operation_workflow_owner / workflow_progress owns the fresh priority recovery residual, stale dispatch-pending or no-step-transition operations must re-enter one bounded owner wake, retry, timeout, dispatch, or advance path.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json",
    "expectedCausalModelChange": "The priority recovery workflow-progress frontier either converges, reduces to a narrower operation workflow runtime edge, or exposes a fresh same-scenario owner boundary.",
    "representativeOutcome": "migrated",
    "causalDebt": "The focused operation workflow proof is green and the representative rerun no longer keeps priority recovery as first frontier. Canonical evidence now reports active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage as the local blocker.",
    "crossBoundaryReview": "Review, fix, and implementation delegation are recorded as blocked-by-environment-policy because this host requires an explicit user request before spawning subagents."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart priority recovery workflow-progress residual after active-gate duplicate MOVE reduction",
    "phaseChain": [
      "publication convergence",
      "priority recovery operation workflow progress",
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage is blocked under startup_active_gate_owner / snapshot_coverage after the focused priority recovery dispatch-deadline proof.",
    "knownDownstreamBlockers": [
      "priority recovery is no longer the first frontier in the latest representative evidence",
      "active_gate_snapshot_coverage is blocked with activeGate timed out and snapshotCoverage incomplete",
      "startup readiness support remains downstream of active-gate coverage"
    ],
    "missingCausalEdge": "Operation workflow owner must turn stale dispatch-pending or no-step-transition priority recovery rows into one bounded owner progress path.",
    "missingCausalEdgeProbe": "npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js",
    "boundedProgressProof": "Focused workflow tests must prove wake, retry, timeout, dispatch, or advance re-entry before the representative rolling-restart rerun.",
    "boundedProgressProofArtifact": "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "expectedObservableTransition": "priority recovery moved off the first frontier and rolling-restart now exposes startup_active_gate_owner / snapshot_coverage.",
    "maxProgressBound": "one operation workflow owner re-entry cycle plus one representative rolling-restart rerun after focused tests pass",
    "sameFrontierFallback": "not used; the representative rerun migrated to startup_active_gate_owner / snapshot_coverage.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage successor from canonical evidence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "operation_workflow_owner",
    "fromBoundary": "workflow_progress",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "After the bounded SQL priority replica-operation dispatch deadline proof, rolling-restart no longer reports priority_recovery_partition_progress as first frontier.",
    "evidence": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --explain active_gate_snapshot_coverage",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md",
  "closed": "2026-05-13",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260513-rolling-restart-active-gate-snapshot-coverage-after-readiness-support-reduction.md"
}
-->

## Why

The package proved the operation workflow residual far enough for the
representative gate to move. The focused workflow-progress tests are green, the
bounded SQL priority replica-operation dispatch deadline is covered, and the
latest `rolling-restart` rerun no longer reports
`priority_recovery_partition_progress` as the first frontier.

Canonical evidence now promotes `startup_active_gate_owner / snapshot_coverage`
with `active_gate_snapshot_coverage` blocked. This package should migrate to
the existing active-gate successor rather than continue editing operation
workflow code.

## Scope Basis

AGPL rolling-restart release-gate work from `roadmap.md` Phase `0.1 -
Internal Coherence`: topology workflow stabilization, failure simulations, and
production guarantees.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the work targets one representative gate with a
  named operation workflow owner boundary, focused owner proof, and one
  representative rerun after implementation.
- Escalation trigger to a heavier lane: fresh evidence promotes another owner,
  the fix requires writes outside the owned workflow path, or the same frontier
  remains red after one bounded owner cycle.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Fallback Evidence

Canonical evidence identified `operation_workflow_owner / workflow_progress` as
the owner boundary but did not name the concrete target operation or replica
handler delivery state. Raw report and playback searches were used only after
that canonical classification to locate the SQL write `CREATE_REPLICA`
delivery gap: the operation remained `SENDING` while the target handler had
started `CREATE_REPLICA` work. That fallback scoped the bounded dispatch
deadline proof added in this package.

## Subagent Sequencing Ledger

Review and fix sequencing is recorded before implementation starts. Real
subagents require an explicit user request in this host, so unavailable role
proof is recorded rather than invented.

- [x] Review subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-priority-recovery-workflow-progress-review
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-priority-recovery-workflow-progress-fix
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-priority-recovery-workflow-progress-implementation

## In Scope

1. work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress.md
2. work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md
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
14. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
15. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
16. test/control-plane/replica-dispatch-node-state-update.test-part-2.js

## Out Of Scope

1. harness timeout increases
2. Pro behavior
3. Enterprise behavior
4. startup active-gate runtime changes without fresh first-frontier evidence
5. publication convergence runtime changes without fresh first-frontier evidence

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260513-priority-recovery-operation-workflow-owner-workflow-progress.md`, `work/sprints/active-2026-q2-phase-0-1-rolling-restart-release-gate-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `work/model-ledger.jsonl`, `src/rebalancer/operation-workflow-owner-segment-1.js`, `src/rebalancer/operation-workflow-owner-segment-2.js`, `src/rebalancer/operation-workflow-owner-segment-4.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-1.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js`, `src/rebalancer/operation-workflow-owner-shared.js`, `src/rebalancer/operation-workflow-owner.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `test/control-plane/replica-dispatch-node-state-update.test-part-2.js`
- Forbidden files: `harness timeout increases`, `Pro behavior`, `Enterprise behavior`, `startup active-gate runtime changes without fresh first-frontier evidence`, `publication convergence runtime changes without fresh first-frontier evidence`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --explain priority_recovery_partition_progress`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --markdown`, `npm run analyze:owner-files -- operation_workflow_owner workflow_progress`, `npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js`, `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js`, `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js`, `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --explain priority_recovery_partition_progress
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-green-gate-after-active-gate-snapshot-coverage-reduction.report.json --markdown
5. npm run analyze:owner-files -- operation_workflow_owner workflow_progress
6. npm test -- test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js
7. node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js
8. node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js
9. npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner.js
10. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --fast-local --verbose
11. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json
12. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json --explain active_gate_snapshot_coverage
13. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-sql-dispatch-deadline.report.json
