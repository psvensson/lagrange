# Stable Raft Leadership - Design Document

## Overview

This document describes the design for ensuring partition Raft groups quickly elect a leader and maintain stable leadership. The system uses the liferaft library for all Raft consensus operations and MessageRouter for all inter-replica communication.

## Architecture

The Raft consensus architecture consists of:

1. **PartitionService** - Wraps liferaft and provides the transport layer
2. **Liferaft** - External library handling all Raft consensus logic
3. **MessageRouter** - Unified transport for all Raft message delivery

```
┌─────────────────────────────────────────────────────────────┐
│                      PartitionService                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                    Liferaft                          │    │
│  │  - Election logic                                    │    │
│  │  - Heartbeat management                              │    │
│  │  - Log replication                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                     write() method                           │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  MessageRouter                       │    │
│  │  - Local delivery (same node)                        │    │
│  │  - Remote delivery (WebSocket)                       │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### PartitionService

The PartitionService creates a custom RaftNode class that extends LifeRaft:

```javascript
class RaftNode extends LifeRaft {
  write(packet, callback) {
    // Build peer address for routing
    const peerAddress = self.buildPeerAddress(this.address);
    
    // Deliver via MessageRouter
    self.transport.deliver(peerAddress, packet)
      .then((result) => callback(null, result))
      .catch((err) => callback(err));
  }
}
```

Key responsibilities:
- Create liferaft instance with correct configuration
- Provide write() method that uses MessageRouter
- Join all peer replicas via liferaft.join()
- Handle liferaft events (leader, follower, candidate)

### MessageRouter

The MessageRouter handles all message delivery:
- Local delivery for co-located replicas
- WebSocket delivery for remote replicas
- Address-based routing using unified format: `${nodeId}/partition/${replicaId}`

### Peer Discovery

When a replica is created, it must receive the complete list of peer replica IDs:

1. During bootstrap: `replicaIds` is passed directly to PartitionService constructor
2. During rebalancing: `replica_ids` is included in CREATE_REPLICA message

**Important**: All peer addresses MUST use the fully qualified network identity format: `${nodeId}/partition/${replicaId}`. This ensures replicas can address peers on other nodes when the cluster topology changes, even if they initially start on the same node.

## Data Models

### Replica Configuration

```javascript
{
  partitionId: string,      // Partition identifier
  replicaId: string,        // This replica's ID
  replicaIds: string[],     // All peer replica IDs (including self)
  nodeId: string,           // Node hosting this replica
  transport: MessageRouter  // Transport for Raft communication
}
```

### Peer Address Format

All peer addresses use the unified format: `${nodeId}/partition/${replicaId}`

This format is used:
- When joining peers via liferaft.join()
- When sending Raft messages via write()
- When registering with MessageRouter

Example: `node-001/partition/partition-1-r0`
```

### Raft Message Flow

```
Replica A (Leader)                    Replica B (Follower)
      │                                      │
      │  heartbeat via write()               │
      ├─────────────────────────────────────>│
      │                                      │
      │  MessageRouter.deliver()             │
      │  ─────────────────────────────────>  │
      │                                      │
      │  handleTransportMessage()            │
      │  <─────────────────────────────────  │
      │                                      │
      │  liferaft.emit('data', packet)       │
      │                                      │
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system - essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Single Leader Election

*For any* Raft group with N replicas (where N >= 1), after initialization completes, exactly one replica SHALL have isLeader=true.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Leadership Stability

*For any* Raft group that has elected a leader, if no topology changes occur, the leader SHALL remain the same and term numbers SHALL not increment.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Message Delivery

*For any* Raft message sent via the write() method, the MessageRouter SHALL deliver it to the correct peer replica handler, regardless of whether replicas are co-located or distributed.

**Validates: Requirements 3.2, 3.3, 6.2, 6.4**

### Property 4: Complete Peer List

*For any* replica created via PartitionService, the replicaIds array SHALL contain all peer replica IDs for that partition.

**Validates: Requirements 4.1**

### Property 5: No Premature Leadership

*For any* replica with an incomplete peer list (replicaIds.length < expected), the replica SHALL NOT immediately declare itself leader.

**Validates: Requirements 4.3**

## Error Handling

### Transport Failures

When MessageRouter.deliver() fails:
- Liferaft handles retries internally via its heartbeat mechanism
- Failed deliveries are logged but don't crash the replica
- Liferaft will eventually trigger re-election if leader becomes unreachable

### Peer Discovery Failures

When peer addresses cannot be resolved:
- Fall back to same-node addressing during bootstrap
- Log warning but continue operation
- Liferaft will retry connections

## Testing Strategy

### Unit Tests

Unit tests verify specific examples and edge cases:
- Replica registration with MessageRouter
- Peer address building
- Liferaft configuration

### Property-Based Tests

Property tests verify universal properties across all inputs using fast-check:

1. **Single Leader Property**: Generate random replica configurations, verify exactly one leader
2. **Stability Property**: Create Raft group, wait for election, verify no leadership changes
3. **Message Delivery Property**: Generate random messages, verify delivery to correct handler
4. **Peer List Property**: Generate replica creation scenarios, verify complete peer lists

Configuration:
- Use fast-check library for property-based testing
- Maximum 10 iterations per property test (per testing guidelines)
- Tests must complete in < 2 seconds

### Integration Tests

Integration tests verify end-to-end behavior:
- 3 replicas on same node elect one leader
- Leadership remains stable over time
- Raft communication works via MessageRouter
