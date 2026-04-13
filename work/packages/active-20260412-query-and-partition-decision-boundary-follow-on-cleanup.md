# Query and Partition Decision-Boundary Follow-On Cleanup

## Why

The first runtime-contract-hardening pass covered bounded partition/query state
owners, but the live decision-boundary detector still flags several
low-complexity branch piles in query and partition orchestration. Those are
good follow-on targets because they sit on existing unit-covered paths and can
be hardened without expanding scope.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Hotspots

1. `src/query/strategy-selector.js`
2. `src/query/distributed/parallel-query-coordinator.js`
3. `src/partition/managed-split-workflow.js`

## Invariants

1. Query/partition decision boundaries collect one normalized evidence snapshot
   before emitting one outcome.
2. Retry, admission, and routing failures are emitted from canonical builders,
   not repeated return bags.
3. The cleanup stays inside existing owners; no parallel framework or new
   coordination layer is introduced.

## Analysis Tasks

- [x] Run the live decision-boundary detector on current `src/` owners and use
  the present output rather than stale package assumptions.
- [x] Select low-risk files with focused tests and localized repeated-decision
  seams.

## Implementation Tasks

- [x] Refactor `chooseDefaultStrategy()` to normalize one snapshot, resolve one
  default-strategy state, and emit one canonical decision.
- [x] Refactor `executeOnPartitionWithMetrics()` to route failure/success
  shaping through canonical partition-execution builders.
- [x] Refactor `ManagedSplitWorkflow.executeInternal()` so scheduled retry,
  pressure deferral, and admission denial route through one execution-gate
  adjudicator.

## Done When

1. The touched query/partition seams no longer rely on repeated semantic return
   bags inside the flagged decision functions.
2. Focused detector and unit-suite reruns are green for the new batch.

## 2026-04-12 execution update

Implemented slice:
1. `strategy-selector` now normalizes default-strategy evidence and resolves
   one explicit default-strategy state before emitting the chosen strategy and
   reason.
2. `parallel-query-coordinator` now normalizes partition-execution failures and
   success outcomes through one canonical builder path instead of repeated
   failure/success return bags in `executeOnPartitionWithMetrics()`.
3. `managed-split-workflow` now routes scheduled retry, pressure deferral, and
   admission-denied outcomes through one execution-gate adjudicator before
   returning the canonical split result.

Focused validation passed:
1. `node scripts/check-guideline-decision-boundaries.js src/query/strategy-selector.js src/query/distributed/parallel-query-coordinator.js src/partition/managed-split-workflow.js`
2. `node test/query/strategy-selector.test.js`
3. `node test/query/parallel-query-coordinator.test.js`
4. `node test/partition/managed-split-workflow.test.js`
5. `node test/query/plan-diagnostics.test.js`

Remaining gap in this package:
1. none inside this slice; the later repo-wide zero-out pass absorbed the
   remaining detector hits and the live `src/` audit is now clean.
