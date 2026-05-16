# Priority Recovery operation_workflow_owner workflow_progress Residual

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The active-gate snapshot timeout handoff fixture split the selected-source, forced-repair, authoritative query-pressure, and inherited readiness causes. The representative rerun remains red and canonical evidence reselected priority_recovery_partition_progress as the first frontier under operation_workflow_owner / workflow_progress with priority_recovery_event_driven_wait. Residual extraction reports three spread_satisfied_in_flight witnesses across control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1.",
  "nextAction": "Run required review/fix/implementation subagents before runtime edits, then prove or split the priority_recovery_event_driven_wait residual without reopening publication ACK, timeout budgets, or active-gate admission.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --explain priority_recovery_partition_progress",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-ports.js"
  ],
  "commitScope": [
    "work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md",
    "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-5.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-3.js",
    "src/rebalancer/operation-workflow-owner-segment-7-stage-2.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "priority recovery residuals split beyond workflow_progress"
    ]
  },
  "representativeResidual": {
    "status": "live-red-scenario-release-gate",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "frontier": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "workflow_progress",
    "dominantReason": "priority_recovery_event_driven_wait",
    "nextAction": "Prove or split three spread_satisfied_in_flight workflow-progress witnesses."
  },
  "causalGovernance": {
    "hypothesis": "The current representative edge is a priority recovery event-driven workflow-progress residual. Three partitions report spread_satisfied_in_flight and topology operator witnesses at dispatch_pending/planned with next action advance_existing_operation.",
    "stopConditionCheck": "Run the required subagent sequence, npm run analyze:causal-model on fresh evidence, focused priority recovery residual extraction, focused workflow owner tests, static guardrails, and one representative rolling-restart rerun after implementation.",
    "expectedCausalModelChange": "Focused proof should drain or split priority_recovery_event_driven_wait, then either make rolling-restart green or migrate back to the next canonical frontier.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Publication ACK remains satisfied. Active-gate snapshot coverage is downstream at 2/5 with snapshot_repair_deferred. The current first frontier is priority_recovery_partition_progress with three workflow-progress witnesses.",
    "crossBoundaryReview": "Publication ACK, timeout budgets, and active-gate admission remain closed. Active-gate snapshot coverage stays frozen unless canonical evidence selects it again."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after active-gate snapshot timeout handoff fixture",
    "phaseChain": [
      "consume active-gate snapshot fixture migration proof",
      "classify priority_recovery_partition_progress as the current first frontier",
      "run review, fix if required, and implementation subagents before runtime edits",
      "prove or split three spread_satisfied_in_flight workflow-progress witnesses",
      "rerun representative rolling-restart and classify green, reduced, same-frontier, migrated, or split"
    ],
    "currentFirstFrontier": "priority_recovery_partition_progress in test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json, owned by operation_workflow_owner / workflow_progress.",
    "knownDownstreamBlockers": [
      "publication_ack_convergence is satisfied",
      "active_gate_snapshot_coverage is downstream with snapshotCoverageNodeCount=2 and expectedNodeCount=5",
      "selected snapshot observation is repair_deferred with stale replica operations in flight",
      "priority recovery residual extraction reports three workflow-progress witnesses",
      "witness partitions are control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1"
    ],
    "missingCausalEdge": "Prove whether spread_satisfied_in_flight event-driven waits should advance existing operations for the three priority recovery partitions or split by a narrower workflow-progress cause.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown",
    "boundedProgressProof": "The predecessor active-gate package split the snapshot handoff edge and representative evidence selected priority recovery again. This package owns only the selected operation_workflow_owner / workflow_progress residual and must prove the advance existing operation progress mechanism.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json",
    "expectedObservableTransition": "Focused proof should reduce priority recovery witnesses or migrate to the next canonical edge without reopening frozen ACK, budget, or admission edges.",
    "maxProgressBound": "one focused operation_workflow_owner / workflow_progress package slice after required subagent sequencing",
    "sameFrontierFallback": "If priority_recovery_partition_progress remains first frontier, preserve the three partition witnesses and split by exact workflow-progress cause.",
    "expectedNextFrontier": "representative green, reduced workflow-progress residual, or active-gate snapshot coverage after priority recovery drains",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md / operation_workflow_owner / workflow_progress / migrated",
      "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260516-startup-active-gate-admin-snapshot-timeout-after-priority-recovery.md / startup_active_gate_owner / snapshot_coverage / reduced"
    ],
    "oscillationCheck": "This priority package is allowed because the immediately preceding active-gate package produced fresh representative evidence selecting priority_recovery_partition_progress again.",
    "handoffInvariant": "Publication ACK, timeout budgets, and active-gate admission remain closed unless canonical evidence selects them again."
  },
  "predecessor": "work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md"
}
-->

## Why

The representative rolling-restart rerun after the active-gate snapshot fixture
selected `priority_recovery_partition_progress` again. This package owns the
focused `operation_workflow_owner / workflow_progress` residual with three
`spread_satisfied_in_flight` witnesses.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, specifically topology workflow
stabilization, failure simulations, and production guarantees for the AGPL
runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is required: the representative edge oscillated back to
  priority recovery after an active-gate fixture package, so this package must
  prove the exact producer/consumer handoff before runtime edits.
- Escalation trigger to a heavier lane: runtime ownership expands beyond the
  listed workflow-progress files, a frozen decision reopens, or representative
  evidence contradicts the selected owner boundary.

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
2. work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md
3. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
4. work/sprints/current-blocker.md
5. work/sprints/current-blocker.json
6. src/rebalancer/operation-workflow-owner.js
7. src/rebalancer/operation-workflow-owner-segment-7-stage-5.js
8. src/rebalancer/operation-workflow-owner-segment-7-stage-3.js
9. src/rebalancer/operation-workflow-owner-segment-7-stage-2.js
10. src/rebalancer/operation-workflow-owner-ports.js
11. test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js
12. test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js
13. test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js
14. work/model-ledger.jsonl

## Out Of Scope

1. publication-ack-convergence
2. representative-timeout-budget
3. active-gate-admission-relaxation
4. active-gate-snapshot-coverage

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md`, `work/packages/done-20260516-startup-active-gate-snapshot-timeout-handoff-fixture.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `src/rebalancer/operation-workflow-owner.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-3.js`, `src/rebalancer/operation-workflow-owner-segment-7-stage-2.js`, `src/rebalancer/operation-workflow-owner-ports.js`, `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, `test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`, `work/model-ledger.jsonl`
- Forbidden files: `publication-ack-convergence`, `representative-timeout-budget`, `active-gate-admission-relaxation`, `active-gate-snapshot-coverage`
- Frozen decisions: publication ACK, timeout budgets, active-gate admission, and active-gate snapshot coverage stay closed unless canonical evidence selects them again.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, representative scenario evidence changes, or residuals split beyond workflow_progress.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --explain priority_recovery_partition_progress`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`
- Model ledger advisory: `escalate`

## Validation

1. PASS - `npm run work:package:doctor -- --suggest work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md` selected causal-escalation metadata and subagent sequencing requirements.
2. PASS - `npm run work:package:evidence-block -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json`
3. PASS - `npm run analyze:owner-files -- operation_workflow_owner workflow_progress --markdown`
4. PASS - `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-snapshot-timeout-handoff-fixture-20260516.report.json --explain priority_recovery_partition_progress`
5. Pending - `npm run work:validate -- --entry work/packages/active-20260516-priority-recovery-operation-workflow-owner-workflow-progress.md`
