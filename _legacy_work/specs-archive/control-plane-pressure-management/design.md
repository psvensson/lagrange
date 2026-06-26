# Design Document: Control-Plane Pressure Management

## Overview

This tranche addresses the seed-pressure pattern exposed by the last reruns.
The problem is no longer broad discovery churn. It is queue contention at the
router boundary plus redundant authoritative read traffic while the seed is
already hot.

The design keeps one owner per concern:

| Concern | Owner | Change |
|---------|-------|--------|
| Per-node outbound queueing | `MessageRouter` | Add critical/background lanes with reserved pending capacity |
| Producer delivery intent | `MessageGroupService`, `RebalanceCoordinator` | Pass explicit delivery priority into the router owner path |
| Authoritative control-plane reads | `AuthoritativeControlPlaneView` | Add in-flight single-flight dedupe by canonical read key |
| Periodic rebalance scheduling | `UnifiedRebalancer` | Defer periodic checks when the local router reports pressure |

## Non-Goals

- This spec does not redesign bootstrap topology or system leadership
  distribution.
- This spec does not add a new transport subsystem, circuit breaker, or queue
  owner.
- This spec does not add fallback read paths outside the authoritative read
  owner.

## Design

### 1. Router Reserved Capacity

`MessageRouter` already owns per-node outbound queues and reconnect
serialization. The next step is to split one queue into two owner-managed
lanes:

- `criticalPending`
- `backgroundPending`

The queue still has one total pending ceiling, but background traffic may only
consume:

`maxPending - criticalReserve`

Critical traffic may use the reserved headroom until the full queue reaches
`maxPending`.

Processing rules:

1. Fill in-flight slots from the critical lane first.
2. If no critical items are waiting, process background items.
3. Preserve one queue owner and one reconnect owner per peer.

The router also exposes a pressure summary API so other owners can consume the
router’s view instead of inferring pressure indirectly from raw stats.

### 2. Explicit Producer Priority

The router should not guess from logs which traffic matters most. Producers must
declare their intent through the existing owner path.

Producer mapping for this tranche:

- `MessageGroupService.forwardCDCEventToLeader()` -> `critical`
- `RebalanceCoordinator.executeOperationInternal()` dispatch send ->
  `background`

This keeps the queue-priority decision where the producer semantics live while
keeping actual queue enforcement inside the router owner.

### 3. Authoritative Read Single-Flight

`AuthoritativeControlPlaneView` currently issues every authoritative read
independently, even when several callers request the same snapshot at the same
time.

The design adds:

- `inFlightReadsByKey: Map<string, Promise<Object>>`

Canonical read key fields:

- `tableName`
- SQL text
- params
- `allowSqlFallback`
- `localReadConsistency`
- routing readiness dimension

`readRows()`:

1. Builds the canonical dedupe key.
2. Returns the existing in-flight promise if present.
3. Starts one authoritative read if absent.
4. Removes the key in `finally`.

`readNodeSnapshot()` automatically benefits because it already routes through
`readRows()` for `nodes` and `services`.

### 4. Hot-Router Rebalance Deferral

`UnifiedRebalancer.checkRebalance()` is periodic background work. Under seed
pressure it should yield to recovery traffic.

The router owner exposes a pressure summary, for example:

- `backpressured: boolean`
- `saturatedNodeCount`
- `maxPendingUtilization`

`UnifiedRebalancer.checkRebalance()` consults that owner signal after startup
delay and stabilization checks but before expensive evaluation/planning. When
the router is backpressured:

1. Log the defer decision.
2. Increase/back off the current interval.
3. Schedule the next check later.
4. Do not call `evaluateState()` or `rebalance()`.

This keeps rebalance throttling inside the scheduler owner.

## Verification Strategy

1. Extend router tests to prove:
   - background deliveries are rejected at the non-reserved limit,
   - critical deliveries still enqueue,
   - critical deliveries drain first.
2. Extend message-group and rebalance-coordinator tests to prove the intended
   delivery priorities are passed to the router owner path.
3. Extend authoritative control-plane view tests to prove concurrent identical
   reads share one in-flight authoritative read and later calls re-read after
   settle.
4. Extend unified-rebalancer tests to prove periodic checks defer when router
   pressure is reported.
5. Run targeted unit suites, then rerun:
   - `node-join-under-load`
   - `rolling-restart`
   - `seven-node-table-partition-distribution`
