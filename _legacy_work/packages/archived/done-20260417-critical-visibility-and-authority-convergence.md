# Critical Visibility And Authority Convergence

## Why

The current failure family still crosses too many adjacent owner surfaces:

1. critical recovery says a target should retry
2. endpoint visibility says the cluster is still transitional
3. routing says canonical leader metadata is missing
4. publication says the cluster has already published

Those are all valid local signals, but the critical lane still lacks one
canonical convergence owner that answers the real question:

`Can this critical recovery step safely route, publish, and complete now?`

## Scope Basis

Roadmap and AGPL-scoped rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)
3. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)

Architecture and analysis basis:

1. `architecture/current-owner-maps.md`
2. `work/sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md`

## Sprint Umbrella

[Distributed Stability And Recovery Completion Sprint](../sprints/archived/done-2026-q2-distributed-stability-and-recovery-completion.md)

## In Scope

1. Collapse critical routing authority, canonical leader identity, endpoint
   visibility, and readiness into one convergence contract for the critical
   lane.
2. Make `RebalanceCoordinator`, `ReplicaDispatchService`,
   `JoinReadinessEvaluator`, and routing consume the same convergence answer.
3. Preserve fail-closed behavior for steady-state non-critical traffic.
4. Surface one critical-lane reason vocabulary in diagnostics and tests.

## Out Of Scope

1. Redesigning general user-query routing behavior.
2. Broadening non-critical writes to use recovery-only routing.
3. Replacing all existing readiness owners instead of consolidating the
   critical lane.

## Invariants

1. The critical lane must emit one canonical convergence answer and one reason
   set.
2. `null` or `undefined` must not encode critical-lane visibility state.
3. Steady-state routing safety must remain fail-closed outside the bounded
   critical lane.

## Authority Snapshot Model

1. `systemTableCache` rows are the observed current input. They may be empty,
   leaderless, or otherwise transitional during convergence.
2. `BootstrapTopologySnapshotOwner` publishes a stabilized authority snapshot
   for critical consumers. That published snapshot may retain the last stable
   priority owner when the observed input regresses.
3. The retained authority snapshot is the last published stable snapshot kept
   past TTL so critical owner resolution can survive short-lived local
   regressions.
4. Canonical leader identity, critical readiness, routing, and critical
   recovery completion must consume the published or retained authority
   snapshot, not the raw observed system-cache rows.
5. Diagnostics and convergence analysis should inspect raw observed rows
   alongside the published authority snapshot so regressions stay visible
   instead of being hidden by stabilization.
6. Reconcile and merge code may read raw observed rows, but it must stabilize
   them before publishing an authority answer to critical consumers.

## Authority View Clarification

1. This package does not introduce two peer caches for the same job.
2. `systemTableCache` is the raw observed cluster view.
3. The published authority snapshot is the current stabilized answer derived
   from that raw view.
4. The retained authority snapshot is the last published stable answer kept
   past the active TTL so the owner can survive a short-lived local
   regression.
5. The published and retained authority views are one bounded authority layer
   owned by `BootstrapTopologySnapshotOwner`; they are not independent sources
   of truth that downstream code may choose between freely.
6. New code must treat the retained authority snapshot as owner-internal
   stabilization state, not as a second public cache.

## Consumer Contract

1. `BootstrapTopologySnapshotOwner` is the only owner allowed to combine raw
   observed rows, the published authority snapshot, and the retained authority
   snapshot into one canonical answer.
2. `QueryRouter`, `QueryExecutor`, `SqlQueryEngine`, `JoinReadinessEvaluator`,
   `ControlPlaneMutationReadiness`, and bootstrap admission or assignment
   owners must consume the published authority snapshot or the canonical leader
   helpers derived from it.
3. Diagnostics, failure bundles, and convergence analysis should compare the
   published authority snapshot against the latest raw observed rows so a
   regressed local observation stays visible.
4. The retained authority snapshot is owner-internal stabilization state. New
   production consumers should not branch on it directly; they should consume
   the published authority answer that already applies the bounded retention
   policy.
5. Deprecated compatibility wrappers with names like `readObserved*` or
   `readCached*` remain only to keep older call sites stable. New code must
   not use those names to infer semantics; it must select one explicit view.

## Consumer To View Mapping

1. `QueryRouter`, `QueryExecutor`, and `SqlQueryEngine` must use canonical
   leader helpers or the published authority snapshot for production routing
   decisions.
2. `JoinReadinessEvaluator`, `ControlPlaneMutationReadiness`, bootstrap
   admission, bootstrap assignment, and handoff owners must use the published
   authority snapshot for readiness or mutation gating.
3. `RebalanceCoordinator` and other critical recovery planners may inspect raw
   observed rows while reconciling convergence, but they must publish or act
   on the stabilized authority answer exposed by
   `BootstrapTopologySnapshotOwner`.
4. Diagnostics, failure bundles, and convergence analysis should read both the
   published authority snapshot and the latest raw observed rows.
5. Only `BootstrapTopologySnapshotOwner` internals, bounded diagnostics, and
   focused tests may read the retained authority snapshot directly.

## Endpoint Visibility Diagnostics

1. Endpoint visibility output must distinguish published endpoint evidence
   from readiness-backed repair evidence.
2. Diagnostics for a critical partition must state whether readiness-backed
   endpoint repair was allowed for that partition.
3. Diagnostics for a critical partition must identify which node ids were only
   counted because readiness-backed endpoint repair supplied:
   - websocket or node endpoint visibility
   - postgres wire endpoint visibility
4. `control_plane_publications-p1` must fail closed on missing published
   endpoint rows for active nodes; readiness-backed endpoint repair is not an
   allowed substitute there.
5. Other bounded priority-lane consumers may still use readiness-backed
   endpoint repair when the owning convergence contract explicitly allows it,
   but the diagnostic output must make that backfill visible.

## Hotspots

1. `src/query/canonical-leader-routing.js`
2. `src/bootstrap/join-readiness-evaluator.js`
3. `src/rebalancer/unified-rebalancer.js`
4. `src/query/query-executor.js`
5. `src/control-plane/control-plane-mutation-readiness.js`
6. `src/control-plane/control-plane-system-table-gateway.js`
7. `test/query/query-executor.test.js`

## Detection / Analysis Tasks

- [x] Inventory the current critical-lane visibility and authority readers.
- [x] Detect overlapping questions currently answered by different owners.
- [x] Detect where critical lanes still reinterpret leader gaps, endpoint
      gaps, or publication truth locally.
- [x] Define one canonical critical convergence snapshot and reason model.
- [x] Detect which diagnostics must switch to that shared snapshot.

## Implementation Tasks

- [x] Add the shared critical visibility and authority convergence owner.
- [x] Cut critical dispatch, readiness, and routing paths over to that owner.
- [x] Preserve bounded fail-closed semantics for non-critical steady-state
      traffic.
- [x] Add endpoint-visibility diagnostics that distinguish published endpoint
      evidence from readiness-backed repair evidence.
- [x] Add focused tests for converged, deferred, blocked, and resumed critical
      states.
- [x] Perform the required closure deep dive across all affected code areas;
      fix spotted mistakes, irregularities, and doctrine violations or split
      follow-up packages before closure.

## Validation

1. Targeted query, readiness, and rebalancer unit suites.
2. Focused integration tests for canonical leader and endpoint convergence.
3. One boundary scenario covering priority partition visibility recovery.
4. One seven-node rerun against the transaction-control failure family.

## Done When

1. Critical recovery consumers share one authority and visibility answer.
2. Publication-complete but unroutable critical states are either impossible
   or typed explicitly.
3. Endpoint and canonical leader gaps no longer require cross-owner log
   inference to diagnose.
4. Endpoint-visibility output shows whether missing publication rows were
   repaired from readiness and which node ids depended on that repair.
5. The required closure deep dive is complete and any discovered issues are
   fixed or split forward.
