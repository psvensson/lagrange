# Implementation Plan: Replica Lifecycle State Machine

## Overview

This implementation plan creates a formal state machine for replica lifecycle management. The implementation follows an incremental approach: first creating the core state machine, then integrating it with existing components, and finally adding observability features.

## Tasks

- [x] 1. Create ReplicaStateMachine core class
  - Create new file `src/node/replica-state-machine.js`
  - Define state constants and valid transitions matrix
  - Implement `transition()` method with validation
  - Implement `isValidTransition()` method
  - Implement `getState()` and `getStateCounts()` methods
  - Export class and constants
  - _Requirements: 1.1, 1.2, 1.3, 2.1-2.8_

- [x] 1.1 Write property test for valid transition enforcement
  - **Property 1: Valid Transition Enforcement**
  - **Validates: Requirements 1.2, 1.3**

- [x] 2. Add state tracking and entry time recording
  - Implement `ReplicaState` data structure
  - Track entry time for transitional states
  - Implement `getTransitionalReplicas()` method
  - Add previous state tracking for debugging
  - _Requirements: 6.1_

- [x] 2.1 Write property test for entry time tracking
  - **Property 9: Entry Time Tracking**
  - **Validates: Requirements 6.1**

- [x] 3. Add event emission for state transitions
  - Extend EventEmitter for state change events
  - Emit events with all required fields (replica_id, partition_id, node_id, previous_state, new_state, timestamp, trigger_reason)
  - Include error details for failed state transitions
  - Ensure synchronous emission before transition completes
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 3.1 Write property test for event emission completeness
  - **Property 8: Event Emission Completeness**
  - **Validates: Requirements 5.1, 5.3**

- [x] 4. Checkpoint - Ensure core state machine tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add timeout handling
  - Implement configurable timeouts per state
  - Add `startTimeoutChecker()` and `stopTimeoutChecker()` methods
  - Implement automatic transition to `failed` on timeout
  - Add timeout reason to error message
  - _Requirements: 6.2, 6.3, 6.4, 6.5_

- [x] 5.1 Write property test for timeout-triggered failures
  - **Property 10: Timeout-Triggered Failures**
  - **Validates: Requirements 6.2, 6.3, 6.4, 6.5**

- [x] 6. Add concurrent operation limits
  - Track counts of replicas in transitional states
  - Implement `canStartOperation()` method
  - Add configurable limits for add and remove operations
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 6.1 Write property test for state count accuracy
  - **Property 11: State Count Accuracy**
  - **Validates: Requirements 7.1**

- [x] 6.2 Write property test for concurrent operation limits
  - **Property 12: Concurrent Operation Limits**
  - **Validates: Requirements 7.2, 7.3**

- [x] 7. Add metrics collection
  - Track transition counts per state pair
  - Track time spent in each state
  - Track failure counts and timeout counts
  - Track peak concurrent operations
  - Implement `getMetrics()` method
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 7.1 Write property test for metrics accuracy
  - **Property 14: Metrics Accuracy**
  - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

- [x] 8. Checkpoint - Ensure state machine feature tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integrate with ReplicaLifecycleManager
  - Inject ReplicaStateMachine into ReplicaLifecycleManager
  - Update `handleCreateReplica()` to use state machine transitions
  - Update `handleRemoveReplica()` to use state machine transitions
  - Implement idempotent operation handling
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 9.1 Write property test for idempotent operations
  - **Property 13: Idempotent Operations**
  - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 10. Integrate with UnifiedRebalancer
  - Inject ReplicaStateMachine into UnifiedRebalancer
  - Update `calculateMoves()` to query state machine
  - Prevent duplicate ADD moves for transitional replicas
  - Prevent duplicate REMOVE moves for removing replicas
  - Generate cleanup moves for failed replicas
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 10.1 Write property test for no duplicate ADD moves
  - **Property 3: No Duplicate ADD Moves for Transitional Replicas**
  - **Validates: Requirements 3.2**

- [x] 10.2 Write property test for no duplicate REMOVE moves
  - **Property 4: No Duplicate REMOVE Moves for Removing Replicas**
  - **Validates: Requirements 3.3**

- [x] 10.3 Write property test for cleanup moves
  - **Property 5: Cleanup Moves for Failed Replicas**
  - **Validates: Requirements 3.4**

- [x] 11. Add CDC persistence for state transitions
  - Update state machine to persist via CDCIntegrationService
  - Add state_entered_at, previous_state, trigger_reason columns to services table
  - Ensure persistence completes before transition returns
  - _Requirements: 4.1_

- [x] 11.1 Write property test for state persistence
  - **Property 6: State Persistence via CDC**
  - **Validates: Requirements 4.1**

- [x] 12. Checkpoint - Ensure integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Add node recovery handling
  - Implement `handleNodeRecovery()` in state machine
  - Query services table for replicas in transitional states
  - Transition creating/syncing replicas to failed
  - Complete removal for removing replicas
  - _Requirements: 4.2, 4.3, 4.4_

- [x] 13.1 Write property test for recovery state handling
  - **Property 7: Recovery State Handling**
  - **Validates: Requirements 4.3, 4.4**

- [x] 14. Update Admin CLI services view
  - Add color coding for replica states
  - Display time-in-state for transitional replicas
  - Show failure reason for failed replicas
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 15. Add state transition history command to Admin CLI
  - Implement `history <replica_id>` command
  - Query logs table for state transition events
  - Display chronological transition history
  - _Requirements: 8.4_

- [x] 16. Wire up state machine in BootstrapService
  - Create ReplicaStateMachine instance during bootstrap
  - Pass to ReplicaLifecycleManager and UnifiedRebalancer
  - Register existing replicas with state machine
  - _Requirements: 1.4_

- [-] 17. Final checkpoint - Run full test suite
  - Run `npm test` to verify all tests pass
  - Verify no regressions in existing functionality
  - Ensure all property tests pass

## Notes

- All tasks including property tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The state machine is designed to be backward compatible with existing replica status values
