# Requirements Document

## Introduction

The latest distributed reruns show the transport/control-plane path is now the
dominant failure mode after the raft durability and replacement-window fixes
landed. The common pattern is:

1. transport reconnect failure or connection churn,
2. repeated admin/control-plane query timeouts,
3. authoritative cache repair fan-out on hot paths,
4. stale or divergent control-plane views,
5. readiness collapse and topology convergence timeout.

This spec defines the first stabilization tranche. It intentionally stays
inside existing owners:

- `MessageRouter` remains the only transport delivery owner,
- `AdminServiceDiscovery` remains the only service-discovery repair owner,
- `ControlPlaneReadinessService` remains the only readiness owner.

The goal is to reduce amplification under partial failure without introducing
fallback paths or parallel implementations.

## Requirements

### Requirement 1: Router Backpressure Must Be Bounded

**User Story:** As a cluster operator, I want transport delivery to fail fast
when one peer is disconnected and its outbound queue is already saturated, so
that the system does not build unbounded pressure behind a single reconnect.

#### Acceptance Criteria

1. `MessageRouter` SHALL enforce a per-node maximum pending outbound queue
   depth in addition to the existing in-flight concurrency limit.
2. WHEN a remote node queue is already at the configured pending limit, THEN
   `MessageRouter.deliver()` SHALL return a typed failed delivery result rather
   than silently accepting more queued work.
3. Queue saturation SHALL NOT create a second reconnect owner or bypass the
   existing per-node reconnect deduplication path.
4. The rejected delivery result SHALL preserve the standard transport delivery
   shape with `acknowledged: false` and an explicit queue-backpressure error.
5. Transport metrics and queue state SHALL continue to reflect the bounded
   queue accurately after rejection.

### Requirement 2: Authoritative Discovery Repair Must Be Scoped

**User Story:** As a cluster operator, I want service-discovery repair to read
only the authoritative tables implicated by the observed gap, so that admin and
control snapshots do not fan out eight system-table reads on every degraded
request.

#### Acceptance Criteria

1. `AdminServiceDiscovery` SHALL derive one authoritative repair table set from
   the trigger codes returned by the repair policy owner.
2. WHEN only replica-operation liveness is stale, THEN repair SHALL read only
   `replica_operations`.
3. WHEN the gap is topology or peer-location visibility, THEN repair SHALL read
   only the canonical topology/discovery tables required for that gap, not the
   full default table list.
4. Scoped discovery queries (`tableName` / `tableId`) SHALL repair only the
   tables needed to reconstruct that scoped topology view.
5. The default full repair table set MAY still be used when the trigger is a
   broad cache-staleness watermark and no narrower implicated set exists.

### Requirement 3: Load-Lane Readiness Refresh Must Not Block The Hot Path

**User Story:** As a cluster operator, I want load-lane admission checks to use
recent cached readiness and refresh in the background when the cache looks
stale, so that under pressure the system sheds or admits quickly instead of
blocking on authoritative repair.

#### Acceptance Criteria

1. `ControlPlaneReadinessService.getNodeReadiness()` SHALL support a mode that
   returns a recent cached ineligible snapshot immediately and triggers the
   owner-path refresh asynchronously.
2. This background-refresh mode SHALL preserve the single readiness owner and
   SHALL reuse the existing readiness evaluation lane instead of creating a new
   mutation path.
3. `AdminWebSocketAPI` load-lane admission SHALL use the background-refresh
   mode instead of requiring a synchronous authoritative refresh on ineligible
   snapshots.
4. WHEN no cached readiness snapshot is available, the readiness owner MAY
   still perform a normal evaluation.
5. The cached result returned in background-refresh mode SHALL remain explicit
   about ineligibility; this mode is not a fallback to stale success.

### Requirement 4: Regression Coverage Must Prove Owner Paths

**User Story:** As a maintainer, I want the new stabilizing behavior covered by
owner-path regressions, so that future fixes do not reintroduce transport or
repair amplification through parallel logic.

#### Acceptance Criteria

1. Tests SHALL prove `MessageRouter` rejects queue-saturated deliveries through
   its canonical outbound queue owner rather than by adding a second send path.
2. Tests SHALL prove `AdminServiceDiscovery` chooses scoped repair table sets
   through the repair policy owner and does not hard-code a second repair path
   in callers.
3. Tests SHALL prove `ControlPlaneReadinessService` returns cached ineligible
   readiness immediately while scheduling the existing owner-lane refresh in
   the background.
4. Tests SHALL prove `AdminWebSocketAPI` requests the new readiness mode for
   load-lane admission.
5. Verification SHALL include targeted unit suites and at least focused
   distributed reruns for the primary failing scenarios.
