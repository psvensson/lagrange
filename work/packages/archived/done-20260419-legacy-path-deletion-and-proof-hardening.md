# Legacy Path Deletion And Proof Hardening

## Status

Complete on 2026-04-19 after deleting the touched boundary shadow paths,
adding explicit regression coverage for the new contracts, and proving the
combined package surfaces green on focused suites plus repo metrics. Named
harness reruns remain the next external evidence step and were intentionally
deferred until all package work was closed.

## Why

The architecture only becomes predictable when old grammars are deleted and
the remaining ones are proven through targeted invariants and distributed
evidence.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Delete superseded helpers, fallbacks, and shadow vocabularies from the
   touched boundaries.
2. Add proof layers for new contracts: static guards, focused owner tests,
   property/invariant tests, and named harness reruns.
3. Tighten diagnostics so failures classify to one owner boundary.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`
4. `seven-node-load-during-partitioning`

## Residual Closure Inventory

- [x] Superseded raw ACK readers, cloned dispatch shadow state, and local
      leader/visibility branch piles touched by this tranche are deleted where
      the shared contracts now own the meaning.
- [x] The new semantic-phase, partition-kernel, and transport-delivery
      contracts all have focused proof plus `npm run test:metrics`.
- [x] Harness work is no longer blocked by unfinished package code; the next
      failures can be evaluated as typed blocker stories against the new
      boundaries.

## Validation

1. `test/rebalancer/replica-status-completeness.property.test.js`
2. `test/rebalancer/replica-operation-repository.test.js`
3. `test/rebalancer/unified-rebalancer.test.js`
4. `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
5. `test/partition/partition-write-kernel.test.js`
6. `test/partition/partition-service-raft-propose-metrics.test.js`
7. `test/node/replica-handler.test.js`
8. `test/transport/transport-semantic-outcome.test.js`
9. `test/transport/message-router.test.js`
10. `test/bootstrap/node-joining-service.test.js`
11. `test/service/service-dispatcher.test.js`
12. `npm run test:metrics`
