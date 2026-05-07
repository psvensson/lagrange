# Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z/rolling-restart/",
  "owner": "Topology publication missing-active node over rebalancer-leader priority operation scheduling",
  "boundary": "Topology publication missing-active node / priority operation scheduling owner",
  "dominantReason": "publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
  "currentState": "The reservation-visibility seam is closed. The representative rerun now fails at epoch 4 ACK_PENDING with snapshot coverage 1/5 and three priority partitions in needs_operation under rebalancer_leader / operation_scheduling. Rebalancer logs on 7493... show one add-like move planned for each blocked partition, but pre-execution handoff skips those moves as node_not_ready with repair_ineligible target readiness on 11601..., which suggests the current-entity follow-up lane is missing defer_to_workflow_owner target-readiness normalization.",
  "nextAction": "Extract the 021000Z priority partition witnesses and pre-execution handoff logs; add a focused rebalancer regression where planner-created current-entity follow-up moves target a recovery-eligible but repair-ineligible node; then repair the augmentation or pre-execution path so needs_operation follow-up moves preserve defer_to_workflow_owner readiness semantics.",
  "proof": [
    "Focused 021000Z operation-scheduling / pre-execution handoff fixture",
    "Focused current-entity priority follow-up target-readiness regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/unified-rebalancer-segment-4-stage-3.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-shared.js",
    "test/rebalancer/unified-rebalancer-core-03-test-cases.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-workflow-progress-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Workflow Progress Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-workflow-progress-reentry.md)
closed by migration. The reservation-reconciliation fix no longer leaves the
representative blocker on workflow progress or orphan release. The next rerun
still fails `rolling-restart`, but the normalized owner has moved to priority
operation scheduling.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-reservation-visibility-reconcile-20260507T021000Z/rolling-restart/`.
3. Result: failed after `134.9s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification remains `publication_convergence_blocked` with root
   cause class `topology` and dominant reason
   `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`.
6. Publication convergence is epoch `4` `ACK_PENDING` with pending ACK count
   `1`, missing-published count `3`, and explicit gate reasons
   `priority_partitions_not_spread`, `publication_epoch_pending`,
   `snapshot_coverage=1/5`, and missing-active nodes
   `35a891...|8be8...|ebc4...`.
7. Current active-gate progress agrees on the same missing-active set and also
   reports one unresolved priority-recovery class:
   `eligible_but_no_operation_created`.
8. The selected blocked priority witnesses are
   `sql_transaction_participants-p1`, `sql_transactions-p1`, and
   `sql_write_operations-p1`. All three report semantic state
   `needs_operation`, next action `create_recovery_operation`, current owner
   `rebalancer_leader`, and boundary `operation_scheduling`.
9. Supporting readiness evidence on the selected snapshot node `7493...`
   reports `selectedSnapshotReachabilityError`, but the same snapshot also
   contains the direct actuation clue: the rebalancer still attempts one move
   per blocked priority partition.
10. Rebalancer logs on `7493...` show the actuation seam precisely:
    `sql_transaction_participants-p1`, `sql_transactions-p1`, and
    `sql_write_operations-p1` each start rebalancing with `moveCount=1`, then
    pre-execution handoff returns `pre_execution_skips_only` because target
    node `11601...` is blocked on readiness skip detail `repair_ineligible`.
11. The owner question is therefore narrower than the top-level publication
    symptom: whether the current priority follow-up move is being scheduled on
    the ordinary `REQUIRE_READY` path instead of preserving the canonical
    `defer_to_workflow_owner` readiness mode for recovery-eligible targets.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `021000Z` fixture for the three selected
   `needs_operation` witnesses and the matching pre-execution handoff logs.
2. Add a focused regression that reproduces a planner-created current-entity
   priority move being dropped at pre-execution because target readiness was
   not normalized to `defer_to_workflow_owner`.
3. Repair only the selected rebalancer owner path.
4. Preserve the closed reservation-visibility regression from the predecessor
   package.

## Out Of Scope

1. Reopening the closed reservation-visibility package unless the same
   defer-visible orphan-release signature re-enters directly.
2. Harness-only timeout increases or snapshot-readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. `rebalancer_leader / operation_scheduling` owns the boundary while the
   selected blocked priority partitions are actionable `needs_operation` and
   the runtime still attempts to plan one add-like move per partition.
2. Startup snapshot reachability remains supporting evidence unless it directly
   explains why those add-like moves were never produced or never handed off.
3. Target readiness deferral belongs to the rebalancer/workflow handoff when
   the target is recovery-eligible but intentionally not repair-eligible.

Canonical contract shape:

1. The selected priority follow-up move must retain one canonical readiness
   mode from planning through pre-execution.
2. `needs_operation` must not be stranded by ordinary readiness gating when
   the workflow owner is supposed to admit recovery on a recovery-only target.
3. Failure bundle, active-gate progress, and runtime logs must agree on the
   same owner before the package closes.

## Residual Closure Inventory

- [ ] Extract the `021000Z` operation-scheduling / pre-execution fixture.
- [ ] Add the focused regression for current-entity follow-up target-readiness normalization.
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

1. Focused `021000Z` operation-scheduling / pre-execution fixture passes.
2. Focused owner-boundary regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / priority operation
   scheduling boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
