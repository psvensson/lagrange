# Authoritative Operation Visibility Under Pressure

## Why

The current seven-node failure still shows repeated `replica_operations`
owner-query timeouts and empty or missing operation visibility while recovery
planning is trying to decide whether it can complete over-target work. That is
still timeout-shaped silence where the system needs one authoritative
pending/deferred operation-visibility contract.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one authoritative operation-visibility outcome under transport or
   control-plane pressure.
2. Preserve pending/deferred visibility semantics through recovery planners and
   repositories instead of collapsing to timeouts or empty collections.
3. Align diagnostics and tests with the shared operation-visibility contract.

## Out Of Scope

1. New recovery planner heuristics unrelated to operation visibility.
2. Transport backlog isolation except where required to expose the canonical
   visibility outcome.

## Invariants

1. Recovery consumers must not branch on empty collections or opaque timeouts
   when operation visibility is still unresolved.
2. Pending visibility must remain distinct from terminal failure.
3. One owner path must classify the visibility state for all recovery
   consumers.

## Hotspots

1. `src/rebalancer/replica-operation-repository.js`
2. `src/rebalancer/rebalance-coordinator.js`
3. `src/control-plane/authoritative-control-plane-view.js`
4. `test/rebalancer/`
5. `test/control-plane/`

## Analysis Tasks

- [x] Confirm the latest failure family still hinges on `replica_operations`
  visibility timeouts.
- [x] Identify all current timeout-shaped fallbacks or empty-result paths.

## Implementation Tasks

- [x] Add one explicit operation-visibility outcome model.
- [x] Cut repository/planner consumers over to that model.
- [x] Add focused regression coverage and update diagnostics.

## Progress Notes

1. Added one canonical deferred operation-visibility outcome in
   `src/rebalancer/replica-operation-repository.js` so authoritative
   `replica_operations` owner reads now preserve pending/deferred state
   instead of collapsing retryable pressure into empty visibility.
2. Cut `src/rebalancer/rebalance-coordinator.js` over to the typed deferred
   outcome so planner callers now receive one canonical
   `DEFERRED_RETRY_PENDING` skip/error surface rather than inferring true
   emptiness from timeout-shaped silence.
3. Focused coverage is green in
   `test/rebalancer/replica-operation-repository.test.js`,
   `test/rebalancer/rebalance-coordinator-operation-ownership.test.js`, and
   the new middle-layer scenario in
   `test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`.
4. The package remains active because the latest seven-node checkpoint still
   shows routed owner-query timeouts against `replica_operations` under real
   cluster pressure, so the authoritative read path is improved but not yet
   fully stabilized in distributed execution.
5. The first diagnostics-visibility slice now keeps `REPLACE` rows at
   `ACTIVE` visible as in-flight source-removal work and emits canonical
   `replicaOperations.rows` through the control snapshot and harness client,
   so convergence triage no longer collapses live work into `0` in-flight or
   `Operation history: none`.
6. A fresh checkpoint rerun still did not close with a new report artifact,
   but live logs now point at the next remaining boundary more cleanly:
   transport-pressure `DEGRADE` is still turning into
   `query_admission_deferred`, routed `replica_operations` read timeouts, and
   missing canonical leader identity under load instead of the earlier
   operation-history blind spot.

## Validation

1. Passed: `node test/rebalancer/replica-operation-repository.test.js`
2. Passed: `node test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
3. Passed: `node test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
4. Passed: `node test/rebalancer/replica-operation-liveness.test.js`
5. Passed: `node test/admin/admin-control-snapshot.test.js`
6. Passed: `node test/distributed/harness/__tests__/node-client.test.js`
7. Passed: `node test/distributed/harness/__tests__/assertions.test.js`
8. Passed: `node test/admin/admin-websocket-api.test.js`
9. The last completed checkpoint rerun remained red:
   `test-output/reports/seven-node-runtime-owner-collapse-20260416T020251Z.report.json`
10. A follow-up rerun attempt on April 16, 2026 was stopped after live logs
    reproduced the next boundary but before a fresh report artifact was
    written.

## Done When

1. `replica_operations` pressure no longer appears to recovery consumers as
   timeout-shaped silence.
2. Recovery planning can distinguish pending visibility from terminal failure
   and continue making bounded progress.
