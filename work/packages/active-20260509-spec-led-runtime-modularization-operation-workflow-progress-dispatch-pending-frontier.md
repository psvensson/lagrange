# Spec-Led Runtime Modularization Operation Workflow Progress Dispatch-Pending Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The rebalancer handoff retry-scheduled package removed the stale handoff witness from the representative priority recovery summary. The fresh representative report now fails first on priority_recovery_partition_progress with operation_workflow_owner / workflow_progress, dominant source priority_recovery_workflow_progress_event_driven, priorityRecoveryInvariants passed, and recovery operations stuck in dispatch_pending or waiting-progress states without step transitions.",
  "nextAction": "Review the just-closed rebalancer handoff retry-scheduled package, fix any findings, then trace why dispatch-pending priority recovery operations remain event-driven without canonical workflow progress.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_progress fixture from the representative report",
    "Focused operation workflow owner dispatch-pending/no-step-transition tests selected by priority_recovery_workflow_progress_event_driven",
    "Touched-file static guardrails selected by operation_workflow_owner and priority recovery workflow progress",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json --fast-local --verbose"
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
    "work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "workflow progress evidence requires changes outside operation_workflow_owner or dispatch service wake/replay",
      "focused fixture exposes operation_scheduling, rebalancer_handoff, or workflow_timeout again",
      "representative proof still fails on the same dispatch_pending no-step-transition witness after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-retry-scheduled-frontier.md"
}
-->

## Why

The retry-scheduled handoff package proved the representative blocker was
partly diagnostic shadowing: a stale dispatch retry-log handoff witness was
masking newer workflow progress for the same operation. After that correction,
the first blocker is the underlying owner problem: priority recovery operations
exist but remain dispatch-pending or waiting for progress without canonical
workflow transitions.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-retry-scheduled-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the rebalancer handoff retry-scheduled package before implementation
   starts.
2. Freeze the smallest workflow-progress dispatch-pending witness from the
   fresh representative report.
3. Trace operation workflow owner, dispatch service wake/replay, and priority
   recovery snapshot evidence for operations with no step transitions.
4. Rewrite the workflow-progress path so persisted-not-dispatched,
   dispatched-waiting-progress, and transition-deferred evidence resolve
   through one owner decision and effect path.
5. Keep operation scheduling, rebalancer handoff, workflow timeout, and
   publication ACK convergence satisfied.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Rebalancer leader operation scheduling; that is predecessor proof.
2. Rebalancer handoff retry-log summary shadowing; that is predecessor proof.
3. Workflow timeout handling; that is earlier predecessor proof.
4. Active-gate report schema alias deletion.
5. Harness timeout increases, report relabeling, or fallback workflow-progress
   classification.
6. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / workflow_progress` for the dominant witness.
2. `priority_recovery_workflow_progress_event_driven` must come from owner
   workflow evidence, not from diagnostics reconstructing stalled operations
   from raw logs.
3. Dispatch-pending, waiting-progress, and transition-deferred observations
   must resolve through one canonical workflow-progress decision table.
4. No package-owned change may regress the reduced `operation_scheduling`,
   `rebalancer_handoff`, `workflow_timeout`, or publication ACK convergence
   edges.

## Tactical Inspiration

1. Temporal workflow history: persisted work must replay deterministically from
   durable history, and workers must not reinterpret stale local state.
2. Kubernetes controllers: status conditions name the owning reconcile action
   and requeue cause instead of leaving consumers to infer stalled progress.
3. Raft controller logs: operation creation, dispatch, and step advancement are
   ordered through one owner log.
4. SRE diagnostic pipelines: diagnostics select the dominant witness from
   canonical owner output and remain read-only.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: workflow progress evidence requires changes outside
  `operation_workflow_owner` or dispatch service wake/replay; focused fixture
  exposes `operation_scheduling`, `rebalancer_handoff`, or `workflow_timeout`
  again; representative proof still fails on the same dispatch-pending
  no-step-transition witness after owner fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
workflow progress boundary, workflow progress phase, operation id, partition id,
latest workflow step, latest operation status, actuation state, next required
action, and owner reason `priority_recovery_progress_blocked`.

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

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `workflow_progress`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked`
- Source: `unresolvedSemanticStateIds: needs_operation,operation_stalled`,
  `blockedPartitionIds: control_plane_publications-p1,replica_operations-p1,sql_transaction_participants-p1,sql_transactions-p1`,
  `dominantReason: priority_recovery_workflow_progress_event_driven`,
  `failureClass: priority_recovery_progress_blocked`.
- Representative dominant witness: `control_plane_publications-p1`, semantic
  state `operation_stalled`, progress class
  `operation_created_but_no_step_transitions`, actuation state
  `persisted_not_dispatched`, workflow phase `dispatch_pending`, latest
  workflow step `PENDING`, latest operation status `pending`, next required
  action `advance_existing_operation`.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json --explain priority_recovery_partition_progress`

## Subagent Observability Contract

Subagent waits for this package are checkpointed instead of blind long waits.
Each subagent prompt must ask for concrete file paths, current hypothesis,
validation status, and blocker status. The parent session records timeout or
stall outcomes in this package instead of converting missing output into proof.

## Subagent Observability Notes

- Plato (019e0e15-6411-7330-92a4-43eaadefe310) was assigned predecessor
  review, missed two checkpoint windows, and was closed without proof.
- Anscombe (019e0e19-533a-7303-984c-0d76ae0e1436) was assigned replacement
  predecessor review, missed a checkpoint window, and was closed without proof.
- Kepler (019e0e1c-0fc3-7922-83bc-7d2066b95f50) was assigned narrow
  predecessor review, missed a checkpoint window, and was closed without proof.
- Dirac (019e0e1d-6541-79f2-ba39-52c1d38b7f15) completed predecessor review;
  result `fixes-required`.
- Lagrange (019e0e1e-6eb2-7141-9ae0-3fc9c3c467e6) completed the fresh fix
  role; result `waiver-required` because no truthful docs-only fix can invent
  missing historical implementation-subagent proof for the predecessor.
- Human waiver recorded on 2026-05-09: waive the missing standalone
  implementation-subagent proof for
  `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-retry-scheduled-frontier.md`
  and allow successor package implementation to proceed despite that sequencing
  gap.
- Volta (019e0e62-50b0-73b0-9930-ac0a711f4353) was assigned implementation,
  returned a checkpoint diagnosis, and made no changes; it is not used as
  implementation proof.
- Dewey (019e0e64-1a98-7540-86a7-97cd13049755) completed implementation;
  result `implemented`.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Dirac (019e0e1d-6541-79f2-ba39-52c1d38b7f15) reviewed
      `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-retry-scheduled-frontier.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Lagrange (019e0e1e-6eb2-7141-9ae0-3fc9c3c467e6) fixed
      `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-retry-scheduled-frontier.md`;
      result `waiver-required`.
- [x] Implementation subagent recorded:
      Agent Dewey (019e0e64-1a98-7540-86a7-97cd13049755) implemented
      `work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md`.

## Detection / Analysis Tasks

- [x] Review the rebalancer handoff retry-scheduled package before
      implementation starts.
- [x] Extract the smallest workflow-progress dispatch-pending fixture from the
      representative report.
- [x] Trace operation workflow owner and dispatch service wake/replay evidence
      for operations with no step transitions.
- [x] Identify any diagnostics, retry-log, timeout, or active-gate branch that
      masks workflow progress owner evidence.

## Implementation Tasks

- [x] Add or update the focused workflow-progress dispatch-pending fixture.
- [x] Rewrite the owner logic so event-driven workflow progress has one
      canonical decision path.
- [x] Delete or guard superseded workflow-progress fallback branches.
- [x] Update diagnostics/harness consumers only where owner vocabulary changes.
- [x] Rerun representative rolling-restart and migrate any fresh frontier.

## Implementation Notes

- Implemented slice:
  `src/rebalancer/operation-workflow-owner-segment-7-stage-5.js` no longer
  requires `operationOwnerObservation.effectCommand` or
  `timeoutReconcileDue` before dispatch-pending event-driven recovery
  schedules owner-key re-entry. The scheduler now consumes the already
  normalized owner-advance and dispatch-pending evidence and lets
  `armCoordinatorCreatedOperation` run the canonical owner decision/effect.
- Focused regression:
  `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
  strips `operationOwnerObservation` from a persisted-not-dispatched
  event-driven snapshot with `timeoutReconcileDue: false` and proves re-entry
  still enqueues owner work.
- Diagnostics/harness vocabulary:
  no owner vocabulary changed; no diagnostics consumer update was required.

## Validation Notes

- Passed:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json --explain priority_recovery_partition_progress`
- Passed:
  `node --test test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
- Passed:
  `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
- Passed:
  `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`
- Passed:
  `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`
- Passed:
  `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-7-stage-5.js`
- Passed:
  `git diff --check -- src/rebalancer/operation-workflow-owner-segment-7-stage-5.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md`
- Failed with migrated frontier:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json --fast-local --verbose`

## Migrated Frontier

- Fresh representative frontier:
  `priority_recovery_partition_progress`.
- Owner/boundary:
  `rebalancer_leader / operation_scheduling`.
- Dominant source:
  `priority_recovery_operation_scheduling_event_driven`.
- Dominant semantic states:
  `needs_operation`, `operation_stalled`, `recovering_in_flight`.
- Dominant progress class:
  `eligible_but_no_operation_created`.
- Dominant witness:
  `sql_write_operations-p1`, semantic state `needs_operation`, actuation state
  `action_required`, workflow phase `none`, latest workflow step
  `unavailable`, latest operation status `unavailable`, next required action
  `create_recovery_operation`.
- Package-owned edge status:
  the previous `operation_workflow_owner / workflow_progress`
  dispatch-pending witness no longer dominates. The remaining blocker is
  rebalancer leader operation scheduling for a priority partition with no
  recovery operation.

## Validation

1. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json --explain priority_recovery_partition_progress`
2. Focused operation workflow and dispatch wake/replay tests selected by
   `priority_recovery_workflow_progress_event_driven`.
3. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
4. `git diff --check`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-dispatch-pending.report.json --fast-local --verbose`

## Done When

1. Workflow progress has one owner-bound dispatch-pending decision path.
2. Focused operation workflow, dispatch service, and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
