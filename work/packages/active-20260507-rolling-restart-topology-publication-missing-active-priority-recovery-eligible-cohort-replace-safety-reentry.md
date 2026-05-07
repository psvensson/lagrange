# Rolling Restart Topology Publication Missing-Active Priority Recovery Eligible-Cohort Replace-Safety Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-join-select-recovery-routing-20260507T041947Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-join-select-recovery-routing-20260507T041947Z/rolling-restart/",
  "owner": "Topology publication missing-active node over priority recovery eligible-cohort replace-safety regression after join-time recovery-routing closure",
  "boundary": "Topology publication missing-active node / priority recovery eligible-cohort replace-safety owner",
  "dominantReason": "publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72",
  "currentState": "The join-time distributed recovery-routing seam is closed. The representative rerun still fails at epoch 1 PUBLISHED with active 3/5, coverage 1/5, pending ACK count 0, and missingPublishedCount 4. Fresh runtime evidence now centers on sql_transactions-p1 operation 227d1172-3520-48bc-85d1-a7f2e9b54fe1: target node 11601... already entered REPLACE creation, then the seed rejects the same target as no longer in the current eligible cohort while pre-execution also marks its remove leg blocked on node-ready lease debt.",
  "nextAction": "Extract the 041947Z sql_transactions-p1 eligible-cohort rejection, lease-blocked pre-execution handoff, and target-side in-progress REPLACE witnesses; add a focused regression for the selected coordinator/rebalancer replace-safety path; repair only that owner boundary; and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused 041947Z eligible-cohort replace-safety witness fixture",
    "Focused priority recovery eligible-cohort replace-safety regression",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/rebalancer/rebalance-coordinator-segment-5.js",
    "src/rebalancer/unified-rebalancer-segment-4-stage-4.js",
    "test/rebalancer/priority-follow-up-target-readiness.test.js",
    "test/rebalancer/unified-rebalancer.test.js",
    "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Control-Plane Publication Workflow Progress Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md)
closed by migration. The distributed recovery-routing seam is now preserved,
but the representative rerun still fails at the same top-level publication
gate on a new priority-recovery safety boundary.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-join-select-recovery-routing-20260507T041947Z.report.json`.
2. Playback directory:
   `test-output/reports/.playback/rolling-restart-after-join-select-recovery-routing-20260507T041947Z/rolling-restart/`.
3. Result: failed after `135.5s`.
4. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
5. Failure classification remains `publication_convergence_blocked` with root
   cause class `topology`, dominant reason
   `publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72`,
   and confidence `high`.
6. Publication convergence stalls at epoch `1` `PUBLISHED` with active `3/5`,
   selected snapshot coverage `1/5`, published active `1/5`, pending ACK
   count `0`, and missing-published count `4`.
7. Seed-side playback on `7493...` shows operation
   `227d1172-3520-48bc-85d1-a7f2e9b54fe1` on `sql_transactions-p1`
   blocked by safety policy because target node `11601...` is no longer in
   the current eligible cohort, which the log records as
   `35a891...` and `7493...`.
8. The same seed playback later emits rebalancer pre-execution handoff for
   `sql_transactions-p1` with two planned `replace` moves: one ready add-like
   move toward `35a891...`, and one blocked remove move on `11601...` with
   `preExecuteSkipReasons=["node_not_ready"]` and `skipDetail="lease"`.
9. Target-side playback on `11601...` shows the same operation already
   entered `SENDING` then `CREATING`, and repeated `CREATE_REPLICA` handling
   logs report `Replica creation already in progress` for
   `sql_transactions-p1-r4`.
10. Transitional cluster membership on the seed remains
    `topology_settling_blocked` with blocker reason
    `node_ready_lease_incomplete` and unready node set `11601...`,
    `35a891...`.
11. The report’s priority-recovery summary is internally inconsistent with the
    fresh runtime witness set: it marks `sql_transactions-p1` as `converged`
    and still retains stale workflow-progress witness data on
    `sql_transaction_participants-p1`, so the next slice must decide whether
    the direct defect is runtime replace-safety, stale authoritative
    visibility, or their normalization boundary.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Extract the focused `041947Z` witness set for the failed
   `sql_transactions-p1` eligible-cohort rejection, lease-blocked
   pre-execution handoff, and target-side `REPLACE` creation-in-progress
   timeline.
2. Decide whether the canonical owner is coordinator replace-safety,
   rebalancer eligible-cohort admission, or stale authoritative
   normalization that falsely collapses the failed operation to `converged`.
3. Add a focused regression for the selected owner path before the next
   representative rerun.
4. Preserve the closed distributed recovery-routing regressions from the
   predecessor package.

## Out Of Scope

1. Reopening the closed query routing propagation package unless the same
   distributed fanout contract regresses directly.
2. Harness-only timeout increases or publication/readiness exemptions.
3. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
4. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. Rebalancer eligible-cohort admission owns the boundary if a target remains
   selected for `REPLACE` after the authoritative effective eligible cohort
   excludes it.
2. Coordinator replace-safety owns the boundary if an in-flight operation that
   already reached target-side creation is incorrectly failed or collapsed
   after a cohort refresh.
3. Snapshot normalization owns the boundary if runtime evidence still shows a
   failed or in-progress operation while the canonical priority-recovery
   summary erases that state and reports `converged`.
4. Top-level publication missing-active remains the scenario carrier, not the
   implementation owner, unless no lower direct seam can explain the live
   failure.

Canonical contract shape:

1. One authoritative view must determine whether a target is still eligible
   for `REPLACE`, and that decision must agree across planning,
   coordinator safety checks, and control-plane summaries.
2. A target node that already began replica creation must not be silently
   erased from the owner summary without one explicit canonical failure state
   and reason.
3. Failure bundle, priority-recovery summary, and playback timeline must agree
   on one selected owner boundary before the package can close.

## Residual Closure Inventory

- [ ] Extract the `041947Z` eligible-cohort / replace-safety witness fixture.
- [ ] Decide the direct owner boundary: rebalancer admission,
      coordinator replace-safety, or stale authoritative normalization.
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

1. Focused `041947Z` eligible-cohort / replace-safety fixture passes.
2. Focused owner-path regression passes.
3. Touched-file guardrails are rerun and recorded.
4. One representative `rolling-restart --fast-local` rerun is recorded with
   explicit pass or blocker migration notes.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / priority recovery
   eligible-cohort replace-safety boundary with replayable evidence.
2. Sprint bookkeeping points to this package as the sole current
   representative owner.
