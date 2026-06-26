# Requirements Document

## Introduction

This specification defines a simplified transport layer for liferaft integration that eliminates unnecessary message type conversions. The current architecture converts liferaft packet types to custom message types and back, adding complexity without value. This refactoring passes liferaft packets through the transport layer unchanged, using packet detection to route Raft messages directly to liferaft's event system.

This specification applies to both message groups and partitions, enabling code reuse and consistent Raft transport behavior across entity types.

## Glossary

- **Liferaft**: The Raft consensus library used for leader election and log replication
- **Raft_Packet**: Native liferaft message format with fields: type, term, address, state, leader, last, data
- **MessageRouter**: WebSocket-based message routing infrastructure for cross-node communication
- **Unified_Address**: Address format `${nodeId}/${entityType}/${entityId}` used for service routing
- **Passthrough_Transport**: Transport layer that forwards packets without type conversion
- **MessageGroupService**: Service that manages Raft consensus for message groups
- **PartitionService**: Service that manages Raft consensus for data partitions with SQLite storage
- **RaftNode**: Extended LifeRaft class that implements the simplified write() method for transport

## Requirements

### Requirement 1: Eliminate Type Conversion

**User Story:** As a developer, I want Raft packets to flow through the transport unchanged, so that the code is simpler and easier to debug.

#### Acceptance Criteria

1. WHEN a liferaft packet is sent via the transport, THE Passthrough_Transport SHALL preserve all original packet fields without modification
2. WHEN a liferaft packet is received, THE MessageGroupService SHALL detect it by checking for native liferaft type values ('vote', 'voted', 'append', 'appended')
3. THE RaftTransportAdapter SHALL NOT convert packet types between liferaft format and custom format
4. FOR ALL valid liferaft packets, sending then receiving SHALL produce an equivalent packet (round-trip property)

### Requirement 2: Raft Packet Detection

**User Story:** As a developer, I want the system to automatically detect Raft packets, so that they can be routed directly to liferaft without explicit type markers.

#### Acceptance Criteria

1. WHEN a message payload contains a 'type' field with value 'vote', 'voted', 'append', or 'appended', THE MessageGroupService SHALL treat it as a Raft packet
2. WHEN a Raft packet is detected, THE MessageGroupService SHALL emit it directly to liferaft via `raft.emit('data', packet)`
3. WHEN a message payload does not match Raft packet criteria, THE MessageGroupService SHALL handle it as an application message
4. THE Raft_Packet detection SHALL be based solely on the 'type' field value, not on wrapper message types

### Requirement 3: Simplified RaftNode.write()

**User Story:** As a developer, I want the RaftNode.write() method to be minimal, so that the transport logic is easy to understand.

#### Acceptance Criteria

1. WHEN liferaft calls write() with a packet, THE RaftNode SHALL send the packet directly to MessageRouter.deliver()
2. THE RaftNode.write() SHALL add only the destination address, preserving all other packet fields
3. THE RaftNode.write() SHALL NOT perform any type mapping or field transformation
4. WHEN MessageRouter.deliver() completes, THE RaftNode.write() SHALL invoke the callback with the result

### Requirement 4: Remove RaftTransportAdapter

**User Story:** As a developer, I want to eliminate the RaftTransportAdapter class, so that there are fewer layers between liferaft and the transport.

#### Acceptance Criteria

1. THE MessageGroupService SHALL implement transport logic directly in the RaftNode class
2. THE RaftTransportAdapter class SHALL be removed from the codebase
3. THE MessageGroupService SHALL use MessageRouter directly for peer communication
4. WHEN the refactoring is complete, THE system SHALL have one fewer abstraction layer for Raft transport

### Requirement 5: Handler Registration Simplification

**User Story:** As a developer, I want message handlers to process both Raft and application messages, so that registration is simpler.

#### Acceptance Criteria

1. WHEN a handler is registered with MessageRouter, THE handler SHALL receive all messages for that address
2. THE handler SHALL detect Raft packets and route them to liferaft
3. THE handler SHALL process non-Raft messages as application messages
4. THE MessageGroupService.receiveMessage() SHALL be the single entry point for all incoming messages

### Requirement 6: Backward Compatibility

**User Story:** As a developer, I want existing tests to continue passing, so that the refactoring doesn't break functionality.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE existing Raft adapter tests SHALL pass with minimal modifications
2. WHEN the refactoring is complete, THE existing message-group tests SHALL pass
3. WHEN the refactoring is complete, THE multi-node integration test SHALL establish leadership successfully
4. IF test modifications are needed, THEN THE modifications SHALL only update message format expectations, not test logic

### Requirement 7: Debug Logging Cleanup

**User Story:** As a developer, I want debug console.log statements removed, so that the code is production-ready.

#### Acceptance Criteria

1. THE refactored code SHALL NOT contain console.log statements for debugging
2. THE refactored code SHALL use the logging service for all diagnostic output
3. WHEN debug information is needed, THE code SHALL use logger.debug() with structured data

### Requirement 8: Partition Liferaft Integration

**User Story:** As a developer, I want partitions to use the liferaft library with the same simplified transport pattern as message groups, so that Raft implementation is consistent and code is reused.

#### Acceptance Criteria

1. THE PartitionService SHALL use the liferaft library for Raft consensus instead of custom Raft implementation
2. WHEN a liferaft packet is sent via the partition transport, THE PartitionService SHALL preserve all original packet fields without modification
3. WHEN a liferaft packet is received by a partition, THE PartitionService SHALL detect it using the same isRaftPacket() function as message groups
4. THE PartitionService SHALL emit Raft packets directly to liferaft via `raft.emit('data', packet)`
5. FOR ALL valid liferaft packets sent to partitions, sending then receiving SHALL produce an equivalent packet (round-trip property)

### Requirement 9: Shared Raft Packet Detection

**User Story:** As a developer, I want a shared utility for Raft packet detection, so that both message groups and partitions use the same logic.

#### Acceptance Criteria

1. THE isRaftPacket() function SHALL be extracted to a shared module accessible by both MessageGroupService and PartitionService
2. THE RAFT_PACKET_TYPES constant SHALL be defined in the shared module
3. WHEN either service receives a message, THE service SHALL use the shared isRaftPacket() function for detection
4. THE shared module SHALL be located in src/raft/ directory

### Requirement 10: Partition RaftNode Class

**User Story:** As a developer, I want partitions to use a RaftNode class similar to message groups, so that the write() method implementation is consistent.

#### Acceptance Criteria

1. THE PartitionService SHALL define a RaftNode class that extends LifeRaft
2. THE RaftNode.write() method SHALL send packets directly to MessageRouter.deliver()
3. THE RaftNode.write() SHALL add only the destination address, preserving all other packet fields
4. THE RaftNode.write() SHALL NOT perform any type mapping or field transformation
5. THE RaftNode class pattern SHALL be consistent between MessageGroupService and PartitionService

### Requirement 11: Remove Custom Partition Raft Implementation

**User Story:** As a developer, I want to remove the custom Raft implementation from partitions, so that there is only one Raft implementation to maintain.

#### Acceptance Criteria

1. THE PartitionService SHALL remove the custom handleAppendEntries() method
2. THE PartitionService SHALL remove the custom handleRequestVote() method
3. THE PartitionService SHALL remove the custom handleAppendEntriesResponse() method
4. THE PartitionService SHALL remove the custom handleRequestVoteResponse() method
5. THE PartitionService SHALL remove the custom startElectionTimer() method
6. THE PartitionService SHALL remove the custom becomeLeader() method
7. THE PartitionService SHALL remove the custom startElection() method
8. THE PartitionService SHALL remove the custom sendHeartbeat() method
9. WHEN the refactoring is complete, THE PartitionService SHALL rely entirely on liferaft for Raft consensus

### Requirement 12: Partition SQLite Log Adapter

**User Story:** As a developer, I want partitions to use a SQLite-backed log adapter for liferaft, so that Raft log entries are persisted to disk.

#### Acceptance Criteria

1. THE PartitionService SHALL use SQLiteLogAdapter for liferaft's Log option
2. THE SQLiteLogAdapter SHALL persist log entries to the partition's SQLite database
3. THE SQLiteLogAdapter SHALL implement the same interface as InMemoryLogAdapter
4. WHEN a partition restarts, THE SQLiteLogAdapter SHALL restore log entries from SQLite
5. FOR ALL log entries, writing then reading SHALL produce equivalent entries (round-trip property)

### Requirement 13: Partition Transport Handler Update

**User Story:** As a developer, I want the partition transport handler to detect and route Raft packets like message groups, so that the handling is consistent.

#### Acceptance Criteria

1. THE PartitionService.handleTransportMessage() SHALL use isRaftPacket() to detect Raft packets
2. WHEN a Raft packet is detected, THE handler SHALL emit it to liferaft via raft.emit('data', packet)
3. WHEN a non-Raft message is received, THE handler SHALL process it as an application message
4. THE handler SHALL NOT use custom message type constants (mg_raft_append_entries, etc.)

### Requirement 14: Backward Compatibility for Partitions

**User Story:** As a developer, I want existing partition tests to continue passing, so that the refactoring doesn't break functionality.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE existing partition tests SHALL pass with minimal modifications
2. WHEN the refactoring is complete, THE partition Raft elections SHALL work correctly
3. WHEN the refactoring is complete, THE partition data replication SHALL work correctly
4. IF test modifications are needed, THEN THE modifications SHALL only update message format expectations, not test logic
