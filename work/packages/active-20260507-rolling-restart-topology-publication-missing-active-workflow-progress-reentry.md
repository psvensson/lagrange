# Rolling Restart Topology Publication Missing-Active Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-exact-target-observation-20260507T013352Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-exact-target-observation-20260507T013352Z/rolling-restart/",
  "owner": "Topology publication missing-active node over operation-workflow progress and replace-remove safety deferral",
  "boundary": "Topology publication missing-active node / operation-workflow progress owner",
  "dominantReason": "publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a",
  "currentState": "The exact-target observation seam is closed. The representative rerun now fails as publication_convergence_blocked on epoch 5 ACK_PENDING missingPublishedCount=2, while supporting workflow evidence points at sql_write_operations-p1 under operation_workflow_owner / workflow_progress with a coordinator-created REPLACE stalled at dispatch_pending and target-node orphan reservation release during deferred visibility.",
  "nextAction": "Extract the 013352Z publicationConvergence, current active-gate progress, sql_write_operations-p1 workflow witness, and target-node reservation log fixture; add a focused reservation-visibility regression; then repair the owner-read or reservation-reconciliation path so active reservations are not released while in-flight operations are only defer-visible.",
  "proof": [
    "Focused exact-target observation regressions",
    "Focused sql_write_operations-p1 reservation visibility regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-segment-2.js",
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/rebalance-coordinator-segment-4.js",
    "src/rebalancer/rebalance-coordinator-segment-5.js",
    "src/rebalancer/replica-operation-repository-observation-methods.js",
    "test/rebalancer/coordinator-reservation-lifecycle.test.js",
    "test/rebalancer/priority-replace-exact-target-observation.test.js",
    "test/rebalancer/replica-operation-observation-contract.test.js"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-steady-published-selected-membership-deficit-readiness-timeout-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Startup Steady-Published Selected Membership Deficit Readiness Timeout Reentry](./done-20260506-rolling-restart-startup-steady-published-selected-membership-deficit-readiness-timeout-reentry.md)
closed by migration. The representative rerun no longer selects startup
readiness fallback or steady-published selected-membership normalization as
the dominant blocker. Current publication convergence, current active-gate
progress, and priority recovery observation now agree on the same
steady-published three-node missing-active set, and the blocker has moved to
the next owner decision.

The first slice in this package is now complete as well: the exact-target
replica observation seam is closed by focused regression coverage and owner
read-path repair. The representative rerun moved forward again without leaving
the package boundary, so the live blocker remains
`publication_missing_active_node` over `operation_workflow_owner /
workflow_progress`, but the concrete owner seam has advanced to
`sql_write_operations-p1` and target-side reservation visibility.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-exact-target-observation-20260507T013352Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-exact-target-observation-20260507T013352Z/rolling-restart/`.
3. Result: failed after `131.2s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is `publication_convergence_blocked` with root cause
   class `topology`, dominant reason
   `publication_missing_active_node=8be8d30f-4499-5eed-865c-71b4d529a67a`,
   confidence `high`, and signals for
   `priorityRecoveryPartition=sql_write_operations-p1`,
   `priorityRecoveryOwner=operation_workflow_owner`,
   `priorityRecoveryBoundary=workflow_progress`,
   `priorityRecoveryWaitMode=event_driven`, and
   `priorityRecoveryNextAction=wait_for_operation_progress`.
6. Publication convergence is epoch `5` `ACK_PENDING` with pending ACK count
   `1`, blocked-node count `0`, missing-published count `2`, and explicit gate
   reasons `priority_partitions_not_spread`,
   `publication_epoch_pending`, `snapshot_coverage=2/5`,
   `publication_missing_active_node=8be8...`, and
   `publication_missing_active_node=ebc4...`.
7. Current active-gate progress agrees on the same live deficit: active `3/5`,
   snapshot coverage `2/5`, selected published active `3/5`, pending ACK
   count `1`, missing-published count `2`, and the same selected
   missing-published node ids `8be8...|ebc4...`.
8. Failure-bundle workflow evidence now points at `sql_write_operations-p1`
   under `operation_workflow_owner / workflow_progress` with semantic state
   `recovering_in_flight`, completion state `blocked`, next action
   `wait_for_operation_progress`, and correlation key
   `sql_write_operations-p1|5|21206e66-4f05-46cf-b439-714de9440cf3`.
9. The same witness family shows a coordinator-created critical `REPLACE`
   for target replica `sql_write_operations-p1-r4` on target node `11601...`
   with workflow step / status evidence that oscillates between
   `PENDING` `persisted_not_dispatched` and later `SENDING`
   `dispatched_waiting_progress`, which points at a visibility or actuation
   seam rather than a closed terminal operation.
10. Target-node log evidence on `11601...` records
    `Released orphan storage reservation during reconciliation` for operation
    `21206e66-4f05-46cf-b439-714de9440cf3` shortly after a timeout on
    `SELECT * FROM storage_reservations WHERE status = ? AND expires_at <= ?`.
11. The owner question is therefore narrower than the previous
    `replica_operations-p1` safety deferral slice: whether reservation
    reconciliation or owner-read visibility is wrongly classifying an in-flight
    `sql_write_operations-p1` operation as orphaned before authoritative
    progress becomes visible.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed exact-target observation regression and the moved
   representative evidence from the first slice in this package.
2. Extract a focused `013352Z` publication missing-active / workflow-progress
   fixture for top-level publication convergence, current active-gate
   progress, `sql_write_operations-p1` workflow evidence, and target-node
   reservation reconciliation logs.
3. Repair only the selected topology/workflow owner path, specifically the
   reservation-visibility or dispatch-progress seam that can misclassify an
   in-flight coordinator-created `REPLACE` as orphaned.
4. Preserve the earlier closed steady-published selected-membership
   normalization regression.

## Out Of Scope

1. Reopening the closed startup steady-published normalization package unless
   the representative blocker re-enters that owner boundary directly.
2. Harness-only timeout increases or output suppression that hide the named
   topology/workflow disagreement.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Explicit `publication_missing_active_node` owns the boundary when top-level
   publication convergence and current active-gate progress agree on the live
   missing-active node set under `steady_published`, pending ACK count is `0`,
   and no unresolved priority-recovery classes remain.
2. `operation_workflow_owner / workflow_progress` owns the boundary when the
   named partition and operation directly explain why those missing-active
   nodes cannot progress into the published active set.
3. `replace_remove_safety_blocked` is supporting actuation evidence unless it
   becomes the direct canonical blocker after owner normalization.
4. Storage reservation reconciliation is subordinate infrastructure unless it
   incorrectly classifies an in-flight workflow operation as orphaned and
   becomes the direct cause of stalled workflow progress.

Canonical contract shape:

1. Failure bundle, publication convergence, current active-gate progress, and
   priority recovery progress summary must agree on one canonical owner for
   the same selected missing-active set.
2. If workflow progress owns the boundary, the proof must show the named
   operation and deferral surface are the direct cause rather than stale
   supporting context.
3. If explicit `publication_missing_active_node` remains the direct owner,
   workflow-progress and replace-remove-safety evidence must remain subordinate
   until the topology debt closes.
4. Reservation reconciliation must not release an active reservation when the
   associated operation is still present or only defer-visible through the
   canonical owner-read contract.

## Residual Closure Inventory

- [x] Extract the `005730Z` fixture, prove the exact-target observation bug,
      and close that owner-read seam with focused regressions.
- [x] Rerun the representative scenario once to confirm blocker migration
      inside the same package boundary.
- [ ] Extract the `013352Z` reservation-visibility / workflow-progress
      fixture for `sql_write_operations-p1`.
- [ ] Add the focused regression for reservation reconciliation or deferred
      owner visibility.
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

1. `npm test -- test/rebalancer/replica-operation-observation-contract.test.js test/rebalancer/priority-replace-exact-target-observation.test.js`
   passed after the exact-target observation repair.
2. `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/rebalance-coordinator-segment-5.js src/rebalancer/replica-operation-repository-observation-methods.js`
   passed.
3. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/rebalance-coordinator-segment-5.js src/rebalancer/replica-operation-repository-observation-methods.js`
   passed.
4. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/rebalance-coordinator-segment-5.js src/rebalancer/replica-operation-repository-observation-methods.js`
   passed.
5. `npx eslint src/rebalancer/operation-workflow-owner-segment-2.js src/rebalancer/operation-workflow-owner-segment-7-stage-1.js src/rebalancer/operation-workflow-owner-segment-7-stage-3.js src/rebalancer/operation-workflow-owner-segment-7-stage-4.js src/rebalancer/operation-workflow-owner-segment-7-stage-shared.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/rebalance-coordinator-segment-5.js src/rebalancer/replica-operation-repository-observation-methods.js test/rebalancer/replica-operation-observation-contract.test.js test/rebalancer/priority-replace-exact-target-observation.test.js`
   passed.
6. `npm test -- test/rebalancer/replace-replica-workflow.test.js test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`
   passed.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-exact-target-observation-20260507T013352Z.report.json --fast-local --verbose`
   failed after `131.2s`, but moved the blocker forward from
   `replica_operations-p1` exact-target observation to
   `sql_write_operations-p1` reservation visibility / workflow progress inside
   this package boundary.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / workflow-progress boundary
   with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
