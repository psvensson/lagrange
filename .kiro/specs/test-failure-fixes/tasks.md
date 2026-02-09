# Implementation Plan: Test Failure Fixes

## Overview

This implementation plan addresses 52 failing tests across 27 test suites. The fixes are organized into logical groups: code path uniqueness, bootstrap sequence, message delivery, integration test fixes, and property test implementation.

## Tasks

- [x] 1. Extract WorkerRaftNode to shared module
  - [x] 1.1 Create src/worker/worker-raft-node.js with shared WorkerRaftNode class
    - Extract class from message-group-worker-service.js
    - Add context parameter for messageBridge, logger, entityId access
    - Export class for use by both services
    - _Requirements: 2.1, 2.3_
  
  - [x] 1.2 Update message-group-worker-service.js to use shared WorkerRaftNode
    - Import WorkerRaftNode from worker-raft-node.js
    - Remove duplicate class definition
    - Pass context object with messageBridge, logger, groupId
    - _Requirements: 2.1, 2.2_
  
  - [x] 1.3 Update partition-worker-service.js to use shared WorkerRaftNode
    - Import WorkerRaftNode from worker-raft-node.js
    - Remove duplicate class definition
    - Pass context object with messageBridge, logger, partitionId
    - _Requirements: 2.1, 2.2_
  
  - [x] 1.4 Write property test for code path uniqueness
    - **Property 2: Code Path Uniqueness**
    - Verify WorkerRaftNode exists in exactly one location
    - **Validates: Requirements 2.1, 2.2**

- [x] 2. Checkpoint - Verify code path uniqueness tests pass
  - Run code-path-uniqueness.property.test.js
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Fix bootstrap sequence system table initialization
  - [x] 3.1 Update registration phase to verify system tables exist
    - Add ensureSystemTablesExist() method to RegistrationPhase
    - Verify tables exist before CDC operations
    - Create tables if missing during bootstrap
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 3.2 Update CDCIntegrationService to handle missing tables gracefully
    - Check table existence before insert operations
    - Log clear error if table not found
    - _Requirements: 1.2, 1.3_
  
  - [x] 3.3 Write property test for bootstrap system table invariant
    - **Property 1: Bootstrap System Table Invariant**
    - Verify all system tables exist after successful bootstrap
    - **Validates: Requirements 1.1, 1.4**

- [x] 4. Checkpoint - Verify bootstrap sequence tests pass
  - Run bootstrap-sequence.test.js
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Fix message delivery reliability
  - [x] 5.1 Update MessageRouter to increment messageCount on delivery
    - Add messageCount initialization in constructor
    - Increment at start of deliver() method
    - Ensure count increments even on delivery failure
    - _Requirements: 8.1, 8.2_
  
  - [x] 5.2 Update MessageGroupService to validate transport before send
    - Check transport is not null before sendMessage
    - Throw descriptive error if transport unavailable
    - _Requirements: 9.1, 9.2_
  
  - [x] 5.3 Write property test for message router delivery tracking
    - **Property 6: Message Router Delivery Tracking**
    - Verify messageCount increments on every delivery
    - **Validates: Requirements 8.1, 8.2, 8.3**
  
  - [x] 5.4 Write property test for no silent delivery failures
    - **Property 7: No Silent Delivery Failures**
    - Verify error thrown when transport is null
    - **Validates: Requirements 9.1, 9.2**

- [x] 6. Checkpoint - Verify message delivery tests pass
  - Run message-delivery-reliability.property.test.js
  - Run no-silent-delivery-failures.property.test.js
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Fix UNIQUE constraint handling
  - [x] 7.1 Update CDCIntegrationService to use INSERT OR REPLACE
    - Modify insertSystemTableRow to use INSERT OR REPLACE
    - Handle UNIQUE constraint violations gracefully
    - _Requirements: 4.1, 4.2_
  
  - [x] 7.2 Write property test for UNIQUE constraint handling
    - **Property 5: UNIQUE Constraint Handling**
    - Verify duplicate inserts don't cause errors
    - **Validates: Requirements 4.1, 4.2**

- [x] 8. Fix CREATE_REPLICA timeout handling
  - [x] 8.1 Update ReplicaWorkerManager to return error on timeout
    - Return error object instead of undefined on timeout
    - Include timeout duration in error message
    - Clean up partial resources on timeout
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [x] 8.2 Write property test for CREATE_REPLICA timeout response
    - **Property 8: CREATE_REPLICA Timeout Response**
    - Verify error response returned on timeout
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [x] 9. Checkpoint - Verify failure scenario tests pass
  - Run failure-scenarios.integration.test.js
  - Run websocket-create-replica-ack.integration.test.js
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Fix integration test leader election timeouts
  - [x] 10.1 Increase leader election timeout in cross-worker-cdc tests
    - Update LEADER_ELECTION_TIMEOUT_MS to appropriate value
    - Add retry logic for leader election checks
    - _Requirements: 3.1, 3.2_
  
  - [x] 10.2 Fix multi-worker-raft leader election
    - Ensure Raft peers are properly joined
    - Verify message bridge is initialized before elections
    - _Requirements: 5.1, 5.2_
  
  - [x] 10.3 Fix node-join-replica-activation timeout
    - Increase timeout for nodes table population
    - Add CDC propagation wait before checking table
    - _Requirements: 6.1, 6.2_
  
  - [x] 10.4 Write property test for leader election completion
    - **Property 3: Leader Election Completion**
    - Verify leader elected within timeout
    - **Validates: Requirements 3.1, 3.2, 5.1, 5.2**

- [x] 11. Checkpoint - Verify integration tests pass
  - Run cross-worker-cdc.integration.test.js
  - Run multi-worker-raft.integration.test.js
  - Run node-join-replica-activation.integration.test.js
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Fix multi-node Raft replication tests
  - [x] 12.1 Fix routing to replica_operations partition
    - Ensure partition exists before routing
    - Add retry with backoff for routing failures
    - _Requirements: 4.3_
  
  - [x] 12.2 Write property test for CDC event delivery
    - **Property 4: CDC Event Delivery**
    - Verify CDC events delivered to subscribers
    - **Validates: Requirements 3.3, 3.4**

- [x] 13. Checkpoint - Verify multi-node tests pass
  - Run multi-node-raft-replication.integration.test.js
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement or remove empty property test files
  - [x] 14.1 Review and fix aggregate-function-correctness.property.test.js
    - Verify test implementation is complete
    - Fix any failing assertions
    - _Requirements: 10.1_
  
  - [x] 14.2 Review and fix cache-based-routing.property.test.js
    - Verify test implementation is complete
    - Fix any failing assertions
    - _Requirements: 10.2_
  
  - [x] 14.3 Review and fix sql-query-pbt.test.js
    - Verify test implementation is complete
    - Fix any failing assertions
    - _Requirements: 10.3_
  
  - [x] 14.4 Evaluate and handle remaining empty property test files
    - Review cross-partition-join.property.test.js
    - Review no-orphaned-replicas-after-recovery.property.test.js
    - Review operation-log-persistence.property.test.js
    - Review recovery-handles-incomplete-operations.property.test.js
    - Review remove-workflow-step-progression.property.test.js
    - Review cross-partition-rejection.property.test.js
    - Review single-partition-acid.property.test.js
    - Review transaction-durability-raft.property.test.js
    - Review phase-lifecycle-events.property.test.js
    - Either implement tests or remove files if not applicable
    - _Requirements: 10.4-10.12_

- [x] 15. Verify test configuration compliance
  - [x] 15.1 Audit all property tests for numRuns configuration
    - Ensure all fc.assert calls use {numRuns: 10}
    - Fix any tests with incorrect configuration
    - _Requirements: 11.1_
  
  - [x] 15.2 Write property test for test configuration compliance
    - **Property 9: Test Configuration Compliance**
    - Scan test files for numRuns configuration
    - **Validates: Requirements 11.1, 11.2**
  
  - [x] 15.3 Remove any skipped tests
    - Search for .skip(), xit(), xdescribe()
    - Either fix or remove skipped tests
    - _Requirements: 11.4_
  
  - [x] 15.4 Write property test for no skipped tests
    - **Property 10: No Skipped Tests**
    - Scan test files for skip patterns
    - **Validates: Requirements 11.4**

- [x] 16. Final checkpoint - Run full test suite
  - Run npm test
  - Verify all 52 previously failing tests now pass
  - Ensure no new test failures introduced
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests use real Raft consensus (no mocking Raft per testing guidelines)
