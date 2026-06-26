# Implementation Plan: Unified Remote Transport

## Overview

This implementation transforms the transport architecture to use WebSocket for all messages, including local ones via self-connection. The work is organized to maintain a working system throughout the migration.

## Tasks

- [x] 1. Refactor MessageRouter to remove local handler optimization
  - [x] 1.1 Remove `localHandlers` map from MessageRouter
    - Delete the `localHandlers` property from constructor
    - Remove all references to `localHandlers` in the class
    - _Requirements: 3.1, 3.4_
  - [x] 1.2 Remove `deliverLocal` method
    - Delete the `deliverLocal` method entirely
    - Update `deliver` to always use WebSocket path
    - _Requirements: 3.2, 3.3, 3.4_
  - [x] 1.3 Update `deliver` method to always use WebSocket
    - Remove the local handler check at the start of deliver
    - Always extract nodeId and use connection
    - _Requirements: 3.2, 9.1_
  - [x] 1.4 Write property test for uniform delivery path
    - **Property 3: Uniform WebSocket Delivery**
    - **Validates: Requirements 2.4, 3.2, 3.3, 9.3**

- [x] 2. Implement self-connection (loopback)
  - [x] 2.1 Add `connectToSelf` method to MessageRouter
    - Create method that connects to `ws://localhost:${this.wsPort}`
    - Use same connection handling as remote nodes
    - _Requirements: 2.1, 2.4_
  - [x] 2.2 Update `initialize` to establish self-connection
    - Call `connectToSelf` after `startServer`
    - Fail initialization if self-connection fails
    - _Requirements: 2.2, 8.2_
  - [x] 2.3 Handle self-disconnection as fatal error
    - Emit 'selfDisconnect' event instead of reconnecting
    - Do not attempt automatic reconnection for self
    - _Requirements: 2.1_
  - [x] 2.4 Write unit test for self-connection establishment
    - Verify self-connection exists after initialize
    - Verify messages to self go through WebSocket
    - _Requirements: 2.1, 2.2_

- [x] 3. Implement unified address format
  - [x] 3.1 Add `parseAddress` method to MessageRouter
    - Split address by '/' and return {nodeId, entityType, entityId}
    - Handle malformed addresses gracefully
    - _Requirements: 1.2, 9.1_
  - [x] 3.2 Add `isValidAddress` method to MessageRouter
    - Validate format is `nodeId/entityType/entityId`
    - Validate entityType is one of valid types
    - _Requirements: 1.1, 1.3_
  - [x] 3.3 Update `register` to validate address format
    - Call `isValidAddress` before storing handler
    - Throw error for invalid addresses
    - _Requirements: 5.1_
  - [x] 3.4 Write property test for address format validation
    - **Property 1: Address Format and Parsing**
    - **Validates: Requirements 1.1, 1.2, 1.3, 9.1, 10.1, 10.3**

- [x] 4. Update handler storage to use address-based routing
  - [x] 4.1 Rename internal handler storage for clarity
    - Change from `localHandlers` to `handlers` (if not already done)
    - Update all internal references
    - _Requirements: 5.2_
  - [x] 4.2 Update `handleServiceMessage` to use handlers map
    - Look up handler by targetAddress
    - Invoke handler and send ACK with result
    - _Requirements: 5.2, 5.3_
  - [x] 4.3 Write property test for routing correctness
    - **Property 4: Routing Correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 5. Checkpoint - Verify MessageRouter changes
  - Ensure all tests pass, ask the user if questions arise.
  - Run existing MessageRouter tests
  - Verify self-connection works

- [x] 6. Remove MessageGroupTransport
  - [x] 6.1 Update BootstrapService to not create MessageGroupTransport
    - Remove `messageGroupTransport` creation
    - Use MessageRouter directly for all services
    - _Requirements: 4.1, 4.3_
  - [x] 6.2 Update NodeJoiningService to not use MessageGroupTransport
    - Remove `messageGroupTransport` references
    - Use MessageRouter directly
    - _Requirements: 4.1_
  - [x] 6.3 Update MessageGroupService to use MessageRouter directly
    - Change transport parameter to accept MessageRouter
    - Update all transport.deliver calls
    - _Requirements: 4.2_
  - [x] 6.4 Update PartitionService to use MessageRouter directly
    - Change transport parameter to accept MessageRouter
    - Update all transport.deliver calls
    - _Requirements: 4.2_
  - [x] 6.5 Delete MessageGroupTransport file
    - Remove `src/transport/message-group-transport.js`
    - Remove all imports of MessageGroupTransport
    - _Requirements: 4.1, 10.2_

- [x] 7. Update service addresses to unified format
  - [x] 7.1 Update MessageGroupService registration addresses
    - Change from `replicaId` to `${nodeId}/message-group/${replicaId}`
    - Update all address references in the service
    - _Requirements: 1.1, 5.1_
  - [x] 7.2 Update PartitionService registration addresses
    - Change from `replicaId` to `${nodeId}/partition/${replicaId}`
    - Update all address references in the service
    - _Requirements: 1.1, 5.1_
  - [x] 7.3 Update ReplicaLifecycleManager registration address
    - Change to `${nodeId}/lifecycle/manager`
    - Update all address references
    - _Requirements: 1.1, 5.1_
  - [x] 7.4 Update all inter-service message targets
    - Update Raft message targets to use unified format
    - Update lifecycle message targets to use unified format
    - _Requirements: 1.1, 10.3_

- [x] 8. Checkpoint - Verify service address changes
  - Ensure all tests pass, ask the user if questions arise.
  - Run integration tests
  - Verify cross-node communication works

- [x] 9. Update bootstrap sequence
  - [x] 9.1 Update BootstrapService to start server first
    - Move WebSocket server start to beginning of phaseInfrastructure
    - _Requirements: 8.1_
  - [x] 9.2 Update BootstrapService to establish self-connection
    - Call router.initialize() which handles self-connection
    - Fail bootstrap if self-connection fails
    - _Requirements: 8.2, 8.4_
  - [x] 9.3 Update BootstrapService to create services after self-connection
    - Ensure services created only after router.initialize() completes
    - _Requirements: 8.3_
  - [x] 9.4 Write unit test for bootstrap sequence
    - Verify ordering: server → self-connect → services
    - Verify bootstrap fails if self-connection fails
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 10. Update NodeJoiningService for unified transport
  - [x] 10.1 Update NodeJoiningService bootstrap sequence
    - Follow same pattern as BootstrapService
    - Start server, self-connect, then create services
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 10.2 Update lifecycle message addressing
    - Use `${targetNodeId}/lifecycle/manager` for CREATE_REPLICA
    - Use unified addresses for all lifecycle messages
    - _Requirements: 1.1, 7.1_

- [x] 11. Update tests to use unified transport
  - [x] 11.1 Update MockWebSocketTransport test helper
    - Ensure it implements the simplified MessageRouter interface
    - Remove any MessageGroupTransport-specific methods
    - _Requirements: 4.1_
  - [x] 11.2 Update integration tests for unified addresses
    - Change all address assertions to unified format
    - Update test setup to use new bootstrap sequence
    - _Requirements: 1.1, 10.3_
  - [x] 11.3 Write property test for delivery semantics
    - **Property 5: Delivery Semantics**
    - **Validates: Requirements 6.2, 7.1, 7.2, 7.3, 7.4**

- [x] 12. Clean up legacy code
  - [x] 12.1 Remove InMemoryTransport if still present
    - Delete `src/transport/in-memory-transport.js` if exists
    - Remove all imports
    - _Requirements: 10.2_
  - [x] 12.2 Remove any remaining fallback logic
    - Search for and remove any "fallback" delivery code
    - Remove any "try local first" patterns
    - _Requirements: 3.2, 7.4_
  - [x] 12.3 Remove `isSelfHostedGroup` flag from services
    - This optimization is no longer needed
    - Remove from MessageGroupService and PartitionService
    - _Requirements: 3.3_

- [x] 13. Final checkpoint - Full test suite
  - Ensure all tests pass, ask the user if questions arise.
  - Run full test suite
  - Verify node joining works end-to-end
  - Verify replica rebalancing works

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The migration maintains a working system throughout
