# MOVE_ASSIGNMENT Liveness Proof Hardening

April 26 closure: the `MOVE_ASSIGNMENT` liveness proof now verifies the
completion boundary directly instead of relying on the generic active-row
exclusion.

## Why

The active rolling-restart package previously observed stale active
`MOVE_ASSIGNMENT` rows with `completedAt` in the operation-drain evidence. The
first fix made completed `MOVE_ASSIGNMENT` rows terminal for liveness, but the
focused test could still pass through the older generic rule that excluded
active non-`REPLACE` rows.

This package tightens that proof:

1. active `MOVE_ASSIGNMENT` rows without durable completion remain in flight
2. active `MOVE_ASSIGNMENT` rows with `completedAt` drain
3. report-shaped rows using `operation_type` and `completed_at` are proven
   absent from summary blockers

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Runtime stability and harness determinism closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Rolling restart operation transition pressure and over-target trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md)

## In Scope

1. Remove the accidental generic exclusion for active `MOVE_ASSIGNMENT` rows.
2. Keep durable `completedAt` active `MOVE_ASSIGNMENT` rows terminal.
3. Add a negative proof for active assignment rows without completion.
4. Add a summary-level proof for report-shaped completed assignment rows.

## Out Of Scope

1. Changing `REPLACE` remove-dispatch liveness.
2. Treating incomplete bootstrap assignment rows as terminal.
3. Harness-only ignores for operation drain.
4. Pro or Enterprise features.

## Shared Boundary Contract

- Semantic owner:
  replica operation liveness.
- Canonical contract:
  bootstrap `MOVE_ASSIGNMENT` rows leave operation drain only after durable
  completion or observed target ownership.
- Allowed consumers:
  control-plane quiescence, post-rebalance closure, rolling-restart triage,
  and operation-drain summaries.
- Prohibited reinterpretations:
  active status alone is not enough to close a bootstrap assignment row.

## Progress Grammar

1. `assignment_active_pending_completion` means the row is active but still
   lacks durable completion or observed target ownership.
2. `assignment_completed` means the row has durable completion evidence and no
   longer blocks drain.
3. `assignment_observed_converged` means service ownership proves the target
   owns the assignment even before durable completion is visible.

## Residual Closure Inventory

- [x] Active `MOVE_ASSIGNMENT` rows without completion remain in flight.
- [x] Completed active `MOVE_ASSIGNMENT` rows drain.
- [x] Report-shaped completed rows are absent from in-flight summaries.
- [x] Focused liveness tests pass.

## Validation

Executed on April 26, 2026:

1. `npm test -- test/rebalancer/replica-operation-liveness.test.js`
2. Result: passed, `22/22`.
3. `npm run audit:guideline:literals`
4. Result: passed with 0 new violations and 6219 inherited baseline
   violations.
5. `npm run audit:guideline:decision-boundaries`
6. Result: passed.
7. `git diff --check`
8. Result: passed.

## Done When

1. The liveness proof distinguishes active-pending from completed
   `MOVE_ASSIGNMENT` rows.
2. The package has focused test coverage and no remaining runtime work.
