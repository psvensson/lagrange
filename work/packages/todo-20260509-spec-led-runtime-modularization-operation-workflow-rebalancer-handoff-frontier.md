# Spec-Led Runtime Modularization Operation Workflow Rebalancer Handoff Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-publication-convergence/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "rebalancer_handoff",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The publication convergence package closed publication_ack_convergence. The representative report now fails first on priority_recovery_partition_progress with operation_workflow_owner / rebalancer_handoff, unresolved semantic states needs_operation and operation_stalled, and blocked partitions replica_operations-p1, sql_transactions-p1, and sql_write_operations-p1.",
  "nextAction": "Review the publication convergence package, freeze the rebalancer handoff witness, then trace why the priority recovery operation workflow remains in retry-scheduled handoff instead of progressing through the canonical workflow owner.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner rebalancer_handoff fixture from the representative report",
    "Focused operation workflow/rebalancer handoff tests selected by priority_recovery_progress_blocked",
    "Touched-file static guardrails selected by operation_workflow_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner*.js",
    "src/rebalancer/*handoff*.js",
    "src/rebalancer/unified-rebalancer*.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*workflow*.test.js",
    "test/rebalancer/*handoff*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "rebalancer handoff evidence requires changes outside operation_workflow_owner",
      "focused fixture exposes publication ACK convergence again",
      "representative proof still fails on rebalancer_handoff after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md"
}
-->

## Why

The publication convergence package closed the pending ACK residual. The
representative rerun still fails, but the first frontier moved to
`operation_workflow_owner / rebalancer_handoff` on
`priority_recovery_partition_progress`.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the publication convergence package before implementation starts.
2. Freeze the smallest rebalancer handoff witness from the representative
   report.
3. Trace operation workflow owner handoff for retry-scheduled priority
   recovery work.
4. Rewrite the owner path so rebalancer handoff has one canonical workflow
   outcome, retry reason, and re-entry path.
5. Keep diagnostics and harness consumers read-only and owner-bound.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Publication ACK convergence; that is predecessor proof.
2. Active-gate report schema alias deletion.
3. Harness timeout increases, report relabeling, or fallback workflow
   classification.
4. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / rebalancer_handoff`.
2. `priority_recovery_progress_blocked` must come from operation workflow
   owner evidence, not from diagnostics reconstructing retry-scheduled state
   from raw active-gate blockers.
3. `needs_operation` and `operation_stalled` must resolve through one
   canonical handoff decision table.
4. Publication ACK convergence must stay satisfied while this frontier is
   reduced.

## Tactical Inspiration

1. Temporal workflow histories: handoff retry state is durable owner history,
   not a consumer-side timeout guess.
2. Kubernetes controllers: retry-scheduled status needs one owning controller,
   stable reason codes, and explicit re-entry conditions.
3. Raft controller logs: membership and rebalancer handoff events must be
   ordered through a single owner path.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: rebalancer handoff evidence requires changes outside
  `operation_workflow_owner`; focused fixture exposes publication ACK
  convergence again; representative proof still fails on `rebalancer_handoff`
  after owner fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
operation workflow handoff boundary, unresolved semantic states, blocked
partition ids, retry-scheduled handoff reason, workflow outcome, and owner
reason `priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, operation
workflow tests, priority recovery diagnostics, and sprint/package handoff
notes.

Prohibited reinterpretations: do not treat rebalancer handoff as publication
ACK convergence, startup snapshot coverage, generic readiness failure, or a
harness timeout. Do not add fallback workflow classification outside the
operation workflow owner.

Primary diagnostics / proof surfaces: rebalancer-handoff fixture, topology
convergence explain output, focused operation workflow/rebalancer tests,
static guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `rebalancer_handoff`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked`
- Source: `unresolvedSemanticStateIds: needs_operation,operation_stalled`,
  `blockedPartitionIds: replica_operations-p1,sql_transactions-p1,sql_write_operations-p1`,
  `dominantReason: priority_recovery_rebalancer_handoff_retry_scheduled`,
  `failureClass: priority_recovery_progress_blocked`.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain priority_recovery_partition_progress`

## Detection / Analysis Tasks

- [ ] Review the publication convergence package before implementation
      starts.
- [ ] Extract the smallest rebalancer handoff fixture from the representative
      report.
- [ ] Trace the operation workflow owner handoff path for
      retry-scheduled priority recovery work.
- [ ] Identify any diagnostics or active-gate branch that masks handoff owner
      evidence.

## Implementation Tasks

- [ ] Add or update the focused rebalancer handoff fixture.
- [ ] Rewrite the owner logic so rebalancer handoff has one canonical decision
      path.
- [ ] Delete or guard superseded handoff fallback branches.
- [ ] Update diagnostics/harness consumers only where owner vocabulary changes.
- [ ] Rerun representative rolling-restart and migrate any fresh frontier.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain priority_recovery_partition_progress`
3. Focused operation workflow/rebalancer handoff tests selected by
   `operation_workflow_owner`.
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --fast-local --verbose`

## Done When

1. Rebalancer handoff has one owner-bound decision path.
2. Focused operation workflow and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
