# Spec-Led Runtime Modularization Operation Workflow Rebalancer Handoff Retry-Scheduled Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The operation scheduling event-driven package moved the representative proof past rebalancer_leader / operation_scheduling. The fresh representative report now fails first on priority_recovery_partition_progress with operation_workflow_owner / rebalancer_handoff, dominant source priority_recovery_rebalancer_handoff_retry_scheduled, priorityRecoveryInvariants passed, and transport backpressure deferring remote handoff progress.",
  "nextAction": "Review the just-closed operation scheduling event-driven package, fix any findings, then trace why retry-scheduled rebalancer handoff remains blocked after recovery operations are created for the priority partitions.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner rebalancer_handoff fixture from the representative report",
    "Focused handoff/retry tests selected by priority_recovery_rebalancer_handoff_retry_scheduled",
    "Touched-file static guardrails selected by operation_workflow_owner and rebalancer handoff",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "test/distributed/harness/priority-recovery-summary-normalization.js",
    "test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/model-ledger.jsonl",
    "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-retry-scheduled-frontier.md",
    "work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md",
    "work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-event-driven-frontier.md",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "handoff retry evidence requires changes outside operation_workflow_owner or rebalance coordinator handoff",
      "focused fixture exposes operation_scheduling or workflow_progress again",
      "representative proof still fails on rebalancer_handoff after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-event-driven-frontier.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-progress-dispatch-pending-frontier.md"
}
-->

## Why

The scheduling package proved the rebalancer leader now creates the required
priority recovery operations. The fresh representative report still fails, but
the first blocker has moved to handoff progress: operations are created and then
retry-scheduled while remote dispatch is blocked by transport pressure.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-event-driven-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the operation scheduling event-driven package before implementation
   starts.
2. Freeze the smallest retry-scheduled handoff witness from the fresh
   representative report.
3. Trace operation workflow owner handoff retry evidence for priority recovery
   operations created under transport backpressure.
4. Rewrite the handoff path so created remote handoff, retry scheduling, and
   durable workflow observation resolve through one canonical owner decision.
5. Keep operation scheduling, workflow progress, workflow timeout, and
   publication ACK convergence satisfied.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Rebalancer leader operation scheduling; that is predecessor proof.
2. Event-driven workflow progress and workflow timeout handling; those are
   predecessor proofs.
3. Publication ACK convergence; that is earlier predecessor proof.
4. Active-gate report schema alias deletion.
5. Harness timeout increases, report relabeling, or fallback handoff
   classification.
6. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / rebalancer_handoff` for the dominant witness.
2. `priority_recovery_rebalancer_handoff_retry_scheduled` must come from owner
   handoff evidence, not from diagnostics reconstructing transport failure from
   raw logs.
3. Created remote handoff, dispatch retry, and workflow visibility must resolve
   through one canonical handoff decision table.
4. No package-owned change may regress the reduced `operation_scheduling`,
   `workflow_progress`, `workflow_timeout`, or publication ACK convergence
   edges.

## Tactical Inspiration

1. Temporal workflow commands: a scheduled command records retryable handoff
   state durably and replays through owner history.
2. Kubernetes controllers: failed remote delivery is reconciled by the owning
   controller through stable status and requeue causes.
3. Raft controller logs: operation creation and remote dispatch handoff must be
   ordered through one owner path.
4. SRE diagnostic pipelines: transport pressure can explain delay, but it must
   not replace the owner decision that names the next action.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: handoff retry evidence requires changes outside
  `operation_workflow_owner` or rebalance coordinator handoff; focused fixture
  exposes `operation_scheduling` or `workflow_progress` again; representative
  proof still fails on `rebalancer_handoff` after owner fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
rebalancer handoff boundary, retry-scheduled handoff reason, workflow outcome,
operation id, partition id, target node id, and owner reason
`priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, operation
workflow tests, rebalance coordinator tests, priority recovery diagnostics, and
sprint/package handoff notes.

Prohibited reinterpretations: do not treat rebalancer handoff as operation
scheduling, workflow progress, workflow timeout, publication ACK convergence,
startup snapshot coverage, generic readiness failure, or a harness timeout. Do
not add fallback handoff classification outside the operation workflow owner.

Primary diagnostics / proof surfaces: handoff retry fixture, topology
convergence explain output, focused operation workflow/rebalance coordinator
tests, static guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `rebalancer_handoff`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked, priority_recovery_event_driven_wait`
- Source: `unresolvedSemanticStateIds: needs_operation,recovering_in_flight`,
  `blockedPartitionIds: control_plane_publications-p1,replica_operations-p1,sql_transaction_participants-p1,sql_transactions-p1,sql_write_operations-p1`,
  `dominantReason: priority_recovery_rebalancer_handoff_retry_scheduled`,
  `failureClass: priority_recovery_progress_blocked`.
- Representative proof note: priority recovery invariants passed and the
  playback created recovery operations for the priority partitions before the
  handoff retry frontier dominated.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven.report.json --explain priority_recovery_partition_progress`

## Subagent Sequencing Exception

The predecessor review/fix sequence was real:
Agent Maxwell (019e0df1-2f33-75d0-bb09-f20d590b0a46) reviewed
`work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-event-driven-frontier.md`;
result `fixes-required`. Agent Beauvoir
(019e0df2-ee73-72c2-ac00-5738690f4963) fixed
`work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-event-driven-frontier.md`.

This package does not have truthful standalone implementation-subagent proof.
Curie (019e0df8-3cd3-7f63-9af1-23d856a38bcc) analyzed the blocker and made a
partial patch that did not land in the final tree. Avicenna
(019e0dfd-eb51-72d0-8ae2-074450d12a0e) reported no edits. Fermat
(019e0dff-862b-7630-b606-09bc679f0e03) did not provide a final status before
closure; the parent session retained the focused fixture and completed the
normalizer implementation after the subagent stall. Do not treat those agent
attempts as a clean implementation-subagent ledger without a human waiver.

## Detection / Analysis Tasks

- [x] Review the operation scheduling event-driven package before
      implementation starts.
- [x] Extract the smallest rebalancer-handoff retry-scheduled fixture from the
      representative report.
- [x] Trace operation workflow owner handoff retry evidence for created
      priority recovery operations.
- [x] Identify any diagnostics, retry-log, transport-pressure, or active-gate
      branch that masks handoff owner evidence.

## Implementation Tasks

- [x] Add or update the focused handoff retry-scheduled fixture.
- [x] Rewrite the owner logic so retry-scheduled rebalancer handoff has one
      canonical decision path.
- [x] Delete or guard superseded handoff fallback branches.
- [x] Update diagnostics/harness consumers only where owner vocabulary changes.
- [x] Rerun representative rolling-restart and migrate any fresh frontier.

## Implementation Evidence

- Frozen fixture:
  `test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
  now covers the representative same-operation witness order where a later
  dispatch retry-log handoff witness must not supersede newer canonical target
  creation workflow progress.
- Root cause: priority recovery summary normalization used freshness alone
  after a narrow dispatch retry-log exception. A later stale retry log could
  dominate a same-operation workflow progress witness even after the operation
  had advanced beyond handoff.
- Harness logic change:
  `test/distributed/harness/priority-recovery-summary-normalization.js` now
  builds a witness supersession evidence snapshot, resolves it through an
  explicit table, and falls back to freshness only when no dispatch-retry
  supersession rule matches.
- Deletion/guarding change: the old inline special-case handoff comparison is
  replaced with the table-driven witness supersession path. Workflow progress
  phases `target_creation`, `target_sync`, `source_removal`, and `terminal`
  now explicitly supersede dispatch retry-log handoff evidence for the same
  operation.
- Subagent observability: stalled implementation agents were closed rather
  than waited on blindly. The package records the implementation-subagent proof
  gap explicitly instead of converting partial or missing agent output into a
  false ledger entry.

## Validation Results

- Red/green fixture:
  `node --test test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js`
  first failed with `rebalancer_handoff` selected instead of
  `workflow_progress`, then passed with 11 tests after the table rewrite.
- `node --test test/scripts/analyze-topology-convergence.test.js`
  passed with 12 tests.
- Static guardrails passed for the touched harness files: literal guideline,
  decision-boundary guideline, runtime grammar, and `git diff --check`.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json`
  reports the first frontier as
  `operation_workflow_owner / workflow_progress`.
- `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json`
  reports root cause `topology` and dominant reason
  `priority_recovery_workflow_progress_event_driven`.
- Representative command wrote
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json`
  and failed on a migrated frontier:
  `operation_workflow_owner / workflow_progress`.

## Migrated Frontier

- Fresh representative frontier:
  `priority_recovery_partition_progress`.
- Owner/boundary:
  `operation_workflow_owner / workflow_progress`.
- Dominant source:
  `priority_recovery_workflow_progress_event_driven`.
- Dominant semantic states:
  `needs_operation`, `operation_stalled`.
- Dominant progress classes:
  `priority_operation_serial_wait`,
  `operation_created_but_no_step_transitions`.
- Dominant witness:
  `control_plane_publications-p1`, semantic state `operation_stalled`,
  actuation state `persisted_not_dispatched`, workflow phase
  `dispatch_pending`, latest workflow step `PENDING`, latest operation status
  `pending`, next required action `advance_existing_operation`.
- Package-owned edge status:
  the previous `operation_workflow_owner / rebalancer_handoff` retry-scheduled
  witness no longer dominates. The remaining blocker is workflow progress for
  persisted or dispatched recovery operations that do not transition.

## Validation

1. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven.report.json --explain priority_recovery_partition_progress`
2. Focused operation workflow/rebalance coordinator handoff tests selected by
   `priority_recovery_rebalancer_handoff_retry_scheduled`.
3. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
4. `git diff --check`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff-retry-scheduled.report.json --fast-local --verbose`

## Done When

1. Rebalancer handoff has one owner-bound retry decision path.
2. Focused operation workflow, rebalance coordinator, and diagnostics tests
   pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.

## Commit And Push Ledger

1. Focused package commit: `7cf3f9c2`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
