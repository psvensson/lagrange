# CDC Propagation Fix

## Problem

When Node 2 joined the cluster and transitioned to READY state, Node 1 never saw it as ready. Additionally, Node 2's LeaseService was sweeping Node 1's lease, indicating bidirectional CDC propagation issues.

### Symptoms

1. Node 2 transitions to READY at `20:48:40.311`
2. Node 1 continues to see only 1 available ready node
3. Node 2 sweeps Node 1's lease starting at `20:48:50.279`
4. Rebalancer on Node 1 sees fluctuating available node counts (1 or 2, never stable)
5. Logs show "Replica target is constrained by available ready nodes" repeatedly

## Root Cause

CDC events from partition writes were not properly propagating to all nodes' system caches. The issue was in how CDC subscriptions were set up:

**Before the fix:**
```javascript
partition.subscribeToCDC(async (cdcEvent) => {
  if (cdcEvent.tableName === tableName) {
    // This was called on ALL message group replicas (leader + followers)
    await messageGroup.applyCDCEvent(
      cdcEvent.tableName,
      cdcEvent.operation,
      cdcEvent.data,
    );
  }
});
```

**The problem:** `applyCDCEvent()` was being called on both leader and follower message group replicas. However, only the leader can replicate CDC events through Raft. When called on a follower, the CDC event would:
1. Update the local cache on that node
2. Try to replicate through Raft (but fail because it's not the leader)
3. Never reach other nodes' caches

## The Fix

Added a leadership check before applying CDC events:

**After the fix:**
```javascript
partition.subscribeToCDC(async (cdcEvent) => {
  if (cdcEvent.tableName === tableName) {
    // Only apply CDC event if this message group is the leader
    // This ensures CDC events are replicated through Raft to all nodes
    if (messageGroup.isLeaderReplica()) {
      await messageGroup.applyCDCEvent(
        cdcEvent.tableName,
        cdcEvent.operation,
        cdcEvent.data,
      );
    }
  }
});
```

## How CDC Replication Works

1. **Partition writes data** → Generates CDC event
2. **CDC event delivered to subscribers** → All local message group replicas receive it
3. **Leadership check** → Only the leader processes it
4. **Leader applies to cache** → `messageGroup.applyCDCEvent()` called
5. **Raft replication** → Leader replicates through Raft log
6. **All replicas apply** → Each message group replica applies the committed entry to its local cache
7. **All nodes updated** → Every node's system cache now has the updated data

## Files Modified

1. `src/bootstrap/bootstrap-service.js` - Added leadership check in `subscribeToCDC()`
2. `src/bootstrap/node-joining-service.js` - Added leadership check in partition creation
3. `test/bootstrap/cdc-leader-only-replication.test.js` - New test verifying the fix

## Testing

Created unit test `test/bootstrap/cdc-leader-only-replication.test.js` that verifies:
- CDC events are only applied by the message group leader
- Followers do not apply CDC events (avoiding duplicate/failed replication)

Existing integration tests continue to pass:
- `test/bootstrap/node-joining-cdc-subscription.test.js` - 19 tests pass
- `test/integration/membership-consistency.integration.test.js` - 75 tests pass

## Impact

This fix ensures that:
1. When any node writes to a system table (e.g., heartbeat updates), the CDC event propagates to all nodes
2. All nodes see consistent system state (node readiness, leases, etc.)
3. Rebalancer can correctly identify available nodes
4. Lease sweeping works correctly across all nodes
5. Node join/leave events are properly propagated cluster-wide

## Architecture Compliance

This fix maintains the architectural principle that **CDC events are the single source of truth for system cache updates**. By ensuring CDC events properly replicate through the message group Raft system, we maintain cache consistency across all nodes without introducing any fallback mechanisms or duplicate code paths.
