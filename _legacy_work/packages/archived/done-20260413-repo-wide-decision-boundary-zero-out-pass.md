# Repo-Wide Decision-Boundary Zero-Out Pass

## Why

After the earlier bounded cleanup batches, the live decision-boundary detector
still reported a small but cross-cutting set of `src/` violations in CLI,
debug-runtime, logging, query, runtime, service, topology, wasm-service, and
worker owners. Those remaining branch piles were low-risk and unit-covered, so
the fastest way to close the audit was one repo-wide zero-out pass.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Hotspots

1. `src/cli/core/cdc-stream-handler.js`
2. `src/cli/core/live-query-manager.js`
3. `src/cli/index.js`
4. `src/cli/views/config-view.js`
5. `src/debug-runtime/breakpoint-manager.js`
6. `src/debug-runtime/debug-coordinator.js`
7. `src/logging/logging-service.js`
8. `src/query/callback/callback-execution-host.js`
9. `src/query/nested-call-classifier.js`
10. `src/runtime/oci-container-driver.js`
11. `src/runtime/service-runtime-lifecycle.js`
12. `src/service/service-reconciler.js`
13. `src/topology/latency-group-manager.js`
14. `src/wasm-service/runtime-legacy-mapping.js`
15. `src/worker/message-group-worker-service.js`
16. `src/worker/worker-message-bridge.js`

## Invariants

1. Every remaining detector hit must collapse to one canonical outcome path.
2. The cleanup must stay inside existing owners and handlers.
3. The repo-wide `src/` decision-boundary audit is the completion gate.

## Analysis Tasks

- [x] Pull the live repo-wide detector output and use that list as the only
  source of truth for remaining violations.
- [x] Read each flagged function and identify the smallest explicit-state or
  canonical-outcome rewrite that removes the branch pile without widening
  scope.

## Implementation Tasks

- [x] Collapse CLI and debug-runtime status/decision helpers to one outcome
  builder or one canonical expression path.
- [x] Collapse query/runtime/service/topology/worker return-bag branch piles to
  one dispatch or one outcome builder.
- [x] Keep regression fixes local when validation exposes a guard-order bug.

## Done When

1. `node scripts/check-guideline-decision-boundaries.js src` reports zero
   violations.
2. Touched focused suites pass across CLI, debug-runtime, logging, query,
   runtime, service, topology, wasm-service, and worker owners.

## 2026-04-13 execution update

Implemented slice:
1. CLI status/config handlers now build one canonical status or editability
   outcome instead of repeated semantic assignment/return piles.
2. Debug-runtime monotonic transition and pause-reason resolution now emit one
   canonical result per decision.
3. Logging, callback execution, nested-call classification, OCI health, and
   endpoint-intent validation now route through one canonical outcome path.
4. Service reconciliation, latency-group assignment, legacy runtime inference,
   worker CDC dispatch, and worker IPC response shaping now route through one
   explicit dispatcher or one canonical outcome path.
5. Follow-up regression fixes restored null-guard ordering in
   `oci-container-driver.health()` and `validateEndpointIntent()`.

Focused validation passed:
1. `node scripts/check-guideline-decision-boundaries.js src`
2. `node test/cli/core/cdc-stream-handler.test.js`
3. `node test/cli/core/live-query-manager.test.js`
4. `node test/cli/views/config-view.test.js`
5. `node test/cli/index.test.js`
6. `node test/live-query/live-query-manager.test.js`
7. `node test/debug-runtime/breakpoint-manager.test.js`
8. `node test/debug-runtime/breakpoint-manager.integration.test.js`
9. `node test/debug-runtime/debug-coordinator.test.js`
10. `node test/debug-runtime/debug-coordinator.integration.test.js`
11. `node test/logging/logging-service.test.js`
12. `node test/query/nested-call-classifier.test.js`
13. `node test/query/callback-execution-host.test.js`
14. `node test/query/callback-execution-host-throughput-metrics.test.js`
15. `node test/runtime/oci-container-driver.test.js`
16. `node test/runtime/oci-container-driver-contract.test.js`
17. `node test/runtime/service-runtime-lifecycle.test.js`
18. `node test/runtime/service-runtime-lifecycle-journal.test.js`
19. `node test/runtime/service-runtime-lifecycle-idempotency.test.js`
20. `node test/service/service-reconciler.test.js`
21. `node test/topology/latency-group-manager.test.js`
22. `node test/wasm-service/runtime-legacy-mapping.test.js`
23. `node test/worker/message-group-worker-service.test.js`
24. `node test/worker/worker-message-bridge.test.js`
25. `node test/worker/worker-message-bridge.property.test.js`

Remaining gap in this package:
1. none; the repo-wide `src/` decision-boundary audit is clean on the current
   codebase snapshot.
