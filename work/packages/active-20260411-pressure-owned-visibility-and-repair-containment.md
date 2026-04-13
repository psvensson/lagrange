# Pressure-Owned Visibility and Repair Containment

## Why

The current runtime contains several overlapping amplification loops:

1. writes retry under transient control-plane failure
2. writes may then wait for cache visibility before returning
3. reads may trigger authoritative repair or enqueue reconcile work
4. admin and harness helpers may continue polling and forcing repair
5. each layer can interpret pressure differently

That is not one pressure policy. It is several local "helpful" behaviors that
compose into recursive work under stress.

Your stated requirement is the right one: if the system can still converge,
taking time is acceptable. Timeouts should identify non-converging failure, not
merge all slow convergence into the same bucket. This package makes that
explicit by separating authoritative commit, eventual visibility, and terminal
failure behind one bounded owner policy.

## Scope Basis

Roadmap and AGPL-scoped matrix rows:

1. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Runtime Completion Contracts and Owner Simplification Sprint](../sprints/active-2026-q2-runtime-completion-contracts-and-owner-simplification.md)

## In Scope

1. Separate authoritative commit from eventual cache or admin visibility where
   eventual stabilization is acceptable.
2. Define one owner-owned pressure policy for retry, defer, pending
   visibility, and repair behavior.
3. Remove or heavily gate read-triggered reconcile and repair loops from hot
   paths.
4. Align admin, readiness, harness, and write paths on explicit
   `pending_visibility`, `deferred_by_pressure`, and terminal failure
   semantics.
5. Reduce duplicate retry loops between CDC writes, gateway reads, admin
   repair, and harness helpers.

## Out Of Scope

1. Blanket timeout increases.
2. Transport rewrite work.
3. Performance tuning that does not change control-plane survivability
   semantics.

## Invariants

1. Reads do not recursively schedule unbounded repair work.
2. Authoritative commit and eventual visibility are distinct states.
3. Pressure produces bounded pending or deferred semantics rather than a retry
   storm.
4. Timeouts retain the distinction between slow convergence and structural
   non-convergence.

## Hotspots

1. `src/cdc/cdc-integration-service.js`
2. `src/control-plane/control-plane-system-table-gateway.js`
3. `src/admin/admin-control-snapshot.js`
4. `src/control-plane/control-plane-readiness-service.js`
5. `test/distributed/scenarios/table-distribution-helpers.js`
6. `test/distributed/harness/cluster.js`

## Status

Partially implemented on 2026-04-11.

Implemented:

1. read-triggered stale priority-partition reconcile enqueue is now disabled by
   default and requires explicit opt-in
2. repair reads now flow through one named repair-required read contract in
   the gateway instead of caller-local transport policy composition
3. control-plane mutation normalization now emits one explicit
   `completionState` so pending visibility, deferred pressure, and applied
   state are separated centrally instead of inferred by each caller
4. table-distribution observation now emits one canonical topology state:
   `routable`, `opaque`, or `invalid`
5. invalid follower-only or above-target partition topologies now trigger one
   bounded repair attempt and then fail early on stable flatlines instead of
   consuming the full timeout budget
6. alternate distributed witnesses no longer beat better snapshots just
   because they report more replicas; non-invalid topology now wins first
7. admin preflight and distributed observation now share one partition
   leader-topology evaluator instead of maintaining separate leader-completion
   heuristics
8. leader activation now publishes `partitions.leader_node_id` from
   `PartitionServiceRowOwner`, reducing split write ownership between service
   role updates and canonical partition-leader metadata
9. replica-state-machine transitions to `removing`, `removed`, or `failed`
   now conditionally clear canonical partition leader ownership when the
   departing replica still owns `partitions.leader_node_id`, so failure
   recovery no longer leaves stale leader metadata behind by default

Deep-dive findings now extending this package:

1. `AdminControlSnapshot.ensureMembershipPublicationObservation(...)` still
   queues reconcile and performs acknowledgement from an observation path
2. `ControlPlaneReadinessService.enqueueStalePriorityPartitionSummaryRefresh(...)`
   still allows read-triggered reconcile when opt-in is enabled
3. the remaining issue is no longer just retries under pressure; it is helper
   reads still owning workflow side effects

## Detection / Analysis Tasks

- [ ] Trace where commit, cache visibility, and operator-visible readiness are
      currently conflated.
- [x] Inventory read-triggered repair and reconcile paths that can fire
      repeatedly under polling.
- [ ] Identify which retry loops are duplicates of each other rather than true
      independent safety nets.
- [ ] Confirm the minimal shared result vocabulary needed across runtime and
      harness layers.
- [x] Deep-dive observation paths that still enqueue reconcile or acknowledge
      workflow state.

## Implementation Tasks

- [ ] Introduce explicit pending or deferred result semantics where eventual
      stabilization is acceptable.
- [ ] Remove or strongly gate read-triggered reconcile scheduling on hot paths
      so observation no longer recursively creates work.
- [ ] Align admin and harness timeouts with explicit pending or deferred vs
      terminal failure outcomes.
- [ ] Collapse duplicate retry behavior between CDC, gateway, admin repair,
      and harness layers behind one shared pressure policy.
- [ ] Add focused regression and distributed coverage for sustained recovery
      pressure.
- [ ] Remove publication acknowledgement and reconcile side effects from
      `AdminControlSnapshot` observation helpers; observation must return
      evidence, not progress workflow state.

## Validation

1. Recovery-pressure scenarios either converge or surface explicit pending or
   deferred state instead of broad timeout collapse.
2. Table-visibility and control-snapshot polling no longer manufacture repair
   work on every loop iteration.
3. Pressure evidence is consistent across runtime results and harness
   artifacts.

## Done When

1. Pressure containment is centrally owned rather than reconstructed by each
   subsystem.
2. Repair work is edge-triggered and bounded.
3. Late admin visibility collapse no longer emerges from recursive retry and
   repair amplification.

## 2026-04-11 implementation update
- MovePlanner no longer globally stalls cleanup when unrelated topology-blocking operations exist. It now allows cleanup-only REMOVE planning for already over-target active topologies while still preventing under-target drops.
- ReplicaRecoveryService target-node selection now exhausts distinct healthy nodes before duplicating placements.
- ReplicaRecoveryService pending recovery guards now clear in `finally`, so transient create failures do not permanently suppress future recovery attempts.
- ReplicaRecoveryService now catches non-critical per-entity recovery failures inside one cycle so later deficient entities can still recover.

## 2026-04-11 implementation update - cleanup execution and owner path tightening
- Safe over-target cleanup is now an explicit planner contract via `standaloneSafe` REMOVE moves.
- Rebalance execution now distinguishes between unsafe relocation removes that require paired add capacity and safe cleanup removes that can proceed immediately.
- Partition replica service-row deletion now goes through `PartitionServiceRowOwner.removeReplica()` so registration, activation, and deletion share one owner path.
- Partition delete predicates are now typed and local-node scoped, reducing the chance of stale or over-broad cleanup during recovery pressure.

## 2026-04-11 - authoritative replica absence is now decisive
- Tightened `ReplicaOperationRepository.getActualReplicaStatus(...)` so successful authoritative `services` reads that return zero rows now resolve to `null` instead of being overwritten by stale cache visibility.
- Cache fallback is now reserved for degraded authoritative reads, not authoritative absence.
- Updated the direct cache-fallback regression to cover authoritative failure, and added a new regression that proves successful authoritative no-row reads do not consult stale cache.
- Focused tests passed:
  - `node test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
  - `node test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`

## 2026-04-11 - query-path overlays stop inventing canonical leaders
- Added a shared bootstrap leader selection helper and reused it across SQLQueryEngine overlay creation and QueryExecutor fresh-bootstrap write fallback.
- Recovery overlays now preserve service visibility without minting leader_node_id from follower-only service sets.
- Writes now fail closed during the fresh bootstrap window when only follower services are visible.
- Focused tests passed:
  - node test/query/sql-query-engine.test.js
  - node test/query/query-executor.test.js

## 2026-04-12 extension
- The remaining containment problem is now explicitly about observation side effects.
- This package now owns the cleanup that keeps read helpers from enqueuing reconcile or acknowledging workflow state while under pressure.

## 2026-04-12 Deep-Dive Extension: Observation Must Stop Owning Repair and Ack Side Effects

### New structural issue

The code still has read flows that can enqueue reconcile or advance acknowledgement while serving diagnostics or control-snapshot observation. The two clearest remaining paths are stale priority-partition summary refresh behavior in readiness diagnostics and membership-publication observation inside admin control snapshot.

### Additional implementation tasks

- [ ] Remove observation-owned reconcile triggers from hot read paths and move them behind explicit owner-triggered edge transitions.
- [ ] Remove observation-owned acknowledgement side effects from control-snapshot reads.
- [ ] Separate observation result, repair intent, and acknowledgement command into distinct result types or commands so read paths stay read-only.
- [ ] Ensure any remaining repair trigger is edge-triggered, deduplicated, and cooldown-controlled by the owner instead of poll-triggered by readers.
- [ ] Recheck the remaining diagnostics surfaces for hidden workflow side effects after the publication-owner cleanup lands.

### Additional hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/admin/admin-control-snapshot.js`

### Structural concern

This package now explicitly carries the doctrine violation that reads still mutate workflow state under pressure.

## 2026-04-12 Close-out Update

Implemented in this package:
1. Readiness publication reads no longer enqueue reconcile from helper observation paths.
2. Admin control-snapshot observation no longer acknowledges membership or enqueues reconcile from the read path.

Validation outcome:
1. Focused readiness and admin unit coverage passed.

Status:
Structurally completed for this sprint.
