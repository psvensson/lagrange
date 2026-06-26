# Requirements: CDC Continuity During Topology Transitions

## Introduction

Distributed harness failures across 6 scenarios (3 failure groups) share a
common architectural root cause: CDC propagation gaps after topology changes
(partition split, node restart, seed restart). The system's steady-state CDC
pipeline works correctly, but topology transitions create windows where child
partitions lack CDC subscribers, restarted nodes fail to re-establish CDC
subscriptions, and the rebalancer misses event-driven triggers after split
completion.

These gaps cause:
- Split child partitions that never spread replicas beyond the initial 3-node
  bootstrap quorum (Group A: 3 scenarios)
- Restarted nodes stuck in degraded state with empty system caches and
  cascading heartbeat/query timeouts (Group B: 2 scenarios)
- Seed restart leaving the entire cluster with stale partition metadata and
  zero observed leader elections (Group C: 1 scenario)

This spec addresses all three failure groups through targeted fixes to the
CDC pipeline, rebalancer event wiring, and restart recovery path.

### Failure Group Summary

| Group | Scenarios | Symptom | Root Cause |
|-------|-----------|---------|------------|
| A | `seven-node-table-partition-distribution 7n`, `seven-node-read-write-load-distribution 7n`, `seven-node-rw-txn-recovery 7n` | Splits happen (1→3 partitions) but replicas only spread to 3/7 nodes | No event-driven rebalance after split; CDC subscriber registration gap on child partitions |
| B | `rolling-restart 5n`, `rolling-restart 3n` | Nodes stuck in warming/degraded; memory leak | CDC subscription re-establishment stalls on restart; timer leak during prolonged recovery |
| C | `seed-restart-under-load 5n` | Zero leader changes observed; empty voter/leader maps | CDC propagation chain breaks when seed restarts; message group failover doesn't re-establish subscriptions |

## Glossary

- **CDC subscriber**: A callback registered on a `PartitionService` via
  `subscribeToCDCWithHandshake()` that receives change data capture events
  and propagates them to the system cache via message group transport.
- **CDC propagation chain**: The path from partition leader SQL mutation →
  CDC event → subscriber delivery → message group replication →
  `SystemTableCache` update on all nodes.
- **Split child partition**: A new partition created by `ManagedSplitWorkflow`
  during a partition split operation.
- **Bootstrap quorum**: The minimum number of replicas provisioned for a
  child partition at split time (typically 3), before the rebalancer spreads
  to additional nodes.
- **CDC buffer**: The `cdcEventBuffer` on `PartitionService` that stores CDC
  events when no subscribers are registered, for later replay.
- **Stabilization period**: The delay after a state change before the
  `UnifiedRebalancer` runs its next check, preventing premature rebalancing.

## Requirements

### Requirement 1: Event-Driven Rebalance After Split Completion

**User Story:** As a cluster operator, I want the rebalancer to immediately
evaluate replica spread after a partition split completes, so that child
partition replicas are distributed across the cluster without waiting for the
next periodic timer.

#### Acceptance Criteria

1. WHEN `PartitionSplitMergeManager` emits `SPLIT_COMPLETED`, the system
   SHALL trigger an immediate rebalance check on the child partition entities
   within the stabilization period.
2. THE trigger SHALL use the existing `triggerImmediateCheck` path on the
   `UnifiedRebalancer` instances for the child partitions, not a new parallel
   rebalance mechanism.
3. THE trigger SHALL be wired at the composition root where
   `PartitionSplitMergeManager` is instantiated (in `src/index.js`), not
   inside the split workflow itself.
4. IF the child partition's rebalancer is not yet initialized (leader not
   elected), THE trigger SHALL be deferred until the rebalancer becomes
   active via the existing `setLeader(true)` → `scheduleNextCheck()` path.
5. THE trigger SHALL NOT bypass the stabilization period — it resets the
   stabilization timer so the rebalancer waits for the cluster to settle
   before acting.

### Requirement 2: CDC Subscriber Registration Before Raft Processing

**User Story:** As a cluster operator, I want CDC subscribers to be registered
on child partitions before Raft starts processing, so that no CDC events are
lost during the window between partition creation and subscriber attachment.

#### Acceptance Criteria

1. WHEN `createPartitionService` factory creates a new partition (including
   split children), THE CDC subscriber SHALL be registered via
   `subscribeToCDCWithHandshake()` before the partition's Raft group begins
   processing entries.
2. THE `subscribeToCDCWithHandshake()` call SHALL complete (including any
   buffered event catchup replay) before the factory returns the partition
   service to the caller.
3. IF the partition has buffered CDC events from before subscriber
   registration, THE handshake catchup SHALL replay all buffered events to
   the new subscriber before switching to steady-state delivery.
4. THE fix SHALL apply to both the `BootstrapService.createPartitionService`
   and `NodeJoiningService.createPartitionService` factories, since both
   paths create partition services for split children.

### Requirement 3: CDC Buffer Replay Robustness

**User Story:** As a cluster operator, I want buffered CDC events to be
reliably replayed when a subscriber registers, so that no system table
updates are lost even if the subscriber arrives after events have been
buffered.

#### Acceptance Criteria

1. WHEN a CDC subscriber registers via `subscribeToCDCWithHandshake()` and
   the buffer contains events, THE handshake SHALL attempt inline replay
   of all buffered events.
2. IF inline replay fails partially, THE system SHALL schedule a follow-up
   replay via `scheduleBufferedCDCReplay()` with the initial retry delay
   (not an escalated backoff delay).
3. THE `scheduleBufferedCDCReplay()` method SHALL NOT exit early when
   `cdcSubscribers.size > 0` and `cdcEventBuffer.hasEvents()` — the
   existing guard is correct but the interaction with handshake timing
   must be verified under concurrent load.
4. WHEN a subscriber is the first to register on a partition that has
   buffered events, THE replay SHALL begin within one retry delay interval
   after registration completes.

### Requirement 4: Leader Metadata Propagation for Child Partitions

**User Story:** As a cluster operator, I want child partition leader metadata
to propagate to all nodes after Raft leader election, so that the rebalancer
and query router can discover child partition leaders.

#### Acceptance Criteria

1. WHEN a child partition's Raft group elects a leader, THE `partitions`
   system table row SHALL be updated with the elected leader's `node_id`
   in the `leader_node_id` field.
2. THE `leader_node_id` update SHALL flow through the standard CDC
   propagation path so that `SystemTableCache` on all nodes reflects the
   new leader.
3. THE update SHALL happen through the canonical partition row owner path,
   not through a new or parallel write mechanism.
4. IF the CDC subscriber is not yet registered when leader election occurs,
   THE `leader_node_id` update SHALL be buffered and replayed when the
   subscriber registers (per Requirement 3).

### Requirement 5: Restart CDC Subscription Re-establishment

**User Story:** As a cluster operator, I want a restarted node to
re-establish all CDC subscriptions within a bounded time window, so that
its system cache is populated and it can participate in cluster operations.

#### Acceptance Criteria

1. WHEN a node restarts and re-joins the cluster via `NodeJoiningService`,
   THE CDC subscription setup (`subscribeToCDCEvents()`) SHALL complete
   before the node advertises itself as ready.
2. IF any CDC subscription fails during re-establishment, THE failure SHALL
   be logged with structured diagnostics (which table, which partition,
   which error) and retried with bounded backoff.
3. THE node SHALL NOT advertise readiness (via heartbeat or node status)
   until CDC subscriptions for all CDC-propagated system tables are
   confirmed active.
4. THE total CDC re-establishment time SHALL be bounded by a configurable
   timeout. If the timeout expires, the node SHALL emit a structured
   diagnostic event identifying which subscriptions are missing and
   continue attempting recovery.

### Requirement 6: Message Group Leader Failover CDC Continuity

**User Story:** As a cluster operator, I want CDC propagation to continue
seamlessly when the message group leader fails over to another node, so
that system cache updates are not interrupted during seed or node restarts.

#### Acceptance Criteria

1. WHEN a message group's Raft leader changes, THE new leader SHALL
   re-establish CDC subscriptions for all CDC-propagated tables within
   the message group's scope.
2. THE new leader's CDC subscription setup SHALL follow the same path as
   initial subscription (`subscribeToCDC` on `MessageGroupWorkerService`
   or `MessageGroupService`), not a new parallel mechanism.
3. DURING the failover window (between old leader loss and new leader
   subscription), CDC events SHALL be buffered on the source partitions
   (per the existing `cdcEventBuffer` mechanism) and replayed when the
   new subscriber registers.
4. THE failover SHALL NOT require manual intervention or node restart to
   restore CDC propagation.

### Requirement 7: Timer Cleanup on Node Shutdown

**User Story:** As a cluster operator, I want all timers and retry loops
to be properly cleaned up when a node shuts down, so that restarted nodes
do not accumulate leaked resources from previous lifecycles.

#### Acceptance Criteria

1. WHEN a `PartitionService` is destroyed, ALL pending timers SHALL be
   cleared, including `cdcBufferReplayTimer`, stabilization timers, and
   any retry backoff timers.
2. WHEN a `UnifiedRebalancer` is shut down, ALL pending timers SHALL be
   cleared, including `scheduledCheck`, `stabilizationTimer`, and any
   queued reconcile work.
3. WHEN a `MessageGroupService` is shut down, ALL pending timers SHALL be
   cleared, including CDC-related timers and rebalancer timers.
4. THE shutdown cleanup SHALL be idempotent — calling shutdown multiple
   times SHALL NOT throw or leak resources.
5. AFTER shutdown, NO new timers SHALL be created by the shut-down
   component, even if async callbacks from pre-shutdown operations
   attempt to schedule work.

### Requirement 8: Structured Restart Recovery Diagnostics

**User Story:** As a cluster operator, I want structured diagnostics during
node restart recovery, so that I can identify exactly where the CDC pipeline
is stalled when a node fails to recover.

#### Acceptance Criteria

1. DURING restart recovery, THE node SHALL emit periodic structured
   diagnostic events showing CDC subscription status per system table
   (subscribed, pending, failed, buffered event count).
2. THE diagnostics SHALL include message group leader identity and
   connection status, since CDC propagation depends on message group
   transport.
3. THE diagnostics SHALL be queryable via the existing admin diagnostics
   endpoint so that the distributed harness can capture them in failure
   bundles.
4. THE diagnostic interval SHALL be configurable, defaulting to every
   5 seconds during recovery.
