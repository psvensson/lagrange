# Rolling Restart Priority Recovery Operation Scheduling Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-06",
  "closed": "2026-05-06",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-recovery-target-readiness-defer-20260506T133734Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-priority-recovery-target-readiness-defer-20260506T133734Z/rolling-restart/",
  "owner": "Unified rebalancer priority recovery scheduling and actuation",
  "boundary": "Priority recovery operation scheduling",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "Follow-up moves persist through the coordinator when the selected recovery target is transport-unready; the representative blocker migrated to workflow progress.",
  "nextAction": "Use successor serial-wait workflow-progress package for the current representative blocker.",
  "proof": [
    "Focused priority recovery owner-path regression",
    "Touched-file guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4.js",
    "test/rebalancer/unified-rebalancer.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-bootstrap-move-replica-assignment-token-register-service.md"
}
-->

Opened on May 6, 2026 after
[Rolling Restart Bootstrap Move Replica Assignment Token Register Service](./done-20260506-rolling-restart-bootstrap-move-replica-assignment-token-register-service.md)
closed by migration. The representative rerun no longer terminates on
bootstrap assignment-token handling. It now stalls after publication closure on
priority recovery actuation: `sql_write_operations-p1` remains
`needs_operation` under `rebalancer_leader`, while
`sql_transaction_participants-p1` stays in supporting
`coordination_mismatch` under `operation_workflow_owner`.

Closure update on May 6, 2026: the focused regression now proves priority
recovery follow-up moves persist through the coordinator even when the chosen
recovery-eligible target is transport-unready, and the representative rerun
`test-output/reports/rolling-restart-after-priority-recovery-target-readiness-defer-20260506T133734Z.report.json`
no longer selects `rebalancer_leader / operation_scheduling` as the dominant
owner seam. The live blocker migrated forward to
`operation_workflow_owner / workflow_progress`: `sql_write_operations-p1`
still reports `needs_operation`, but now waits on
`priority_operation_serial_wait` behind serial-wait operation
`7cfa5968-b992-4f93-80c5-f7127a3e345c`. That new representative boundary is
tracked in
[Rolling Restart Priority Recovery Serial-Wait Workflow Progress Reentry](./done-20260506-rolling-restart-priority-recovery-serial-wait-workflow-progress-reentry.md).

## Closing Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bootstrap-assignment-token-register-service-20260506T131802Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bootstrap-assignment-token-register-service-20260506T131802Z/rolling-restart/`.
3. Result: failed after `131.4s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class: `topology`.
6. Dominant reason:
   `priority_recovery_operation_scheduling_event_driven`.
7. Failure class: `priority_recovery_progress_blocked`.
8. Publication convergence is predecessor context for this boundary: epoch `2`
   `PUBLISHED`, pending ACK count `0`, blocked node count `0`, and recovery
   protocol state `priority_spread_pending`.
9. The selected primary witness is `sql_write_operations-p1` with semantic
   state `needs_operation`, owner `rebalancer_leader`, boundary
   `operation_scheduling`, wait mode `event_driven`, next action
   `create_recovery_operation`, and progress class
   `eligible_but_no_operation_created`.
10. Supporting priority recovery evidence keeps
    `sql_transaction_participants-p1` on semantic state
    `coordination_mismatch` with operation
    `2bd30cfa-d7a8-49a9-a001-1178d242dd79`, owner
    `operation_workflow_owner`, boundary `workflow_progress`, next action
    `wait_for_operation_progress`, and progress class
    `publication_recovery_eligible_but_coordinator_excludes_node`.
11. Active-gate progress still stalls at active `3/5`, selected snapshot
    coverage `3/5`, selected snapshot node `ebc4...` via `admin_health`, and
    missing published nodes `11601...`, `8be8...`, and `ebc4...`.
12. Replay stays `replayed_blocked`: durable state remains epoch `2`
    `PUBLISHED`, replayed state reopens to epoch `3` `OPEN`, row counts stay
    `nodes=3`, `nodeEndpoints=0`, `partitions=33`, and `services=103`, and
    replayed blocked partition ids expand to all five priority partitions.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Trace why the rebalancer leader leaves `sql_write_operations-p1` at
   `needs_operation` instead of creating the required recovery operation.
2. Prove whether `sql_transaction_participants-p1`
   `coordination_mismatch` is subordinate context or part of the same owner
   failure.
3. Add focused owner-path regressions before the next representative rerun.
4. Record blocker migration immediately if the representative path moves again.

## Out Of Scope

1. Reopening the closed bootstrap assignment-token package unless this exact
   representative path re-enters that seam.
2. Broad matrix continuation before the five-node representative path passes
   or migrates to a new named owner boundary.
3. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Unified rebalancer priority recovery scheduling and actuation.
2. Operation workflow owner only where an already-created recovery operation
   stays relevant to the selected blocker.

Canonical contract shape:

1. When priority recovery identifies a required spread gap,
   `needs_operation` must either create one canonical recovery operation or
   emit one explicit blocking reason that outranks operation scheduling.
2. Supporting workflow-progress evidence must not mask a primary
   `needs_operation` actuation failure.
3. Failure bundle, replay, and sprint bookkeeping must agree on one canonical
   selected blocker for this rerun.

## Residual Closure Inventory

- [x] Capture the owner path that leaves `sql_write_operations-p1` at
      `eligible_but_no_operation_created`.
- [x] Explain whether `sql_transaction_participants-p1`
      `publication_recovery_eligible_but_coordinator_excludes_node` is
      subordinate or co-owning evidence.
- [x] Add focused tests or fixtures for the selected operation-scheduling
      boundary.
- [x] Run focused verification and one representative `rolling-restart`
      rerun.

## Validation

1. Focused priority recovery owner-path tests pass.
2. Touched-file guardrails are rerun and recorded.
3. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit blocker migration notes.

## Done When

1. The representative path either creates the required priority recovery
   operation or migrates to a different named owner boundary with replayable
   evidence.
2. Sprint bookkeeping points to the successor serial-wait workflow-progress
   package as the sole current representative owner for this sprint path.
