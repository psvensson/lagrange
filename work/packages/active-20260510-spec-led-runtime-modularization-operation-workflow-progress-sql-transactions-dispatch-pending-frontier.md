# Spec-Led Runtime Modularization Operation Workflow Progress SQL Transactions Dispatch-Pending Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-10",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The workflow-progress implementation now treats persisted PENDING dispatch-pending rows as owner re-entry candidates and attaches owner-advance observation to appended diagnostic snapshots for PENDING persisted-not-dispatched and absent-target SENDING dispatch-pending witnesses. Focused tests and touched-file guardrails pass. The representative rerun reduced the original sql_transactions-p1 stalled/no-transition witness, but the same owner boundary still dominates with recovering_in_flight event-driven PENDING rows on replica_operations-p1 and sql_write_operations-p1 while startup snapshot coverage remains downstream.",
  "nextAction": "Continue this active package from the fresh representative report: freeze the recovering_in_flight PENDING persisted-not-dispatched residual for replica_operations-p1/sql_write_operations-p1, then determine whether owner re-entry is blocked by operation_workflow_owner scheduling or by transport/startup backpressure before further runtime changes.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_progress fixture for sql_transactions-p1 persisted-not-dispatched/no-step-transition evidence",
    "Focused operation workflow owner and dispatch wake/replay tests selected by priority_recovery_workflow_progress_event_driven",
    "Touched-file static guardrails selected by operation_workflow_owner and dispatch service ownership",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-sql-transactions-dispatch-pending.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner*.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/control-plane/replica-dispatch-service*.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "src/control-plane/priority-recovery-snapshot-stage-10.js",
    "test/rebalancer/*workflow*.test.js",
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "test/control-plane/*dispatch*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js",
    "test/control-plane/priority-recovery-snapshot.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/model-ledger.jsonl",
    "work/packages/active-20260510-spec-led-runtime-modularization-operation-workflow-progress-sql-transactions-dispatch-pending-frontier.md",
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
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md"
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
`work/packages/done-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md`
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

This package is active. The proof package is committed, pushed, closed with a
truthful Commit And Push Ledger, and recorded as this package's predecessor.
Ptolemy reviewed the closed proof package and found stale tracker/handoff text.
Kepler fixed that text and regenerated the current-blocker snapshot before
runtime implementation started. Rawls then implemented this workflow-progress
slice.

## Implementation Notes

- Owner reconcile now treats persisted `PENDING`/`pending` dispatch rows as
  dispatch-pending re-entry candidates instead of falling through to transition
  advancement.
- Appended priority recovery operation snapshots synthesize a diagnostic owner
  advancement observation for report-shaped `PENDING` +
  `persisted_not_dispatched` witnesses and for absent-target `SENDING` +
  `dispatched_waiting_progress` witnesses. Failed/non-active target rows remain
  excluded so target-service failure evidence does not masquerade as progress.
- Focused coverage now includes the `sql_transactions-p1`-shaped
  persisted-not-dispatched `PENDING` witness, absent-target `SENDING`
  diagnostics, and broad snapshot assertions for the owner-observed in-flight
  state.
- The representative rerun no longer reports the original `sql_transactions-p1`
  `operation_stalled` / `persisted_not_dispatched` blocker. The fresh normalized
  frontier remains `operation_workflow_owner / workflow_progress`, but its
  semantic state is now `recovering_in_flight` for `replica_operations-p1` and
  `sql_write_operations-p1` with timed-out `PENDING` rows. The same run exposes
  downstream `startup_active_gate_owner / snapshot_coverage` pressure.

## Validation

1. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --explain priority_recovery_partition_progress`
2. Focused operation workflow owner fixture for the `sql_transactions-p1`
   persisted-not-dispatched/no-step-transition witness.
3. Focused operation workflow and dispatch wake/replay tests.
4. Touched-file static guardrails.
5. Representative rolling-restart rerun.

## Validation Results

- PASS:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-sql-write-operations.report.json --explain priority_recovery_partition_progress`
- PASS: `node --test test/rebalancer/operation-workflow-owner-adapter.test.js`
- PASS:
  `node --test test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- PASS: `node --test test/rebalancer/operation-workflow-owner-decision.test.js`
- PASS:
  `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- PASS:
  `node --test test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`
- PASS: `node --test test/control-plane/priority-recovery-snapshot.test.js`
- PASS:
  `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-ports.js src/control-plane/priority-recovery-snapshot-stage-10.js`
- PASS:
  `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-ports.js src/control-plane/priority-recovery-snapshot-stage-10.js`
- PASS:
  `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-ports.js src/control-plane/priority-recovery-snapshot-stage-10.js`
- PASS:
  `git diff --check -- src/rebalancer/operation-workflow-owner-ports.js src/control-plane/priority-recovery-snapshot-stage-10.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js test/control-plane/priority-recovery-snapshot.test.js work/packages/active-20260510-spec-led-runtime-modularization-operation-workflow-progress-sql-transactions-dispatch-pending-frontier.md work/packages/done-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/sprints/current-blocker.json work/sprints/current-blocker.md`
- FAIL, reduced but same owner boundary:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-sql-transactions-dispatch-pending.report.json --fast-local --verbose`
- PASS, classification:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-sql-transactions-dispatch-pending.report.json`
- PASS, evidence block:
  `npm run work:package:evidence-block -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-sql-transactions-dispatch-pending.report.json`
- Fresh representative classification: `priority_recovery_partition_progress`
  remains the first frontier under `operation_workflow_owner /
  workflow_progress`; blocked partitions are `replica_operations-p1` and
  `sql_write_operations-p1`, unresolved semantic state is
  `recovering_in_flight`, reasons are `priority_recovery_progress_blocked` and
  `priority_recovery_event_driven_wait`, and the next expected downstream
  frontier is `startup_active_gate_owner / snapshot_coverage`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Ptolemy (019e10d5-7873-7701-b782-4716edbd594a) reviewed
      `work/packages/done-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Codex fix subagent (019e10d8-3a39-7d33-be03-497183872915) fixed
      `work/packages/done-20260510-spec-led-runtime-modularization-representative-green-proof-or-next-blocker.md`.
- [x] Implementation subagent recorded:
      Agent Rawls (019e10db-d43e-7031-9e1f-60e48f1d813d) implemented
      `work/packages/active-20260510-spec-led-runtime-modularization-operation-workflow-progress-sql-transactions-dispatch-pending-frontier.md`.
