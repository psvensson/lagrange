# Rolling Restart Topology Publication Missing-Active Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z/rolling-restart/",
  "owner": "Topology publication missing-active node over operation-workflow progress and replace-remove safety deferral",
  "boundary": "Topology publication missing-active node / operation-workflow progress owner",
  "dominantReason": "publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
  "currentState": "The deferred-visibility reservation seam is closed. The representative rerun now fails earlier at epoch 4 ACK_PENDING with snapshot coverage 1/5 and three priority partitions back in needs_operation under rebalancer_leader / operation_scheduling. Rebalancer logs show one add-like move planned for each blocked partition, but pre-execution skips them on target-node repair_ineligible readiness, so the blocker migrated to the follow-up target-readiness defer boundary.",
  "nextAction": "Continue in active-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md for the current priority operation-scheduling / pre-execution defer seam.",
  "proof": [
    "Focused sql_write_operations-p1 reservation visibility regression",
    "Focused operation-visibility observation contract regression set",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/rebalance-coordinator-segment-4.js",
    "test/rebalancer/coordinator-reservation-lifecycle.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-workflow-progress-reentry.md"
  ],
  "predecessor": "work/packages/done-20260506-rolling-restart-startup-steady-published-selected-membership-deficit-readiness-timeout-reentry.md",
  "closed": "2026-05-07",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Startup Steady-Published Selected Membership Deficit Readiness Timeout Reentry](./done-20260506-rolling-restart-startup-steady-published-selected-membership-deficit-readiness-timeout-reentry.md)
closed by migration. The representative rerun no longer selects startup
readiness fallback or steady-published selected-membership normalization as
the dominant blocker. Current publication convergence, current active-gate
progress, and priority recovery observation now agree on the same
steady-published three-node missing-active set, and the blocker moved to the
next owner decision.

The first slice in this package is now complete as well: the exact-target
replica observation seam is closed by focused regression coverage and owner
read-path repair. The representative rerun moved forward again without leaving
the package boundary, so the live blocker remains
`publication_missing_active_node` over `operation_workflow_owner /
workflow_progress`, but the concrete owner seam has advanced to
`sql_write_operations-p1` and target-side reservation visibility.

Closure update on May 7, 2026: the reservation-reconciliation seam is now
closed too. The focused deferred-visibility regression proves active storage
reservations stay active while canonical owner reads are defer-visible, and
the coordinator now adjudicates orphan release from one normalized visibility
snapshot instead of falling back to `queryOperationById()` absence. The next
representative rerun,
`test-output/reports/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z.report.json`,
no longer terminates on workflow-progress / orphan-release behavior. The live
blocker migrated to `rebalancer_leader / operation_scheduling`: three priority
partitions remain `needs_operation`, and rebalancer logs on `7493...` show one
add-like move per partition being dropped during pre-execution as
`node_not_ready` with `repair_ineligible` target readiness.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z/rolling-restart/`.
3. Result: failed after `134.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is `publication_convergence_blocked` with root cause
   class `topology`, dominant reason
   `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   confidence `high`, and signals for
   `priorityRecoveryPartition=sql_write_operations-p1`,
   `priorityRecoveryOwner=rebalancer_leader`,
   `priorityRecoveryBoundary=operation_scheduling`,
   `priorityRecoveryWaitMode=event_driven`, and
   `priorityRecoveryNextAction=create_recovery_operation`.
6. Publication convergence is epoch `4` `ACK_PENDING` with pending ACK count
   `1`, blocked-node count `0`, missing-published count `3`, and explicit gate
   reasons `priority_partitions_not_spread`,
   `publication_epoch_pending`, `snapshot_coverage=2/5`,
   `publication_missing_active_node=35a891...`,
   `publication_missing_active_node=8be8...`, and
   `publication_missing_active_node=ebc4...`.
7. Current active-gate progress agrees on the same live deficit: active `2/5`,
   snapshot coverage `1/5`, selected published active `2/5`, pending ACK
   count `1`, missing-published count `3`, and the same selected
   missing-published node ids `35a891...|8be8...|ebc4...`.
8. Failure-bundle evidence now points at three priority partitions under
   `rebalancer_leader / operation_scheduling`: `sql_transaction_participants-p1`,
   `sql_transactions-p1`, and `sql_write_operations-p1` all report semantic
   state `needs_operation`, progress class
   `eligible_but_no_operation_created`, next action
   `create_recovery_operation`, and boundary `operation_scheduling`.
9. Selected startup readiness failure is supporting evidence rather than the
   direct owner: the chosen snapshot node `7493...` times out on control
   snapshot reachability while the same active-gate snapshot still names the
   same three blocked priority partitions.
10. Runtime logs on `7493...` show the actionable actuation seam directly:
    each of the three blocked priority partitions enters rebalancing with
    `moveCount=1`, but pre-execution handoff records
    `pre_execution_skips_only`, `preExecuteSkippedMoveCount=1`, and
    readiness group `11601...` blocked on `repair_ineligible`.
11. The package therefore closes by migration: reservation reconciliation no
    longer releases defer-visible active reservations, and the live owner
    boundary is now priority follow-up scheduling versus pre-execution target
    readiness deferral.

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
- [x] Extract the `013352Z` reservation-visibility / workflow-progress
      fixture for `sql_write_operations-p1`.
- [x] Add the focused regression for reservation reconciliation or deferred
      owner visibility.
- [x] Repair the selected owner path and rerun focused tests, touched-file
      guardrails, and one representative `rolling-restart` scenario.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.
      Baseline result on May 7, 2026:
      `node scripts/check-guideline-literals.js src/rebalancer/rebalance-coordinator-segment-4.js test/rebalancer/coordinator-reservation-lifecycle.test.js`
      -> `0 new literal-guideline violations`;
      `node scripts/check-guideline-decision-boundaries.js src/rebalancer/rebalance-coordinator-segment-4.js test/rebalancer/coordinator-reservation-lifecycle.test.js`
      -> `0 decision-boundary guideline violations`;
      `node scripts/check-runtime-grammar-contracts.js src/rebalancer/rebalance-coordinator-segment-4.js test/rebalancer/coordinator-reservation-lifecycle.test.js`
      -> `0 runtime-grammar-contract violations`;
      `git diff --check` -> clean.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npm test -- test/rebalancer/coordinator-reservation-lifecycle.test.js`
   passed.
2. `npm test -- test/rebalancer/coordinator-reservation-lifecycle.test.js test/rebalancer/replica-operation-observation-contract.test.js test/rebalancer/priority-replace-exact-target-observation.test.js test/rebalancer/coordinator-created-operation-progress.test.js`
   passed.
3. `node scripts/check-guideline-literals.js src/rebalancer/rebalance-coordinator-segment-4.js`
   passed.
4. `node scripts/check-guideline-decision-boundaries.js src/rebalancer/rebalance-coordinator-segment-4.js`
   passed.
5. `node scripts/check-runtime-grammar-contracts.js src/rebalancer/rebalance-coordinator-segment-4.js`
   passed.
6. `npx eslint src/rebalancer/rebalance-coordinator-segment-4.js test/rebalancer/coordinator-reservation-lifecycle.test.js`
   passed.
7. `git diff --check`
   passed.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z.report.json --fast-local --verbose`
   failed after `134.9s`, but moved the blocker forward from
   reservation visibility / workflow progress to
   `rebalancer_leader / operation_scheduling` pre-execution readiness deferral
   inside the same representative topology publication boundary.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / workflow-progress boundary
   with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
