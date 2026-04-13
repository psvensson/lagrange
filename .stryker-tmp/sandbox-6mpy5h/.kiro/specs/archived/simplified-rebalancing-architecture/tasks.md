# Implementation Plan: Simplified Rebalancing Architecture

## Overview

This implementation plan migrates the current scattered rebalancing architecture to a simplified design with single state ownership, RPC abstraction over message groups, and a persistent operation log. The migration is done in phases to allow gradual rollout.

## Tasks

- [x] 1. Create unified ReplicaStatus enum and Operation types
  - [x] 1.1 Create src/rebalancer/replica-status.js with unified ReplicaStatus enum
    - Define ReplicaStatus: PENDING, CREATING, SYNCING, ACTIVE, REMOVING, REMOVED, FAILED
    - Define WORKFLOW_STEP_TO_STATUS mapping
    - Define Operation type with all required fields
    - _Requirements: 5.1, 5.2_

  - [x] 1.2 Write property test for ReplicaStatus enum completeness
    - **Property: ReplicaStatus enum contains all required values**
    - **Validates: Requirements 5.2**

- [x] 2. Implement RPCClient over message groups
  - [x] 2.1 Create src/transport/rpc-client.js
    - Implement call() method with correlation ID and timeout
    - Implement handleResponse() for response matching
    - Track pending requests with timeout cleanup
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 2.2 Write property test for RPC correlation correctness
    - **Property 3: RPC Correlation Correctness**
    - **Validates: Requirements 3.3, 3.4**

  - [x] 2.3 Write property test for RPC timeout behavior
    - **Property 4: RPC Timeout Behavior**
    - **Validates: Requirements 3.2, 3.4**

- [x] 3. Create replica_operations system table
  - [x] 3.1 Add replica_operations schema to system-table-schemas.js
    - Define table schema with all required columns
    - Add indexes for status, partition_id, created_at
    - _Requirements: 9.1, 9.2_

  - [x] 3.2 Update bootstrap to create replica_operations table
    - Add to system table creation sequence
    - _Requirements: 9.1_

- [x] 4. Checkpoint - Ensure foundation is solid
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement RebalanceCoordinator
  - [x] 5.1 Create src/rebalancer/rebalance-coordinator.js
    - Implement createOperation() with persistence
    - Implement executeOperation() using RPCClient
    - Implement updateStep() with logging
    - Implement timeout checking
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.1, 6.2_

  - [x] 5.2 Write property test for operation record completeness
    - **Property 2: Operation Record Completeness**
    - **Validates: Requirements 2.2, 2.3, 2.4**

  - [x] 5.3 Write property test for ADD workflow step progression
    - **Property 5: ADD Workflow Step Progression**
    - **Validates: Requirements 4.1, 4.3**

  - [x] 5.4 Write property test for REMOVE workflow step progression
    - **Property 6: REMOVE Workflow Step Progression**
    - **Validates: Requirements 4.2, 4.3**

  - [x] 5.5 Write property test for timeout triggers failure
    - **Property 7: Timeout Triggers Failure**
    - **Validates: Requirements 6.2**

- [x] 6. Implement ReplicaHandler
  - [x] 6.1 Create src/node/replica-handler.js
    - Implement handleCreateReplica() with idempotency
    - Implement handleRemoveReplica() with idempotency
    - Implement async creation/removal with CDC status updates
    - _Requirements: 10.2_

  - [x] 6.2 Register ReplicaHandler with message router
    - Register at ${nodeId}/replica-handler address
    - Wire up RPC response handling
    - _Requirements: 3.1_

- [x] 7. Checkpoint - Core components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement recovery handling
  - [x] 8.1 Add handleRecovery() to RebalanceCoordinator
    - Query replica_operations for incomplete operations
    - Mark SENDING/CREATING as FAILED
    - Reconcile SYNCING operations
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 8.2 Write property test for recovery handles incomplete operations
    - **Property 8: Recovery Handles Incomplete Operations**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 8.3 Write property test for no orphaned replicas after recovery
    - **Property 9: No Orphaned Replicas After Recovery**
    - **Validates: Requirements 7.4**

- [x] 9. Implement operation log persistence
  - [x] 9.1 Add persistOperation() to RebalanceCoordinator
    - Insert/update replica_operations via CDC
    - Include all required fields
    - _Requirements: 9.1, 9.2_

  - [x] 9.2 Add loadIncompleteOperations() for recovery
    - Query operations not in terminal state
    - _Requirements: 7.1_

  - [x] 9.3 Write property test for operation log persistence
    - **Property 10: Operation Log Persistence**
    - **Validates: Requirements 9.1, 9.2**

- [x] 10. Integrate with existing system
  - [x] 10.1 Update UnifiedRebalancer to use RebalanceCoordinator
    - Delegate operation execution to coordinator
    - Remove pendingMoves tracking (coordinator owns this)
    - _Requirements: 2.5_

  - [x] 10.2 Update ReplicaLifecycleManager to use ReplicaHandler
    - Simplify to just call ReplicaHandler methods
    - Remove local state tracking
    - _Requirements: 1.1, 1.2_

  - [x] 10.3 Remove ReplicaStateMachine usage
    - Coordinator now owns state tracking
    - Keep ReplicaStateMachine for backward compatibility but mark deprecated
    - _Requirements: 1.1, 1.3_

- [x] 11. Update Admin CLI
  - [x] 11.1 Add operation log view to Admin CLI
    - Display in-flight operations with workflow steps
    - Show operation history
    - _Requirements: 4.4, 9.3_

- [x] 12. Final checkpoint - Full integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Cleanup and documentation
  - [x] 13.1 Update design documentation with new architecture
    - Document component responsibilities
    - Document message flow
    - _Requirements: 10.4_

  - [x] 13.2 Add deprecation notices to old components
    - Mark ReplicaStateMachine as deprecated
    - Mark old status enums as deprecated
    - _Requirements: 5.3, 5.4_

## Notes

- All tasks including property-based tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The migration preserves backward compatibility during transition
- Feature flags can be used to gradually enable new components

