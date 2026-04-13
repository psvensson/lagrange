# Implementation Plan: Simplified Cluster Architecture

## Overview

This implementation plan transforms the cluster architecture to use unified addressing, explicit node lifecycle states, immutable assignment epochs, and pull-based replica assignment. The implementation is structured to build foundational components first, then integrate them into the existing system.

## Tasks

- [x] 1. Implement Unified Address Manager
  - [x] 1.1 Create AddressManager class with parse, format, and validate methods
    - Implement `parse(address)` returning `{nodeId, serviceType, serviceId}`
    - Implement `format(nodeId, serviceType, serviceId)` returning canonical string
    - Implement `validate(address)` returning `{valid, error?}`
    - Add helper methods `getNodeId()`, `getServiceType()`, `getServiceId()`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [x] 1.2 Write property test for address round-trip
    - **Property 1: Address Round-Trip Consistency**
    - **Validates: Requirements 1.5, 1.6, 1.7**

  - [x] 1.3 Write property test for malformed address rejection
    - **Property 2: Malformed Address Rejection**
    - **Validates: Requirements 1.2, 1.3**

- [x] 2. Implement Node Lifecycle State Machine
  - [x] 2.1 Create NodeLifecycleStateMachine class
    - Define NodeState enum: STARTING, CONNECTING, DISCOVERING, JOINING, SYNCING, READY, DRAINING, STOPPED
    - Define VALID_TRANSITIONS map
    - Implement `getState()`, `transition(newState)`, `isValidTransition(from, to)`
    - Implement `isReady()`, `isDraining()`, `isJoining()`
    - Emit 'stateChange' events on valid transitions
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Write property test for state transition validity
    - **Property 3: State Transition Validity**
    - **Validates: Requirements 2.3**

  - [x] 2.3 Write property test for state change event emission
    - **Property 4: State Change Event Emission**
    - **Validates: Requirements 2.2**

- [x] 3. Implement Assignment Epoch Manager
  - [x] 3.1 Create AssignmentEpoch data structure
    - Define epoch structure: `{epoch, assignments, timestamp, proposedBy}`
    - Implement immutable epoch creation
    - _Requirements: 3.1, 3.3_

  - [x] 3.2 Create AssignmentEpochManager class
    - Implement `getCurrentEpoch()`, `getPartitionAssignments(partitionId)`
    - Implement `getNodeAssignments(nodeId)`
    - Implement `proposeEpoch(expectedEpoch, newAssignments)` with CAS
    - Implement `applyEpoch(epoch)` for CDC updates
    - _Requirements: 3.2, 3.6, 3.7, 3.8_

  - [x] 3.3 Write property test for epoch monotonic increment
    - **Property 5: Epoch Monotonic Increment**
    - **Validates: Requirements 3.2, 3.8**

  - [x] 3.4 Write property test for epoch immutability
    - **Property 6: Epoch Immutability**
    - **Validates: Requirements 3.3**

  - [x] 3.5 Write property test for epoch CAS correctness
    - **Property 7: Epoch Compare-and-Swap Correctness**
    - **Validates: Requirements 3.6**

- [x] 4. Checkpoint - Core Components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement State-Aware Rebalancer
  - [x] 5.1 Create StateAwareRebalancer class
    - Implement `shouldConsiderNode(nodeId, nodeState)` - only READY nodes
    - Implement `calculateMoves(currentEpoch, nodeStates)`
    - Implement `onNodeStateChange(nodeId, oldState, newState)`
    - Integrate with existing rebalancer logic
    - _Requirements: 5.3, 5.6, 5.8_

  - [x] 5.2 Write property test for rebalancer state filtering
    - **Property 8: Rebalancer Respects Node States**
    - **Validates: Requirements 5.3, 5.6**

  - [x] 5.3 Write property test for draining node handling
    - **Property 9: Rebalancer Moves From Draining Nodes**
    - **Validates: Requirements 5.8**

  - [x] 5.4 Write property test for placement policy compliance
    - **Property 12: Placement Policy Compliance**
    - **Validates: Requirements 6.5**

- [x] 6. Implement Pull-Based Replica Assigner
  - [x] 6.1 Create PullBasedReplicaAssigner class
    - Implement `analyzeAndPropose(currentEpoch, thisNodeId, allReadyNodes, tablePolicies)`
    - Implement `calculateReplicasToPull(currentAssignments, thisNodeId, allNodes)`
    - Implement `validateAgainstPolicies(proposedAssignments, tablePolicies)`
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 6.2 Implement replica creation and sync
    - Implement `createLocalReplicas(partitionIds)`
    - Implement `syncReplicaData(partitionId, sourceNodes)`
    - _Requirements: 4.6, 4.7, 4.9, 4.10_

  - [x] 6.3 Write property test for join assignment strategy
    - **Property 14: Join Assignment Relieves Overloaded Nodes**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x] 6.4 Write property test for rebalancer batching
    - **Property 15: Rebalancer Batches Moves**
    - **Validates: Requirements 6.4**

- [x] 7. Checkpoint - Rebalancing Components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update System Cache for Epoch Support
  - [x] 8.1 Add epoch tracking to SystemTableCache
    - Add `currentEpoch` field
    - Implement `getEpoch()`, `updateFromEpoch(epoch)`
    - Implement `getReadyNodes()` filtering by state
    - _Requirements: 7.1, 7.2_

  - [x] 8.2 Implement epoch-based cache updates
    - Reject updates from older epochs
    - Atomic cache updates on epoch change
    - _Requirements: 7.5_

  - [x] 8.3 Write property test for cache state filtering
    - **Property 10: Cache State Filtering**
    - **Validates: Requirements 5.9**

  - [x] 8.4 Write property test for cache epoch rejection
    - **Property 13: Cache Rejects Old Epochs**
    - **Validates: Requirements 7.5**

- [x] 9. Integrate Node Lifecycle with Existing Services
  - [x] 9.1 Update NodeService to use NodeLifecycleStateMachine
    - Replace implicit state tracking with explicit state machine
    - Emit state changes to nodes table via CDC
    - _Requirements: 5.1, 5.4, 5.7_

  - [x] 9.2 Update NodeJoiningService for pull-based assignment
    - Use PullBasedReplicaAssigner instead of push-based RPC
    - Transition through JOINING → SYNCING → READY states
    - _Requirements: 4.1, 4.6, 4.7_

  - [x] 9.3 Update BootstrapService for epoch-based initialization
    - Fetch current epoch during DISCOVERING phase
    - Propose epoch during JOINING phase
    - _Requirements: 3.4, 4.1_

- [x] 10. Migrate Existing Address Usage
  - [x] 10.1 Update MessageGroupService to use unified addresses
    - Replace partial addresses with full unified format
    - Use AddressManager for all address operations
    - _Requirements: 1.4_

  - [x] 10.2 Update PartitionService to use unified addresses
    - Replace partial addresses with full unified format
    - Use AddressManager for all address operations
    - _Requirements: 1.4_

  - [x] 10.3 Update RaftTransportAdapter to use unified addresses
    - Replace partial addresses with full unified format
    - Use AddressManager for all address operations
    - _Requirements: 1.4_

- [x] 11. Checkpoint - Integration Complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Update CDC Handlers for Epoch Events
  - [x] 12.1 Add epoch change CDC handler
    - Listen for epoch changes in config table
    - Update local AssignmentEpochManager on epoch change
    - _Requirements: 3.5_

  - [x] 12.2 Update node state CDC handler
    - Propagate node state changes (JOINING, READY, DRAINING)
    - Trigger rebalancer on state changes
    - _Requirements: 5.2, 5.5_

- [x] 13. Implement Concurrent Epoch Coordination
  - [x] 13.1 Add epoch proposal conflict resolution
    - Handle CAS failures with retry logic
    - Implement exponential backoff for retries
    - _Requirements: 6.2, 6.3_

  - [x] 13.2 Write property test for concurrent epoch proposals
    - **Property 11: Concurrent Epoch Proposals**
    - **Validates: Requirements 6.3**

- [x] 14. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Run full test suite to verify no regressions

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Implementation builds foundational components (1-3) before integration (9-12)
