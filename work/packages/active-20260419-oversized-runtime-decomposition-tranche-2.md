# Oversized Runtime Decomposition Tranche 2

## Status

Active on 2026-04-19. The first near-threshold runtime cuts are landed and
verified for:

1. `src/bootstrap/system-table-schemas-constants.js`
2. `src/query/distributed/distributed-transaction-coordinator.js`
3. `src/worker/message-group-worker-service.js`
4. `src/rebalancer/move-planner.js`
5. `src/admin/admin-test-run-service.js`
6. `src/index.js`
7. `src/cli/index.js`
8. `src/bootstrap/join-readiness-evaluator.js`
9. `src/partition/partition-split-merge-manager.js`
10. `src/bootstrap/bootstrap-service.js`
11. `src/partition/managed-split-workflow.js`

## Why

The second tier of oversized runtime files also violates the repo hygiene
rule. They should be decomposed after the first hotspot tranche is made
readable and reviewable.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reduce the remaining oversized runtime files below `1500` lines,
   prioritizing:
   `src/control-plane/control-plane-readiness-service.js`
   `src/query/query-executor.js`
   `src/partition/partition-service.js`
   `src/transport/message-router.js`
   `src/cdc/cdc-integration-service.js`
   `src/admin/admin-websocket-api.js`
2. Continue through the rest of the oversized runtime list until no non-exempt
   runtime file exceeds the limit.

## Residual Closure Inventory

- [ ] No non-exempt runtime file remains above `1500` lines. Current remaining
  runtime violations after this slice: `18`.
- [ ] Decomposition follows owner boundaries rather than arbitrary slicing.
- [ ] Metrics and focused tests stay green.
