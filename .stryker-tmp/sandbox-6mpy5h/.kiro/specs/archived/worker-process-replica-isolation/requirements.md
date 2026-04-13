# Requirements Document

## Introduction

This document specifies the requirements for isolating Raft replicas (partitions and message groups) into separate worker processes. Currently, all replicas run in the main process and share memory, causing issues with duplicate CDC events, inconsistent code paths for local vs remote communication, and different system behavior depending on replica placement. The goal is to make local replicas behave identically to remote replicas by running each replica in its own worker process with independent caches and uniform WebSocket-based communication.

## Glossary

- **Replica**: A single instance of a Raft consensus group member (either a partition replica or message group replica)
- **Worker_Process**: An isolated Node.js worker thread managed by piscina that runs a single replica
- **Main_Process**: The primary Node.js process that manages worker processes and handles external connections
- **MessageRouter**: The transport layer that routes messages between services (currently WebSocket-based, but transport-agnostic)
- **Transport_Layer**: The underlying communication mechanism used by MessageRouter (e.g., WebSocket, NATS, Veilid)
- **SystemTableCache**: An in-memory cache of system table data, updated by CDC events
- **SystemCacheProxy**: A stateless proxy in the main process that forwards cache queries to a local message group replica
- **CDC_Event**: A Change Data Capture event generated when data changes in a partition
- **Partition_Service**: A SQLite-backed Raft group that stores table data
- **Message_Group_Service**: A Raft group that provides reliable inter-service communication
- **Loopback_Connection**: A transport connection from a node to itself for uniform message routing (transport-agnostic)
- **Replica_Worker_Base**: A shared base class that handles worker process lifecycle for both partition and message group replicas
- **WorkerReplicaHandle**: A handle object returned by ReplicaWorkerManager containing metadata about a worker replica (not the service itself)
- **SEED_CACHE**: A special message type used during seed node bootstrap to populate the initial system cache before partitions exist
- **JOIN_REQUEST**: A message sent by a joining node to the seed node to initiate the join process
- **JOIN_RESPONSE**: A message sent by the seed node containing message group replica assignment and Raft peer information
- **JOIN_COMPLETE**: A message sent by the joining node after its message group replica is synchronized
- **RaftTransportAdapter**: An adapter that routes Raft packets through the MessageRouter infrastructure

## Requirements

### Requirement 1: Worker Process Isolation

**User Story:** As a system architect, I want each Raft replica to run in its own worker process, so that replicas are isolated from each other and failures in one replica don't affect others on the same node.

#### Acceptance Criteria

1. WHEN a partition replica is created, THE Main_Process SHALL spawn a dedicated Worker_Process for that replica
2. WHEN a message group replica is created, THE Main_Process SHALL spawn a dedicated Worker_Process for that replica
3. WHEN a Worker_Process crashes, THE Main_Process SHALL detect the failure and emit a replica failure event
4. WHEN a Worker_Process crashes, THE Main_Process SHALL NOT affect other Worker_Processes on the same node
5. THE Worker_Process SHALL have access to better-sqlite3 native module for partition replicas
6. WHILE a replica is running, THE Worker_Process SHALL maintain its own isolated memory space

### Requirement 2: Uniform Transport Communication

**User Story:** As a developer, I want all inter-replica communication to use the same MessageRouter path, so that local and remote replicas behave identically regardless of the underlying transport.

#### Acceptance Criteria

1. WHEN a replica sends a message to another replica on the same node, THE MessageRouter SHALL route the message through the loopback connection
2. WHEN a replica sends a message to a replica on a different node, THE MessageRouter SHALL route the message through the configured Transport_Layer to that node
3. THE Worker_Process SHALL NOT have direct memory access to other Worker_Processes on the same node
4. WHEN a Raft packet is sent between replicas, THE MessageRouter SHALL use the same code path regardless of whether the target is local or remote
5. THE Main_Process SHALL maintain transport connections to all Worker_Processes via loopback addresses
6. THE MessageRouter SHALL be transport-agnostic, supporting pluggable Transport_Layer implementations

### Requirement 3: Independent System Caches

**User Story:** As a system architect, I want each message group replica to have its own in-memory SQLite system cache, so that cache updates are isolated and don't cause duplicate events.

#### Acceptance Criteria

1. WHEN a message group Worker_Process starts, THE Worker_Process SHALL create its own in-memory SQLite database for the system cache
2. THE Worker_Process SHALL NOT share SystemTableCache instances with other Worker_Processes
3. WHEN a CDC_Event is received by a message group leader, THE Message_Group_Service SHALL replicate the cache change to follower replicas via Raft consensus
4. WHEN a message group follower receives a replicated cache change, THE Message_Group_Service SHALL apply it to its local SQLite cache
5. THE SystemTableCache in each Worker_Process SHALL be queryable via SQL for cache lookups

### Requirement 4: Single CDC Subscription Point

**User Story:** As a system architect, I want only the message group leader to subscribe to CDC events from partition leaders, so that duplicate CDC events are eliminated.

#### Acceptance Criteria

1. WHEN a message group replica becomes leader, THE Message_Group_Service SHALL subscribe to CDC events from all partition leaders
2. WHEN a message group replica loses leadership, THE Message_Group_Service SHALL unsubscribe from CDC events
3. WHEN a partition leader generates a CDC_Event, THE Partition_Service SHALL send it only to the subscribed message group leader
4. WHEN a message group leader receives a CDC_Event, THE Message_Group_Service SHALL replicate it to followers via Raft consensus
5. THE Message_Group_Service follower replicas SHALL NOT directly subscribe to CDC events from partition leaders

### Requirement 5: Worker Process Lifecycle Management

**User Story:** As a system operator, I want the main process to manage worker process lifecycle, so that replicas can be started, stopped, and monitored reliably.

#### Acceptance Criteria

1. WHEN the Main_Process initializes, THE ServiceThreadManager SHALL create a piscina worker pool
2. WHEN a replica needs to be created, THE Main_Process SHALL send a CREATE_REPLICA operation to a Worker_Process
3. WHEN a replica needs to be stopped, THE Main_Process SHALL send a STOP_REPLICA operation to the Worker_Process
4. WHEN a Worker_Process receives a CREATE_REPLICA operation, THE Worker_Process SHALL initialize the replica service and register with MessageRouter
5. WHEN a Worker_Process receives a STOP_REPLICA operation, THE Worker_Process SHALL gracefully shutdown the replica and unregister from MessageRouter
6. THE Main_Process SHALL track the health status of all Worker_Processes

### Requirement 6: Shared Base Class for Worker Replicas

**User Story:** As a developer, I want a common base class for worker process replicas, so that partition and message group services share consistent lifecycle management code.

#### Acceptance Criteria

1. THE Replica_Worker_Base class SHALL handle worker process initialization for both partition and message group replicas
2. THE Replica_Worker_Base class SHALL handle WebSocket registration with the Main_Process MessageRouter
3. THE Replica_Worker_Base class SHALL handle graceful shutdown and cleanup
4. WHEN a subclass extends Replica_Worker_Base, THE subclass SHALL implement replica-specific initialization logic
5. THE Replica_Worker_Base class SHALL emit lifecycle events (initialized, started, stopped, failed)

### Requirement 7: Message Routing in Worker Processes

**User Story:** As a developer, I want worker processes to route messages through the main process MessageRouter, so that all communication uses the established WebSocket infrastructure.

#### Acceptance Criteria

1. WHEN a Worker_Process needs to send a message, THE Worker_Process SHALL send it to the Main_Process via IPC
2. WHEN the Main_Process receives a message from a Worker_Process, THE MessageRouter SHALL route it to the target address
3. WHEN the MessageRouter receives a message for a local Worker_Process, THE Main_Process SHALL forward it to that Worker_Process via IPC
4. THE Worker_Process SHALL use the unified address format (nodeId/entityType/replicaId) for all message routing
5. WHEN a Worker_Process registers with the Main_Process, THE Main_Process SHALL create a handler that forwards messages to that Worker_Process

### Requirement 8: Worker Process Crash Recovery

**User Story:** As a system operator, I want the system to handle worker process crashes gracefully, so that replica failures are detected and can trigger rebalancing.

#### Acceptance Criteria

1. WHEN a Worker_Process crashes, THE Main_Process SHALL detect the crash within 5 seconds
2. WHEN a Worker_Process crash is detected, THE Main_Process SHALL emit a replica failure event
3. WHEN a replica failure event is emitted, THE Rebalancer SHALL be notified to potentially create a replacement replica
4. WHEN a Worker_Process crashes, THE Main_Process SHALL clean up the associated MessageRouter registration
5. THE Main_Process SHALL log the crash with sufficient detail for debugging

### Requirement 9: System Cache Proxy

**User Story:** As a developer, I want the main process to have a stateless proxy for system cache access, so that services in the main process can query system data without direct access to worker memory.

#### Acceptance Criteria

1. THE SystemCacheProxy SHALL NOT cache or hold any data locally
2. WHEN a cache query is made, THE SystemCacheProxy SHALL forward the query to any available local message group replica
3. THE SystemCacheProxy SHALL select one local message group replica and reuse it until the set of local replicas changes
4. WHEN the set of local message group replicas changes, THE SystemCacheProxy SHALL select a new replica for queries
5. THE SystemCacheProxy SHALL provide the same interface as SystemTableCache (get, query, filter, getAll)

### Requirement 10: Message-Based Service Communication

**User Story:** As a developer, I want all communication with worker replicas to use message-based protocols, so that there is a single uniform way to interact with replicas regardless of location.

#### Acceptance Criteria

1. THE Main_Process SHALL NOT call methods directly on worker replica services
2. WHEN the Main_Process needs to interact with a replica, THE Main_Process SHALL send a message via ReplicaWorkerManager.deliverMessage()
3. THE Worker_Process SHALL handle all incoming messages through a message handler interface
4. WHEN querying replica leadership status, THE Main_Process SHALL send a GET_LEADERSHIP_STATUS message
5. WHEN subscribing to CDC events, THE subscriber SHALL send a SUBSCRIBE_CDC message to the partition service address
6. CDC events SHALL be delivered as messages to the subscribed message group service address

### Requirement 11: Manager-Based Worker Registration

**User Story:** As a developer, I want the ReplicaWorkerManager to handle MessageRouter registration, so that workers don't need to self-register via IPC.

#### Acceptance Criteria

1. WHEN a replica is successfully created in a Worker_Process, THE ReplicaWorkerManager SHALL register a handler with MessageRouter
2. THE MessageRouter handler SHALL forward incoming messages to the worker via ReplicaWorkerManager.deliverMessage()
3. THE Worker_Process SHALL NOT self-register with MessageRouter via IPC
4. WHEN a replica is stopped, THE ReplicaWorkerManager SHALL unregister the handler from MessageRouter
5. WHEN a Worker_Process crashes, THE ReplicaWorkerManager SHALL unregister the handler from MessageRouter

### Requirement 12: Message Groups First Bootstrap

**User Story:** As a system architect, I want message group replicas to be created before partition replicas during bootstrap, so that the system cache is available for all subsequent operations.

#### Acceptance Criteria

1. DURING seed node bootstrap, THE BootstrapService SHALL create message group replicas BEFORE creating partition replicas
2. WHEN message group replicas are created, THE BootstrapService SHALL wait for leader election before proceeding
3. AFTER message group leader election, THE BootstrapService SHALL create SystemCacheProxy pointing to the local message group
4. DURING seed node bootstrap, THE BootstrapService SHALL send a SEED_CACHE message to the message group leader with initial system data
5. WHEN a message group leader receives a SEED_CACHE message, THE Message_Group_Service SHALL apply the data to its SQLiteSystemCache and replicate via Raft
6. THE SEED_CACHE message SHALL only be accepted during the initial bootstrap phase (before partitions exist)
7. AFTER initial cache seeding, ALL system data writes SHALL go through partition replicas via SQL

### Requirement 13: Node Joining Bootstrap Protocol

**User Story:** As a system architect, I want joining nodes to receive a message group replica as their first action, so that they have system cache access for all subsequent operations.

#### Acceptance Criteria

1. WHEN a node joins the cluster, THE joining node SHALL connect to the seed node via WebSocket for initial bootstrap
2. THE joining node SHALL send a JOIN_REQUEST message with its nodeId and address
3. THE seed node SHALL respond with a JOIN_RESPONSE containing message group replica assignment and Raft peer information
4. THE joining node SHALL create its assigned message group replica BEFORE any other replicas
5. THE message group replica SHALL receive system cache state via Raft replication from the leader
6. AFTER the message group replica is synchronized, THE joining node SHALL create SystemCacheProxy pointing to it
7. AFTER SystemCacheProxy is ready, THE joining node SHALL send a JOIN_COMPLETE message to the seed node
8. ALL subsequent joining operations SHALL use message groups for communication (not direct WebSocket)

### Requirement 14: Raft Transport Integration with Workers

**User Story:** As a developer, I want Raft packet routing to work correctly through worker message bridges, so that Raft consensus operates correctly across worker processes.

#### Acceptance Criteria

1. WHEN a Raft replica in a Worker_Process sends a packet to a peer, THE RaftTransportAdapter SHALL route it through WorkerMessageBridge
2. THE WorkerMessageBridge SHALL forward Raft packets to the Main_Process MessageRouter
3. THE MessageRouter SHALL route Raft packets to the target worker (local or remote)
4. WHEN a Worker_Process receives a Raft packet, THE WorkerMessageBridge SHALL deliver it to the Raft replica
5. Raft leader election SHALL work correctly across worker processes on the same node
6. Raft log replication SHALL work correctly across worker processes on the same node
