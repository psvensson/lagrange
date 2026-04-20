# Priority Recovery Admission Unification

## Why

Priority recovery admission was the clearest duplicated decision in the hot
path. One plan builder existed, but planning and scheduling still wrapped it
through divergent callers with different semantics.

That was directly showing up as repeated `budget_exceeded`, starvation of
critical partitions, and prolonged `PRIORITY_CONTROL_PLANE_RECOVERY_PENDING`.

## Scope Basis

Phase 0.1 roadmap scope: topology workflow stabilization and failure
simulation correctness under stress.

## In Scope

1. Make one canonical priority-recovery admission plan the only truth for
   recovery-active, emergency-active, and slot reservation semantics.
2. Remove semantic drift between `RebalanceCoordinator` and
   `UnifiedRebalancer`.
3. Encode admission outputs as an explicit decision model rather than caller
   interpretation.
4. Add guardrail tests proving the same plan is used by both planning and
   scheduling paths.

## Out Of Scope

1. Active membership / recovery cohort unification.
2. Operation owner-path unification.
3. Transport late-response cleanup.
4. Split workflow refactors.

## Invariants

1. Critical transport/control-plane partitions must not be starved by ordinary
   priority partitions.
2. Ordinary non-priority work must still honor reserved capacity during active
   recovery.
3. Under load, admission may defer but must not misclassify or silently widen.

## Hotspots

1. `src/control-plane/priority-recovery-snapshot.js`
2. `src/rebalancer/rebalance-coordinator.js`
3. `src/rebalancer/unified-rebalancer.js`
4. `test/control-plane/priority-recovery-snapshot.test.js`
5. `test/rebalancer/unified-rebalancer.test.js`
6. `test/rebalancer/*coordinator*.test.js`

## Detection / Analysis Tasks

- [x] Build the concern inventory.
- [x] Build the semantic-question matrix.
- [x] Detect duplicate ownership.
- [x] Detect the implicit state model.
- [x] Detect remaining branch lattices at the caller boundary.

## Implementation Tasks

- [x] Define the canonical admission-plan contract and reason fields.
- [x] Route `RebalanceCoordinator` through the canonical contract without local
      semantic additions.
- [x] Route `UnifiedRebalancer` through the same canonical contract with the
      same semantics.
- [x] Remove or downgrade divergent wrapper logic.
- [x] Tighten tests so both callers fail if they drift again.

## Outcome

Completed as the admission-layer simplification batch. The remaining harness
failures are no longer explained by coordinator vs rebalancer admission drift
alone; they are now tracked in the recovery-architecture sprint.

## Validation

- [x] `test/control-plane/priority-recovery-snapshot.test.js`
- [x] `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
- [x] `test/rebalancer/unified-rebalancer.test.js`
- [x] Partial distributed verification completed; remaining five-node recovery
      failures moved to the recovery-architecture sprint

## Done When

1. There is one admission plan contract for priority recovery.
2. Both coordinator and unified rebalancer consume it without semantic drift.
3. Critical and ordinary priority partitions have explicit, testable admission
   behavior.
4. Residual recovery failures, if any, are tracked outside this package.
