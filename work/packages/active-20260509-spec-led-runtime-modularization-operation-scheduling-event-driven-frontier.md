# Spec-Led Runtime Modularization Operation Scheduling Event-Driven Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven/rolling-restart/",
  "owner": "rebalancer_leader",
  "boundary": "operation_scheduling",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The operation workflow progress event-driven package removed the operation_workflow_owner / workflow_progress blocker as the dominant frontier. The representative report now fails first on priority_recovery_partition_progress with rebalancer_leader / operation_scheduling, dominant witness replica_operations-p1, semantic state needs_operation, progress class eligible_but_no_operation_created, and next required action create_recovery_operation.",
  "nextAction": "Review the just-closed operation workflow progress event-driven package, fix any findings, then trace why the rebalancer leader does not create the required priority recovery operation for replica_operations-p1.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven.report.json --explain priority_recovery_partition_progress",
    "Focused rebalancer_leader operation_scheduling fixture from the representative report",
    "Focused operation scheduling/admission tests selected by priority_recovery_operation_scheduling_event_driven",
    "Touched-file static guardrails selected by rebalancer_leader and priority recovery scheduling",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer*.js",
    "src/rebalancer/move-planner*.js",
    "src/rebalancer/provisioning-admission-policy.js",
    "src/rebalancer/operation-workflow-owner*.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*operation-scheduling*.test.js",
    "test/rebalancer/*priority-recovery*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/model-ledger.jsonl",
    "work/packages/active-20260509-spec-led-runtime-modularization-operation-scheduling-event-driven-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "operation scheduling evidence requires changes outside rebalancer leader admission or priority recovery scheduling",
      "focused fixture exposes workflow_progress, workflow_timeout, or rebalancer_handoff again",
      "representative proof still fails on operation_scheduling after rebalancer leader fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-event-driven-frontier.md"
}
-->

## Why

The event-driven workflow-progress owner slice now preserves late executor
outcomes and re-enters dispatch-pending work through the operation workflow
owner. The representative proof still fails, but the first actionable frontier
has moved outward to the rebalancer leader: `replica_operations-p1` needs a
priority recovery operation and no operation exists.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-event-driven-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the operation workflow progress event-driven package before
   implementation starts.
2. Freeze the smallest operation-scheduling witness for `replica_operations-p1`.
3. Trace rebalancer leader priority recovery scheduling, admission, and
   pre-execution handoff for the selected witness.
4. Rewrite the scheduling path so `eligible_but_no_operation_created` emits one
   canonical scheduling decision, effect, retry reason, and durable observation.
5. Keep publication ACK convergence and the reduced workflow-progress owner
   edge satisfied.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Operation workflow progress event-driven handling; that is predecessor
   proof.
2. Workflow timeout and rebalancer handoff handling; those are predecessor
   proofs.
3. Publication ACK convergence; that is earlier predecessor proof.
4. Active-gate report schema alias deletion.
5. Harness timeout increases, report relabeling, or fallback scheduling
   classification.
6. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `rebalancer_leader / operation_scheduling` for the dominant witness.
2. `eligible_but_no_operation_created` must come from rebalancer leader
   scheduling evidence, not from diagnostics reconstructing absence from raw
   active-gate blockers.
3. Operation creation, serial wait, and pre-execution deferral must resolve
   through one canonical scheduling decision table.
4. No package-owned change may regress the reduced `workflow_progress`,
   `workflow_timeout`, `rebalancer_handoff`, or publication ACK convergence
   edges.

## Tactical Inspiration

1. Kubernetes scheduler phases: filter, reserve, and bind are distinct
   decisions with explicit failure reasons.
2. CockroachDB allocator: repair candidates should produce a stable allocator
   decision and durable reason, not scattered preflight skips.
3. Kubernetes controllers: missing desired work is reconciled by the owning
   controller and exposed as status, not inferred by consumers.
4. Temporal workflow commands: scheduling effects are emitted once from a
   canonical decision and retried by owner history.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: operation scheduling evidence requires changes outside
  rebalancer leader admission or priority recovery scheduling; focused fixture
  exposes `workflow_progress`, `workflow_timeout`, or `rebalancer_handoff`
  again; representative proof still fails on `operation_scheduling` after
  rebalancer leader fix.

## Shared Boundary Contract

Semantic owner: `rebalancer_leader`.

Canonical contract shape / vocabulary: priority recovery progress edge,
operation scheduling boundary, unresolved semantic states, blocked partition
ids, operation scheduling event-driven reason, scheduling outcome, and owner
reason `priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, rebalancer
leader tests, priority recovery diagnostics, and sprint/package handoff notes.

Prohibited reinterpretations: do not treat operation scheduling as workflow
progress, workflow timeout, rebalancer handoff, publication ACK convergence,
startup snapshot coverage, generic readiness failure, or a harness timeout. Do
not add fallback scheduling classification outside the rebalancer leader.

Primary diagnostics / proof surfaces: operation-scheduling fixture, topology
convergence explain output, focused rebalancer scheduling/admission tests,
static guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `rebalancer_leader`
- Current boundary: `operation_scheduling`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked, priority_recovery_event_driven_wait`
- Source: `unresolvedSemanticStateIds: needs_operation,recovering_in_flight`,
  `blockedPartitionIds: control_plane_publications-p1,replica_operations-p1,sql_transaction_participants-p1,sql_transactions-p1,sql_write_operations-p1`,
  `dominantReason: priority_recovery_operation_scheduling_event_driven`,
  `failureClass: priority_recovery_progress_blocked`.
- Representative dominant witness: `replica_operations-p1`, semantic state
  `needs_operation`, progress class `eligible_but_no_operation_created`, next
  required action `create_recovery_operation`, no operation ids, blocking
  boundary `operation_scheduling`, wait mode `event_driven`.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven.report.json --explain priority_recovery_partition_progress`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Lorentz (019e0dbc-fba9-70b2-a1ee-2fb865733774) reviewed
      `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-event-driven-frontier.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Goodall (019e0dcc-13be-7241-b34e-1e27dc48d7a9) fixed
      `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-progress-event-driven-frontier.md`.
- [ ] Implementation subagent recorded:
      pending-before-implementation-resumes.

## Detection / Analysis Tasks

- [ ] Review the operation workflow progress event-driven package before
      implementation starts.
- [ ] Extract the smallest operation-scheduling fixture from the representative
      report.
- [ ] Trace rebalancer leader scheduling/admission for
      `eligible_but_no_operation_created`.
- [ ] Identify any diagnostics, admission, or active-gate branch that masks
      operation scheduling owner evidence.

## Implementation Tasks

- [ ] Add or update the focused operation-scheduling fixture.
- [ ] Rewrite the owner logic so event-driven operation scheduling has one
      canonical decision path.
- [ ] Delete or guard superseded scheduling fallback branches.
- [ ] Update diagnostics/harness consumers only where owner vocabulary changes.
- [ ] Rerun representative rolling-restart and migrate any fresh frontier.

## Validation

1. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven.report.json --explain priority_recovery_partition_progress`
2. Focused rebalancer leader scheduling/admission tests selected by
   `priority_recovery_operation_scheduling_event_driven`.
3. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
4. `git diff --check`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-scheduling-event-driven.report.json --fast-local --verbose`

## Done When

1. Operation scheduling has one owner-bound decision path.
2. Focused rebalancer leader and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
