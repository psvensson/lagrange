# Test And Harness File Decomposition

## Why

The runtime file cleanup will not hold if the matching tests and harness
helpers remain giant files. Oversized tests are harder to maintain and obscure
which invariants each suite is actually proving.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Split oversized test and harness files so no non-exempt test file exceeds
   `1500` lines.
2. Mirror production seams where practical.
3. Separate large scenario helpers from assertion and report helpers so the
   distributed harness remains navigable.

## Priority Targets

1. `test/distributed/harness/cluster.js`
2. `test/distributed/scenarios/postgres-baseline-comparison.js`
3. `test/query/sql-query-engine.test.js`
4. `test/query/query-executor.test.js`
5. `test/bootstrap/node-joining-service.test.js`
6. `test/control-plane/control-plane-readiness-service.test.js`

## Residual Closure Inventory

- [ ] No non-exempt test or harness file remains above `1500` lines.
- [ ] Split suites preserve the original invariant coverage.
- [ ] Harness helper boundaries are explicit and reviewable.

