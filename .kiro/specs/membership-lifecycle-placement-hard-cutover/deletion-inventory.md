# Membership Lifecycle And Placement Hard Cutover Deletion Inventory

This document is the exit artifact required by Task 25. It records the old
runtime paths removed by the hard cutover, the surviving canonical owners, and
the closure evidence that now guards against regression.

## Scope

The inventory covers the concerns named by the spec:

1. lifecycle progression
2. readiness-owned repair semantics
3. rebalance gating and active-node derivation shortcuts
4. cache and transport used as proof instead of projection
5. phase-owned runtime bridges that outlived startup completion

It does not treat startup adapters or explicit compatibility seams as
deletions unless the steady-state path itself was removed.

## Removed Runtime Paths By Concern

### Lifecycle And Membership Progression

Removed from active runtime semantics:

1. join/restart progression branches that kept semantic ownership outside the
   lifecycle owner after delegation cutover
2. join cleanup logic that depended on `joinMembershipPublished` instead of
   deriving the registered node through canonical rows
3. stored join intent state on `NodeJoiningService` beyond the narrow startup
   handoff requirement

Canonical replacement:

1. lifecycle intent and completion stay with the lifecycle owner path
2. `NodeJoiningService` acts as a startup adapter and handoff surface only

Primary evidence:

1. `test/bootstrap/register-node-in-cluster.test.js`
2. `test/bootstrap/join-cleanup.property.test.js`
3. `test/bootstrap/node-joining-service.test.js`

### Readiness And Health Projection

Removed from active runtime semantics:

1. transport-driven readiness shortcuts that restored remote cluster-member
   health as though transport were membership truth
2. readiness-side repair behavior that acted like an alternate semantic owner
3. cache-wait helpers that treated cache visibility as proof of completion,
   including `SeedCacheHydrationPhase.waitForReadyNodeInCache()`

Canonical replacement:

1. readiness remains a derived projection over canonical owner rows, declared
   read models, and bounded health evidence
2. transport contributes health evidence only and does not redefine placement
   or leader truth

Primary evidence:

1. `test/rebalancer/projection-boundary.guard.test.js`
2. `test/bootstrap/bootstrap-cdc-readiness-gate.test.js`
3. `test/bootstrap/cache-hydration-strictness.test.js`

### Rebalance And Placement Gating

Removed from active runtime semantics:

1. active-node derivation paths that relied on stale cache-era readiness or
   transport shortcuts instead of canonical membership and readiness
2. bootstrap/join-specific node-ready rebalance triggering that waited on
   cache proof instead of current readiness

Canonical replacement:

1. rebalance admission follows canonical readiness and published topology
2. node-ready rebalance triggering is owned through dedicated startup owner
   handoff rather than embedded bootstrap service state

Primary evidence:

1. `test/bootstrap/node-ready-rebalance-trigger.test.js`
2. `test/rebalancer/projection-boundary.guard.test.js`

### Cache And Projection Boundary

Removed from active runtime semantics:

1. durable rejoin reuse paths that treated cache-visible rows as proof of
   authoritative membership state
2. cache hydration and CDC fanout behavior used as promotion or completion
   oracles
3. mixed semantic decision paths that combined cache reads with authoritative
   fallback inside one control decision

Canonical replacement:

1. authoritative owner reads happen through the declared owner path
2. cache and CDC remain observational read models only
3. divergence re-enters owner queues or diagnostics rather than mutating
   through fallback branches

Primary evidence:

1. `test/bootstrap/register-node-in-cluster.test.js`
2. `test/rebalancer/projection-boundary.guard.test.js`
3. `test/bootstrap/cache-hydration-gate.test.js`

### Phase-Owned Runtime Bridges And Startup State

Removed from active runtime semantics:

1. `src/bootstrap/phases/join-message-group-phase.js`
2. `SeedMessageGroupsPhase.getLeaderMessageGroupService()` as a runtime-facing
   leader-selection seam
3. `SeedRegistrationPhase.getLeaderPartition()` as a phase-owned runtime
   lookup seam
4. stored phase booleans that acted as steady-state truth after startup,
   including `joinMembershipPublished`,
   `messageGroupServiceEndpointsPublished`, and
   `messageGroupServiceHandlerRegistered`
5. stored bootstrap/join state that mirrored runtime activation, including the
   old `controlPlaneBackgroundWritersActivated` flag and persisted control-
   plane heartbeat start options

Canonical replacement:

1. `src/bootstrap/owners/join-message-group-runtime-owner.js`
2. `BootstrapService.getLeaderMessageGroupService()` as the service-level
   compatibility seam over canonical runtime selection
3. `src/bootstrap/owners/seed-registration-runtime-owner.js`
4. `src/bootstrap/owners/bootstrap-node-ready-rebalance-owner.js`
5. `src/bootstrap/owners/startup-runtime-handoff-owner.js`

Primary evidence:

1. `test/bootstrap/join-message-group-phase.test.js`
2. `test/bootstrap/unified-service-lifecycle-cutover-guards.test.js`
3. `test/bootstrap/bootstrap-service-ready-signal.test.js`
4. `test/bootstrap/node-joining-ready-signal-retry.test.js`

## Physically Deleted Files

Verified deleted from the repository:

1. `src/bootstrap/phases/join-message-group-phase.js`

## Intentional Survivors

These are not deletion misses. They remain by design:

1. `BootstrapService` and `NodeJoiningService` still exist as startup
   composition and compatibility surfaces.
2. Service-level helpers such as `BootstrapService.getLeaderPartition()` and
   `BootstrapService.getLeaderMessageGroupService()` still exist where they are
   compatibility seams over canonical owners, not phase-owned runtime truth.
3. phase entrypoint methods such as `phaseCreateSelfHostedMessageGroup` and
   `phaseJoinExistingMessageGroup` remain as startup execution labels while the
   steady-state ownership path lives in the runtime owners.

## Closure Checklist

- [x] old lifecycle progression branches removed from active runtime semantics
- [x] readiness-owned repair and transport-as-truth shortcuts removed
- [x] cache-as-proof and mixed projection/authoritative decision paths removed
- [x] phase-owned runtime bridges removed or demoted to explicit startup-only
  seams
- [x] obsolete join message-group phase file deleted from source
- [x] architecture and operational docs updated to describe only the new
  ownership model
- [x] structural guards and deterministic regressions exist for the removed
  paths named above
- [x] final focused deterministic closure suite rerun as Task 26 evidence
- [ ] distributed scenario closure ladder completed as Task 27 evidence

## Verification Notes

Repository checks performed while creating this artifact:

1. `src/bootstrap/phases/join-message-group-phase.js` is absent from source.
2. direct source searches show no remaining definitions for
   `joinMembershipPublished`, `messageGroupServiceEndpointsPublished`, or
   `messageGroupServiceHandlerRegistered`.
3. direct source searches show the old phase-owned wrappers above are no longer
   present as live seams.
4. documentation now describes startup services as adapters and readiness as a
   projection rather than an alternate owner path.