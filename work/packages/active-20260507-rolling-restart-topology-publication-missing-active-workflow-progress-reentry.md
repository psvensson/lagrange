# Rolling Restart Topology Publication Missing-Active Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z/rolling-restart/",
  "owner": "Topology publication missing-active node over operation-workflow progress and replace-remove safety deferral",
  "boundary": "Topology publication missing-active node / operation-workflow progress owner",
  "dominantReason": "publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7",
  "currentState": "The steady-published selected-membership normalization seam is closed. The representative rerun now fails as publication_convergence_blocked on epoch 4 steady_published missingPublishedCount=3, while supporting progress evidence points at replica_operations-p1 under operation_workflow_owner / workflow_progress with replace_remove_safety_blocked deferrals.",
  "nextAction": "Extract the 005730Z publicationConvergence, priority recovery progress summary, replica_operations-p1 workflow evidence, and replace_remove_safety_blocked log fixture; decide whether explicit publication_missing_active_node or operation_workflow_owner / workflow_progress now owns the boundary; then repair only that owner path.",
  "proof": [
    "Focused 005730Z publication missing-active / workflow-progress owner fixture",
    "Focused replace-remove-safety and workflow-progress owner regressions",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner-shared.js",
    "src/rebalancer/rebalancer-constants.js",
    "test/rebalancer/replace-replica-workflow.test.js",
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/failure-bundle-segment-4.js"
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

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-steady-published-selected-membership-timeout-alignment-20260507T005730Z/rolling-restart/`.
3. Result: failed after `130.7s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification is `publication_convergence_blocked` with root cause
   class `topology`, dominant reason
   `publication_missing_active_node=35a891b8-c1a0-5064-9c6e-2acfba61c2a7`,
   confidence `high`, and signals for
   `priorityRecoveryPartition=replica_operations-p1`,
   `priorityRecoveryOwner=operation_workflow_owner`,
   `priorityRecoveryBoundary=workflow_progress`,
   `priorityRecoveryWaitMode=event_driven`, and
   `priorityRecoveryNextAction=wait_for_operation_progress`.
6. Publication convergence is epoch `4` `PUBLISHED` / `steady_published` with
   pending ACK count `0`, blocked-node count `0`, missing-published count `3`,
   and explicit gate reasons `snapshot_coverage=2/5` plus
   `publication_missing_active_node=35a...`,
   `publication_missing_active_node=8be8...`, and
   `publication_missing_active_node=ebc4...`.
7. `priorityRecoveryObservation` agrees with the same three-node deficit and
   keeps `priorityRecoveryClosureState=closure_satisfied_fresh` with no
   unresolved priority-recovery classes.
8. Current active-gate progress agrees with that publication debt: active
   `2/5`, snapshot coverage `2/5`, selected published active `2/5`,
   `missingPublishedCount=3`, and the same three selected missing-published
   node ids.
9. Failure-bundle progress summary keeps workflow evidence subordinate but
   concrete: partition count `3`, selected partition `replica_operations-p1`,
   owner `operation_workflow_owner`, actuation
   `dispatched_waiting_progress`, boundary `workflow_progress`, wait mode
   `event_driven`, next action `wait_for_operation_progress`, contract state
   `pending`, and `lastProgressAtMs=1778115550658`.
10. Log evidence on `11601...` shows operation
    `d80b0e5b-2605-4257-abef-5fd0afb034b8` for `replica_operations-p1`
    repeatedly deferred by safety policy:
    `replace_remove_safety_blocked`, error
    `Critical partition replica_operations-p1 replacement replica replica_operations-p1-r5 is not voter-ready`.
11. The owner question is therefore narrow: whether explicit steady-published
    `publication_missing_active_node` is now the direct canonical blocker, or
    whether the named `replica_operations-p1` workflow-progress /
    replace-remove-safety deferral is the stronger owner that explains why
    those nodes cannot become active.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract a focused `005730Z` publication missing-active / workflow-progress
   fixture for top-level publication convergence, current active-gate
   progress, priority recovery progress summary, and the deferring
   `replica_operations-p1` workflow evidence.
2. Decide whether the canonical owner is explicit
   `publication_missing_active_node`, `operation_workflow_owner /
   workflow_progress`, or a narrower replace-remove-safety actuation seam
   inside that workflow path.
3. Repair only the selected topology/workflow owner path.
4. Preserve the closed steady-published selected-membership normalization
   regression.

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

Canonical contract shape:

1. Failure bundle, publication convergence, current active-gate progress, and
   priority recovery progress summary must agree on one canonical owner for
   the same three-node missing-active set.
2. If workflow progress owns the boundary, the proof must show the named
   operation and deferral surface are the direct cause rather than stale
   supporting context.
3. If explicit `publication_missing_active_node` remains the direct owner,
   workflow-progress and replace-remove-safety evidence must remain subordinate
   until the topology debt closes.

## Residual Closure Inventory

- [ ] Extract the `005730Z` publication missing-active / workflow-progress
      fixture.
- [ ] Decide the owner boundary: explicit publication debt, workflow progress,
      or a narrower replace-remove-safety actuation seam.
- [ ] Add the focused regression and repair the selected owner path.
- [ ] Rerun focused tests, touched-file guardrails, and one representative
      `rolling-restart` scenario.

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

1. Pending.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / workflow-progress boundary
   with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
