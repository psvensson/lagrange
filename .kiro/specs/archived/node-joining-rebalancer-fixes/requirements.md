# Requirements Document

## Introduction

This document specifies requirements for fixing inter-node communication issues that occur when a new node joins an existing cluster. The current implementation has several problems: EventEmitter memory leaks from accumulated ACK listeners, seed node partitions not being tracked by ReplicaLifecycleManager, rebalancers bombarding joining nodes with commands before they're ready, and ACK routing issues between different service instances.

## Glossary

- **Seed_Node**: The first node in a cluster that bootstraps system tables and partitions
- **Joining_Node**: A node that joins an existing cluster by contacting the seed node
- **Rebalancer**: Component that manages replica placement across nodes
- **ReplicaLifecycleManager**: Component that handles CREATE_REPLICA and REMOVE_REPLICA messages
- **ACK_Handler**: Event listener that waits for acknowledgment of lifecycle messages
- **Stabilization_Period**: Configurable delay before rebalancer acts on detected state changes
- **Pending_Move_Map**: Data structure tracking in-flight replica operations by request ID

## Requirements

### Requirement 1: Seed Node Partition Registration

**User Story:** As a cluster operator, I want seed node partitions to be tracked by ReplicaLifecycleManager, so that rebalancer remove operations work correctly on the seed node.

#### Acceptance Criteria

1. WHEN the Seed_Node completes bootstrap THEN the Bootstrap_Service SHALL register all created partitions with the ReplicaLifecycleManager
2. WHEN a partition is registered with ReplicaLifecycleManager THEN the localReplicas map SHALL contain an entry for that replica_id
3. WHEN the Rebalancer requests removal of a seed node partition THEN the ReplicaLifecycleManager SHALL find the replica in localReplicas and process the removal

### Requirement 2: Rebalancer Stabilization Period

**User Story:** As a cluster operator, I want the rebalancer to wait before acting on state changes, so that joining nodes have time to stabilize before receiving commands.

#### Acceptance Criteria

1. THE Rebalancer SHALL have a configurable stabilization_period (default 5 seconds, range 1-10 seconds)
2. WHEN a node joins the cluster THEN the Rebalancer SHALL wait for the stabilization_period before generating moves
3. WHEN the Rebalancer detects suboptimal state THEN it SHALL wait for the stabilization_period before executing moves
4. WHEN the stabilization_period expires THEN the Rebalancer SHALL re-evaluate state before acting
5. IF the state changes during the stabilization_period THEN the Rebalancer SHALL reset the stabilization timer

### Requirement 3: ACK Handler Memory Management

**User Story:** As a developer, I want ACK handlers to be properly managed, so that EventEmitter memory leaks do not occur.

#### Acceptance Criteria

1. THE Partition_Service SHALL use a Map-based pending request tracker instead of multiple EventEmitter once listeners
2. WHEN a lifecycle message is sent THEN the Partition_Service SHALL store the request in the pending_move_map with its resolve/reject callbacks
3. WHEN an ACK is received THEN the Partition_Service SHALL look up the request_id in the pending_move_map and resolve the corresponding promise
4. WHEN an ACK timeout occurs THEN the Partition_Service SHALL remove the request from the pending_move_map and reject the promise
5. WHEN the Partition_Service shuts down THEN it SHALL clean up all pending requests in the pending_move_map

### Requirement 4: Lifecycle Handler Registration on Seed Node

**User Story:** As a cluster operator, I want the seed node to have a lifecycle handler registered, so that it can receive CREATE_REPLICA and REMOVE_REPLICA messages from other nodes.

#### Acceptance Criteria

1. WHEN the Seed_Node completes bootstrap THEN the Bootstrap_Service SHALL register a lifecycle handler with the MessageRouter
2. THE lifecycle handler address SHALL follow the pattern `${nodeId}/lifecycle`
3. WHEN a CREATE_REPLICA message is received THEN the lifecycle handler SHALL delegate to ReplicaLifecycleManager.handleCreateReplica
4. WHEN a REMOVE_REPLICA message is received THEN the lifecycle handler SHALL delegate to ReplicaLifecycleManager.handleRemoveReplica
5. WHEN an ACK is generated THEN the lifecycle handler SHALL emit the ACK event on the appropriate service

### Requirement 5: Pending Move Deduplication

**User Story:** As a cluster operator, I want the rebalancer to avoid generating duplicate moves, so that joining nodes are not overwhelmed with redundant commands.

#### Acceptance Criteria

1. WHEN the Rebalancer calculates moves THEN it SHALL check the pending_move_map for existing operations
2. IF a pending ADD move exists for a target node THEN the Rebalancer SHALL NOT generate another ADD move for that node
3. IF a pending REMOVE move exists for a replica THEN the Rebalancer SHALL NOT generate another REMOVE move for that replica
4. WHEN a move completes or times out THEN the Rebalancer SHALL remove it from the pending_move_map
5. THE Rebalancer SHALL periodically clean up expired entries from the pending_move_map

### Requirement 6: ACK Routing Consolidation

**User Story:** As a developer, I want ACK events to be routed through a single consistent path, so that ACKs reliably reach the waiting handlers.

#### Acceptance Criteria

1. WHEN a lifecycle handler generates an ACK THEN it SHALL return the ACK in the message response
2. THE deliverWithAck method SHALL extract the ACK from the transport response
3. THE deliverWithAck method SHALL NOT rely on EventEmitter events for ACK delivery
4. IF the transport response contains an ACK THEN the deliverWithAck method SHALL resolve immediately without waiting for events
