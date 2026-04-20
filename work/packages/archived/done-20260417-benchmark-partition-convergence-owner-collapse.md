# Benchmark Partition Convergence Owner Collapse

## Why

The April 15, 2026 seven-node rerun moved the failure boundary again.

The harness load-node availability fix worked:

1. the unit-only gate is green
2. the seven-node scenario now reaches `benchmark_events` table creation
3. the benchmark partition spreads to three nodes
4. the benchmark load phase completes

The remaining failure is later and narrower:

`replica spread -> stable benchmark admission on spread replicas -> second partition growth`

Today that boundary is split across multiple owners:

1. `AdminServiceDiscovery` already owns benchmark admission semantics and
   degradation reasons
2. `Cluster.resolveBenchmarkReadyLoadNodes(...)` interprets those semantics and
   the real load lane
3. `table-distribution-helpers` then discards most of that information and
   rebuilds a weaker replica-bearing versus ready-node view

That causes the harness to treat physical spread as progress even when the
newly spread replicas are still blocked by `leadership_unstable`,
`local_replica_not_voter_ready`, or control-plane pressure. This package
exists to collapse that boundary onto one shared benchmark partition
convergence contract.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Reuse the existing benchmark admission semantics already emitted by service
   discovery and the load lane.
2. Add one shared harness snapshot for benchmark load admission and partition
   convergence.
3. Drive partitioning-node planning from that shared snapshot instead of
   recomputing readiness from plain node lists.
4. Surface convergence blocker reasons through planner diagnostics so later
   partition-growth failures expose usable state, not only counts.
5. Record the owner-path change in owner and architecture docs.

## Out Of Scope

1. New load-lane admission semantics in runtime code.
2. Split-threshold tuning or benchmark pressure retuning.
3. Control-plane publication or heartbeat redesign beyond diagnostics and
   state reuse at the harness boundary.
4. Report-classifier rewrites as a substitute for owner-path simplification.

## Invariants

1. Canonical benchmark admission semantics still originate from the existing
   service-discovery and load-lane owners.
2. The harness must not create a second parallel admission model with
   independent reason names.
3. Partition-growth waiting and benchmark-node planning must consume the same
   convergence snapshot.
4. Replica spread without stable benchmark admission must remain visible as a
   blocked convergence state, not as synthetic progress.

## Hotspots

1. `test/distributed/harness/cluster.js`
2. `test/distributed/harness/benchmark-partition-convergence.js`
3. `test/distributed/scenarios/table-distribution-helpers.js`
4. `test/distributed/harness/__tests__/cluster.test.js`
5. `test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`
6. `architecture/current-owner-maps.md`
7. `architecture.md`

## Analysis Tasks

- [x] Name the shared owner boundary explicitly: benchmark admission snapshot
  versus partition convergence.
- [x] Confirm which benchmark admission signals can be reused directly from the
  existing discovery and load-lane owners.
- [x] Identify the smallest shared state model that can describe ready
  replicas, blocked replicas, and routed-only admission.

## Implementation Tasks

- [x] Add one shared benchmark load-admission snapshot with explicit node
  states and blocker reasons.
- [x] Add one shared benchmark partition convergence snapshot that combines
  replica-bearing spread with the admission snapshot.
- [x] Route `Cluster.resolveBenchmarkReadyLoadNodes(...)` through the new
  admission snapshot as a compatibility wrapper.
- [x] Route `createPartitioningBenchmarkLoadNodePlan(...)` through the shared
  convergence snapshot.
- [x] Add focused unit coverage for convergence states and planner diagnostics.
- [x] Record the new owner path in owner and architecture docs.

## Documentation Decision

1. `architecture/current-owner-maps.md` and `architecture.md` are the right
   records for this slice because the change introduces a new shared harness
   owner path.
2. No `.kiro/steering` or doctrine change is needed for this package. The
   existing explicit-snapshot and explicit-state guidance already required this
   collapse; this work just applies it to benchmark admission and partition
   convergence.

## Validation

1. `test/distributed/harness/__tests__/benchmark-partition-convergence.test.js`
2. `test/distributed/harness/__tests__/cluster.test.js`
3. `test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`

## Done When

1. Benchmark admission and partitioning planning share one explicit snapshot.
2. Planner diagnostics can distinguish ready replicas from blocked spread
   replicas without reconstructing the state ad hoc.
3. `Cluster.resolveBenchmarkReadyLoadNodes(...)` remains available as a
   compatibility adapter over the shared snapshot.
