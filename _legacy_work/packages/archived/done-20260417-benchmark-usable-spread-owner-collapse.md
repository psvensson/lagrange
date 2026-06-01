# Benchmark Usable-Spread Owner Collapse

## Why

The latest seven-node reruns no longer fail at table creation or at the first
control-plane visibility boundary. They now fail later with a narrower
distributed mismatch:

1. `benchmark_events-p1` spreads physically
2. multiple nodes become at least partially benchmark-admission-visible
3. only a smaller subset becomes locally usable for split-driving pressure
4. partition growth stalls before the second partition appears

That means the system currently has physical spread without usable spread.

The deeper issue is not one more scheduler bug. The boundary between:

`physical replica spread -> local replica usability -> benchmark admission ->
dispatch contribution`

is still interpreted by several consumers with different local logic:

1. `AdminServiceDiscovery` owns benchmark readiness and degradation reasons
2. `Cluster.resolveBenchmarkLoadAdmissionSnapshot(...)` converts that into a
   harness admission snapshot
3. `BenchmarkPartitionConvergence` adds replica-bearing spread
4. `LoadNodeAvailability` reasons about dispatch contribution
5. `table-distribution-helpers` and `load-generator` still need to reconstruct
   too much from partial views

This package exists to collapse that boundary into one reusable
`UsableBenchmarkSpreadSnapshot` contract so the harness stops rediscovering the
same node and partition truth at multiple layers.

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## In Scope

1. Reuse the existing discovery-owned benchmark readiness and degradation
   signals instead of adding another harness-only readiness model.
2. Define one shared `UsableBenchmarkSpreadSnapshot` that describes, per node
   and per partition candidate:
   - `replicaBearing`
   - `localReplicaSeen`
   - `localReplicaVoterReady`
   - `leadershipStable`
   - `admissionReady`
   - `dispatchContribution`
   - `blockerReasons`
   - `retryAfterMs`
3. Make cluster admission, partition-growth planning, and load-generator node
   composition consume that snapshot rather than re-deriving local booleans.
4. Keep the harness as a client of shared owner logic rather than a second
   owner of benchmark convergence semantics.
5. Record the new owner path in architecture and owner-map docs.

## Out Of Scope

1. Split-threshold tuning or benchmark ops/sec retuning.
2. Timeout inflation as a substitute for stronger state ownership.
3. New runtime control-plane semantics beyond reusing existing discovery and
   readiness owners.
4. Report-classifier changes that do not consume the shared snapshot.

## Invariants

1. `AdminServiceDiscovery` remains the semantic source for benchmark readiness
   and degradation reasons.
2. The harness must not add a second independent vocabulary for the same
   blocked or ready states.
3. One node can be physically spread yet still not count as a usable local
   contributor; that distinction must remain explicit.
4. Dispatch contribution must come from the same snapshot that explains
   partition-growth blockers.
5. Routed-only admission must stay visible without being promoted to local
   split-driving usability.

## Hotspots

1. `src/admin/admin-service-discovery.js`
2. `test/distributed/harness/cluster.js`
3. `test/distributed/harness/benchmark-partition-convergence.js`
4. `test/distributed/harness/load-node-availability.js`
5. `test/distributed/harness/load-generator.js`
6. `test/distributed/scenarios/table-distribution-helpers.js`
7. `test/distributed/harness/__tests__/benchmark-partition-convergence.test.js`
8. `test/distributed/harness/__tests__/cluster.test.js`
9. `test/distributed/harness/__tests__/load-node-availability.test.js`
10. `test/distributed/harness/__tests__/load-generator.test.js`
11. `architecture/current-owner-maps.md`
12. `architecture.md`

## Analysis Tasks

- [x] Name the missing boundary explicitly: physical spread versus usable spread.
- [x] Confirm that the current system already has reusable readiness and
  degradation semantics worth extending instead of replacing.
- [x] Identify the minimum shared snapshot fields needed to stop consumers from
  re-deriving node usability independently.

## Implementation Tasks

- [x] Add one shared usable-spread owner slice on top of the current
  admission and convergence owners by preserving discovery readiness,
  degradation, and retry evidence in the shared evaluations and deriving one
  explicit dispatch-contribution state from the convergence snapshot.
- [x] Keep `Cluster.resolveBenchmarkReadyLoadNodes(...)` as a compatibility
  adapter over the richer shared admission snapshot.
- [x] Route partition-growth waiting and steady dispatch node selection through
  the new shared snapshot.
- [x] Remove or collapse duplicated local readiness/usability reconstruction in
  harness planning helpers.
- [x] Add focused regression coverage for nodes that are:
  - physically spread but not locally usable
  - routed-admission-only
  - locally usable and split-driving
- [x] Record the first owner-path slice in owner and architecture docs.

## Progress Notes

1. The shared admission snapshot now preserves more of the existing
   discovery-owned truth instead of collapsing it immediately to a few
   booleans: routing/schema/topology readiness, local replica role and voter
   readiness, degradation state, discovery reason details, load-lane reason
   codes, and bounded `retryAfterMs`.
2. The shared convergence snapshot now derives one explicit
   `dispatchContributionState`, so downstream consumers can distinguish local
   primary contributors from blocked local replicas and routed support nodes
   without inventing a second vocabulary.
3. Compatibility consumers still work through the same public harness
   surfaces, but they now sit on a richer shared owner path.
4. `createPartitioningBenchmarkLoadNodePlan(...)` now preserves
   `localPrimaryNodes` and `routedSupportNodes` across the initial bootstrap
   dispatch handoff instead of dropping that owner evidence when the steady
   resolver starts.
5. The new boundary-transition scenario layer now covers usable-spread
   transitions directly, so the harness has a middle validation surface before
   the full seven-node rerun.
6. `resolveBenchmarkPartitionDispatchMode(...)` now keeps partitioning load in
   backfill mode until the usable-spread target exists, rather than treating
   the smaller bootstrap quorum as the steady-state completion signal.
7. `LoadNodeAvailability` now reserves `slot_stalled` for peers that have
   aged out at the borrowed dispatch ceiling, so healthy nodes can keep
   borrowing capacity from weak peers instead of losing that budget as soon as
   the steady contribution floor fills.

## Documentation Decision

1. `architecture/current-owner-maps.md` should name the new shared
   `UsableBenchmarkSpreadSnapshot` building block and its consumers.
2. `architecture.md` should capture why usable spread is the owned boundary,
   not raw spread count.
3. No doctrine change belongs in this package because the doctrine follow-on is
   tracked separately as its own repo-wide package.

## Validation

1. `node test/distributed/harness/__tests__/benchmark-partition-convergence.test.js`
2. `node test/distributed/harness/__tests__/cluster.test.js`
3. `node test/distributed/harness/__tests__/load-node-availability.test.js`
4. `node test/distributed/harness/__tests__/load-generator.test.js`
5. `node test/distributed/harness/__tests__/table-distribution-helpers-read-path.test.js`
6. `node test/distributed/harness/__tests__/table-distribution-helpers-scenario-policy.test.js`
7. `node test/distributed/harness/__tests__/boundary-transition-scenarios.test.js`
8. Unit-only gate
9. Seven-node distributed rerun

## Done When

1. Physical spread, local usability, benchmark admission, and dispatch
   contribution are explained by one shared owner snapshot.
2. The harness no longer re-derives the same node usability boundary in
   multiple local forms.
3. Failure diagnostics can distinguish physical spread from usable spread
   without ad hoc reconstruction.
4. The next seven-node rerun either passes or fails at a later boundary with a
   materially different owned state.
