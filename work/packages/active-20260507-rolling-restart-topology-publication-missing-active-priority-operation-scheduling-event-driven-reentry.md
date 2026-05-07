# Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Event-Driven Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z/rolling-restart/",
  "owner": "Topology publication missing-active node over rebalancer priority recovery operation scheduling regression after bootstrap-budget closure",
  "boundary": "Topology publication missing-active node / priority recovery operation scheduling event-driven owner",
  "dominantReason": "priority_recovery_operation_scheduling_event_driven",
  "currentState": "The bootstrap admission precheck seam and admitted bootstrap request execution-timeout seam are both now closed. The representative rerun reaches epoch 4 PUBLISHED with pending ACK count 0, snapshot coverage 2/5, and seed-side bootstrap responses, but sql_write_operations-p1 returns as the selected priority recovery witness. The normalized blocker is needs_operation under rebalancer_leader / operation_scheduling with progress class eligible_but_no_operation_created while sql_transactions-p1 remains supporting recovering_in_flight context.",
  "nextAction": "Extract the 031003Z operation-scheduling witnesses and operation workflow timeline, add a focused regression for the returned needs_operation / eligible_but_no_operation_created path, repair only the selected rebalancer owner boundary, and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused 031003Z operation-scheduling witness fixture",
    "Focused priority recovery operation-scheduling regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "test/rebalancer/priority-follow-up-target-readiness.test.js",
    "test/rebalancer/unified-rebalancer.test.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Startup Bootstrap Request Execution Timeout Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-startup-bootstrap-request-execution-timeout-reentry.md)
closed by migration. The bootstrap owner path now returns bounded canonical
defer responses, but the representative rerun still fails `rolling-restart`
on a later-stage priority recovery boundary.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-bootstrap-request-execution-timeout-20260507T031003Z/rolling-restart/`.
3. Result: failed after `131.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Root cause class is `topology`, dominant reason
   `priority_recovery_operation_scheduling_event_driven`, and failure class
   `priority_recovery_progress_blocked`.
6. Publication convergence reaches epoch `4` `PUBLISHED` with pending ACK
   count `0`, recovery protocol state `priority_spread_pending`, and gate
   reasons `priority_partitions_not_spread` plus `snapshot_coverage=2/5`.
7. The selected primary witness is `sql_write_operations-p1` with semantic
   state `needs_operation`, owner `rebalancer_leader`, boundary
   `operation_scheduling`, wait mode `event_driven`, next action
   `create_recovery_operation`, and progress class
   `eligible_but_no_operation_created`.
8. Supporting priority-recovery context keeps `sql_transactions-p1` in
   `recovering_in_flight` behind pending operation
   `40bb8fa6-d839-4a34-8d81-2aa9c0c22780`.
9. Active-gate current progress still stalls at active `2/5`, snapshot
   coverage `2/5`, and missing-active nodes `11601...`, `8be8...`, and
   `ebc4...`, but the normalized blocker signature now includes
   `priority_recovery_progress_class=eligible_but_no_operation_created`
   rather than a bootstrap transport-timeout witness.
10. Seed-side logs during the same rerun prepare bootstrap responses,
    including a `MOVE_REPLICA` reply and a later `CREATE_SELF_HOSTED` reply,
    so startup/bootstrap request ownership is retained only as predecessor
    context.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `031003Z` operation-scheduling witness set for
   `sql_write_operations-p1` and adjacent operation workflow state.
2. Determine why `needs_operation` regressed to
   `eligible_but_no_operation_created` after publication returned to
   `PUBLISHED` and bootstrap pressure was reduced.
3. Add a focused regression for the selected `rebalancer_leader /
   operation_scheduling` owner path before the next representative rerun.
4. Preserve the closed bootstrap request execution-timeout regression from the
   predecessor package.

## Out Of Scope

1. Reopening the closed bootstrap request execution-timeout package unless the
   same admitted-request timeout seam re-enters directly.
2. Harness-only timeout increases or publication/readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `rebalancer_leader / operation_scheduling` owns the boundary while the
   selected blocker remains `needs_operation` with next action
   `create_recovery_operation`.
2. `operation_workflow_owner` remains supporting evidence only while
   `sql_transactions-p1` is still progressing through its existing operation.
3. Startup/bootstrap evidence is predecessor context unless it directly
   prevents creation of the next priority recovery operation.

Canonical contract shape:

1. When the selected priority partition reaches `needs_operation` with
   eligible recovery targets, the runtime must either create one canonical
   recovery operation or emit one explicit outranking reason for not doing so.
2. Supporting in-flight workflow context must not strand a separate partition
   at `eligible_but_no_operation_created` without an explicit decision owner.
3. Failure bundle, active-gate progress, and rerun evidence must agree on the
   same selected owner boundary before the package closes.

## Residual Closure Inventory

- [ ] Extract the `031003Z` operation-scheduling witness fixture.
- [ ] Add the focused priority recovery operation-scheduling regression.
- [ ] Repair the selected owner path and rerun focused tests, touched-file
      guardrails, and one representative `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [ ] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [ ] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. Focused `031003Z` operation-scheduling fixture passes.
2. Focused priority recovery operation-scheduling regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either creates the required priority recovery
   operation or migrates away from the topology publication missing-active /
   operation-scheduling boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
