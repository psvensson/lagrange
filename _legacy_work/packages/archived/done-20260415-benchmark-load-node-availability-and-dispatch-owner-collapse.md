# Benchmark Load-Node Availability And Dispatch Owner Collapse

## Why

The April 15, 2026 seven-node rerun moved the failure boundary again.

The old control-plane mutation visibility stall is fixed. The live failure now
reaches benchmark load and then stalls on partition growth with:

1. `partition_growth_stalled`
2. `nodeSlotUnavailable` as the first-fault dominant reason
3. heavy skew toward two load-bearing nodes while several admitted nodes remain
   slot-saturated, timeout-prone, or later admission-blocked

That points to one harness boundary:

`benchmark-ready node admission -> load generator dispatch capacity`

Today those two steps do not share one state model. The cluster admission path
can say a node is benchmark-ready, but the load generator still reasons about
that node through separate local booleans:

1. external admission ready or not
2. local cooldown blocked or not
3. slot available or not

That leaves one missing state: a node can still be admitted yet stop
contributing useful dispatch capacity because its slots are saturated by
long-running benchmark queries. Healthy nodes then fail to borrow that budget,
load under-dispatches, and partition growth never gets the intended pressure.

This package exists to collapse that harness boundary onto one canonical
load-node availability state.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Define one canonical benchmark load-node availability snapshot for harness
   dispatch.
2. Distinguish benchmark-ready nodes that are truly contributing dispatch
   capacity from nodes that are only nominally admitted.
3. Let healthy nodes borrow slot budget when peer nodes are slot-stalled.
4. Add deterministic unit coverage for the slot-stalled capacity case.
5. Record the owner-path change in the current owner map and architecture notes.
6. Re-run the full unit gate and the seven-node distributed scenario.

## Out Of Scope

1. Runtime query-engine or control-plane readiness redesign.
2. Benchmark threshold tuning without owner-path simplification.
3. Report-writer classifier tuning as a substitute for the load-path fix.
4. Scenario-specific load loosening or timeout inflation.

## Invariants

1. Benchmark load admission still starts from the cluster-owned benchmark-ready
   node set.
2. Dispatch capacity uses one explicit availability outcome instead of separate
   local booleans.
3. Slot-stalled nodes stop contributing dispatch capacity before they can
   collapse healthy-node throughput.
4. Pressure may reduce throughput, but healthy nodes must be able to borrow
   budget from stalled peers.
5. The harness fix must not add a second parallel node-admission path.

## Hotspots

1. `test/distributed/harness/load-generator.js`
2. `test/distributed/harness/__tests__/load-generator.test.js`
3. `test/distributed/scenarios/seven-node-read-write-load-transaction-recovery.js`
4. `test/distributed/scenarios/table-distribution-helpers.js`
5. `architecture/current-owner-maps.md`
6. `architecture.md`

## Analysis Tasks

- [x] Confirm the live harness failure is caused by slot-stalled admitted nodes
  still counting as dispatch capacity contributors.
- [x] Name the missing harness owner boundary explicitly:
  benchmark-ready admission versus dispatch-capacity contribution.
- [x] Identify the smallest explicit state model that can drive dispatch,
  capacity borrowing, and diagnostics together.

## Implementation Tasks

- [x] Add a failing regression proving slot-stalled nodes must stop
  contributing dispatch-capacity budget.
- [x] Implement one canonical load-node availability snapshot/state model.
- [x] Route load-generator candidate selection and dynamic per-node slot-budget
  borrowing through that shared state model.
- [x] Record the new owner path in owner/architecture docs.
- [ ] Run focused harness unit tests, the unit-only gate, and the seven-node
  distributed scenario.

## Progress Notes

1. `LoadNodeAvailability` now owns an explicit `slot_borrowing` state between
   nominal per-node saturation and the borrowed dispatch ceiling. That keeps
   healthy nodes dispatchable under borrowed budget without letting borrowed
   capacity rewrite long-stalled nodes into generic `ready`.
2. `LoadRun` candidate selection and recovery fallback both consume the shared
   availability state. The fallback path now probes only `local_blocked`
   nodes that are expected to reopen, instead of reintroducing slot-stalled
   nodes once healthy peers have already absorbed the borrowed budget.
3. Owner-level regression coverage lives in
   `test/distributed/harness/__tests__/load-node-availability.test.js`, and
   load-generator regressions prove both healthy-node borrowing and stalled
   node exclusion under the same borrowed-cap scenario.

## Validation

1. `test/distributed/harness/__tests__/load-generator.test.js`
2. `test/distributed/harness/__tests__/cluster.test.js`
3. `test/distributed/harness/__tests__/table-distribution-helpers-scenario-policy.test.js`
4. Unit-only gate:
   `npx tap $(find test -type f -name '*.test.js' ! -name '*.integration.test.js' ! -path 'test/integration/*' ! -path 'test/bootstrap/*' | sort)`
5. Distributed rerun:
   `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario seven-node-read-write-load-transaction-recovery ...`

## Done When

1. The harness has one explicit load-node availability owner path.
2. Slot-stalled nodes no longer count as healthy dispatch-capacity
   contributors.
3. Focused unit tests prove healthy nodes can borrow budget from slot-stalled
   peers.
4. The unit-only gate is green.
5. The seven-node rerun either passes or fails at a later, clearly different
   boundary.
