# Implementation Plan: Raft Library Integration

## Overview

This plan replaces the hand-rolled Raft implementations in MessageGroupService and PartitionService with the `@markwylde/liferaft` library. The implementation follows a bottom-up approach: first create the adapters, then integrate them into the services, and finally clean up the old code.

## Tasks

- [x] 1. Install liferaft library and set up adapters
  - [x] 1.1 Install @markwylde/liferaft package
    - Run `npm install @markwylde/liferaft`
    - Verify package is added to package.json
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 1.2 Create RaftTransportAdapter class
    - Create `src/raft/raft-transport-adapter.js`
    - Implement `write(packet, callback)` method for liferaft
    - Implement `buildPeerAddress(peerId)` using unified address format
    - Implement `getRaftMessageType(packetType)` for message type mapping
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.3 Write property test for unified address format
    - **Property 5: Unified Address Format**
    - **Validates: Requirements 2.3**

  - [x] 1.4 Create InMemoryLogAdapter class
    - Create `src/raft/in-memory-log-adapter.js`
    - Implement `append(entries, callback)` method
    - Implement `getEntriesFrom(startIndex, callback)` method
    - Implement `getLastEntry(callback)` method
    - Implement `truncateFrom(fromIndex, callback)` method
    - Implement `getLength(callback)` method
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.5 Write property test for in-memory storage round-trip
    - **Property 1: In-Memory Storage Round-Trip**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 1.6 Create SQLiteLogAdapter class
    - Create `src/raft/sqlite-log-adapter.js`
    - Implement `initializeTables()` for _raft_log and _raft_state tables
    - Implement `append(entries, callback)` method
    - Implement `getEntriesFrom(startIndex, callback)` method
    - Implement `truncateFrom(fromIndex, callback)` method
    - Implement `getState(key, callback)` and `setState(key, value, callback)` methods
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 1.7 Write property test for SQLite storage round-trip
    - **Property 2: SQLite Storage Round-Trip and Restart Recovery**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.6**

  - [x] 1.8 Write property test for log truncation
    - **Property 3: Log Truncation Correctness**
    - **Validates: Requirements 3.4, 4.4**

- [x] 2. Checkpoint - Verify adapters work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Integrate liferaft into MessageGroupService
  - [x] 3.1 Refactor MessageGroupService to use liferaft
    - Import liferaft and adapters
    - Create extended LifeRaft class with custom write method
    - Replace InMemoryRaftStorage with InMemoryLogAdapter
    - Replace manual election timer with liferaft's built-in election
    - Replace manual heartbeat with liferaft's built-in heartbeat
    - Wire up liferaft events (leader, follower, candidate, commit)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.4, 6.5_

  - [x] 3.2 Update MessageGroupService message handling
    - Update `receiveMessage()` to forward Raft messages to liferaft
    - Remove `handleVoteRequest()` method (handled by liferaft)
    - Remove `handleHeartbeat()` method (handled by liferaft)
    - Remove `startElection()` method (handled by liferaft)
    - Remove `sendHeartbeat()` method (handled by liferaft)
    - Remove `requestVotesFromPeers()` method (handled by liferaft)
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Update MessageGroupService configuration
    - Read raft.electionTimeoutMinMs from ConfigurationManager
    - Read raft.electionTimeoutMaxMs from ConfigurationManager
    - Read raft.heartbeatIntervalMs from ConfigurationManager
    - Pass configuration to liferaft constructor
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 3.4 Write property test for transport adapter message delivery
    - **Property 4: Transport Adapter Message Delivery**
    - **Validates: Requirements 2.1, 2.2**

- [ ] 4. Checkpoint - Verify MessageGroupService works with liferaft
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Integrate liferaft into PartitionService
  - [ ] 5.1 Refactor PartitionService to use liferaft
    - Import liferaft and adapters
    - Create extended LifeRaft class with custom write method
    - Replace SQLiteRaftStorage with SQLiteLogAdapter
    - Replace manual election timer with liferaft's built-in election
    - Replace manual heartbeat with liferaft's built-in heartbeat
    - Wire up liferaft events (leader, follower, candidate, commit)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.3, 6.4, 6.5_

  - [ ] 5.2 Update PartitionService message handling
    - Update `handleTransportMessage()` to forward Raft messages to liferaft
    - Remove `handleAppendEntries()` method (handled by liferaft)
    - Remove `handleRequestVote()` method (handled by liferaft)
    - Remove `handleAppendEntriesResponse()` method (handled by liferaft)
    - Remove `handleRequestVoteResponse()` method (handled by liferaft)
    - _Requirements: 2.1, 2.2_

  - [ ] 5.3 Update PartitionService configuration
    - Read raft.electionTimeoutMinMs from ConfigurationManager
    - Read raft.electionTimeoutMaxMs from ConfigurationManager
    - Read raft.heartbeatIntervalMs from ConfigurationManager
    - Pass configuration to liferaft constructor
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 5.4 Write property test for committed entry application
    - **Property 6: Committed Entry Application**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [ ] 6. Checkpoint - Verify PartitionService works with liferaft
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Clean up old Raft code
  - [ ] 7.1 Remove InMemoryRaftStorage class from MessageGroupService
    - Delete the InMemoryRaftStorage class definition
    - Delete the RaftLogEntry class definition
    - _Requirements: 1.5_

  - [ ] 7.2 Remove SQLiteRaftStorage class from PartitionService
    - Delete the SQLiteRaftStorage class definition
    - Delete the PartitionRaftLogEntry class definition
    - _Requirements: 1.5_

  - [ ] 7.3 Update existing tests to use new implementation
    - Update tests that reference removed methods
    - Update tests that mock Raft internals
    - Ensure backward compatibility for public API tests
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 8. Error handling and resilience
  - [ ] 8.1 Implement error handling in transport adapter
    - Log transport errors with context
    - Report errors to liferaft callback
    - Handle peer unreachability gracefully
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ] 8.2 Implement quorum-based write availability
    - Detect when quorum is lost
    - Reject writes when quorum unavailable
    - Resume writes when quorum restored
    - _Requirements: 9.4, 9.5_

  - [ ] 8.3 Write property test for quorum-based write availability
    - **Property 7: Quorum-Based Write Availability**
    - **Validates: Requirements 9.4, 9.5**

- [ ] 9. Final checkpoint - Full integration test
  - Ensure all tests pass, ask the user if questions arise.
  - Test multi-node cluster with seed node and joining node
  - Verify leader election works correctly
  - Verify log replication works correctly

## Notes

- All tasks including property-based tests are required
- The liferaft library handles all Raft consensus logic internally
- We only provide transport (MessageRouter) and storage (adapters)
- Existing public APIs (sendMessage, receiveMessage, etc.) remain unchanged
- Message types (RAFT_REQUEST_VOTE, RAFT_APPEND_ENTRIES) remain unchanged for compatibility
