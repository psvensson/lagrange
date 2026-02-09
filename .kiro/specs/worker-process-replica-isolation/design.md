# Design Document: Worker Process Replica Isolation

## Overview

This design describes the architecture for isolating Raft replicas (partitions and message groups) into separate worker processes. The goal is to eliminate shared memory between replicas, ensure uniform communication paths regardless of replica locality, and provide independent system caches for each message group replica.

The key architectural changes are:
1. Each replica runs in its own piscina worker process
2. All inter-replica communication routes through MessageRouter (transport-agnostic)
3. Each message group replica has its own in-memory SQLite system cache
4. Only message group leaders subscribe to CDC events from partition leaders
5. Cache changes are replicated via message group Raft consensus

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Main Process                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         MessageRouter                                    │    │
│  │              (Transport-agnostic, handles all routing)                   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│           │                    │                          │                      │
│           │ IPC                │ IPC                      │ Transport            │
│           ▼                    ▼                          ▼                      │
│  ┌─────────────────┐  ┌─────────────────┐        ┌─────────────────┐            │
│  │ Worker Process  │  │ Worker Process  │        │  Remote Nodes   │            │
│  │ (Partition R1)  │  │ (MsgGroup R1)   │        │                 │            │
│  └─────────────────┘  └─────────────────┘        └─────────────────┘            │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    ReplicaWorkerManager                                  │    │
│  │         (Manages worker lifecycle, health monitoring)                    │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Worker Process (Partition)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │PartitionService │  │  SQLite DB      │  │    WorkerMessageBridge          │  │
│  │  (Raft Group)   │  │  (Data + Log)   │  │  (IPC to Main Process)          │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Worker Process (Message Group)                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │MessageGroupSvc  │  │ SQLite Cache    │  │    WorkerMessageBridge          │  │
│  │  (Raft Group)   │  │ (System Tables) │  │  (IPC to Main Process)          │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Message Flow Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Message Flow (Same Node)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Worker A                    Main Process                    Worker B         │
│  ┌─────────┐                ┌─────────────┐                ┌─────────┐       │
│  │ Replica │ ──IPC Send──▶  │MessageRouter│ ──IPC Send──▶  │ Replica │       │
│  │   A     │                │             │                │   B     │       │
│  │         │ ◀──IPC Recv──  │             │ ◀──IPC Recv──  │         │       │
│  └─────────┘                └─────────────┘                └─────────┘       │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                       Message Flow (Cross Node)                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Node 1                                              Node 2                   │
│  ┌─────────┐    ┌─────────────┐    Transport    ┌─────────────┐  ┌─────────┐│
│  │ Worker  │──▶ │MessageRouter│ ═══════════════▶│MessageRouter│──▶│ Worker  ││
│  │ Replica │    │             │                 │             │   │ Replica ││
│  └─────────┘    └─────────────┘                 └─────────────┘   └─────────┘│
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### CDC Flow Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CDC Event Flow                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Partition Leader                Message Group Leader         MG Followers    │
│  ┌─────────────────┐            ┌─────────────────┐         ┌─────────────┐  │
│  │ Write Operation │            │ CDC Subscriber  │         │  Follower 1 │  │
│  │       │         │            │       │         │         │             │  │
│  │       ▼         │            │       ▼         │         │             │  │
│  │ Generate CDC    │──CDC Evt──▶│ Apply to SQLite │──Raft──▶│ Apply CDC   │  │
│  │                 │            │ Cache           │ Repl    │ to Cache    │  │
│  └─────────────────┘            └─────────────────┘         └─────────────┘  │
│                                                              ┌─────────────┐  │
│                                                              │  Follower 2 │  │
│                                                              │ Apply CDC   │  │
│                                                              │ to Cache    │  │
│                                                              └─────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### ReplicaWorkerManager

Manages the lifecycle of all replica worker processes on a node. Also handles MessageRouter registration on behalf of workers.

```javascript
/**
 * ReplicaWorkerManager - Manages replica worker process lifecycle.
 * Replaces direct replica creation in main process.
 * Handles MessageRouter registration for workers (workers don't self-register).
 */
class ReplicaWorkerManager {
  /**
   * Create a new partition replica in a worker process.
   * After successful creation, registers handler with MessageRouter.
   * @param {Object} options - Partition configuration
   * @param {string} options.partitionId - Partition ID
   * @param {string} options.replicaId - Replica ID
   * @param {string} options.tableId - Table ID
   * @param {Object} options.schema - Table schema
   * @param {string} options.dbPath - SQLite database path
   * @param {Object} options.messageRouter - MessageRouter instance for registration
   * @return {Promise<WorkerReplicaHandle>} Handle to the worker replica
   */
  async createPartitionReplica(options) {}

  /**
   * Create a new message group replica in a worker process.
   * After successful creation, registers handler with MessageRouter.
   * @param {Object} options - Message group configuration
   * @param {string} options.groupId - Message group ID
   * @param {string} options.replicaId - Replica ID
   * @param {Array<string>} options.replicaIds - All replica IDs in group
   * @param {Object} options.messageRouter - MessageRouter instance for registration
   * @return {Promise<WorkerReplicaHandle>} Handle to the worker replica
   */
  async createMessageGroupReplica(options) {}

  /**
   * Stop a replica and terminate its worker process.
   * Unregisters handler from MessageRouter.
   * @param {string} replicaId - Replica ID to stop
   * @return {Promise<void>}
   */
  async stopReplica(replicaId) {}

  /**
   * Deliver a message to a worker replica.
   * Used by MessageRouter handlers to forward messages.
   * @param {string} replicaId - Target replica ID
   * @param {Object} message - Message to deliver
   * @return {Promise<Object>} Response from worker
   */
  async deliverMessage(replicaId, message) {}

  /**
   * Query leadership status of a replica.
   * @param {string} replicaId - Replica ID to query
   * @return {Promise<{isLeader: boolean, term: number}>} Leadership status
   */
  async getLeadershipStatus(replicaId) {}

  /**
   * Get health status of all worker processes.
   * @return {Map<string, WorkerHealthStatus>} Health status by replica ID
   */
  getHealthStatus() {}

  /**
   * Get all message group replica handles on this node.
   * @return {Array<WorkerReplicaHandle>} Message group handles
   */
  getMessageGroupReplicas() {}

  /**
   * Handle worker process crash.
   * Unregisters from MessageRouter and emits failure event.
   * @param {string} replicaId - Crashed replica ID
   * @param {Error} error - Crash error
   * @private
   */
  handleWorkerCrash(replicaId, error) {}
}
```

### SystemCacheProxy

Stateless proxy in the main process for system cache access. Forwards queries to a local message group replica.

```javascript
/**
 * SystemCacheProxy - Stateless proxy for system cache access.
 * Forwards all queries to a local message group replica.
 * Does NOT cache any data locally.
 */
class SystemCacheProxy {
  /**
   * Create a new SystemCacheProxy.
   * @param {Object} options - Configuration options
   * @param {ReplicaWorkerManager} options.workerManager - Worker manager instance
   */
  constructor(options) {}

  /**
   * Get a record from a system table.
   * Forwards query to local message group replica.
   * @param {string} tableName - System table name
   * @param {string} key - Primary key value
   * @return {Promise<Object|undefined>} Record or undefined
   */
  async get(tableName, key) {}

  /**
   * Query system table with SQL.
   * Forwards query to local message group replica.
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @return {Promise<Array<Object>>} Query results
   */
  async query(sql, params) {}

  /**
   * Filter records from a system table.
   * Forwards query to local message group replica.
   * @param {string} tableName - System table name
   * @param {Function} predicate - Filter function
   * @return {Promise<Array<Object>>} Matching records
   */
  async filter(tableName, predicate) {}

  /**
   * Get all records from a system table.
   * Forwards query to local message group replica.
   * @param {string} tableName - System table name
   * @return {Promise<Array<Object>>} All records
   */
  async getAll(tableName) {}

  /**
   * Select a local message group replica for queries.
   * Called when the set of local replicas changes.
   * @private
   */
  selectLocalReplica() {}
}
```

### WorkerMessageBridge

Handles IPC communication between worker processes and the main process. Note: Workers do NOT self-register with MessageRouter - the ReplicaWorkerManager handles registration.

```javascript
/**
 * WorkerMessageBridge - IPC bridge for worker-to-main communication.
 * Runs in each worker process.
 * Note: Registration with MessageRouter is handled by ReplicaWorkerManager,
 * not by the worker itself.
 */
class WorkerMessageBridge {
  /**
   * Initialize the message bridge.
   * Sets up IPC listener for incoming messages.
   * @return {Promise<void>}
   */
  async initialize() {}

  /**
   * Send a message through the main process MessageRouter.
   * @param {string} targetAddress - Target unified address
   * @param {Object} message - Message payload
   * @return {Promise<Object>} Response from target
   */
  async send(targetAddress, message) {}

  /**
   * Handle incoming message from main process.
   * @param {Object} envelope - Message envelope
   * @return {Promise<Object>} Response to send back
   */
  async handleIncoming(envelope) {}

  /**
   * Set the handler for incoming messages.
   * @param {Function} handler - Message handler function
   */
  setMessageHandler(handler) {}

  /**
   * Shutdown the message bridge.
   * @return {Promise<void>}
   */
  async shutdown() {}
}
```

### SQLiteSystemCache

In-memory SQLite-based system cache for message group replicas.

```javascript
/**
 * SQLiteSystemCache - In-memory SQLite cache for system tables.
 * Each message group replica has its own instance.
 */
class SQLiteSystemCache {
  /**
   * Create a new SQLite system cache.
   * Initializes in-memory SQLite database with system table schemas.
   */
  constructor() {}

  /**
   * Get a record from a system table.
   * @param {string} tableName - System table name
   * @param {string} key - Primary key value
   * @return {Object|undefined} Record or undefined
   */
  get(tableName, key) {}

  /**
   * Query system table with SQL.
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @return {Array<Object>} Query results
   */
  query(sql, params) {}

  /**
   * Apply a CDC event to the cache.
   * @param {string} tableName - Table name
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE)
   * @param {Object} data - Record data
   */
  applyCDCEvent(tableName, operation, data) {}

  /**
   * Get all data for Raft replication.
   * @return {Object} Serializable cache state
   */
  getReplicationState() {}

  /**
   * Apply replicated state from Raft leader.
   * @param {Object} state - Replicated cache state
   */
  applyReplicationState(state) {}
}
```

### ReplicaWorkerBase

Abstract base class for replica services running in worker processes.

```javascript
/**
 * ReplicaWorkerBase - Base class for worker process replicas.
 * Handles common lifecycle and communication setup.
 */
class ReplicaWorkerBase {
  /**
   * Initialize the worker replica.
   * Sets up IPC bridge and registers with MessageRouter.
   * @return {Promise<void>}
   */
  async initialize() {}

  /**
   * Start the replica service.
   * Subclasses implement replica-specific startup.
   * @return {Promise<void>}
   */
  async start() {}

  /**
   * Stop the replica service gracefully.
   * @return {Promise<void>}
   */
  async stop() {}

  /**
   * Handle incoming message from MessageRouter.
   * @param {Object} message - Incoming message
   * @return {Promise<Object>} Response
   */
  async handleMessage(message) {}

  /**
   * Send message to another replica via MessageRouter.
   * @param {string} targetAddress - Target unified address
   * @param {Object} message - Message payload
   * @return {Promise<Object>} Response
   */
  async sendMessage(targetAddress, message) {}
}
```

### PartitionWorkerService

Partition service implementation for worker processes.

```javascript
/**
 * PartitionWorkerService - Partition replica running in worker process.
 * Extends ReplicaWorkerBase with partition-specific functionality.
 */
class PartitionWorkerService extends ReplicaWorkerBase {
  /**
   * Initialize partition with SQLite database and Raft.
   * @return {Promise<void>}
   */
  async initialize() {}

  /**
   * Execute SQL query on this partition.
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @return {Promise<Object>} Query result
   */
  async executeQuery(sql, params) {}

  /**
   * Generate and emit CDC event for data change.
   * @param {string} operation - CDC operation
   * @param {Object} data - Changed data
   */
  emitCDCEvent(operation, data) {}
}
```

### MessageGroupWorkerService

Message group service implementation for worker processes.

```javascript
/**
 * MessageGroupWorkerService - Message group replica in worker process.
 * Extends ReplicaWorkerBase with message group functionality.
 */
class MessageGroupWorkerService extends ReplicaWorkerBase {
  /**
   * Initialize message group with SQLite cache and Raft.
   * @return {Promise<void>}
   */
  async initialize() {}

  /**
   * Subscribe to CDC events from partition leaders (leader only).
   * @return {Promise<void>}
   */
  async subscribeToCDC() {}

  /**
   * Unsubscribe from CDC events (when losing leadership).
   * @return {Promise<void>}
   */
  async unsubscribeFromCDC() {}

  /**
   * Apply CDC event to local cache and replicate to followers.
   * @param {Object} cdcEvent - CDC event from partition
   * @return {Promise<void>}
   */
  async applyCDCEvent(cdcEvent) {}

  /**
   * Get system cache for local queries.
   * @return {SQLiteSystemCache} Local system cache
   */
  getSystemCache() {}
}
```

## Data Models

### WorkerReplicaHandle

Handle returned when creating a worker replica.

```javascript
{
  replicaId: string,           // Unique replica identifier
  workerId: number,            // Piscina worker ID
  entityType: string,          // 'partition' or 'message-group'
  unifiedAddress: string,      // Full unified address
  status: string,              // 'starting', 'running', 'stopping', 'stopped'
  createdAt: number,           // Creation timestamp
  lastHealthCheck: number,     // Last health check timestamp
  healthStatus: string         // 'healthy', 'unhealthy', 'unknown'
}
```

### WorkerOperation

Operations sent to worker processes.

```javascript
{
  operation: string,           // Operation type
  replicaId: string,           // Target replica ID
  data: Object                 // Operation-specific data
}

// Operation types:
// - CREATE_PARTITION_REPLICA
// - CREATE_MESSAGE_GROUP_REPLICA
// - STOP_REPLICA
// - DELIVER_MESSAGE
// - HEALTH_CHECK
```

### WorkerMessage

Message envelope for IPC communication.

```javascript
{
  type: string,                // 'request', 'response', 'event'
  messageId: string,           // Unique message ID for correlation
  sourceAddress: string,       // Sender's unified address
  targetAddress: string,       // Recipient's unified address
  payload: Object,             // Message payload
  correlationId: string,       // Request correlation ID
  timestamp: number            // Message timestamp
}
```

### CDCReplicationEntry

CDC event entry for Raft replication in message groups.

```javascript
{
  type: 'CDC_REPLICATION',
  tableName: string,           // System table name
  operation: string,           // INSERT, UPDATE, DELETE
  data: Object,                // Record data
  sourcePartitionId: string,   // Originating partition
  hlcTimestamp: string,        // HLC timestamp for ordering
  sequenceNumber: number       // Sequence within partition
}
```

### Worker Message Types

Message types for communication with worker replicas.

```javascript
// Leadership query
{
  type: 'GET_LEADERSHIP_STATUS',
  replicaId: string
}

// Leadership response
{
  type: 'LEADERSHIP_STATUS',
  isLeader: boolean,
  term: number,
  leaderId: string | null
}

// Cache query (sent to message group replica)
{
  type: 'CACHE_GET',
  tableName: string,
  key: string
}

// Cache query response
{
  type: 'CACHE_GET_RESPONSE',
  data: Object | null
}

// Cache SQL query
{
  type: 'CACHE_QUERY',
  sql: string,
  params: Array
}

// Cache SQL query response
{
  type: 'CACHE_QUERY_RESPONSE',
  rows: Array<Object>
}

// CDC subscription (sent to partition service address)
{
  type: 'SUBSCRIBE_CDC',
  tableName: string,
  subscriberAddress: string    // Message group service address
}

// CDC event (sent to subscribed message group)
{
  type: 'CDC_EVENT',
  tableName: string,
  operation: string,           // INSERT, UPDATE, DELETE
  data: Object,
  sourcePartitionId: string,
  hlcTimestamp: string
}

// Seed cache (sent to message group leader during bootstrap)
{
  type: 'SEED_CACHE',
  entries: Array<{
    tableName: string,
    operation: string,         // INSERT only during seeding
    data: Object
  }>,
  bootstrapPhase: boolean      // Must be true, rejected otherwise
}

// Seed cache response
{
  type: 'SEED_CACHE_RESPONSE',
  success: boolean,
  entriesApplied: number,
  error: string | null
}

// Join request (sent by joining node to seed node via WebSocket)
{
  type: 'JOIN_REQUEST',
  nodeId: string,
  address: string,             // Joining node's address
  capabilities: Object         // Node capabilities (optional)
}

// Join response (sent by seed node to joining node)
{
  type: 'JOIN_RESPONSE',
  success: boolean,
  messageGroupAssignment: {
    groupId: string,
    replicaId: string,
    raftPeers: Array<{
      replicaId: string,
      address: string
    }>
  },
  error: string | null
}

// Join complete (sent by joining node after message group replica is ready)
{
  type: 'JOIN_COMPLETE',
  nodeId: string,
  messageGroupReplicaId: string,
  ready: boolean
}

// Join complete acknowledgment
{
  type: 'JOIN_COMPLETE_ACK',
  success: boolean,
  nextSteps: Array<string>     // Instructions for next phase (partition replicas, etc.)
}
```

## Registration Flow

The registration flow ensures workers are properly connected to MessageRouter without self-registration:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Worker Registration Flow                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  1. Main Process calls ReplicaWorkerManager.createPartitionReplica()         │
│                                                                               │
│  2. ReplicaWorkerManager sends CREATE_PARTITION_REPLICA to piscina pool      │
│                                                                               │
│  3. Worker process creates PartitionWorkerService                            │
│     - Initializes SQLite database                                            │
│     - Initializes Raft (liferaft)                                            │
│     - Sets up WorkerMessageBridge (but does NOT register)                    │
│                                                                               │
│  4. Worker returns success to ReplicaWorkerManager                           │
│                                                                               │
│  5. ReplicaWorkerManager registers handler with MessageRouter:               │
│     messageRouter.registerWorkerHandler(                                     │
│       unifiedAddress,                                                        │
│       (msg) => this.deliverMessage(replicaId, msg)                          │
│     )                                                                        │
│                                                                               │
│  6. Now messages to unifiedAddress are routed to the worker                  │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Bootstrap Sequence with Workers

The bootstrap sequence is updated to use worker processes with "Message Groups First" approach:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Bootstrap Sequence (Seed Node)                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Phase 1: Infrastructure                                                      │
│  ├─ Create MessageRouter                                                      │
│  └─ Create ReplicaWorkerManager (initializes piscina pool)                   │
│                                                                               │
│  Phase 2: Message Groups FIRST (before partitions)                           │
│  ├─ Create message group replicas via workerManager.createMessageGroupReplica│
│  ├─ Each returns WorkerReplicaHandle (not service instance)                  │
│  ├─ Wait for leadership via workerManager.getLeadershipStatus()              │
│  ├─ Create SystemCacheProxy pointing to local message group                  │
│  └─ Send SEED_CACHE message with initial system data (nodes, tables, etc.)   │
│                                                                               │
│  Phase 3: Partitions                                                          │
│  ├─ Create partition replicas via workerManager.createPartitionReplica()     │
│  ├─ Each returns WorkerReplicaHandle (not service instance)                  │
│  └─ Wait for leadership via workerManager.getLeadershipStatus()              │
│                                                                               │
│  Phase 4: Registration                                                        │
│  ├─ Write system data to partitions via SQL (now partitions exist)           │
│  └─ Subscribe message groups to CDC via SUBSCRIBE_CDC messages               │
│                                                                               │
│  Phase 5: Ongoing Operation                                                   │
│  ├─ All system data writes go through partitions                             │
│  └─ Message group caches updated via CDC events                              │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Node Joining Sequence

The joining sequence ensures the joining node has a message group replica before any other operations:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Node Joining Sequence                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Joining Node                              Seed Node                          │
│       │                                        │                              │
│       │──── WebSocket Connect ────────────────▶│                              │
│       │                                        │                              │
│       │──── JOIN_REQUEST ─────────────────────▶│                              │
│       │     {nodeId, address}                  │                              │
│       │                                        │                              │
│       │                                        │ Assign message group replica │
│       │                                        │ to joining node              │
│       │                                        │                              │
│       │◀─── JOIN_RESPONSE ─────────────────────│                              │
│       │     {messageGroupAssignment:           │                              │
│       │       {groupId, replicaId, raftPeers}} │                              │
│       │                                        │                              │
│       │ Create message group replica           │                              │
│       │ in worker process                      │                              │
│       │                                        │                              │
│       │ Raft syncs state from leader ─────────▶│◀──── Raft replication        │
│       │ (receives full system cache)           │                              │
│       │                                        │                              │
│       │ Create SystemCacheProxy                │                              │
│       │                                        │                              │
│       │──── JOIN_COMPLETE ────────────────────▶│                              │
│       │     {nodeId, messageGroupReplicaId}    │                              │
│       │                                        │                              │
│       │◀─── JOIN_COMPLETE_ACK ─────────────────│                              │
│       │     {nextSteps: [...]}                 │                              │
│       │                                        │                              │
│       │ Now use message groups for all         │                              │
│       │ subsequent communication               │                              │
│       │                                        │                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Key points:
1. Joining node connects via WebSocket for initial handshake only
2. First action is to create message group replica
3. Raft replication transfers full system cache state
4. After JOIN_COMPLETE, all communication uses message groups



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Worker Spawning

*For any* replica creation request (partition or message group), the ReplicaWorkerManager SHALL spawn a dedicated worker process, and the worker process count SHALL increase by exactly one.

**Validates: Requirements 1.1, 1.2**

### Property 2: Worker Process Isolation

*For any* set of worker processes on the same node, a crash or state change in one worker process SHALL NOT affect the memory state or operation of other worker processes.

**Validates: Requirements 1.4, 1.6, 2.3**

### Property 3: Uniform Message Routing

*For any* message sent between replicas, the MessageRouter SHALL use the same routing code path regardless of whether the source and target are on the same node or different nodes.

**Validates: Requirements 2.1, 2.2, 2.4**

### Property 4: Loopback Connection Maintenance

*For any* worker process registered with the main process, there SHALL exist a corresponding loopback connection in the MessageRouter's connection registry.

**Validates: Requirements 2.5**

### Property 5: SQLite Cache Initialization

*For any* message group worker process that starts, the worker SHALL create its own in-memory SQLite database instance for the system cache before completing initialization.

**Validates: Requirements 3.1**

### Property 6: Cache Instance Isolation

*For any* two worker processes on the same node, their SystemTableCache instances SHALL be distinct objects with no shared references.

**Validates: Requirements 3.2**

### Property 7: CDC Replication Round-Trip

*For any* CDC event received by a message group leader, applying the event to the leader's cache and then replicating via Raft SHALL result in all follower caches containing equivalent data.

**Validates: Requirements 3.3, 3.4, 4.4**

### Property 8: Cache SQL Queryability

*For any* valid SQL query against system tables, the SQLiteSystemCache SHALL return results equivalent to querying the same data in a standard SQLite database.

**Validates: Requirements 3.5**

### Property 9: CDC Subscription Exclusivity

*For any* message group, only the leader replica SHALL have active CDC subscriptions to partition leaders, and follower replicas SHALL have zero direct CDC subscriptions.

**Validates: Requirements 4.3, 4.5**

### Property 10: Lifecycle Operation Handling

*For any* lifecycle operation (CREATE_REPLICA or STOP_REPLICA) sent to a worker process, the worker SHALL complete the corresponding action (initialize+register or shutdown+unregister) and return a success response.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5**

### Property 11: Health Status Tracking

*For any* worker process managed by ReplicaWorkerManager, the manager SHALL maintain a health status entry that is updated within the configured health check interval.

**Validates: Requirements 5.6**

### Property 12: Base Class Lifecycle Events

*For any* replica (partition or message group) extending ReplicaWorkerBase, the base class SHALL emit lifecycle events (initialized, started, stopped, failed) at the appropriate state transitions.

**Validates: Requirements 6.1, 6.2, 6.3, 6.5**

### Property 13: IPC Message Routing

*For any* message sent from a worker process, the message SHALL be delivered to the main process via IPC, and *for any* message destined for a local worker, the main process SHALL forward it via IPC.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 14: Unified Address Format Compliance

*For any* address used in worker process message routing, the address SHALL conform to the unified format (nodeId/entityType/replicaId).

**Validates: Requirements 7.4**

### Property 15: Handler Registration on Worker Registration

*For any* worker process that registers with the main process, the MessageRouter SHALL create a corresponding handler entry that routes messages to that worker.

**Validates: Requirements 7.5**

### Property 16: Crash Cleanup

*For any* worker process crash detected by the main process, the associated MessageRouter registration SHALL be removed within the crash handling sequence.

**Validates: Requirements 8.4**

### Property 17: SystemCacheProxy Statelessness

*For any* SystemCacheProxy instance, the proxy SHALL NOT hold any cached data, and all queries SHALL be forwarded to a message group replica.

**Validates: Requirements 9.1, 9.2**

### Property 18: SystemCacheProxy Replica Selection

*For any* SystemCacheProxy, the proxy SHALL use the same local message group replica for queries until the set of local replicas changes.

**Validates: Requirements 9.3, 9.4**

### Property 19: Message-Based Interaction

*For any* interaction between the main process and a worker replica, the interaction SHALL use message-based communication via deliverMessage(), not direct method calls.

**Validates: Requirements 10.1, 10.2, 10.3**

### Property 20: Manager-Based Registration

*For any* worker replica created by ReplicaWorkerManager, the manager SHALL register a MessageRouter handler after successful creation, and the worker SHALL NOT self-register.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 21: Message Groups First Bootstrap Order

*For any* seed node bootstrap, message group replicas SHALL be created and have a leader elected BEFORE any partition replicas are created.

**Validates: Requirements 12.1, 12.2**

### Property 22: SEED_CACHE Bootstrap Restriction

*For any* SEED_CACHE message, the message SHALL only be accepted when the bootstrapPhase flag is true and no partitions exist yet. After partitions are created, SEED_CACHE messages SHALL be rejected.

**Validates: Requirements 12.6, 12.7**

### Property 23: SEED_CACHE Raft Replication

*For any* SEED_CACHE message accepted by a message group leader, the cache entries SHALL be applied to the leader's SQLiteSystemCache AND replicated to all followers via Raft consensus.

**Validates: Requirements 12.4, 12.5**

### Property 24: Joining Node Message Group First

*For any* node joining the cluster, the joining node SHALL create its assigned message group replica BEFORE creating any partition replicas, and SHALL have SystemCacheProxy ready before proceeding with other operations.

**Validates: Requirements 13.4, 13.5, 13.6**

### Property 25: Join Protocol Message Sequence

*For any* node join operation, the message sequence SHALL be: JOIN_REQUEST → JOIN_RESPONSE → (message group creation) → JOIN_COMPLETE → JOIN_COMPLETE_ACK.

**Validates: Requirements 13.1, 13.2, 13.3, 13.7**

### Property 26: Raft Transport Worker Integration

*For any* Raft packet sent between replicas in worker processes, the packet SHALL be routed through WorkerMessageBridge → MessageRouter → target WorkerMessageBridge, using the same path for both local and remote peers.

**Validates: Requirements 14.1, 14.2, 14.3, 14.4**

### Property 27: Cross-Worker Raft Consensus

*For any* Raft group with replicas in separate worker processes on the same node, leader election and log replication SHALL function correctly through the MessageRouter infrastructure.

**Validates: Requirements 14.5, 14.6**

## Error Handling

### Worker Process Errors

| Error Type | Condition | Handling |
|------------|-----------|----------|
| `WorkerSpawnError` | Failed to spawn worker process | Log error, emit failure event, do not retry automatically |
| `WorkerCrashError` | Worker process terminated unexpectedly | Detect within 5s, emit replica failure event, clean up registration, notify rebalancer |
| `WorkerTimeoutError` | Worker did not respond to health check | Mark as unhealthy, retry health check, emit failure after threshold |
| `IPCError` | IPC communication failed | Log error, attempt reconnection, emit failure if persistent |

### Message Routing Errors

| Error Type | Condition | Handling |
|------------|-----------|----------|
| `UnknownAddressError` | Target address not registered | Return error to sender, do not retry |
| `WorkerUnavailableError` | Target worker not responding | Return error to sender, let caller handle retry |
| `MessageSerializationError` | Failed to serialize/deserialize message | Log error, return error to sender |

### CDC Replication Errors

| Error Type | Condition | Handling |
|------------|-----------|----------|
| `CDCSubscriptionError` | Failed to subscribe to partition CDC | Log error, retry with backoff, emit event if persistent |
| `CDCReplicationError` | Failed to replicate CDC via Raft | Raft handles retry internally, log if persistent |
| `CacheApplyError` | Failed to apply CDC to SQLite cache | Log error with full context, this indicates data corruption |

### Lifecycle Errors

| Error Type | Condition | Handling |
|------------|-----------|----------|
| `InitializationError` | Worker failed to initialize | Log error, terminate worker, emit failure event |
| `ShutdownError` | Worker failed to shutdown gracefully | Log warning, force terminate after timeout |
| `RegistrationError` | Worker failed to register with MessageRouter | Log error, terminate worker, emit failure event |

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across randomly generated inputs

### Property-Based Testing Configuration

- **Library**: fast-check
- **Minimum iterations**: 100 per property test (per testing guidelines, use `{numRuns: 10}` for fast execution)
- **Tag format**: `Feature: worker-process-replica-isolation, Property {number}: {property_text}`

### Test Categories

#### Unit Tests

1. **Worker Spawning**
   - Test partition replica creation spawns worker
   - Test message group replica creation spawns worker
   - Test native module (better-sqlite3) availability in worker

2. **Crash Detection**
   - Test crash detection within 5 second threshold
   - Test failure event emission on crash
   - Test rebalancer notification on failure

3. **CDC Subscription Lifecycle**
   - Test subscription on leadership gain
   - Test unsubscription on leadership loss

4. **Initialization**
   - Test piscina pool creation on startup

#### Property Tests

1. **Property 1: Worker Spawning** - Generate random replica configs, verify worker count increases
2. **Property 2: Worker Isolation** - Create multiple workers, crash one, verify others unaffected
3. **Property 3: Uniform Routing** - Generate messages to local/remote targets, verify same code path
4. **Property 4: Loopback Connections** - Register workers, verify loopback connections exist
5. **Property 5: SQLite Cache Init** - Start message group workers, verify SQLite instances created
6. **Property 6: Cache Isolation** - Create multiple workers, verify distinct cache instances
7. **Property 7: CDC Replication** - Generate CDC events, verify leader-to-follower replication
8. **Property 8: Cache Queryability** - Generate SQL queries, verify correct results
9. **Property 9: CDC Subscription Exclusivity** - Create message groups, verify only leaders subscribe
10. **Property 10: Lifecycle Operations** - Send lifecycle ops, verify correct handling
11. **Property 11: Health Tracking** - Create workers, verify health status maintained
12. **Property 12: Lifecycle Events** - Trigger state transitions, verify events emitted
13. **Property 13: IPC Routing** - Send messages, verify IPC path used
14. **Property 14: Address Format** - Generate addresses, verify unified format
15. **Property 15: Handler Registration** - Register workers, verify handlers created
16. **Property 16: Crash Cleanup** - Crash workers, verify registrations removed

### Integration Tests

Integration tests should use real Raft consensus (per testing guidelines):

1. **Multi-Worker Raft Group** - Create 3-replica partition in separate workers, verify Raft consensus works
2. **Cross-Worker CDC Flow** - Partition leader generates CDC, message group leader receives and replicates
3. **Worker Crash Recovery** - Crash a worker, verify rebalancer creates replacement
4. **Full Message Flow** - Send message from worker A to worker B via MessageRouter

### Test File Organization

```
test/
├── worker/
│   ├── replica-worker-manager.test.js
│   ├── replica-worker-manager.property.test.js
│   ├── worker-message-bridge.test.js
│   ├── worker-message-bridge.property.test.js
│   ├── sqlite-system-cache.test.js
│   ├── sqlite-system-cache.property.test.js
│   ├── replica-worker-base.test.js
│   ├── replica-worker-base.property.test.js
│   ├── partition-worker-service.test.js
│   ├── message-group-worker-service.test.js
│   └── integration/
│       ├── multi-worker-raft.integration.test.js
│       ├── cross-worker-cdc.integration.test.js
│       └── worker-crash-recovery.integration.test.js
```


## Architecture Documentation Updates

The following sections of `architecture.md` must be updated when this feature is implemented:

### Component Architecture Section

Update the node diagram to show worker processes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Node                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │   Admin API     │  │  Bootstrap API  │  │      SQL Query Engine       │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    ReplicaWorkerManager                               │   │
│  │              (Manages worker process lifecycle)                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Message Router                                │   │
│  │           (Transport-agnostic, handles local IPC and remote)          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                    │                          │                  │
│     IPC   │              IPC   │                    IPC   │                  │
│           ▼                    ▼                          ▼                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ Worker Process  │  │ Worker Process  │  │    Worker Processes         │  │
│  │ (MsgGroup R1)   │  │ (MsgGroup R2)   │  │    (Partition Replicas)     │  │
│  │ SQLite Cache    │  │ SQLite Cache    │  │    SQLite Data + Log        │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### New Section: Worker Process Architecture

Add a new section describing:

1. **Process Isolation Model** - Each replica runs in its own piscina worker process
2. **IPC Communication** - All inter-replica communication routes through main process MessageRouter via IPC
3. **SQLite System Cache** - Each message group replica has its own in-memory SQLite cache
4. **CDC Subscription Model** - Only message group leaders subscribe to CDC events
5. **Cache Replication** - Cache changes replicated via message group Raft consensus

### Update: SystemTableCache Section

Update to reflect that SystemTableCache is now SQLite-based in worker processes:

- Remove reference to Map-based singleton per node
- Add description of SQLiteSystemCache in worker processes
- Document Raft-based cache replication between message group replicas

### Update: CDC Event Flow Section

Update the CDC flow diagram to show:

1. Partition leader generates CDC event
2. CDC event sent only to subscribed message group leader
3. Message group leader applies to local SQLite cache
4. Message group leader replicates via Raft to followers
5. Followers apply to their local SQLite caches

### Update: Key Components Section

Add/update component descriptions:

- **ReplicaWorkerManager**: Manages piscina worker pool and replica lifecycle
- **WorkerMessageBridge**: IPC bridge for worker-to-main communication
- **SQLiteSystemCache**: In-memory SQLite cache replacing Map-based cache
- **ReplicaWorkerBase**: Shared base class for worker process replicas
