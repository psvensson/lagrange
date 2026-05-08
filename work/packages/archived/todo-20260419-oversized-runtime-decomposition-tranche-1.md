# Oversized Runtime Decomposition Tranche 1

## Why

The largest runtime owners still exceed the `1500` line ceiling by a wide
margin. Even where formatting is acceptable, the file size alone keeps too
many boundaries and lifecycles co-located.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reduce these highest-risk runtime files below `1500` lines through bounded
   owner extraction:
   `src/query/sql-query-engine.js`
   `src/rebalancer/operation-workflow-owner.js`
   `src/bootstrap/node-joining-service.js`
   `src/rebalancer/rebalance-coordinator.js`
   `src/rebalancer/unified-rebalancer.js`
2. Use existing shared helpers and owners first.
3. Keep new boundaries semantic and reviewable rather than extracting
   arbitrary utility fragments.

## Scenario Targets

1. `node-join-under-load`
2. `seven-node-read-write-load-transaction-recovery`
3. `seed-restart-under-load`

## Residual Closure Inventory

- [ ] Each tranche-1 runtime hotspot is at or below `1500` lines.
- [ ] Extracted boundaries have explicit owner contracts.
- [ ] Focused proof exists for each moved boundary.

