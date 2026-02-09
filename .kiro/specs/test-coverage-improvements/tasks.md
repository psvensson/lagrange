# Implementation Plan: Test Coverage Improvements

## Overview

This implementation plan creates tests to improve code coverage across critical components of the distributed database system. Tests are organized by component and follow the existing test patterns using tap and fast-check.

## Tasks

- [x] 1. Create RaftTransportAdapter test suite
  - [x] 1.1 Create test file `test/raft/raft-transport-adapter.test.js`
    - Test constructor validation (messageRouter, entityType, nodeId required)
    - Test write method message delivery
    - Test buildPeerAddress address resolution
    - Test getRaftMessageType type mapping
    - Test error handling for invalid addresses
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 1.2 Write property test for Raft packet round-trip
    - **Property 1: Raft Packet Round-Trip Preservation**
    - **Validates: Requirements 2.5**

- [x] 2. Create CDCEventHandler test suite
  - [x] 2.1 Create test file `test/cdc/cdc-event-handler.test.js`
    - Test handleEpochChangeCDC with valid epoch events
    - Test handleEpochChangeCDC with invalid JSON
    - Test handleEpochChangeCDC with non-epoch config keys
    - Test handleEpochChangeCDC without epoch manager
    - Test handleNodeStateCDC with valid state changes
    - Test handleNodeStateCDC with unchanged state
    - Test handleNodeJoinedCDC with new node events
    - Test handleNodeJoinedCDC self-skip behavior
    - Test deriveWsAddressFromNodeAddress address derivation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_
  
  - [x] 2.2 Write property test for node state tracking consistency
    - **Property 2: Node State Tracking Consistency**
    - **Validates: Requirements 3.4, 3.5**
  
  - [x] 2.3 Write property test for WebSocket address derivation
    - **Property 3: WebSocket Address Derivation Correctness**
    - **Validates: Requirements 3.8**

- [x] 3. Checkpoint - Verify CDC and Raft transport tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend CDCIntegrationService test suite
  - [x] 4.1 Add tests for retry logic and error handling
    - Test executeSQL retry with transient errors
    - Test executeSQL max retry exceeded
    - Test isTransientCdcError error classification
    - Test computeRetryDelayMs exponential backoff
    - _Requirements: 4.1, 4.2, 4.7_
  
  - [x] 4.2 Write property test for retry delay exponential backoff
    - **Property 4: Retry Delay Exponential Backoff**
    - **Validates: Requirements 4.1, 4.2**
  
  - [x] 4.3 Add tests for bootstrap mode and data preparation
    - Test executeSQLDirectToLocalPartition bootstrap mode
    - Test setBootstrapMode validation
    - Test prepareInsertData schema defaults
    - Test waitForCacheUpdate cache synchronization
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.8_
  
  - [x] 4.4 Write property test for schema default application
    - **Property 5: Schema Default Application Completeness**
    - **Validates: Requirements 4.6**

- [x] 5. Extend RaftReplicaBase test suite
  - [x] 5.1 Add tests for Raft instance creation and event wiring
    - Test createRaftInstance configuration
    - Test wireRaftEvents event handler wiring
    - Test joinPeers peer joining
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 5.2 Add tests for packet handling and election
    - Test handleRaftPacket with valid packets
    - Test handleRaftPacket with invalid sender address
    - Test startElection timer management
    - _Requirements: 1.4, 1.5, 1.6_
  
  - [x] 5.3 Write property test for Raft packet routing
    - **Property 7: Raft Packet Routing Correctness**
    - **Validates: Requirements 1.4**
  
  - [x] 5.4 Add tests for learner lifecycle and role updates
    - Test scheduleLearnerPromotion timer scheduling
    - Test checkLearnerPromotion state transition
    - Test role update queueing with cdcIntegrationService
    - Test leader node update queueing
    - _Requirements: 1.7, 1.8, 1.9, 1.10_

- [x] 6. Checkpoint - Verify Raft and CDC integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Extend bootstrap phase test suite
  - [x] 7.1 Add tests for phase transitions and failures
    - Test successful phase transitions
    - Test phase failure handling
    - Test phase timeout reporting
    - Test READY phase join request allowance
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 7.2 Write property test for bootstrap state machine invariant
    - **Property 6: Bootstrap Phase State Machine Invariant**
    - **Validates: Requirements 5.5, 5.6**

- [x] 8. Extend PartitionService test suite
  - [x] 8.1 Add tests for query execution
    - Test executeLocalQuery on leader
    - Test executeLocalQuery on follower
    - Test uninitialized operation errors
    - _Requirements: 6.1, 6.2, 6.6_
  
  - [x] 8.2 Add tests for Raft packet handling and CDC
    - Test handleRaftPacket processing
    - Test CDC event generation on write commit
    - _Requirements: 6.3, 6.4_

- [x] 9. Create integration tests with real Raft
  - [x] 9.1 Create integration test for leader election
    - Create 3-replica Raft group
    - Verify leader is elected
    - Verify followers recognize leader
    - _Requirements: 7.3, 7.4_
  
  - [x] 9.2 Create integration test for CDC propagation
    - Write data through Raft consensus
    - Verify CDC events are generated
    - Verify CDC events propagate correctly
    - _Requirements: 7.4, 7.5_

- [x] 10. Final checkpoint - Verify all tests pass and coverage targets met
  - Ensure all tests pass, ask the user if questions arise.
  - Run coverage report and verify targets:
    - Raft: 90%+ line coverage
    - CDC: 85%+ line coverage
    - Bootstrap: 85%+ line coverage
    - Partition: 80%+ line coverage

## Notes

- Each task references specific requirements for traceability
- Property tests use fast-check with {numRuns: 10} per testing guidelines
- Unit tests must complete within 2 seconds
- Integration tests must complete within 30 seconds
- Integration tests must use real Raft (no mocking liferaft)
