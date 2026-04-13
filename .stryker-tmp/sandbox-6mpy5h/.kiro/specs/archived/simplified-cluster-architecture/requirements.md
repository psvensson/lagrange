# Requirements Document

## Introduction

This specification defines architectural simplifications to the distributed database cluster to improve reliability, reduce race conditions, and maintain scalability to thousands of nodes. The changes focus on unified addressing, pull-based replica assignment, explicit lifecycle state machines, and immutable assignment epochs.

## Glossary

- **Node**: A single database process participating in the cluster
- **Partition**: A logical unit of data storage, replicated across multiple nodes
- **Replica**: A copy of a partition hosted on a specific node
- **Assignment_Epoch**: An immutable, versioned snapshot of all partition-to-node assignments
- **Control_Plane**: Metadata management (partition assignments, node registry)
- **Data_Plane**: User data storage and queries
- **Unified_Address**: A canonical address format `{nodeId}/{serviceType}/{serviceId}`
- **Partition_Leader**: The Raft leader for a partition, responsible for writes
- **Gossip_Protocol**: Peer-to-peer protocol for disseminating membership information
- **System_Cache**: Local cache of system table data on each node

## Requirements

### Requirement 1: Unified Address Format

**User Story:** As a developer, I want a single canonical address format used everywhere, so that routing is consistent and debugging is simpler.

#### Acceptance Criteria

1. THE Address_Manager SHALL use the format `{nodeId}/{serviceType}/{serviceId}` as the only valid address format
2. WHEN an address is created, THE Address_Manager SHALL validate it contains all three components
3. WHEN a malformed address is received at any boundary, THE System SHALL reject it with a descriptive error
4. THE System SHALL never store partial addresses (e.g., just replicaId) in any table or cache
5. WHEN parsing an address, THE Address_Manager SHALL return a structured object with nodeId, serviceType, and serviceId fields
6. THE Address_Formatter SHALL serialize addresses to the canonical string format
7. FOR ALL addresses in the system, parsing then formatting SHALL produce the original string (round-trip property)

### Requirement 2: Explicit Node Lifecycle State Machine

**User Story:** As a cluster operator, I want clear visibility into node states and transitions, so that I can understand and debug cluster behavior.

#### Acceptance Criteria

1. THE Node_Lifecycle_Service SHALL implement states: STARTING, CONNECTING, DISCOVERING, JOINING, SYNCING, READY, DRAINING, STOPPED
2. WHEN a node transitions between states, THE Node_Lifecycle_Service SHALL emit a state change event
3. THE Node_Lifecycle_Service SHALL enforce valid state transitions only
4. IF an invalid state transition is attempted, THEN THE Node_Lifecycle_Service SHALL reject it and log an error
5. WHILE in STARTING state, THE Node SHALL initialize local resources only
6. WHILE in CONNECTING state, THE Node SHALL establish WebSocket connections to seed nodes
7. WHILE in DISCOVERING state, THE Node SHALL receive the system cache from seed nodes
8. WHILE in JOINING state, THE Node SHALL register in the cluster, propose epoch changes, and create local replicas
9. WHILE in SYNCING state, THE Node SHALL sync replica data from existing nodes
10. WHILE in READY state, THE Node SHALL accept traffic and participate in Raft consensus
11. WHILE in DRAINING state, THE Node SHALL reject new requests and complete in-flight operations
12. WHEN all in-flight operations complete during DRAINING, THE Node SHALL transition to STOPPED

### Requirement 3: Immutable Assignment Epochs

**User Story:** As a developer, I want partition assignments to be versioned and immutable, so that there are no race conditions from partial updates.

#### Acceptance Criteria

1. THE Assignment_Epoch SHALL contain an epoch number and a complete mapping of partitions to node lists
2. WHEN a new assignment is created, THE System SHALL increment the epoch number
3. THE System SHALL never modify an existing epoch; only create new epochs
4. WHEN a node starts, THE Node SHALL fetch the current epoch from the cluster
5. WHEN the epoch changes, THE System SHALL notify all nodes via CDC
6. THE Node SHALL compare-and-swap when proposing epoch transitions
7. IF a compare-and-swap fails due to epoch mismatch, THEN THE System SHALL retry with the latest epoch
8. FOR ALL epoch transitions, the new epoch number SHALL be exactly one greater than the previous

### Requirement 4: Pull-Based Replica Assignment

**User Story:** As a joining node, I want to decide which replicas to pull to myself based on load balancing and table policies, so that I relieve overloaded nodes while respecting replication constraints.

#### Acceptance Criteria

1. WHEN a node joins the cluster, THE Node SHALL receive the current assignment epoch
2. THE Joining_Node SHALL identify overloaded nodes (nodes with more replicas than average)
3. THE Joining_Node SHALL select replicas to pull that relieve overloaded nodes
4. THE Joining_Node SHALL respect table replication policies when selecting replicas
5. THE Joining_Node SHALL not propose assignments that place multiple replicas of the same partition on the same node
6. THE Joining_Node SHALL propose a new epoch with updated assignments
7. IF the epoch proposal is accepted, THEN THE Joining_Node SHALL create the replicas locally
8. THE System SHALL not use push-based CREATE_REPLICA RPC for normal replica placement
9. WHEN creating a replica locally, THE Node SHALL sync data from existing replicas
10. IF replica sync fails, THEN THE Node SHALL retry or mark the replica as failed

### Requirement 5: CDC-Based Membership with State-Aware Rebalancing

**User Story:** As a cluster, I want CDC to propagate membership changes with explicit node states, so that rebalancing only considers ready nodes.

#### Acceptance Criteria

1. WHEN a node joins, THE Node SHALL register with state JOINING in the nodes table
2. THE CDC_System SHALL propagate the JOINING state to all nodes
3. THE Rebalancer SHALL ignore nodes in JOINING state for replica placement
4. WHEN a node completes initialization, THE Node SHALL update its state to READY
5. THE CDC_System SHALL propagate the READY state to all nodes
6. THE Rebalancer SHALL only consider nodes in READY state for replica placement
7. WHEN a node begins draining, THE Node SHALL update its state to DRAINING
8. THE Rebalancer SHALL begin moving replicas away from DRAINING nodes
9. THE System_Cache SHALL track node states and filter by state when needed

### Requirement 6: Decentralized Rebalancing with Epochs

**User Story:** As a cluster operator, I want rebalancing to be decentralized but coordinated via epochs, so that it scales to thousands of nodes.

#### Acceptance Criteria

1. WHEN a node detects an imbalance, THE Node SHALL propose a new epoch with improved assignments
2. THE Epoch_Coordinator SHALL use compare-and-swap to ensure only one epoch transition succeeds
3. IF multiple nodes propose conflicting epochs, THEN only one SHALL succeed and others SHALL retry
4. THE Rebalancer SHALL batch multiple moves into a single epoch transition when possible
5. THE Rebalancer SHALL respect replica placement policies (e.g., replicas on different nodes)
6. WHEN an epoch transition completes, THE affected nodes SHALL sync replicas as needed

### Requirement 7: System Cache Consistency with Epochs

**User Story:** As a node, I want my system cache to be consistent with the current epoch, so that routing decisions are correct.

#### Acceptance Criteria

1. WHEN a node receives a new epoch, THE Node SHALL update its system cache atomically
2. THE System_Cache SHALL store the current epoch number
3. WHEN routing a request, THE Node SHALL use the cached epoch for partition lookup
4. IF a routing decision fails due to stale epoch, THEN THE Node SHALL refresh its epoch and retry
5. THE System_Cache SHALL reject updates from epochs older than the current epoch
