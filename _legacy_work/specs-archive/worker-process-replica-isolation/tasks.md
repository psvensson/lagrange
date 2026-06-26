# Implementation Plan: Worker Process Replica Isolation

## Overview

This implementation plan converts the current in-process replica architecture to worker process isolation. Each replica (partition or message group) will run in its own piscina worker process with independent memory and SQLite-based caches. All communication routes through the main process MessageRouter via IPC.

## Tasks

- [x] 1. Create worker isolation constants and base infrastructure
  - [x] 1.1 Create worker isolation constants file
    - Create `src/worker/worker-constants.js` with operation types, status values, error messages
    - Define WORKER_OPERATION: CREATE_PARTITION_REPLICA, CREATE_MESSAGE_GROUP_REPLICA, STOP_REPLICA, DELIVER_MESSAGE, HEALTH_CHECK
    - Define WORKER_STATUS, WORKER_EVENT, WORKER_ERROR_MSG constants
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 1.2 Create WorkerMessageBridge for IPC communication
    - Create `src/worker/worker-message-bridge.js`
    - Implement register(), send(), handleIncoming(), unregister() methods
    - Use parentPort from worker_threads for IPC
    - Handle message serialization/deserialization
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 1.3 Write property test for WorkerMessageBridge
    - **Property 13: IPC Message Routing**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 2. Implement SQLiteSystemCache for worker processes
  - [x] 2.1 Create SQLiteSystemCache class
    - Create `src/worker/sqlite-system-cache.js`
    - Initialize in-memory SQLite database with system table schemas
    - Implement get(), query(), filter(), getAll() methods
    - Implement applyCDCEvent() for cache updates
    - Implement getReplicationState() and applyReplicationState() for Raft replication
    - _Requirements: 3.1, 3.2, 3.5_

  - [x] 2.2 Write property test for SQLiteSystemCache queryability
    - **Property 8: Cache SQL Queryability**
    - **Validates: Requirements 3.5**

  - [x] 2.3 Write property test for cache isolation
    - **Property 6: Cache Instance Isolation**
    - **Validates: Requirements 3.2**

- [x] 3. Checkpoint - Ensure base infrastructure tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement ReplicaWorkerBase shared base class
  - [x] 4.1 Create ReplicaWorkerBase class
    - Create `src/worker/replica-worker-base.js`
    - Implement initialize() with WorkerMessageBridge setup
    - Implement start(), stop() lifecycle methods
    - Implement handleMessage() and sendMessage() for routing
    - Emit lifecycle events (initialized, started, stopped, failed)
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 4.2 Write property test for lifecycle events
    - **Property 12: Base Class Lifecycle Events**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

  - [x] 4.3 Write property test for unified address format
    - **Property 14: Unified Address Format Compliance**
    - **Validates: Requirements 7.4**

- [x] 5. Implement PartitionWorkerService
  - [x] 5.1 Create PartitionWorkerService class
    - Create `src/worker/partition-worker-service.js`
    - Extend ReplicaWorkerBase
    - Initialize SQLite database and Raft (liferaft)
    - Implement executeQuery() for SQL operations
    - Implement emitCDCEvent() for change notifications
    - Wire up existing PartitionService logic for worker context
    - _Requirements: 1.1, 1.5_

  - [x] 5.2 Write unit test for native module availability
    - Test better-sqlite3 is accessible in worker process
    - _Requirements: 1.5_

- [x] 6. Implement MessageGroupWorkerService
  - [x] 6.1 Create MessageGroupWorkerService class
    - Create `src/worker/message-group-worker-service.js`
    - Extend ReplicaWorkerBase
    - Initialize SQLiteSystemCache and Raft (liferaft)
    - Implement subscribeToCDC() and unsubscribeFromCDC() for leader
    - Implement applyCDCEvent() with Raft replication to followers
    - Implement getSystemCache() accessor
    - _Requirements: 1.2, 3.1, 4.1, 4.2_

  - [x] 6.2 Write property test for CDC replication
    - **Property 7: CDC Replication Round-Trip**
    - **Validates: Requirements 3.3, 3.4, 4.4**

  - [x] 6.3 Write property test for CDC subscription exclusivity
    - **Property 9: CDC Subscription Exclusivity**
    - **Validates: Requirements 4.3, 4.5**

- [x] 7. Checkpoint - Ensure worker service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement ReplicaWorkerManager
  - [x] 8.1 Create ReplicaWorkerManager class
    - Create `src/worker/replica-worker-manager.js`
    - Initialize piscina worker pool
    - Implement createPartitionReplica() and createMessageGroupReplica()
    - Implement stopReplica() for graceful shutdown
    - Implement getHealthStatus() for monitoring
    - Track worker handles in Map by replicaId
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 8.2 Write property test for worker spawning
    - **Property 1: Worker Spawning**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 8.3 Write property test for lifecycle operations
    - **Property 10: Lifecycle Operation Handling**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5**

  - [x] 8.4 Write property test for health tracking
    - **Property 11: Health Status Tracking**
    - **Validates: Requirements 5.6**

- [x] 9. Implement worker crash handling
  - [x] 9.1 Add crash detection to ReplicaWorkerManager
    - Listen for worker exit events from piscina
    - Detect crashes within 5 second threshold
    - Emit replica failure event on crash
    - Clean up MessageRouter registration on crash
    - Notify rebalancer of failure
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.2 Write property test for worker isolation
    - **Property 2: Worker Process Isolation**
    - **Validates: Requirements 1.4, 1.6, 2.3**

  - [x] 9.3 Write property test for crash cleanup
    - **Property 16: Crash Cleanup**
    - **Validates: Requirements 8.4**

- [x] 10. Checkpoint - Ensure worker manager tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Integrate with MessageRouter
  - [x] 11.1 Add IPC handler registration to MessageRouter
    - Extend MessageRouter to handle worker IPC connections
    - Create handler that forwards messages to worker processes
    - Maintain loopback connections for all local workers
    - _Requirements: 7.5, 2.5_

  - [x] 11.2 Write property test for handler registration
    - **Property 15: Handler Registration on Worker Registration**
    - **Validates: Requirements 7.5**

  - [x] 11.3 Write property test for loopback connections
    - **Property 4: Loopback Connection Maintenance**
    - **Validates: Requirements 2.5**

  - [x] 11.4 Write property test for uniform routing
    - **Property 3: Uniform Message Routing**
    - **Validates: Requirements 2.1, 2.2, 2.4**

- [x] 12. Create worker entry point
  - [x] 12.1 Create replica-worker.js entry point
    - Create `src/worker/replica-worker.js` as piscina worker entry point
    - Handle CREATE_PARTITION_REPLICA operation
    - Handle CREATE_MESSAGE_GROUP_REPLICA operation
    - Handle STOP_REPLICA operation
    - Handle DELIVER_MESSAGE operation
    - Handle HEALTH_CHECK operation
    - _Requirements: 5.4, 5.5_

- [x] 13. Implement manager-based MessageRouter registration
  - [x] 13.1 Update ReplicaWorkerManager to register handlers with MessageRouter
    - After successful createPartitionReplica(), call messageRouter.registerWorkerHandler()
    - After successful createMessageGroupReplica(), call messageRouter.registerWorkerHandler()
    - Handler should forward messages via deliverMessage()
    - Store messageRouter reference in manager
    - _Requirements: 11.1, 11.2_

  - [x] 13.2 Update ReplicaWorkerManager to unregister on stop/crash
    - In stopReplica(), call messageRouter.unregisterWorkerHandler()
    - In handleWorkerCrash(), call messageRouter.unregisterWorkerHandler()
    - _Requirements: 11.4, 11.5_

  - [x] 13.3 Simplify WorkerMessageBridge - remove self-registration
    - Remove register() and unregister() methods
    - Keep initialize(), send(), handleIncoming(), setMessageHandler()
    - Workers receive messages via piscina task queue, not IPC registration
    - _Requirements: 11.3_

  - [x] 13.4 Write property test for manager-based registration
    - **Property 20: Manager-Based Registration**
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [x] 14. Implement SystemCacheProxy
  - [x] 14.1 Create SystemCacheProxy class
    - Create `src/cache/system-cache-proxy.js`
    - Implement get(), query(), filter(), getAll() methods
    - Forward all queries to local message group replica via deliverMessage()
    - Select and cache reference to one local message group replica
    - Re-select when local replica set changes
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 14.2 Add message handlers for cache queries in MessageGroupWorkerService
    - Handle CACHE_GET message type
    - Handle CACHE_QUERY message type
    - Handle CACHE_FILTER message type
    - Handle CACHE_GET_ALL message type
    - _Requirements: 9.2_

  - [x] 14.3 Add getLeadershipStatus() to ReplicaWorkerManager
    - Send GET_LEADERSHIP_STATUS message to worker
    - Return {isLeader, term, leaderId}
    - _Requirements: 10.4_

  - [x] 14.4 Add leadership status handler to worker services
    - Handle GET_LEADERSHIP_STATUS message in PartitionWorkerService
    - Handle GET_LEADERSHIP_STATUS message in MessageGroupWorkerService
    - Return current Raft leadership state
    - _Requirements: 10.4_

  - [x] 14.5 Write property test for SystemCacheProxy statelessness
    - **Property 17: SystemCacheProxy Statelessness**
    - **Validates: Requirements 9.1, 9.2**

  - [x] 14.6 Write property test for replica selection
    - **Property 18: SystemCacheProxy Replica Selection**
    - **Validates: Requirements 9.3, 9.4**

- [x] 15. Implement message-based CDC subscription
  - [x] 15.1 Add SUBSCRIBE_CDC message handler to PartitionWorkerService
    - Handle SUBSCRIBE_CDC message with tableName and subscriberAddress
    - Store subscriber address for CDC event delivery
    - Send CDC events to subscriber address via MessageRouter
    - _Requirements: 10.5_

  - [x] 15.2 Update MessageGroupWorkerService CDC subscription
    - On leadership gain, send SUBSCRIBE_CDC to partition service addresses
    - On leadership loss, send UNSUBSCRIBE_CDC to partition service addresses
    - Receive CDC_EVENT messages and apply to local cache
    - _Requirements: 10.6, 4.1, 4.2_

  - [x] 15.3 Write property test for message-based interaction
    - **Property 19: Message-Based Interaction**
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 16. Checkpoint - Ensure new infrastructure tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Implement SEED_CACHE for bootstrap cache seeding
  - [x] 17.1 Add SEED_CACHE message constants
    - Add SEED_CACHE, SEED_CACHE_RESPONSE to worker message types
    - Add bootstrapPhase tracking to MessageGroupWorkerService
    - _Requirements: 12.4, 12.5, 12.6_

  - [x] 17.2 Implement SEED_CACHE handler in MessageGroupWorkerService
    - Handle SEED_CACHE message with entries array
    - Reject if bootstrapPhase is false (partitions already exist)
    - Apply entries to SQLiteSystemCache
    - Replicate via Raft to followers
    - Return SEED_CACHE_RESPONSE with success/error
    - _Requirements: 12.4, 12.5, 12.6, 12.7_

  - [x] 17.3 Write property test for SEED_CACHE bootstrap restriction
    - **Property 22: SEED_CACHE Bootstrap Restriction**
    - **Validates: Requirements 12.6, 12.7**

  - [x] 17.4 Write property test for SEED_CACHE Raft replication
    - **Property 23: SEED_CACHE Raft Replication**
    - **Validates: Requirements 12.4, 12.5**

- [x] 18. Implement node joining bootstrap protocol
  - [x] 18.1 Add JOIN message constants
    - Add JOIN_REQUEST, JOIN_RESPONSE, JOIN_COMPLETE, JOIN_COMPLETE_ACK to message types
    - _Requirements: 13.1, 13.2, 13.3, 13.7_

  - [x] 18.2 Implement JOIN_REQUEST handler in seed node
    - Handle JOIN_REQUEST via WebSocket (not message groups)
    - Assign message group replica to joining node
    - Return JOIN_RESPONSE with groupId, replicaId, raftPeers
    - _Requirements: 13.2, 13.3_

  - [x] 18.3 Implement JOIN_COMPLETE handler in seed node
    - Handle JOIN_COMPLETE message
    - Verify joining node's message group replica is ready
    - Return JOIN_COMPLETE_ACK with next steps
    - _Requirements: 13.7_

  - [x] 18.4 Update NodeJoiningService to use join protocol
    - Send JOIN_REQUEST to seed node
    - Create message group replica from JOIN_RESPONSE
    - Wait for Raft sync to complete
    - Create SystemCacheProxy
    - Send JOIN_COMPLETE
    - _Requirements: 13.1, 13.4, 13.5, 13.6, 13.7_

  - [x] 18.5 Write property test for joining node message group first
    - **Property 24: Joining Node Message Group First**
    - **Validates: Requirements 13.4, 13.5, 13.6**

  - [x] 18.6 Write property test for join protocol message sequence
    - **Property 25: Join Protocol Message Sequence**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.7**

- [x] 19. Verify and update Raft transport integration with workers
  - [x] 19.1 Verify RaftTransportAdapter works with WorkerMessageBridge
    - Test Raft packet routing through worker message bridge
    - Ensure packets are correctly serialized/deserialized
    - Verify bidirectional communication works
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 19.2 Update RaftTransportAdapter if needed
    - Ensure send() uses WorkerMessageBridge.send() in worker context
    - Ensure receive() handles messages from WorkerMessageBridge
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 19.3 Write property test for Raft transport worker integration
    - **Property 26: Raft Transport Worker Integration**
    - **Validates: Requirements 14.1, 14.2, 14.3, 14.4**

  - [x] 19.4 Write property test for cross-worker Raft consensus
    - **Property 27: Cross-Worker Raft Consensus**
    - **Validates: Requirements 14.5, 14.6**

- [x] 20. Checkpoint - Ensure new protocol tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Update bootstrap to use worker processes (Message Groups First)
  - [x] 21.1 Update BootstrapService to use ReplicaWorkerManager
    - Initialize ReplicaWorkerManager in infrastructure phase
    - Create message group replicas FIRST (before partitions)
    - Wait for message group leader election
    - Create SystemCacheProxy after message groups are ready
    - Send SEED_CACHE message with initial system data
    - Then create partition replicas
    - Use getLeadershipStatus() instead of service.isLeader
    - _Requirements: 1.1, 1.2, 12.1, 12.2, 12.3, 12.4_

  - [x] 21.2 Update phase classes to work with worker handles
    - Update MessageGroupPhase to use workerManager.createMessageGroupReplica()
    - Update PartitionPhase to use workerManager.createPartitionReplica()
    - Return WorkerReplicaHandle instead of service instances
    - _Requirements: 1.1, 1.2_

  - [x] 21.3 Update CDC subscription in bootstrap
    - Use message-based SUBSCRIBE_CDC instead of direct callback registration
    - Subscribe message group to partition service addresses (not specific replicas)
    - _Requirements: 10.5, 10.6_

  - [x] 21.4 Update NodeJoiningService to use join protocol
    - Use JOIN_REQUEST/JOIN_RESPONSE for initial handshake
    - Create message group replica first
    - Use SystemCacheProxy for all subsequent operations
    - _Requirements: 13.1, 13.4, 13.5, 13.6_

  - [x] 21.5 Write property test for message groups first bootstrap order
    - **Property 21: Message Groups First Bootstrap Order**
    - **Validates: Requirements 12.1, 12.2**

- [x] 22. Checkpoint - Ensure bootstrap integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 23. Update existing tests to use worker handles
  - [x] 23.1 Update bootstrap tests
    - Replace direct service access with message-based queries
    - Use getLeadershipStatus() for leadership checks
    - Use SystemCacheProxy for cache access
    - _Requirements: 10.1, 10.2_

  - [x] 23.2 Update integration tests
    - Replace partitionServices Map access with worker handles
    - Replace messageGroupServices Map access with worker handles
    - Use deliverMessage() for service interaction
    - _Requirements: 10.1, 10.2_

- [x] 24. Write integration tests
  - [x] 24.1 Write multi-worker Raft integration test
    - Create 3-replica partition in separate workers
    - Verify Raft consensus works across workers
    - Test leader election and log replication
    - _Requirements: 1.1, 2.4, 14.5, 14.6_

  - [x] 24.2 Write cross-worker CDC integration test
    - Partition leader generates CDC event
    - Message group leader receives via SUBSCRIBE_CDC
    - Verify replication to message group followers
    - _Requirements: 3.3, 4.3, 4.4_

  - [x] 24.3 Write worker crash recovery integration test
    - Create replica in worker
    - Crash the worker process
    - Verify failure event emitted
    - Verify rebalancer notified
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 24.4 Write SystemCacheProxy integration test
    - Create message group workers
    - Query via SystemCacheProxy
    - Verify queries forwarded to worker
    - _Requirements: 9.1, 9.2_

  - [x] 24.5 Write SEED_CACHE integration test
    - Create message group replicas
    - Send SEED_CACHE message
    - Verify data replicated to all followers
    - Verify rejection after partitions created
    - _Requirements: 12.4, 12.5, 12.6_

  - [x] 24.6 Write node joining integration test
    - Start seed node
    - Join second node using join protocol
    - Verify message group replica created first
    - Verify system cache available via Raft sync
    - _Requirements: 13.1, 13.4, 13.5, 13.6_

- [x] 25. Update architecture documentation
  - [x] 25.1 Update architecture.md
    - Update Component Architecture diagram with worker processes
    - Add Worker Process Architecture section
    - Update SystemTableCache section for SQLite-based cache
    - Add SystemCacheProxy section
    - Update CDC Event Flow section for message-based subscription
    - Add SEED_CACHE and Join Protocol sections
    - Update Key Components section with new components
    - _Requirements: All_

- [x] 26. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests use real Raft consensus (per testing guidelines)

### Key Architectural Decisions

1. **Manager-Based Registration**: Workers do NOT self-register with MessageRouter. The ReplicaWorkerManager registers handlers after successful worker creation. This avoids the complexity of IPC-based registration.

2. **Message-Based Communication**: All interaction with worker replicas uses message-based protocols via `deliverMessage()`. No direct method calls on worker services from the main process.

3. **SystemCacheProxy**: A stateless proxy in the main process forwards cache queries to a local message group replica. It does NOT cache any data locally.

4. **CDC via Messages**: CDC subscriptions use SUBSCRIBE_CDC messages sent to partition service addresses. The routing system finds the leader. CDC events are delivered as messages to the subscribed message group address.

5. **Leadership Queries**: Use `getLeadershipStatus()` which sends a GET_LEADERSHIP_STATUS message to the worker, instead of accessing `service.isLeader` directly.

6. **Full Migration**: This is a complete replacement of in-process replicas with worker processes. No legacy code paths are maintained.

7. **Message Groups First Bootstrap**: During seed node bootstrap, message group replicas are created BEFORE partition replicas. This ensures the system cache is available for all subsequent operations. Initial system data is seeded via SEED_CACHE message.

8. **SEED_CACHE for Bootstrap**: A special message type used only during initial seed node bootstrap to populate the system cache before partitions exist. This message is rejected after partitions are created.

9. **Direct WebSocket Join Protocol**: Joining nodes connect directly to the seed node via WebSocket for initial handshake (JOIN_REQUEST/JOIN_RESPONSE). The first action is to create a message group replica, which receives system cache state via Raft replication. After JOIN_COMPLETE, all communication uses message groups.

10. **Raft Transport via Workers**: Raft packets are routed through WorkerMessageBridge → MessageRouter → target WorkerMessageBridge. This ensures Raft consensus works correctly across worker processes on the same node.
