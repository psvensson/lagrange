# Spec-Led Runtime Modularization Operation Workflow Progress SQL Transactions Dispatch-Pending Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-10",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The representative proof package classified the post-scheduling report as migrated-frontier. The first blocked frontier is priority_recovery_partition_progress under operation_workflow_owner / workflow_progress. The dominant witness is sql_transactions-p1 with operation_stalled, persisted_not_dispatched, dispatch_pending, latest workflow step PENDING, and nextRequiredAction advance_existing_operation.",
  "nextAction": "After the proof package is committed, closed, and this package is activated, review the just-closed proof package, then freeze a focused workflow-progress fixture for the sql_transactions-p1 persisted-not-dispatched/no-step-transition witness before runtime implementation starts.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_progress fixture for sql_transactions-p1 persisted-not-dispatched/no-step-transition evidence",
    "Focused operation workflow owner and dispatch wake/replay tests selected by priority_recovery_workflow_progress_event_driven",
    "Touched-file static guardrails selected by operation_workflow_owner and dispatch service ownership",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-sql-transactions-dispatch-pending.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner*.js",
    "src/control-plane/replica-dispatch-service*.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*workflow*.test.js",
    "test/control-plane/*dispatch*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/model-ledger.jsonl",
    "work/packages/todo-20260510-spec-led-runtime-modularization-operation-workflow-progress-sql-transactions-dispatch-pending-frontier.md",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "workflow progress evidence requires changes outside operation_workflow_owner or dispatch service wake/replay",
      "focused fixture exposes operation_scheduling, rebalancer_handoff, or workflow_timeout again",
      "representative proof still fails on the same sql_transactions-p1 dispatch_pending no-step-transition witness after owner fix"
    ]
  },
  "predecessor": "work/packages/active-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md"
}
-->

## Why

The operation-scheduling SQL write operations package repaired the
`rebalancer_leader / operation_scheduling` blocker. The representative report
is still not green, but the first actionable frontier has migrated to
`operation_workflow_owner / workflow_progress`: the priority recovery operation
for `sql_transactions-p1` exists and is visible, yet it remains
dispatch-pending with no workflow step transition.

## Scope Basis

Successor split from
`work/packages/active-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md`
after classification of
`test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the proof package after it is closed by the parent session.
2. Freeze the smallest workflow-progress witness for `sql_transactions-p1`.
3. Trace operation workflow owner, dispatch service wake/replay, and priority
   recovery snapshot evidence for persisted-not-dispatched operations with no
   step transitions.
4. Repair the canonical workflow-progress owner path so the operation advances
   through one decision/effect/retry lane.
5. Keep operation scheduling, rebalancer handoff, workflow timeout, and
   publication ACK convergence satisfied.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Rebalancer leader operation scheduling; that is predecessor proof.
2. Rebalancer handoff retry-log summary shadowing; that is earlier predecessor
   proof.
3. Workflow timeout handling; that is earlier predecessor proof.
4. Active-gate report schema alias deletion.
5. Harness timeout increases, report relabeling, or fallback workflow-progress
   classification.
6. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / workflow_progress` for this witness.
2. `priority_recovery_workflow_progress_event_driven` must come from owner
   workflow evidence, not diagnostics reconstructing stalled operations from
   raw logs.
3. Dispatch-pending and no-step-transition observations must resolve through
   one canonical workflow-progress decision table.
4. No package-owned change may regress the reduced `operation_scheduling`,
   `rebalancer_handoff`, `workflow_timeout`, or publication ACK convergence
   edges.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: workflow progress evidence requires changes outside
  `operation_workflow_owner` or dispatch service wake/replay; focused fixture
  exposes `operation_scheduling`, `rebalancer_handoff`, or
  `workflow_timeout` again; representative proof still fails on the same
  `sql_transactions-p1` dispatch-pending no-step-transition witness after owner
  fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
workflow progress boundary, workflow progress phase, operation id, partition
id, latest workflow step, latest operation status, actuation state, next
required action, and owner reason `priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, operation
workflow tests, dispatch service tests, priority recovery diagnostics, and
sprint/package handoff notes.

Prohibited reinterpretations: do not treat workflow progress as operation
scheduling, rebalancer handoff, workflow timeout, publication ACK convergence,
startup snapshot coverage, generic readiness failure, or a harness timeout. Do
not add fallback workflow-progress classification outside the operation
workflow owner.

Primary diagnostics / proof surfaces: workflow-progress fixture, topology
convergence explain output, focused operation workflow and dispatch wake/replay
tests, static guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `workflow_progress`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked`
- Source: `unresolvedSemanticStateIds: operation_stalled`,
  `blockedPartitionIds: sql_transactions-p1`,
  `dominantReason: priority_recovery_workflow_progress_event_driven`,
  `failureClass: priority_recovery_progress_blocked`.
- Representative dominant witness: `sql_transactions-p1`, semantic state
  `operation_stalled`, progress class
  `operation_created_but_no_step_transitions`, actuation state
  `persisted_not_dispatched`, blocking boundary `workflow_progress`, wait mode
  `event_driven`, workflow progress phase `dispatch_pending`, latest workflow
  step `PENDING`, latest operation status `pending`, next required action
  `advance_existing_operation`.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --explain priority_recovery_partition_progress`

## Activation Notes

This package is intentionally `todo` until the proof package is committed,
pushed, closed with a truthful Commit And Push Ledger, and the parent session
moves this package to `active`. Runtime implementation must not begin before a
fresh review subagent reviews the proof package and the required fix and
implementation subagent sequencing is recorded here.

## Validation

1. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --explain priority_recovery_partition_progress`
2. Focused operation workflow owner fixture for the `sql_transactions-p1`
   persisted-not-dispatched/no-step-transition witness.
3. Focused operation workflow and dispatch wake/replay tests.
4. Touched-file static guardrails.
5. Representative rolling-restart rerun.
