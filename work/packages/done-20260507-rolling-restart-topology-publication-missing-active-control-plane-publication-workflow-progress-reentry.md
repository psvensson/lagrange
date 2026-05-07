# Rolling Restart Topology Publication Missing-Active Control-Plane Publication Workflow Progress Reentry

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-07",
  "closed": "2026-05-07",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-join-select-recovery-routing-20260507T041947Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-join-select-recovery-routing-20260507T041947Z/rolling-restart/",
  "owner": "Topology publication missing-active node over control-plane publication workflow progress and join-time recovery routing propagation",
  "boundary": "Topology publication missing-active node / control-plane publication workflow progress and recovery-routing propagation",
  "dominantReason": "publication_missing_active_node=11601fe0-72d6-5853-8590-ec2881853e72",
  "currentState": "The distributed SELECT and cross-partition JOIN routing-readiness leak is now closed. The representative rerun no longer falls back to serveEligible fanout on join-time authoritative reads, but the five-node path still fails at epoch 1 PUBLISHED with active 3/5, coverage 1/5, missingPublishedCount 4, and a fresh sql_transactions-p1 REPLACE safety rejection because target node 11601... is no longer in the current eligible cohort while node-ready lease debt remains live.",
  "nextAction": "Continue in work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md to extract the 041947Z eligible-cohort rejection and lease-blocked pre-execution witnesses, add a focused regression for the selected replace-safety owner path, repair only that boundary, and rerun one representative rolling-restart scenario.",
  "proof": [
    "Focused query fanout routing-readiness regressions",
    "Touched-file static guardrails",
    "Representative rolling-restart --fast-local rerun"
  ],
  "touchedFiles": [
    "src/query/query-executor-segment-1.js",
    "test/query/query-executor.test.js",
    "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-control-plane-publication-workflow-progress-reentry.md"
  ],
  "predecessor": "work/packages/done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md",
  "successor": "work/packages/active-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md"
}
-->

Opened on May 7, 2026 after
[Rolling Restart Topology Publication Missing-Active Priority Operation Scheduling Event-Driven Reentry](./done-20260507-rolling-restart-topology-publication-missing-active-priority-operation-scheduling-event-driven-reentry.md)
closed by migration. Closed the same day by migration into
[Rolling Restart Topology Publication Missing-Active Priority Recovery Eligible-Cohort Replace-Safety Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md).

## Closure Summary

1. Traced the apparent control-plane publication workflow-progress stall down to
   the lower query fanout boundary: distributed `SELECT` and cross-partition
   `JOIN` paths dropped the caller-supplied
   `routingReadinessDimension` before they reached partition fanout.
2. Repaired `src/query/query-executor-segment-1.js` so
   `executeSelect()` and `executeCrossPartitionJoin()` preserve the requested
   routing-readiness dimension on every distributed fanout call.
3. Added focused regressions proving explicit
   `CONTROL_PLANE_RECOVERY_ELIGIBLE` routing survives both ordinary partition
   fanout and per-table join fanout.
4. The representative rerun
   `rolling-restart-after-join-select-recovery-routing-20260507T041947Z`
   removed the joiner-side `serveEligible` routing fallback from the live
   owner path, but the scenario still failed on a new
   `sql_transactions-p1` eligible-cohort / replace-safety seam.

## Current Evidence

1. Representative rerun:
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
6. Publication convergence now stalls at epoch `1` `PUBLISHED` with active
   `3/5`, selected snapshot coverage `1/5`, published active `1/5`, pending
   ACK count `0`, and missing-published count `4`.
7. The repaired routing seam is closed: the representative playback no longer
   needs distributed query fanout to fall back to steady-state
   `serveEligible` routing for join-time authoritative reads.
8. Fresh seed-side runtime evidence shows operation
   `227d1172-3520-48bc-85d1-a7f2e9b54fe1` on `sql_transactions-p1`
   failing `REPLACE` safety because target node `11601...` is no longer in
   the current eligible cohort, which the seed logs as the two-node cohort
   `35a891...` and `7493...`.
9. The same rerun also records rebalancer pre-execution handoff for
   `sql_transactions-p1` with one ready add-like move toward `35a891...` and
   one blocked remove move on `11601...` with
   `preExecuteSkipReasons=["node_not_ready"]` and `skipDetail="lease"`.
10. Transitional cluster membership is still blocked on
    `node_ready_lease_incomplete` with unready nodes `11601...` and
    `35a891...`, keeping node-ready lease settlement in scope as supporting
    evidence for the new boundary.
11. The report still carries stale workflow-progress witness data for
    `sql_transaction_participants-p1`, but the fresh playback and coordinator
    state no longer support control-plane query routing as the direct owner.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Preserve the closed query fanout routing-readiness regressions.
2. Record the `041947Z` blocker migration from join-time recovery-routing
   propagation to priority-recovery eligible-cohort / replace-safety.

## Out Of Scope

1. Reopening the closed priority operation-scheduling package unless the same
   `eligible_but_no_operation_created` seam re-enters directly.
2. Reopening the closed query routing propagation seam unless distributed
   fanout again drops explicit recovery-routing dimensions.
3. Harness-only timeout increases or publication/readiness exemptions.
4. Broad matrix continuation before the new representative blocker closes or
   migrates.
5. Pro or Enterprise behavior.

## Boundary Contract

Semantic owners:

1. This package owned the boundary only while join-time authoritative reads
   depended on distributed fanout preserving an explicit
   `CONTROL_PLANE_RECOVERY_ELIGIBLE` routing-readiness dimension.
2. Once the representative rerun no longer depended on that fallback, the
   package had to close immediately by migration.
3. Eligible-cohort rejection and lease-blocked replace safety belong to the
   successor boundary, not to this completed routing slice.

Canonical contract shape:

1. Callers that request a non-default routing-readiness dimension must see the
   same dimension at the partition fanout boundary for distributed reads.
2. Cross-partition joins may not preserve recovery routing on one table and
   silently drop it on another.
3. The representative rerun must either keep the same selected owner boundary
   or move sprint bookkeeping to one new named boundary with replayable
   evidence.

## Residual Closure Inventory

- [x] Trace the `034622Z`/`041947Z` join-time routing seam to one executable
      owner boundary.
- [x] Add focused regressions for distributed select and join fanout routing.
- [x] Repair the selected owner path and rerun focused tests, touched-file
      guardrails, and one representative `rolling-restart` scenario.
- [x] Split the migrated eligible-cohort / replace-safety blocker into a new
      active package before closure.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, and diff whitespace.
- [x] File-scoped baseline recorded before production edits for touched source
      and focused test files.

Closure:

- [x] Same guardrails rerun after implementation.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [x] Any out-of-scope inherited violation has a linked follow-on package.

## Validation

1. `npx tap test/query/query-executor.test.js`
   passed.
2. `npx tap test/query/query-executor-distributed-metrics.test.js`
   passed.
3. `node scripts/check-guideline-literals.js src/query/query-executor-segment-1.js test/query/query-executor.test.js`
   passed with `0 new literal-guideline violations`.
4. `node scripts/check-guideline-decision-boundaries.js src/query/query-executor-segment-1.js`
   passed with `0 decision-boundary guideline violations`.
5. `node scripts/check-runtime-grammar-contracts.js src/query/query-executor-segment-1.js`
   passed with `0 runtime-grammar-contract violations`.
6. `npx eslint --no-warn-ignored src/query/query-executor-segment-1.js test/query/query-executor.test.js`
   passed.
7. `git diff --check`
   passed.
8. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-join-select-recovery-routing-20260507T041947Z.report.json --fast-local --verbose`
   failed after `135.5s`, but removed the join-time recovery-routing fallback
   and migrated the representative path to priority-recovery eligible-cohort
   / replace-safety.

## Done When

1. The representative path either reaches ACTIVE convergence or migrates away
   from the topology publication missing-active / control-plane publication
   workflow-progress and recovery-routing boundary with replayable evidence.
2. Sprint bookkeeping points to the successor package as the sole current
   representative owner.

## Migration

This package closes by migration. The repaired boundary was distributed query
fanout propagation for join-time control-plane recovery routing. The successor
package is
[Rolling Restart Topology Publication Missing-Active Priority Recovery Eligible-Cohort Replace-Safety Reentry](./active-20260507-rolling-restart-topology-publication-missing-active-priority-recovery-eligible-cohort-replace-safety-reentry.md),
which owns the `041947Z` `sql_transactions-p1` eligible-cohort rejection,
lease-blocked remove path, and the remaining epoch-1 `PUBLISHED`
missing-active stall.
