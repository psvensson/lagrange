# Partition and Query Runtime Explicit-State Hardening

## Why

`PartitionService`, `SQLQueryEngine`, and `QueryExecutor` are major runtime
owners that still use `null` for runtime state, optional dependencies, and
execution-path branching.

That keeps absence-based ambiguity alive in core runtime behavior.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Hotspots

1. `src/partition/partition-service.js`
2. `src/query/sql-query-engine.js`
3. `src/query/query-executor.js`

## Invariants

1. Runtime lifecycle is represented by explicit states, not nullish placeholders.
2. Query/runtime services do not expose sentinel `null` for routing or readiness decisions.
3. Optional capabilities are modeled explicitly.

## Analysis Tasks

- [ ] Inventory null/undefined usage by category: lifecycle, session, dependency, routing, result.
- [ ] Identify the smallest explicit state vocabulary already latent in the service logic.

## Implementation Tasks

- [ ] Replace nullable lifecycle/session state in touched paths with explicit variants.
- [ ] Remove `|| null` dependency storage from touched query/runtime owners.
- [ ] Replace sentinel `return null` from runtime decision paths with explicit results.
- [ ] Add unit coverage for explicit non-null state contracts.

## Done When

1. Touched partition/query runtime contracts do not use `null` or `undefined` as state.
2. Routing/readiness decisions consume explicit runtime state.
3. Remaining ambiguity, if any, is localized and named.

## 2026-04-12 execution update

Implemented slice:
1. `QueryExecutor` now exposes explicit session pin state through
   `getSessionPartitionAddressState(...)` with `unpinned` vs `pinned`.
2. `prioritizeSessionPartitionAddress(...)` now consumes the explicit pin state
   instead of treating absence as implicit control flow.
3. `SQLQueryEngine` now exposes explicit authoritative and bootstrap overlay
   entry states through:
   `getAuthoritativeRoutingOverlayEntryState(...)` and
   `getBootstrapRoutingOverlayEntryState(...)`.
4. Overlay consumers now distinguish `missing`, `expired`, `superseded`,
   `available`, and per-entry `partitionState` explicitly rather than using
   `null` partition owners as hidden state.

Focused validation passed:
1. `node test/query/query-executor-session-pin-state.test.js`
2. `node test/query/sql-query-engine-routing-overlay-state.test.js`
3. `node test/query/query-executor.test.js`
4. `node test/query/sql-query-engine.test.js`

Remaining gap in this package:
1. `PartitionService` and broader query/runtime dependency storage still contain
   nullish compatibility paths outside the hardened routing/session seams.
