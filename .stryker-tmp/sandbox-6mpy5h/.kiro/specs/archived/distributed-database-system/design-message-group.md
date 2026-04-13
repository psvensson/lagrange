# Message Group Service

Message groups provide reliable inter-service communication and system state distribution. They serve as the unified transport layer for **ALL** service-to-service communication, including Raft consensus messages between partition replicas and between message group replicas themselves.

## Communication Exceptions

The ONLY communications that do NOT go through message groups are:

**1. Initial Bootstrap (One-Time, Before Message Groups Available):**
- New node uses plain HTTP to contact seed node
- HTTP GET/POST to retrieve:
  - Initial system state cache (nodes, partitions, message groups)
  - Message group assignment (join existing or create new)
  - Peer addresses for message group joining
- This is a one-time operation during node startup

**2. Admin CLI Tool Connections:**
- Human operators connect to nodes via WebSocket for administration
- WebSocket endpoint: `/api/admin/stream`
- Used for monitoring, debugging, and manual operations
- Does not use message group infrastructure (direct connection to node)

## Communication Architecture

```
Node A                                    Node B
┌─────────────────────────┐              ┌─────────────────────────┐
│ Service X               │              │ Service Y               │
│   ↓ (send message)      │              │   ↑ (receive message)   │
│ Local Message Group     │              │ Local Message Group     │
│   ↓ (via WebSocket)     │              │   ↑ (via WebSocket)     │
└─────────────────────────┘              └─────────────────────────┘
         │                                        ↑
         └────── Single WebSocket Connection ────┘

Admin CLI Tool
    │
    └──── WebSocket: /api/admin/stream ────> Node A (direct)
```

**Key Benefits:**
- **Single connection per node pair**: Reduces connection overhead
- **Guaranteed delivery**: Message groups handle retries and persistence
- **Location transparency**: Services don't know peer locations
- **Simplified networking**: One WebSocket handles all inter-node traffic
- **Admin access**: Direct WebSocket for human operators

**Validates: Requirements 4.15-18**

## Message Group Topology

- Each message group is a 3-replica Raft group with in-memory storage
- Every node MUST have at least one local message group replica
- A node MAY have multiple local message group replicas (during transitions or in small clusters)
- Message groups form overlapping clusters as nodes are added:
  - 1 node: MG-1 has 3 replicas on node 1
  - 2 nodes: MG-1 has replicas on nodes 1, 1, 2 (rebalancer moves one)
  - 3 nodes: MG-1 has replicas on nodes 1, 2, 3
  - 4 nodes: MG-2 created with replicas on nodes 2, 3, 4 (node 4 gets local access)
  - N nodes: Rebalancer creates/moves replicas to ensure all nodes have local access

## Transport Usage Rules

**CRITICAL: Transport Usage Rules:**

InMemoryTransport is used ONLY during the initial bootstrap phase when creating services on a single node before message groups are operational. After bootstrap completes:

1. **ALL communication** (including same-node) routes through the message router
2. **Local routing**: MessageGroupTransport handles same-node message delivery
3. **Cross-node routing**: WebSocket connections between nodes handle inter-node delivery
4. **No fallback**: There is NO fallback to InMemoryTransport after bootstrap

**Transport Lifecycle:**
```
Bootstrap Phase (Single Node):
  - InMemoryTransport for initial message group Raft
  - Message groups establish leadership
  - System table partitions created

Post-Bootstrap (All Nodes):
  - MessageGroupTransport for ALL partition Raft communication
  - MessageGroupTransport for message group Raft communication
  - WebSocket for cross-node message delivery
  - InMemoryTransport is NOT used
```

## System Table Cache Architecture

Each message group replica maintains its own System_Table_Cache. The cache lives within the message group replica service, not as a separate copy on the node. All message group replicas maintain identical caches via CDC subscription:
- `nodes` - Available nodes and their resource statistics
- `partitions` - Partition locations and replica assignments
- `tables` - Table schemas and policies
- `message_groups` - Message group membership
- `services` - Service registry

Local services query system information by calling any local message group replica on their node. Since all message group replica caches are identical (via CDC), it doesn't matter which local replica is used. The cache is updated automatically when system table partitions emit CDC events.

## Read-Only Cache Constraint (Requirement 32)

**CRITICAL: Read-Only Cache Constraint:**

The System_Table_Cache MUST be read-only for all components except CDC event handlers. This is a fundamental architectural constraint that ensures cache consistency across all nodes.

**Rules:**
1. **NO direct cache writes**: Components must NEVER call `applySystemTableChange()` to write to the cache
2. **ALL writes go through system tables**: Use `CDCIntegrationService.insertSystemTableRow()`, `updateSystemTableRow()`, or `deleteSystemTableRow()`
3. **CDC is the single source of truth**: Only CDC event handlers may update the cache
4. **Even local writes must use CDC**: Even if writing on the same node, writes must go through the system table partition

**Why This Matters:**
- **Consistency**: Direct cache writes bypass CDC, causing cache divergence across nodes
- **Ordering**: CDC provides a total order of events; direct writes break this guarantee
- **Auditability**: All changes are logged in Raft; direct cache writes are invisible
- **Failure recovery**: CDC events are replicated; direct cache writes are lost on crash

## Interface

```javascript
class MessageGroupService {
  async sendMessage(targetService, message)
  async receiveMessage(message)
  async subscribeToSystemTableCDC(tableName)
  async querySystemCache(tableName, query) // Local services call this
  async acknowledgeMessage(messageId)
  async routeRaftMessage(sourceReplica, targetReplica, raftMessage)
}
```

## Transport Architecture

```
Partition Replica A                    Partition Replica B
      ↓ Raft message                         ↑
      ↓                                      ↑
Message Group (local)  ←──────────→  Message Group (local or remote)
      ↓                                      ↑
      └──── WebSocket (if cross-node) ───────┘
```

All partition replicas communicate through message groups, which handle:
- Local routing (same-node): direct message passing between worker threads
- Remote routing (cross-node): WebSocket transport between nodes

This ensures location transparency — replicas don't know or care where their peers are located.

**Validates: Requirements 4.7, 4.8, 5.2, 5.3, 6.1-6.6**
