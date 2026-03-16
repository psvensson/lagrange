# Design: CDC Continuity During Topology Transitions

## Overview

This design addresses CDC propagation gaps that occur during three categories
of topology transitions: partition splits, node restarts, and seed restarts.
All fixes follow the system guidelines' single-owner and zero-duplication
contracts — no new caches, no parallel code paths, no fallback mechanisms.

The fixes are organized into three groups matching the failure categories:

- **Group A fixes** (split spread stall): Event-driven rebalance trigger,
  CDC subscriber registration timing, leader metadata propagation.
- **Group B fixes** (restart recovery stall): CDC subscription
  re-establishment, timer cleanup, recovery diagnostics.
- **Group C fixes** (seed restart): Message group leader failover CDC
  continuity (subsumes Group B fixes since the mechanism is the same).

### Design Rationale

The root cause across all three groups is that CDC propagation is treated as
a bootstrap-time concern but not as a topology-transition concern. The
existing code correctly wires CDC subscribers during initial cluster
bootstrap, but the same wiring does not reliably execute during:

1. Split child partition creation (subscribers may attach after Raft starts)
2. Node restart (CDC subscriptions may fail silently during rejoin)
3. Message group leader failover (new leader may not re-subscribe to all
   partition CDC streams)

The fix strategy is to strengthen the existing CDC wiring paths rather than
create new ones. Every fix reuses existing components and code paths per
system guidelines §1.1 and §1.3.

## Architecture

### Component Ownership Map (Changes Only)

| Concern | Owner | Change |
|---------|-------|--------|
| Split completion → rebalance trigger | `src/index.js` composition root | Wire `SPLIT_COMPLETED` listener to child rebalancers |
| CDC subscriber timing on partition creation | `createPartitionService` factories | Ensure `subscribeToCDCWithHandshake` completes before return |
| Leader metadata propagation | Existing `PartitionService` leader election handler | Verify `partitions` row update flows through CDC |
| Restart CDC re-establishment | `NodeJoiningService.subscribeToCDCEvents` | Add bounded retry with structured diagnostics |
| Message group failover CDC | `MessageGroupWorkerService.wireRaftGroupEvents` | Ensure new leader re-subscribes on leadership gain |
| Timer cleanup | `PartitionService`, `UnifiedRebalancer`, `MessageGroupService` | Audit and fix shutdown paths |
| Recovery diagnostics | `NodeJoiningService` | Add periodic diagnostic emission during recovery |

### Data Flow: Split Completion → Rebalance

```
PartitionSplitMergeManager
  │ emits SPLIT_COMPLETED {leftPartitionId, rightPartitionId}
  ▼
Composition root listener (src/index.js)
  │ looks up child partition services by partition ID
  │ for each child partition service:
  ▼
PartitionService.rebalancer (UnifiedRebalancer)
  │ if isLeader: triggerImmediateCheck('split_completed')
  │ if !isLeader: deferred until setLeader(true) → scheduleNextCheck()
  ▼
UnifiedRebalancer.checkRebalance()
  │ getAvailableNodes() → filter by repairEligible
  │ applyPolicy() → detect replica_count_below_target
  ▼
RebalanceCoordinator.executeOperation()
  │ ADD replica to additional nodes
```

### Data Flow: CDC Subscriber Registration on Child Partition

Current (broken):
```
createPartitionService()
  │ new PartitionService(options)
  │ partition.initialize()        ← Raft group may start here
  │ subscribeToCDCWithHandshake() ← subscriber registered AFTER Raft
  │                                  events may have been buffered
  ▼
return partition
```

Fixed:
```
createPartitionService()
  │ new PartitionService(options)
  │ partition.initialize()
  │ subscribeToCDCWithHandshake() ← subscriber registered
  │   └─ inline catchup replay of any buffered events
  │ return partition               ← Raft processing continues with
  ▼                                  subscriber already attached
```

The key insight is that `partition.initialize()` sets up the Raft group but
the group doesn't start processing entries until the event loop yields. The
`subscribeToCDCWithHandshake()` call is async but completes within the same
`createPartitionService` async function, so the subscriber is registered
before the factory returns. The fix is to verify this ordering is guaranteed
and add a regression test that fails if it isn't.

### Data Flow: Restart CDC Re-establishment

```
NodeJoiningService.subscribeToCDCEvents()
  │ for each CDC-propagated table:
  │   for each message group service:
  │     messageGroupService.subscribeToCDC(tableName)
  │   for each partition service:
  │     partition.subscribeToCDCWithHandshake(cdcSubscriber)
  │
  │ NEW: bounded retry loop with structured diagnostics
  │   if subscription fails:
  │     log {table, partition, error, attempt, remainingBudget}
  │     retry with backoff (up to configurable timeout)
  │   if timeout expires:
  │     emit diagnostic event with missing subscriptions
  │     continue recovery (don't block indefinitely)
  ▼
Node advertises readiness only after subscriptions confirmed
```

### Data Flow: Message Group Leader Failover

```
MessageGroupWorkerService.wireRaftGroupEvents()
  │ raftGroup.on(LEADER, () => {
  │   if (isNowLeader && !wasLeader) {
  │     subscribeToCDC()  ← existing path, already correct
  │   }
  │ })
```

The `MessageGroupWorkerService` already re-subscribes on leadership gain
(lines 312-313 in `message-group-worker-service.js`). The issue is that
`MessageGroupService` (the non-worker variant used in some configurations)
may not have the same re-subscription logic. The fix is to verify both
paths and ensure consistency.

## Components and Interfaces

### 1. Split Completion Rebalance Trigger

**Location**: `src/index.js` (both seed and join composition roots)

Wire a listener on `PartitionSplitMergeManager` for `SPLIT_COMPLETED`:

```javascript
partitionSplitMergeManager.on(
  SPLIT_MERGE_EVENT.SPLIT_COMPLETED,
  (result) => {
    const childPartitionIds =
      result?.targetPartitionIds || [];
    for (const childPartitionId of childPartitionIds) {
      const partitionService =
        resolvePartitionServiceByPartitionId(childPartitionId);
      if (!partitionService?.rebalancer) {
        continue;
      }
      partitionService.rebalancer.recordStateChange(
        STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED,
      );
    }
  },
);
```

Uses `recordStateChange` rather than `triggerImmediateCheck` because:
- `recordStateChange` resets the stabilization timer and schedules a check
  after the stabilization period, which is the correct behavior after a
  topology change.
- `triggerImmediateCheck` bypasses stabilization, which could cause
  premature rebalancing before the child partition's Raft group has
  settled.

**New constant** in `rebalancer-constants.js`:
```javascript
// Add to STABILIZATION_RESET_TRIGGER
SPLIT_COMPLETED: 'split_completed',
```

**Partition service lookup**: The composition root needs a way to find
partition services by partition ID. Both `BootstrapService` and
`NodeJoiningService` maintain `partitionServices` maps keyed by replica ID.
A helper that iterates these maps and matches by `partitionId` property is
needed. This is a read-only lookup, not a new cache.

### 2. CDC Subscriber Registration Timing Fix

**Location**: `createPartitionService` factories in
`src/bootstrap/bootstrap-service.js` (lines 1752-1840) and
`src/bootstrap/node-joining-service.js` (lines 3015-3107)

The existing code already calls `subscribeToCDCWithHandshake()` after
`partition.initialize()`. The fix is to:

1. Verify that `subscribeToCDCWithHandshake()` is awaited (it already is
   in both factories).
2. Add a regression test that creates a partition, buffers CDC events
   before subscriber registration, then verifies all buffered events are
   delivered after registration.
3. Verify that the `shouldAttachPartitionCdcPropagation(tableName)` check
   returns true for user tables (it should, since user tables need CDC
   propagation for system cache updates).

If investigation reveals that `shouldAttachPartitionCdcPropagation` returns
false for user tables, that's the bug — fix the predicate.

### 3. Leader Metadata Propagation Verification

**Location**: `src/partition/partition-service.js` (leader election handler)

When a partition's Raft group elects a leader, the `partitions` system table
row must be updated with `leader_node_id`. This update flows through:

1. `PartitionService` detects leadership change via Raft event
2. Writes `leader_node_id` to `partitions` row via SQL
3. CDC event propagates the change to `SystemTableCache` on all nodes

The fix is to:
1. Trace this path for child partitions specifically
2. Verify the write happens and the CDC event is generated
3. If the write doesn't happen for child partitions, identify why and fix
4. Add a regression test that creates a child partition, triggers leader
   election, and verifies `leader_node_id` appears in the system cache

### 4. Restart CDC Subscription Hardening

**Location**: `src/bootstrap/node-joining-service.js`
(`subscribeToCDCEvents` method, line 2417)

Extend the existing `subscribeToCDCEvents` with:

1. Bounded retry loop for failed subscriptions
2. Structured diagnostic logging per subscription attempt
3. Configurable timeout for total re-establishment time
4. Readiness gate: don't advertise node as ready until subscriptions
   are confirmed

**New constants** in `src/bootstrap/node-joining-constants.js`:
```javascript
CDC_REESTABLISHMENT_TIMEOUT_MS: 30000,
CDC_REESTABLISHMENT_RETRY_DELAY_MS: 1000,
CDC_REESTABLISHMENT_MAX_RETRIES: 10,
CDC_RECOVERY_DIAGNOSTIC_INTERVAL_MS: 5000,
```

### 5. Message Group Failover CDC Verification

**Location**: `src/worker/message-group-worker-service.js` (line 312) and
`src/message-group/message-group-service.js`

The `MessageGroupWorkerService` already calls `subscribeToCDC()` on
leadership gain. Verify that:

1. `MessageGroupService` (non-worker variant) has equivalent logic
2. The subscription covers all CDC-propagated tables, not just a subset
3. The subscription handles the case where the previous leader's
   subscriptions are still partially active (idempotent re-subscription)

If `MessageGroupService` lacks re-subscription on leadership gain, add it
following the same pattern as `MessageGroupWorkerService`.

### 6. Timer Cleanup Audit

**Locations**:
- `src/partition/partition-service.js` — `shutdown()` / `destroy()`
- `src/rebalancer/unified-rebalancer.js` — `shutdown()`
- `src/message-group/message-group-service.js` — `shutdown()`

For each component, verify that shutdown:

1. Clears all `setTimeout` / `setInterval` handles
2. Sets a shutdown flag that prevents new timer creation
3. Is idempotent

Specific timers to audit:
- `PartitionService`: `cdcBufferReplayTimer`
- `UnifiedRebalancer`: `scheduledCheck`, `stabilizationTimer`,
  `rebalanceCheckQueue`
- `MessageGroupService`: CDC-related timers, rebalancer timers,
  flush timers

### 7. Recovery Diagnostics

**Location**: `src/bootstrap/node-joining-service.js`

Add periodic diagnostic emission during restart recovery:

```javascript
// During subscribeToCDCEvents retry loop:
const diagnosticInterval = setInterval(() => {
  this.logger.info(JOINING_LOG_MSG.CDC_RECOVERY_DIAGNOSTICS, {
    nodeId: this.nodeId,
    subscriptionStatus: this.getCdcSubscriptionStatus(),
    messageGroupLeader: this.getMessageGroupLeaderInfo(),
    elapsedMs: Date.now() - recoveryStartMs,
  });
}, CDC_RECOVERY_DIAGNOSTIC_INTERVAL_MS);
```

The diagnostic payload includes:
- Per-table subscription status (subscribed / pending / failed / buffered)
- Message group leader identity and connection status
- Elapsed recovery time
- Buffered event counts per partition

## Correctness Properties

### Property 1: Split completion triggers rebalance evaluation

For any successful partition split producing child partitions, the child
partition rebalancers must receive a state change notification within one
event loop tick of the `SPLIT_COMPLETED` event emission.

**Validates: Requirement 1**

### Property 2: CDC subscriber registration precedes Raft entry processing

For any partition created via `createPartitionService`, the CDC subscriber
must be registered before the first Raft-committed entry is processed by
the partition's state machine.

**Validates: Requirement 2**

### Property 3: Buffered CDC events are fully replayed on subscriber registration

For any partition with N buffered CDC events, registering a subscriber via
`subscribeToCDCWithHandshake` must deliver all N events to the subscriber
(either inline during handshake or via scheduled replay).

**Validates: Requirement 3**

### Property 4: Child partition leader_node_id propagates via CDC

For any child partition that elects a Raft leader, the `partitions` system
table row must contain the leader's `node_id` in `leader_node_id` within
one CDC propagation cycle.

**Validates: Requirement 4**

### Property 5: Restart CDC subscriptions are bounded

For any node restart, CDC subscription re-establishment must either
complete or emit structured diagnostics within the configured timeout.

**Validates: Requirements 5, 8**

### Property 6: Message group failover preserves CDC continuity

For any message group leader failover, the new leader must have CDC
subscriptions active for all CDC-propagated tables within one
stabilization period.

**Validates: Requirement 6**

### Property 7: Shutdown clears all timers

For any component shutdown, the count of active timers owned by that
component must be zero after shutdown completes.

**Validates: Requirement 7**

### Property 8: Shutdown prevents new timer creation

For any component that has been shut down, attempting to schedule new
work must be a no-op (no new timers created, no errors thrown).

**Validates: Requirement 7**
