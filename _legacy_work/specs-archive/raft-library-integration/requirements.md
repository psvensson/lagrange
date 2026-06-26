# Requirements Document

## Introduction

This document specifies requirements for replacing the hand-rolled Raft consensus implementation with a proper Raft library. The current codebase has custom Raft implementations in both `MessageGroupService` (in-memory) and `PartitionService` (SQLite-backed) that are incomplete and buggy. A Raft library handles all consensus state machine logic (term management, vote counting, log replication, leader election), while the application provides transport and storage adapters.

## Glossary

- **Raft_Library**: External npm package implementing the Raft consensus algorithm state machine
- **Transport_Adapter**: Component that sends/receives Raft messages between nodes via WebSocket
- **Storage_Adapter**: Component that persists Raft state (term, votedFor, log entries) to storage
- **Message_Group_Raft**: Raft instance for message groups using in-memory storage
- **Partition_Raft**: Raft instance for partitions using SQLite storage
- **Raft_Message**: Protocol message (RequestVote, AppendEntries, etc.) exchanged between Raft peers
- **Committed_Entry**: Log entry that has been replicated to a majority and is safe to apply
- **State_Machine**: Application logic that processes committed entries (cache updates, SQL execution)

## Requirements

### Requirement 1: Raft Library Selection and Installation

**User Story:** As a developer, I want to use a battle-tested Raft library, so that I don't have to maintain custom consensus logic.

#### Acceptance Criteria

1. THE System SHALL install a Raft library that supports custom transport mechanisms
2. THE System SHALL install a Raft library that supports custom storage backends
3. THE System SHALL install a Raft library that exposes leader election events
4. THE System SHALL install a Raft library that exposes committed entry callbacks
5. THE System SHALL remove all hand-rolled Raft logic from the codebase

### Requirement 2: Transport Adapter for WebSocket Communication

**User Story:** As a system architect, I want Raft messages to flow through the existing WebSocket transport, so that we maintain a single communication channel.

#### Acceptance Criteria

1. WHEN the Raft_Library needs to send a Raft_Message, THE Transport_Adapter SHALL deliver it via MessageRouter
2. WHEN a Raft_Message arrives via WebSocket, THE Transport_Adapter SHALL forward it to the Raft_Library
3. THE Transport_Adapter SHALL use unified address format (nodeId/entityType/entityId) for peer addressing
4. WHEN a peer is unreachable, THE Transport_Adapter SHALL report the failure to the Raft_Library
5. THE Transport_Adapter SHALL support both MessageGroupService and PartitionService message routing

### Requirement 3: In-Memory Storage Adapter for Message Groups

**User Story:** As a system architect, I want message group Raft state stored in memory, so that message routing remains fast.

#### Acceptance Criteria

1. THE Storage_Adapter SHALL persist currentTerm to memory
2. THE Storage_Adapter SHALL persist votedFor to memory
3. THE Storage_Adapter SHALL persist log entries to memory
4. THE Storage_Adapter SHALL support log truncation for conflict resolution
5. THE Storage_Adapter SHALL support log compaction to prevent unbounded growth
6. WHEN the node restarts, THE Storage_Adapter SHALL start with fresh state (message groups are ephemeral)

### Requirement 4: SQLite Storage Adapter for Partitions

**User Story:** As a system architect, I want partition Raft state persisted to SQLite, so that data survives restarts.

#### Acceptance Criteria

1. THE Storage_Adapter SHALL persist currentTerm to SQLite _raft_state table
2. THE Storage_Adapter SHALL persist votedFor to SQLite _raft_state table
3. THE Storage_Adapter SHALL persist log entries to SQLite _raft_log table
4. THE Storage_Adapter SHALL support log truncation for conflict resolution
5. THE Storage_Adapter SHALL support log compaction via snapshots
6. WHEN the node restarts, THE Storage_Adapter SHALL restore state from SQLite

### Requirement 5: Leader Election Integration

**User Story:** As a system operator, I want leader election to work reliably, so that the cluster can make progress.

#### Acceptance Criteria

1. WHEN the Raft_Library elects a leader, THE System SHALL emit a leaderElected event
2. WHEN this node becomes leader, THE System SHALL set isLeader to true
3. WHEN this node loses leadership, THE System SHALL set isLeader to false
4. WHEN a new leader is elected, THE System SHALL update leaderId
5. THE System SHALL expose getRole(), getLeaderId(), and isLeaderReplica() methods

### Requirement 6: Committed Entry Application

**User Story:** As a developer, I want committed entries applied to the state machine, so that data changes take effect.

#### Acceptance Criteria

1. WHEN the Raft_Library commits an entry, THE State_Machine SHALL apply it
2. FOR Message_Group_Raft, THE State_Machine SHALL update the SystemTableCache
3. FOR Partition_Raft, THE State_Machine SHALL execute the SQL operation
4. THE State_Machine SHALL generate CDC events after applying entries
5. THE State_Machine SHALL maintain lastApplied index for crash recovery

### Requirement 7: Configuration Integration

**User Story:** As a system operator, I want Raft timing parameters configurable, so that I can tune for my network.

#### Acceptance Criteria

1. THE System SHALL read raft.electionTimeoutMinMs from ConfigurationManager
2. THE System SHALL read raft.electionTimeoutMaxMs from ConfigurationManager
3. THE System SHALL read raft.heartbeatIntervalMs from ConfigurationManager
4. THE System SHALL pass these values to the Raft_Library on initialization
5. WHEN configuration changes, THE System SHALL log a warning (restart required)

### Requirement 8: Backward Compatibility

**User Story:** As a developer, I want the public API unchanged, so that existing code continues to work.

#### Acceptance Criteria

1. THE MessageGroupService SHALL maintain the same public method signatures
2. THE PartitionService SHALL maintain the same public method signatures
3. THE System SHALL maintain the same event names (leaderElected, initialized, etc.)
4. THE System SHALL maintain the same message types for transport (RAFT_REQUEST_VOTE, RAFT_APPEND_ENTRIES)
5. WHEN tests reference Raft internals, THE tests SHALL be updated to use the new implementation

### Requirement 9: Error Handling and Recovery

**User Story:** As a system operator, I want Raft errors handled gracefully, so that the cluster remains stable.

#### Acceptance Criteria

1. WHEN the Raft_Library reports an error, THE System SHALL log it with context
2. WHEN a peer fails to respond, THE System SHALL continue operating with remaining peers
3. WHEN storage operations fail, THE System SHALL report the error to the Raft_Library
4. WHEN the cluster loses quorum, THE System SHALL stop accepting writes
5. WHEN quorum is restored, THE System SHALL resume normal operation
