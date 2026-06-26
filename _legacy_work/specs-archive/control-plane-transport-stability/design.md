# Design Document: Control-Plane Transport Stability

## Overview

This design addresses the first transport/control-plane stabilization tranche.
It does not attempt to solve every remaining distributed failure. Instead it
targets the three amplification points already visible in code and in the
latest rerun reports:

1. unbounded outbound pressure behind one remote reconnect,
2. eight-table authoritative discovery repair on degraded hot paths,
3. synchronous readiness refresh on load-lane admission.

The design extends existing owners rather than creating new ones.

## Ownership

| Concern | Owner | Change |
|---------|-------|--------|
| Remote delivery queue/backpressure | `MessageRouter` | Add bounded pending depth and typed rejection |
| Discovery repair scoping | `AdminServiceDiscovery` + `admin-authoritative-repair-policy.js` | Derive implicated repair table set from trigger codes |
| Hot-path readiness refresh | `ControlPlaneReadinessService` | Add cached-ineligible background refresh mode |
| Load-lane readiness usage | `AdminWebSocketAPI` | Request background refresh mode |

## Design

### 1. Bounded Router Backpressure

`MessageRouter` already owns:

- per-node outbound queues,
- per-node reconnect deduplication via `pendingNodeConnections`,
- delivery metrics.

The missing piece is a bound on queued work. The design adds one new queue
limit:

- `outboundQueueMaxPending`

Behavior:

1. If a queue has capacity, enqueue as today.
2. If `pending.length >= maxPending`, fail the delivery immediately with the
   canonical delivery shape: `acknowledged: false` plus a typed
   backpressure error.
3. Do not spawn a new reconnect path. Reconnect ownership remains in
   `ensureNodeConnection()`.

This keeps the router as the single owner of both queueing and rejection.

### 2. Scoped Discovery Repair

`AdminServiceDiscovery` currently decides whether repair is warranted, but once
it decides to repair, it iterates the full
`AUTHORITATIVE_DISCOVERY_REPAIR.TABLES` set. That is too broad under failure.

The repair policy owner already returns trigger codes. This design extends that
policy layer to derive one implicated repair table set from trigger codes.

Examples:

- `STALE_REPLICA_OPERATIONS_IN_FLIGHT` -> `replica_operations`
- `DISCOVERY_EMPTY_WITH_SERVICES_PRESENT` -> `nodes`, `partitions`,
  `services`, `node_endpoints`, `service_endpoints`
- `PARTITION_TOPOLOGY_GAP` -> `tables`, `partitions`, `services`
- broad cache watermark -> default full set

`AdminServiceDiscovery.ensureAuthoritativeDiscoveryCacheRepair()` then reads
only that derived table set.

This keeps “whether to repair” and “what to repair” inside the same owner path.

### 3. Background Refresh For Cached Ineligible Readiness

`ControlPlaneReadinessService` already has:

- cached readiness snapshots,
- one readiness evaluation lane,
- one authoritative repair lane,
- background refresh helpers for sync callers.

The current `getNodeReadiness()` path still synchronously bypasses cached
ineligible snapshots when `requireFreshOnIneligible` is true. That is correct
for some internal decisions, but it is too expensive for load-lane admin
admission during cluster pressure.

The design adds one new caller-controlled option:

- `preferBackgroundRefreshOnIneligible: true`

Behavior:

1. If a recent cached snapshot exists and it is ineligible for the requested
   decision dimension, return that cached snapshot immediately.
2. Start the existing owner-lane refresh in the background.
3. Do not mark the node eligible unless the cached snapshot already says so.

This is not a fallback path. It is still the same readiness owner, just a
different freshness contract for hot-path callers.

### 4. Admin Load-Lane Integration

`AdminWebSocketAPI.resolveLoadLaneReadinessSnapshot()` switches from:

- synchronous fresh-on-ineligible behavior

to:

- cached snapshot with background refresh when ineligible.

This preserves fail-fast behavior for load-lane admission while reducing the
probability that a saturated node blocks its own admin gate on another round of
authoritative repair.

## Verification Strategy

1. Extend `test/transport/message-router.test.js` with bounded queue
   backpressure regressions.
2. Extend `test/admin/admin-authoritative-repair-policy.test.js` and/or add
   `test/admin/admin-service-discovery.test.js` for scoped repair tables.
3. Extend `test/control-plane/control-plane-readiness-service.test.js` for
   cached ineligible background refresh.
4. Extend `test/admin/admin-websocket-api.test.js` for load-lane readiness
   options.
5. Run focused distributed scenarios after unit suites:
   `node-join-under-load`, `rolling-restart`, and
   `seven-node-table-partition-distribution`.
