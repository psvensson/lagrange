# Spec-Led Runtime Modularization Operation Workflow Rebalancer Handoff Retry-Scheduled Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
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
    "src/rebalancer/operation-workflow-owner*.js",
    "src/rebalancer/rebalance-coordinator*.js",
    "src/rebalancer/replica-operation-repository*.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*handoff*.test.js",
    "test/rebalancer/*workflow*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/model-ledger.jsonl",
    "work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-retry-scheduled-frontier.md"
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
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-scheduling-event-driven-frontier.md"
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

## Subagent Sequencing Ledger

- [ ] Review subagent recorded:
      pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed:
      pending-before-implementation-resumes.
- [ ] Implementation subagent recorded:
      pending-before-implementation-resumes.

## Detection / Analysis Tasks

- [ ] Review the operation scheduling event-driven package before
      implementation starts.
- [ ] Extract the smallest rebalancer-handoff retry-scheduled fixture from the
      representative report.
- [ ] Trace operation workflow owner handoff retry evidence for created
      priority recovery operations.
- [ ] Identify any diagnostics, retry-log, transport-pressure, or active-gate
      branch that masks handoff owner evidence.

## Implementation Tasks

- [ ] Add or update the focused handoff retry-scheduled fixture.
- [ ] Rewrite the owner logic so retry-scheduled rebalancer handoff has one
      canonical decision path.
- [ ] Delete or guard superseded handoff fallback branches.
- [ ] Update diagnostics/harness consumers only where owner vocabulary changes.
- [ ] Rerun representative rolling-restart and migrate any fresh frontier.

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
