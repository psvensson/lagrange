# Requirements Document

## Introduction

The previous pressure-management tranche bounded router queues and exposed the
real remaining bottleneck: producer-side control-plane work still floods the
seed with background traffic during join and restart.

The strongest remaining sources are:

1. join-time authoritative backfill, especially replica fanout across
   discovery-critical tables,
2. canonical join-readiness repair loops that can re-trigger the same backfill
   while topology is still unstable,
3. CDC group propagation background retries that keep re-driving failed fanout
   while the seed router is already hot.

This tranche keeps ownership intact and removes pressure amplification at the
producer layer instead of raising router limits or adding fallback paths.

## Requirements

### Requirement 1: Join Backfill Must Be Pressure-Aware And Single-Flight

**User Story:** As a cluster operator, I want join-time authoritative backfill
to avoid issuing duplicate or excessive discovery reads while the seed is hot,
so that joining nodes can converge without overwhelming seed-hosted control
plane partitions.

#### Acceptance Criteria

1. `NodeJoiningService.backfillPropagatedCacheTablesFromAuthoritativeState()`
   SHALL coalesce concurrent requests for the same normalized table set through
   one in-flight owner path.
2. Join backfill SHALL keep the blocking discovery-critical path distinct from
   the opportunistic path; the blocking path may continue to run while the
   opportunistic path may be deferred.
3. Replica fanout inside authoritative backfill SHALL NOT issue one parallel
   burst to every replica address for every table when local router pressure is
   already present.
4. Blocking join backfill reads that remain necessary SHALL use explicit
   critical delivery priority through the canonical query/transport owner path.
5. Opportunistic join backfill SHALL remain best-effort and SHALL NOT cause
   join failure when deferred due to local transport pressure.

### Requirement 2: Canonical Join Readiness Repair Must Back Off Under Pressure

**User Story:** As a cluster operator, I want canonical join-readiness repair
to avoid re-triggering the same expensive discovery backfill every second while
the seed is already saturated, so that repair attempts help convergence instead
of amplifying the failure.

#### Acceptance Criteria

1. `JoinReadinessEvaluator` SHALL respect a longer owner-defined minimum
   interval between canonical discovery repair attempts.
2. WHEN the local router reports outbound pressure, THEN canonical readiness
   repair SHALL defer instead of immediately launching another backfill wave.
3. Deferred readiness repair SHALL remain observable through structured logs or
   diagnostics.
4. Readiness repair SHALL continue to use the existing backfill owner path
   instead of introducing direct ad-hoc discovery queries.

### Requirement 3: Join-Critical Control-Plane Publications Must Carry Explicit Priority

**User Story:** As a cluster operator, I want the small set of join-critical
control-plane writes and reads to retain delivery priority even under seed
pressure, so that node admission and readiness can still make progress.

#### Acceptance Criteria

1. Join-critical `NODE_STATE_UPDATE` publications SHALL use critical delivery
   priority through `MessageRouter`.
2. Join-critical system-table writes performed during node registration and
   endpoint publication SHALL support critical routed delivery through the
   canonical SQL/query owner path.
3. This priority upgrade SHALL apply only to the join-critical control-plane
   path and SHALL NOT reclassify opportunistic or retry-loop work as critical
   by default.

### Requirement 4: CDC Background Retry Must Not Re-Flood A Hot Seed

**User Story:** As a cluster operator, I want CDC propagation background retry
to defer and coalesce when the local router is already backpressured, so that
failed propagation recovery does not keep refilling the seed backlog.

#### Acceptance Criteria

1. `CDCGroupPropagationService` SHALL maintain one background retry owner path
   per canonical retry key instead of allowing duplicate retry waves for the
   same failed delivery set.
2. WHEN the local router reports outbound pressure, THEN CDC background retry
   scheduling SHALL defer rather than immediately dispatch another retry wave.
3. Deferred CDC retry SHALL preserve bounded eventual retry behavior once local
   pressure clears.
4. CDC propagation SHALL remain on the existing grouped/safe owner path and
   SHALL NOT add fallback delivery helpers.

### Requirement 5: Regression Coverage And Focused Harness Verification

**User Story:** As a maintainer, I want regression tests and focused harness
verification for producer-side pressure shedding, so that later changes do not
reintroduce seed overload through join backfill or retry amplification.

#### Acceptance Criteria

1. Tests SHALL prove join backfill coalesces concurrent identical requests and
   avoids full replica fanout while the local router is backpressured.
2. Tests SHALL prove canonical join-readiness repair defers while router
   pressure is active.
3. Tests SHALL prove join-critical node-state and blocking backfill deliveries
   use explicit critical priority.
4. Tests SHALL prove CDC background retry defers/coalesces under local router
   pressure without leaking duplicate retry timers.
5. Verification SHALL include targeted unit suites plus focused distributed
   reruns for `node-join-under-load`, `rolling-restart`, and
   `seven-node-table-partition-distribution`.
