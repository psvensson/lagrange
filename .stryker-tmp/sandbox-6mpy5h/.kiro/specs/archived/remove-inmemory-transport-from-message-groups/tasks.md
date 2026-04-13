# Implementation Plan: Remove In-Memory Transport from Message Groups

## Overview

This implementation removes in-memory transport references from MessageGroupService and updates Bootstrap/Node Joining services to use WebSocket-based transport exclusively. The changes are made incrementally to ensure each step is testable.

## Tasks

- [x] 1. Update MessageGroupService constructor to require WebSocket transport
  - [x] 1.1 Add transport validation in constructor
    - Add check that transport option is provided
    - Add `isWebSocketBasedTransport()` method to validate transport type
    - Throw descriptive errors for missing or invalid transport
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Write property test for transport type validation
    - **Property 1: Transport Type Validation**
    - **Validates: Requirements 1.2**
  - [x] 1.3 Remove fallback event emission from attemptDirectDelivery
    - Remove the `else` branch that emits 'message' event when transport is null
    - Add error throwing when transport is null at runtime
    - Log error before throwing
    - _Requirements: 1.3, 4.1, 4.4_
  - [x] 1.4 Write property test for no silent delivery failures
    - **Property 2: No Silent Delivery Failures**
    - **Validates: Requirements 4.3, 1.3**

- [x] 2. Update Raft consensus to require WebSocket transport
  - [x] 2.1 Update startElection to throw when transport unavailable
    - Remove fallback event emission for requestVote
    - Add error throwing with specific message for Raft consensus
    - Log error before throwing
    - _Requirements: 4.2, 4.4_
  - [x] 2.2 Write property test for error message consistency
    - **Property 3: Error Message Consistency**
    - **Validates: Requirements 4.1, 4.2**

- [x] 3. Checkpoint - Verify MessageGroupService changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update Bootstrap Service transport usage
  - [x] 4.1 Refactor phaseInfrastructure to initialize MessageGroupTransport first
    - Create MessageGroupTransport before message groups
    - Keep InMemoryTransport only for partition services (rename to partitionTransport)
    - Remove InMemoryTransport usage for message group communication
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 4.2 Update phaseMessageGroups to use MessageGroupTransport
    - Pass messageGroupTransport to MessageGroupService constructor
    - Register message group handlers with MessageRouter instead of InMemoryTransport
    - _Requirements: 2.1, 2.2_
  - [x] 4.3 Add error handling for MessageRouter initialization failure
    - Catch MessageRouter initialization errors
    - Log error with context and fail bootstrap
    - _Requirements: 2.4_

- [x] 5. Update Node Joining Service transport usage
  - [x] 5.1 Refactor to use MessageGroupTransport for message groups
    - Create MessageGroupTransport for message group communication
    - Keep InMemoryTransport only for partition services
    - _Requirements: 3.1, 3.2_
  - [x] 5.2 Add error handling for transport unavailability
    - Throw clear error when WebSocket transport not available
    - _Requirements: 3.3_

- [x] 6. Checkpoint - Verify Bootstrap and Node Joining changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update existing tests to use mock WebSocket transport
  - [x] 7.1 Create MockWebSocketTransport test helper
    - Implement deliver(), initialize(), shutdown() methods
    - Add setMessageRouter() for MessageGroupTransport compatibility
    - Add configurable failure modes for testing error paths
    - _Requirements: 5.1, 5.3_
  - [x] 7.2 Update message-group-service.test.js to use mock transport
    - Replace InMemoryTransport with MockWebSocketTransport
    - Update test setup to provide valid transport
    - _Requirements: 5.1, 5.2_
  - [x] 7.3 Update integration tests that use MessageGroupService
    - Update cross-node-ack-delivery.integration.test.js
    - Update multi-node-cluster.integration.test.js
    - _Requirements: 5.1, 5.2_

- [ ] 8. Verify InMemoryTransport preserved for partition services
  - [ ] 8.1 Verify InMemoryTransport module still exists and exports correctly
    - Check src/transport/in-memory-transport.js exists
    - Check src/transport/index.js exports InMemoryTransport
    - _Requirements: 6.1_
  - [ ] 8.2 Verify partition services can still use InMemoryTransport
    - Check PartitionService tests still work with InMemoryTransport
    - _Requirements: 6.2_

- [ ] 9. Final checkpoint - Full test suite verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- InMemoryTransport is preserved for partition services - only message groups are affected
