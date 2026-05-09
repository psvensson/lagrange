# Spec-Led Runtime Modularization Operation Workflow Progress Event-Driven Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The workflow timeout transition-deferred package reduced workflow_timeout and rebalancer_handoff evidence. The representative report now fails first on priority_recovery_partition_progress with operation_workflow_owner / workflow_progress, unresolved semantic states operation_stalled and recovering_in_flight, blocked partitions replica_operations-p1 and sql_transactions-p1, and dominant source priority_recovery_workflow_progress_event_driven.",
  "nextAction": "Review the just-closed workflow timeout transition-deferred package, fix any findings, then trace why event-driven workflow progress remains blocked after canonical timeout reentry.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_progress fixture from the representative report",
    "Focused operation workflow progress/reentry tests selected by priority_recovery_workflow_progress_event_driven",
    "Touched-file static guardrails selected by operation_workflow_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner*.js",
    "src/control-plane/priority-recovery-operation-owner-observation.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*workflow*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/distributed/harness/priority-recovery-summary-normalization.js",
    "test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/model-ledger.jsonl",
    "work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-progress-event-driven-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "workflow progress evidence requires changes outside operation_workflow_owner",
      "focused fixture exposes workflow_timeout or rebalancer_handoff again",
      "representative proof still fails on workflow_progress after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-transition-deferred-frontier.md"
}
-->

## Why

The workflow timeout transition-deferred package reduced the timeout and
handoff frontier by routing stale timeout evidence back through the canonical
operation workflow progress path. The representative rerun still fails, but
the first frontier is now event-driven workflow progress under the same owner:
`operation_workflow_owner / workflow_progress`.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-transition-deferred-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the workflow timeout transition-deferred package before
   implementation starts.
2. Freeze the smallest event-driven workflow progress witness from the fresh
   representative report.
3. Trace why dispatch-pending or in-flight operation progress remains blocked
   after timeout reentry.
4. Rewrite the owner path so event-driven workflow progress has one canonical
   decision, effect, retry reason, and re-entry path.
5. Keep workflow timeout, rebalancer handoff, and publication ACK convergence
   satisfied.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Workflow timeout transition-deferred handling; that is predecessor proof.
2. Rebalancer handoff retry scheduling; that is earlier predecessor proof.
3. Publication ACK convergence; that is earlier predecessor proof.
4. Active-gate report schema alias deletion.
5. Harness timeout increases, report relabeling, or fallback workflow
   classification.
6. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / workflow_progress`.
2. `priority_recovery_workflow_progress_event_driven` must come from
   operation workflow owner evidence, not from diagnostics reconstructing
   progress from raw active-gate blockers.
3. `operation_stalled` and `recovering_in_flight` must resolve through one
   canonical workflow-progress decision table.
4. No package-owned change may regress the reduced `workflow_timeout`,
   `rebalancer_handoff`, or publication ACK convergence edges.

## Tactical Inspiration

1. Temporal workflow histories: event-driven progress must be replayable owner
   history, not a consumer-side guess from elapsed time.
2. Kubernetes controllers: progress waits need stable conditions, explicit
   requeue causes, and one owning reconciler.
3. Raft controller logs: workflow progress, timeout reentry, and handoff
   events must be ordered through one owner path.
4. CockroachDB allocator-style phases: separate evidence collection, decision,
   effect emission, and durable observation.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: workflow progress evidence requires changes outside
  `operation_workflow_owner`; focused fixture exposes `workflow_timeout` or
  `rebalancer_handoff` again; representative proof still fails on
  `workflow_progress` after owner fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
operation workflow progress boundary, unresolved semantic states, blocked
partition ids, workflow progress event-driven reason, workflow outcome, and
owner reason `priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, operation
workflow tests, priority recovery diagnostics, and sprint/package handoff
notes.

Prohibited reinterpretations: do not treat workflow progress as workflow
timeout, rebalancer handoff, publication ACK convergence, startup snapshot
coverage, generic readiness failure, or a harness timeout. Do not add fallback
workflow classification outside the operation workflow owner.

Primary diagnostics / proof surfaces: workflow-progress fixture, topology
convergence explain output, focused operation workflow/reentry tests, static
guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `workflow_progress`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked, priority_recovery_event_driven_wait`
- Source: `unresolvedSemanticStateIds: operation_stalled,recovering_in_flight`,
  `blockedPartitionIds: replica_operations-p1,sql_transactions-p1`,
  `dominantReason: priority_recovery_workflow_progress_event_driven`,
  `failureClass: priority_recovery_progress_blocked`.
- Representative dominant witness: `sql_transactions-p1`, next required
  action `advance_existing_operation`, blocking boundary `workflow_progress`,
  wait mode `event_driven`, workflow progress phase `dispatch_pending`,
  latest workflow step `SENDING`, latest operation status `pending`.
- Serial wait evidence also keeps `replica_operations-p1` blocked in workflow
  progress.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json --explain priority_recovery_partition_progress`

## Subagent Sequencing Ledger

- [ ] Review subagent recorded:
      pending-before-implementation-resumes.
- [ ] Fix subagent recorded or explicitly not needed:
      pending-review-result.
- [ ] Implementation subagent recorded:
      pending-before-implementation-resumes.

## Detection / Analysis Tasks

- [ ] Review the workflow timeout transition-deferred package before
      implementation starts.
- [ ] Extract the smallest workflow-progress event-driven fixture from the
      representative report.
- [ ] Trace the operation workflow owner progress path for dispatch-pending
      and recovering in-flight priority recovery work.
- [ ] Identify any diagnostics, retry-log, or active-gate branch that masks
      workflow progress owner evidence.

## Implementation Tasks

- [ ] Add or update the focused workflow-progress fixture.
- [ ] Rewrite the owner logic so event-driven workflow progress has one
      canonical decision path.
- [ ] Delete or guard superseded progress fallback branches.
- [ ] Update diagnostics/harness consumers only where owner vocabulary changes.
- [ ] Rerun representative rolling-restart and migrate any fresh frontier.

## Validation

1. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json --explain priority_recovery_partition_progress`
2. Focused operation workflow progress/reentry tests selected by
   `operation_workflow_owner`.
3. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
4. `git diff --check`
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-progress-event-driven.report.json --fast-local --verbose`

## Done When

1. Workflow progress has one owner-bound decision path.
2. Focused operation workflow and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
