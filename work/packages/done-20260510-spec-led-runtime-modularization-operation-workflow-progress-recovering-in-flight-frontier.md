# Spec-Led Runtime Modularization Operation Workflow Progress Recovering-In-Flight Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-10",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability/rolling-restart/",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_progress",
  "dominantReason": "priority_recovery_workflow_progress_event_driven",
  "currentState": "Implementation repaired the focused operation_workflow_owner / workflow_progress residual: direct priority-recovery owner snapshot builds now normalize dispatch-pending SENDING/pending recovering-in-flight witnesses through the canonical owner adapter and enqueue dispatch-pending wake/replay work. The representative rerun remains non-green but migrated away from the direct workflow-progress repair target: priorityRecoveryProgressSummary is absent, activeNodeCount is 5/5, active-gate snapshot coverage is still 3/5, and the remaining priority evidence is class-only recovering_in_flight for sql_transactions-p1 and sql_write_operations-p1 under startup_active_gate_owner / snapshot_coverage.",
  "nextAction": "Close this package and continue from the fresh representative artifact by activating exactly one successor for startup_active_gate_owner / snapshot_coverage. Do not repeat the completed sql_write_operations-p1 dispatch-pending workflow-progress repair and do not reopen diagnostics schema alias cleanup.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json --explain priority_recovery_partition_progress",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json",
    "Focused owner fixture for sql_write_operations-p1 recovering_in_flight / dispatched_waiting_progress / dispatch_pending / SENDING pending with event_driven wait beyond step timeout",
    "Focused operation_workflow_owner and priority recovery snapshot tests selected by the implementation boundary",
    "Touched-file static guardrails: guideline literals, decision boundaries, runtime grammar, and git diff hygiene",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner*.js",
    "test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js",
    "src/control-plane/priority-recovery-snapshot*.js",
    "src/control-plane/priority-recovery-diagnostics-constants.js",
    "test/rebalancer/*workflow*.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/control-plane/priority-recovery-snapshot*.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "work/model-ledger.jsonl",
    "work/packages/done-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md",
    "work/sprints/active-2026-q2-spec-led-runtime-modularization.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "workflow progress evidence requires changes outside operation_workflow_owner, priority recovery snapshots, or canonical dispatch wake/replay",
      "focused fixture restores operation_scheduling, rebalancer_handoff, workflow_timeout, publication_ack_convergence, or startup active-gate admission as the direct owner",
      "representative proof still has all unresolved priority partitions stuck in recovering_in_flight after the canonical owner re-entry path is repaired",
      "runtime implementation would need Pro or Enterprise features"
    ]
  },
  "predecessor": "work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-architecture-gap.md",
  "closed": "2026-05-10",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The active-gate architecture-gap package is closed and pushed. Its runtime owner
change admitted the stale startup-complete readiness cascade through the
canonical BootstrapRequestOwner path, but the representative proof did not go
green. The contact-seed readiness cascade no longer dominates top failure
evidence; the exposed operation edge is
`operation_workflow_owner / workflow_progress`.

The fresh report is not the same witness as the older workflow-progress
packages. Earlier slices reduced `operation_stalled`,
`persisted_not_dispatched`, `needs_operation`, and serial-wait restoration
residuals. The current reduced witness has only `recovering_in_flight`
unresolved semantic state, with `sql_write_operations-p1` waiting on an existing
`SENDING` / `pending` operation in `dispatch_pending` event-driven progress.

## Scope Basis

1. Predecessor package:
   `work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-architecture-gap.md`.
2. Representative artifact:
   `test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json`.
3. Topology owner explain output for `priority_recovery_partition_progress`
   classifies the edge as `retryable` under
   `operation_workflow_owner / workflow_progress` because all unresolved
   semantic states are `recovering_in_flight`.
4. Causal analysis still reports `widen_architecture_work / architecture_gap`,
   with `priority_recovery_event_wait` on the critical path behind active-gate
   snapshot coverage.
5. Phase `0.1` internal-coherence work in the Community / AGPL repository.

## In Scope

1. Preserve the predecessor review/fix proof before implementation starts.
2. Freeze the smallest owner-path witness for `sql_write_operations-p1`:
   `recovering_in_flight`, `dispatched_waiting_progress`, `dispatch_pending`,
   `SENDING` / `pending`, `event_driven`, step age beyond timeout, and
   `advance_existing_operation`.
3. Trace the canonical operation workflow owner, dispatch wake/replay, and
   priority recovery snapshot path for in-flight operations that remain
   event-driven after their step timeout.
4. Repair or classify the single workflow-progress re-entry decision/effect path
   so recovering-in-flight priority partitions either advance, remain classified
   backpressure, or migrate to a new named owner boundary.
5. Keep publication ACK convergence, reduced active-gate admission behavior,
   workflow timeout, rebalancer handoff, and operation scheduling from regressing.
6. Rerun representative rolling-restart and record whether the workflow-progress
   residual closes, reduces, or migrates.

## Out Of Scope

1. Reopening the closed active-gate architecture-gap implementation.
2. Diagnostics schema alias deletion.
3. Reintroducing `operation_stalled`, `persisted_not_dispatched`,
   `needs_operation`, or serial-wait fixes already closed by earlier
   workflow-progress packages unless the focused fixture proves a regression.
4. Harness timeout increases, report relabeling, or analyzer changes that hide
   the owner-progress residual.
5. Pro or Enterprise work.

## Invariants

1. `priority_recovery_partition_progress` remains owned by
   `operation_workflow_owner / workflow_progress` for this witness.
2. `recovering_in_flight` means owner-observed operation work exists and is not a
   synthetic scheduling absence.
3. `event_driven` wait must be resolved or classified through the canonical
   operation workflow owner path, not by startup active-gate consumers.
4. Diagnostics, failure bundles, and topology analysis observe owner vocabulary;
   they must not reconstruct an alternate workflow-progress decision from raw
   active-gate blockers.
5. The package must not turn active-gate `snapshot_coverage=3/5` into a generic
   readiness, timeout, or publication-ACK explanation.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Owned files: operation workflow owner files, priority recovery snapshot files,
  focused workflow-progress tests, package/sprint/current-blocker trackers, and
  `work/model-ledger.jsonl`.
- Forbidden files: diagnostics schema alias cleanup, active-gate runtime owner
  implementation except for regression-preserving tests if needed, Pro or
  Enterprise surfaces, unrelated package files.
- Frozen decisions: predecessor active-gate package is closed; the current
  workflow-progress witness is `recovering_in_flight`, not
  `operation_stalled`; topology may still list active-gate snapshot coverage as
  the first blocked edge; this package owns only the operation retryable edge.
- Escalation triggers: workflow progress evidence requires changes outside
  `operation_workflow_owner`, priority recovery snapshots, or canonical dispatch
  wake/replay; focused fixture restores operation scheduling, rebalancer handoff,
  workflow timeout, publication ACK convergence, or startup active-gate admission
  as the direct owner; representative proof still has all unresolved priority
  partitions stuck in `recovering_in_flight` after the canonical owner re-entry
  path is repaired; runtime implementation would need Pro or Enterprise
  features.
- Focused proof: topology explain for `priority_recovery_partition_progress`,
  causal-model output, focused owner fixture, touched-file guardrails, and one
  representative rolling-restart rerun.

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: priority recovery progress edge,
workflow progress boundary, partition id, operation id, workflow progress phase,
latest workflow step, latest operation status, actuation state,
recovering-in-flight semantic state, event-driven wait mode, next required
action, serial wait carriers, and owner reason
`priority_recovery_event_driven_wait`.

Allowed consumers: priority recovery snapshots, operation workflow owner tests,
dispatch wake/replay tests, topology convergence analyzer, distributed failure
bundles, diagnostics/admin surfaces, and sprint/package handoff notes.

Prohibited reinterpretations:

1. Do not treat recovering-in-flight workflow progress as operation scheduling,
   rebalancer handoff, workflow timeout, publication ACK convergence, startup
   snapshot coverage, or generic readiness failure.
2. Do not classify elapsed age alone as terminal failure; normalize it with
   owner workflow evidence and the canonical next required action.
3. Do not add fallback workflow-progress classification outside the operation
   workflow owner or priority recovery snapshot owner-observation path.
4. Do not use `null`, `undefined`, cache absence, or admin reachability gaps as
   semantic workflow-progress states.

Primary diagnostics / proof surfaces: topology owner explain output, focused
owner-path fixture, operation workflow/dispatch/prioritization tests,
touched-file static guardrails, causal-model output, and representative
rolling-restart.

## Generated Owner Evidence Block

- Source artifact:
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `priority_recovery_partition_progress`
- Current semantic owner: `operation_workflow_owner`
- Current boundary: `workflow_progress`
- Frontier state: `retryable`
- Dominant reason: `priority_recovery_event_driven_wait`
- Evidence path:
  `report.scenarios[0].publicationConvergence.priorityRecoveryProgressSummary.dominantWitness`
- Reasons: `priority_recovery_event_driven_wait`
- Source: `unresolvedSemanticStateIds: recovering_in_flight`,
  `blockedPartitionIds: control_plane_publications-p1,replica_operations-p1,sql_transactions-p1,sql_write_operations-p1`,
  `dominantReason: priority_recovery_workflow_progress_event_driven`,
  `failureClass: priority_recovery_progress_blocked`.
- Representative dominant witness: `sql_write_operations-p1`,
  `recovering_in_flight`, actuation state `dispatched_waiting_progress`,
  actuation owner `operation_workflow_owner`, current owner
  `operation_workflow_owner`, next required action
  `advance_existing_operation`, blocking boundary `workflow_progress`, wait mode
  `event_driven`, workflow progress phase `dispatch_pending`, step age
  `39910ms`, step timeout `30000ms`, latest workflow step `SENDING`, latest
  operation status `pending`, progress contract state `pending`.
- Serial wait carriers remain attached to operation workflow evidence:
  `control_plane_publications-p1`, `replica_operations-p1`, and
  `sql_transactions-p1`.
- Next explain command:
  `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json --explain priority_recovery_partition_progress`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Handoff Reviewer (`7c6f7341-c7ec-4a26-a5e6-8a2b32cf9b8c`) reviewed `work/packages/done-20260510-spec-led-runtime-modularization-active-gate-snapshot-coverage-architecture-gap.md`; result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Implementation subagent recorded:
      Agent Workflow Implementer (c745d753-3aa0-443f-b0bc-bd0a76f1cc1c) implemented work/packages/active-20260510-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight-frontier.md.

## Residual-Closure Inventory

- Hot path: closed for this package. Direct owner snapshot builds now both attach the canonical
  operation-owner outcome and enqueue dispatch-pending owner wake/replay work.
- Tail consumers: no owner vocabulary change required for the focused owner
  path. The fresh representative rerun no longer has a detailed
  `priorityRecoveryProgressSummary`; remaining priority evidence is class-only
  `recovering_in_flight` under active-gate snapshot coverage.
- Deletion work: no fallback branch was added; the repair reuses
  `OperationWorkflowOwner` adapter decisions and the existing dispatch-pending
  re-entry scheduler.
- Representative proof: migrated. Rolling restart still failed; topology first
  blocked frontier is now `startup_active_gate_owner / snapshot_coverage` with
  `snapshotCoverage=3/5`, active nodes `5/5`, closure witness
  `startup_active_publication_lag`, and only retryable class-only
  workflow-progress evidence downstream.

## Initial Validation / Evidence

1. PASS —
   `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json --explain priority_recovery_partition_progress`.
2. PASS —
   `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-spec-led-runtime-modularization-active-gate-snapshot-coverage-reachability.report.json`
   reports `widen_architecture_work / architecture_gap` with
   `priority_recovery_event_wait` on the critical path behind active-gate
   snapshot coverage.
3. PASS — focused owner-path fixture:
   `node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`.
   The fixture now includes `sql_write_operations-p1` and proves direct owner
   snapshot builds enqueue canonical dispatch-pending wake work.
4. PASS — focused tests:
   `node test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js && node test/rebalancer/operation-workflow-owner-adapter.test.js && node test/control-plane/priority-recovery-snapshot-operation-owner-outcome.test.js`.
5. PASS — touched-file static guardrails:
   `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`,
   `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`,
   `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`, and
   `git diff --check -- src/rebalancer/operation-workflow-owner.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`.
6. FAIL / MIGRATED FRONTIER —
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json --fast-local --verbose`.
   Topology reports first blocked frontier
   `startup_active_gate_owner / snapshot_coverage` with
   `snapshotCoverage=3/5`; the priority edge is retryable class-only
   `recovering_in_flight` evidence for `sql_transactions-p1` and
   `sql_write_operations-p1`.
7. PASS — fresh causal output for
   `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-progress-recovering-in-flight.report.json`
   removes the `priority_recovery_event_wait` failure class and leaves
   `active_gate_snapshot_coverage_incomplete`, `startup_readiness_blocked`, and
   `budget_timeout_cascade`.

## Implementation Notes

The canonical owner adapter already knew how to normalize a dispatch-pending
recovering-in-flight witness, but direct
`buildPriorityRecoveryDecisionSnapshotForOperations` callers only observed the
owner outcome and did not enqueue owner-key re-entry work. The implementation
now self-schedules normalized dispatch-pending owner snapshots through the same
canonical re-entry path. The inherited async snapshot scheduler remains
idempotent because active handoff retry evidence suppresses duplicate owner
wakes. The representative rerun migrated away from the direct workflow-progress
repair target: it has no detailed priority recovery progress summary and no
causal `priority_recovery_event_wait` class. The next package should own
`startup_active_gate_owner / snapshot_coverage` using the fresh active-gate
snapshot coverage residual, not repeat this workflow-progress repair.

## Post-Implementation Review

- PASS after fix — focused validation passed for owner tests, guardrails, and
  work tracker validation.
- FIXED — implementation review found the tracker still named the completed
  `sql_write_operations-p1` dispatch-pending repair as active next work. This
  closure updates the package, sprint, and current-blocker handoff to the fresh
  `startup_active_gate_owner / snapshot_coverage` residual.

## Commit And Push Ledger

1. Focused package commit: `11532520`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
