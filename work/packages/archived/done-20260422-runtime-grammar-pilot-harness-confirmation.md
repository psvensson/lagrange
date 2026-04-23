# Runtime-Grammar Pilot Harness Confirmation

## Why

The runtime-grammar implementation packages are complete, but the named
`node-join-under-load` harness rerun was explicitly deferred until after those
packages landed.

This package exists only to hold that confirmation pass separately from the
implementation work so the sprint state stays accurate.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint umbrella:

1. [Runtime grammar hierarchy and actuation closure sprint](../../sprints/archived/done-2026-q2-runtime-grammar-hierarchy-and-actuation-closure.md)

## In Scope

1. Rerun the named `node-join-under-load` harness scenario after all current
   implementation packages are complete.
2. Confirm whether the harness now reports a narrowed owner/runtime defect
   rather than another grammar hole.
3. Capture the resulting triage/failure-bundle artifact references.

## Out Of Scope

1. New runtime-grammar implementation work
2. Broad tactical harness patching during the confirmation pass

## Validation

1. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Residual Closure Inventory

- [x] The deferred harness confirmation has been executed once after the
      amendment implementation packages completed.
- [x] Fresh artifact references are recorded at
      `test-output/.playback/report/node-join-under-load/failure-bundle.json`
      and
      `test-output/.playback/report/node-join-under-load/triage-summary.json`.
- [x] The rerun no longer exposes the runtime-grammar contradiction or the
      harness-summary flattening that motivated the amendment.
- [x] The new dominant blocker is split explicitly to
      [Priority-recovery operation-scheduling pressure and follow-up creation closure](./done-20260423-priority-recovery-operation-scheduling-pressure-and-followup-creation-closure.md)
      under
      [Coherence Closure Before Harness Sprint](../../sprints/archived/done-2026-q2-remaining-runtime-hotspot-reduction.md).

## Execution Notes

1. Ran
   `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`
   on 2026-04-23 after the two amendment packages were complete on focused
   proof.
2. The scenario still failed after the rerun, but both
   `failure-bundle.json` and `triage-summary.json` now report the same new
   dominant reason:
   `priority_recovery_operation_scheduling_persist_blocked_by_pressure`.
3. The dominant retained witness is now `sql_write_operations-p1` with
   `currentOwner = rebalancer_leader`,
   `blockingBoundary = operation_scheduling`,
   `actuationState = persist_blocked_by_pressure`,
   `nextRequiredAction = create_recovery_operation`,
   `workflowProgressPhaseId = terminal`,
   `latestOperationWorkflowStep = REMOVED`,
   and `latestOperationStatus = removed`.
4. A secondary unresolved witness remains on `sql_transactions-p1` with
   `currentOwner = operation_workflow_owner`,
   `blockingBoundary = workflow_progress`,
   `actuationState = dispatched`,
   `nextRequiredAction = wait_for_operation_progress`,
   and `latestOperationWorkflowStep = CREATING`.
5. This rerun confirms the runtime-grammar amendment is structurally complete:
   the prior `completed` plus `create_recovery_operation` contradiction is
   gone, and the harness now preserves the sharper pressure-owned scheduling
   reason instead of flattening it back into generic stalled scheduling.

## Done When

1. The deferred harness confirmation has been run once after the
   implementation packages are complete.
2. The resulting failure, if any, is clearly outside the runtime-grammar
   implementation gap.
