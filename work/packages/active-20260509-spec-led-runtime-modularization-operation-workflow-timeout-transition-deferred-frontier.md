# Spec-Led Runtime Modularization Operation Workflow Timeout Transition-Deferred Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_timeout",
  "dominantReason": "priority_recovery_progress_blocked",
  "currentState": "The rebalancer handoff package reduced retry-scheduled handoff to a canonical operation workflow owner outcome. The representative report now fails first on priority_recovery_partition_progress with operation_workflow_owner / workflow_timeout, unresolved semantic states operation_stalled and recovering_in_flight, blocked partitions control_plane_publications-p1, replica_operations-p1, and sql_transaction_participants-p1, and dominant source priority_recovery_workflow_timeout_transition_deferred.",
  "nextAction": "With the rebalancer handoff review/fix gates recorded, assign the implementation subagent to freeze the workflow-timeout transition-deferred witness and trace why operation workflow timeout evidence remains transition-deferred instead of re-entering the canonical owner progression path.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --explain priority_recovery_partition_progress",
    "Focused operation_workflow_owner workflow_timeout fixture from the representative report",
    "Focused operation workflow timeout/reentry tests selected by priority_recovery_workflow_timeout_transition_deferred",
    "Touched-file static guardrails selected by operation_workflow_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner*.js",
    "src/rebalancer/*handoff*.js",
    "src/rebalancer/unified-rebalancer*.js",
    "src/control-plane/priority-recovery-operation-owner-observation.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "test/rebalancer/*workflow*.test.js",
    "test/rebalancer/*handoff*.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/distributed/harness/failure-bundle-segment-3.js",
    "test/distributed/harness/__tests__/priority-recovery-summary-normalization.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/model-ledger.jsonl",
    "work/packages/active-20260509-spec-led-runtime-modularization-operation-workflow-timeout-transition-deferred-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "workflow timeout evidence requires changes outside operation_workflow_owner",
      "focused fixture exposes rebalancer_handoff again",
      "representative proof still fails on workflow_timeout after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md"
}
-->

## Why

The rebalancer handoff package closed the retry-scheduled handoff boundary.
The representative rerun still fails, but the first frontier moved to
`operation_workflow_owner / workflow_timeout` on
`priority_recovery_partition_progress`.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Review the rebalancer handoff package before implementation starts.
2. Freeze the smallest workflow-timeout transition-deferred witness from the
   representative report.
3. Trace operation workflow owner timeout and re-entry handling for
   transition-deferred priority recovery work.
4. Rewrite the owner path so workflow timeout has one canonical stale-progress
   outcome, retry reason, and re-entry path.
5. Keep rebalancer handoff and publication ACK convergence satisfied.
6. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Rebalancer handoff retry scheduling; that is predecessor proof.
2. Publication ACK convergence; that is earlier predecessor proof.
3. Active-gate report schema alias deletion.
4. Harness timeout increases, report relabeling, or fallback workflow
   classification.
5. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` is owned by
   `operation_workflow_owner / workflow_timeout`.
2. `priority_recovery_workflow_timeout_transition_deferred` must come from
   operation workflow owner evidence, not from diagnostics reconstructing
   timeout state from raw active-gate blockers.
3. `operation_stalled` and `recovering_in_flight` must resolve through one
   canonical timeout/re-entry decision table.
4. Rebalancer handoff and publication ACK convergence must stay satisfied
   while this frontier is reduced.

## Tactical Inspiration

1. Temporal workflow histories: timeout state is durable owner history, not a
   consumer-side elapsed-time guess.
2. Kubernetes controllers: timeout reconciliation needs one owning controller,
   stable reason codes, and explicit re-entry conditions.
3. Raft controller logs: timeout and handoff events must be ordered through a
   single owner path.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: workflow timeout evidence requires changes outside
  `operation_workflow_owner`; focused fixture exposes `rebalancer_handoff`
  again; representative proof still fails on `workflow_timeout` after owner
  fix.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
operation workflow timeout boundary, unresolved semantic states, blocked
partition ids, transition-deferred timeout reason, workflow outcome, and owner
reason `priority_recovery_progress_blocked`.

Allowed consumers: topology convergence analyzer, failure bundle, operation
workflow tests, priority recovery diagnostics, and sprint/package handoff
notes.

Prohibited reinterpretations: do not treat workflow timeout as rebalancer
handoff, publication ACK convergence, startup snapshot coverage, generic
readiness failure, or a harness timeout. Do not add fallback workflow
classification outside the operation workflow owner.

Primary diagnostics / proof surfaces: workflow-timeout fixture, topology
convergence explain output, focused operation workflow/rebalancer tests,
static guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `workflow_timeout`
- Frontier state: `blocked`
- Dominant reason: `priority_recovery_progress_blocked`
- Evidence path: `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_progress_blocked, priority_recovery_event_driven_wait`
- Source: `unresolvedSemanticStateIds: operation_stalled,recovering_in_flight`,
  `blockedPartitionIds: control_plane_publications-p1,replica_operations-p1,sql_transaction_participants-p1`,
  `dominantReason: priority_recovery_workflow_timeout_transition_deferred`,
  `failureClass: priority_recovery_progress_blocked`.
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --explain priority_recovery_partition_progress`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Faraday (`019e0d15-523b-7ad0-b1f4-82239412843c`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Curie (`019e0d19-4336-7471-9358-11caf22ae5fe`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md`.
- [ ] Implementation subagent recorded:
      pending-before-implementation-resumes.

## Detection / Analysis Tasks

- [x] Review the rebalancer handoff package before implementation starts.
      Faraday reviewed the closed predecessor and Curie fixed the tracker-only
      closure proof finding before implementation starts.
- [ ] Extract the smallest workflow-timeout transition-deferred fixture from
      the representative report.
- [ ] Trace the operation workflow owner timeout path for transition-deferred
      priority recovery work.
- [ ] Identify any diagnostics or active-gate branch that masks timeout owner
      evidence.

## Implementation Tasks

- [ ] Add or update the focused workflow-timeout fixture.
- [ ] Rewrite the owner logic so workflow timeout has one canonical decision
      path.
- [ ] Delete or guard superseded timeout fallback branches.
- [ ] Update diagnostics/harness consumers only where owner vocabulary changes.
- [ ] Rerun representative rolling-restart and migrate any fresh frontier.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-rebalancer-handoff.report.json --explain priority_recovery_partition_progress`
3. Focused operation workflow/rebalancer timeout tests selected by
   `operation_workflow_owner`.
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-workflow-timeout-transition-deferred.report.json --fast-local --verbose`

## Done When

1. Workflow timeout has one owner-bound decision path.
2. Focused operation workflow and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
