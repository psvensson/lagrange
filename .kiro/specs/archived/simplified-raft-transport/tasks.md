# Implementation Plan: Simplified Raft Transport

## Overview

This plan refactors the liferaft integration to eliminate unnecessary message type conversions. Packets flow through the transport unchanged, with Raft packet detection happening at the receiver. This applies to both message groups and partitions.

## Tasks

- [x] 1. Add Raft packet detection function
  - Add `isRaftPacket()` function to message-group-service.js
  - Function checks for native liferaft type values: 'vote', 'voted', 'append', 'appended'
  - _Requirements: 2.1, 2.4_

- [x] 1.1 Write property test for Raft packet detection
  - **Property 2: Raft Packet Detection**
  - Generate random payloads, verify correct classification
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

- [x] 2. Simplify RaftNode.write() method
  - Modify the RaftNode class in MessageGroupService.initialize()
  - Remove transportAdapter usage, call messageRouter.deliver() directly
  - Preserve all packet fields, only add destination address for routing
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 2.1 Write property test for RaftNode.write() field preservation
  - **Property 3: RaftNode.write() Field Preservation**
  - Generate random packets, verify all fields preserved in delivery
  - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

- [x] 3. Simplify receiveMessage() to detect and route Raft packets
  - Use isRaftPacket() to detect Raft packets
  - Emit Raft packets directly to liferaft via raft.emit('data', packet)
  - Remove type conversion logic (getRaftMessageType, getLiferaftPacketType)
  - Handle non-Raft messages as application messages
  - _Requirements: 2.2, 2.3, 5.2, 5.3_

- [x] 3.1 Write property test for packet round-trip preservation
  - **Property 1: Packet Round-Trip Preservation**
  - Generate random liferaft packets, send/receive, verify equivalence
  - **Validates: Requirements 1.1, 1.4**

- [x] 4. Remove RaftTransportAdapter
  - Delete src/raft/raft-transport-adapter.js
  - Remove import from message-group-service.js
  - Remove transportAdapter instance creation
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 5. Clean up debug logging
  - Remove console.log statements from message-router.js (handleServiceMessage)
  - Ensure all diagnostic output uses logger.debug()
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 6. Update existing tests
  - Update transport-adapter-message-delivery.property.test.js for new architecture
  - Verify message-group tests still pass
  - _Requirements: 6.1, 6.2_

- [x] 7. Checkpoint - Verify integration test passes
  - Run multi-node-cluster.integration.test.js
  - Verify leadership election succeeds with simplified transport
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 6.3_

- [x] 8. Extract shared Raft packet utilities
  - Create src/raft/raft-packet-utils.js
  - Move isRaftPacket() and RAFT_PACKET_TYPES to shared module
  - Update MessageGroupService to import from shared module
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 8.1 Write property test for shared Raft detection consistency
  - **Property 5: Shared Raft Detection Consistency**
  - Verify isRaftPacket() produces same result regardless of caller
  - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 9. Update SQLiteLogAdapter for liferaft compatibility
  - Ensure SQLiteLogAdapter implements liferaft Log interface
  - Add getLastInfo(), get(), put(), removeFrom(), getRange() methods
  - Verify persistence and recovery work correctly
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 9.1 Write property test for SQLite log adapter round-trip
  - **Property 7: SQLite Log Adapter Round-Trip**
  - Generate random log entries, write/read, verify equivalence
  - **Validates: Requirements 12.2, 12.5**

- [x] 10. Add liferaft to PartitionService
  - Import liferaft library
  - Import isRaftPacket() from shared module
  - Create RaftNode class extending LifeRaft with write() method
  - Initialize liferaft instance in initialize()
  - Wire up liferaft events (leader, follower, candidate, commit)
  - _Requirements: 8.1, 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 10.1 Write property test for partition RaftNode.write() field preservation
  - **Property 6: Partition RaftNode.write() Field Preservation**
  - Generate random packets, verify all fields preserved in delivery
  - **Validates: Requirements 10.2, 10.3, 10.4**

- [x] 11. Update partition transport handler
  - Update handleTransportMessage() to use isRaftPacket()
  - Emit Raft packets to liferaft via raft.emit('data', packet)
  - Handle non-Raft messages as application messages
  - Remove custom message type handling (mg_raft_append_entries, etc.)
  - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 11.1 Write property test for partition packet round-trip
  - **Property 4: Partition Packet Round-Trip Preservation**
  - Generate random liferaft packets, send/receive via partition, verify equivalence
  - **Validates: Requirements 8.2, 8.5**

- [x] 12. Remove custom Raft implementation from PartitionService
  - Remove handleAppendEntries() method
  - Remove handleRequestVote() method
  - Remove handleAppendEntriesResponse() method
  - Remove handleRequestVoteResponse() method
  - Remove startElectionTimer() and stopElectionTimer() methods
  - Remove becomeLeader() method
  - Remove startElection() method
  - Remove sendHeartbeat() and stopHeartbeat() methods
  - Remove replicateEntry() method
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_

- [x] 13. Update partition tests
  - Update partition-service.test.js for new liferaft-based architecture
  - Verify partition Raft elections work correctly
  - Verify partition data replication works correctly
  - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 14. Checkpoint - Verify all partition tests pass
  - Run partition test suite
  - Run integration tests involving partitions
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 14.1, 14.2, 14.3_

## Notes

- Tasks 1-7 are complete (message group simplified transport)
- Tasks 8-14 extend the pattern to partitions
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- The key integration tests are multi-node cluster and partition replication
