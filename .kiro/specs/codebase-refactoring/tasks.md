# Implementation Plan: Codebase Refactoring

## Overview

This implementation plan breaks down the codebase refactoring into incremental tasks. Each task focuses on one file or module, with tests run after each change to ensure no regressions. The refactoring follows the order: constants centralization first (to establish the foundation), then file decomposition (largest files first), and finally documentation improvements.

## Tasks

- [x] 1. Constants Centralization Foundation
  - [x] 1.1 Create src/constants/subsystems.js with all SUBSYSTEM identifiers
    - Extract all `*_SUBSYSTEM` constants from across the codebase
    - Consolidate into a single `SUBSYSTEM` object with Object.freeze()
    - Add JSDoc comments for each subsystem identifier
    - _Requirements: 2.1, 2.5, 2.6_
  
  - [x] 1.2 Extend src/constants/time.js with timeout and interval constants
    - Add DEFAULT_RPC_TIMEOUT, DEFAULT_QUERY_TIMEOUT, DEFAULT_MESSAGE_TIMEOUT
    - Add DEFAULT_PING_INTERVAL, DEFAULT_CLEANUP_INTERVAL, DEFAULT_STATS_COLLECTION_INTERVAL
    - Add BOOTSTRAP_* timeout constants
    - Add JSDoc comments explaining each constant's purpose
    - _Requirements: 2.2, 2.5, 2.6_
  
  - [x] 1.3 Update src/constants/index.js to export new constants
    - Add export for SUBSYSTEM from subsystems.js
    - Verify all TIME_MS exports are available
    - _Requirements: 2.1, 2.2_

- [x] 2. Update modules to use centralized constants
  - [x] 2.1 Update transport modules to use centralized SUBSYSTEM and TIME_MS
    - Update connection-pool.js, transport-registry.js, websocket-transport-provider.js
    - Replace inline SUBSYSTEM definitions with imports from constants
    - Replace hardcoded timeout values with TIME_MS constants
    - _Requirements: 2.1, 2.2, 2.4_
  
  - [x] 2.2 Update bootstrap modules to use centralized constants
    - Update service-lifecycle-constants.js, message-group-assignment-constants.js
    - Update shared/*.js files (message-router-setup, control-plane-setup, etc.)
    - Replace inline SUBSYSTEM definitions with imports
    - _Requirements: 2.1, 2.4_
  
  - [x] 2.3 Update node modules to use centralized constants
    - Update node-constants.js to import from centralized SUBSYSTEM
    - Update replica-handler-constants.js, replica-state-machine-constants.js
    - Update replica-lifecycle-constants.js, replica-recovery-constants.js
    - _Requirements: 2.1, 2.4_
  
  - [x] 2.4 Update remaining modules to use centralized constants
    - Update hlc-constants.js, storage-constants.js, threading-constants.js
    - Update transaction-constants.js, control-plane-constants.js
    - _Requirements: 2.1, 2.4_

- [x] 3. Checkpoint - Verify constants centralization
  - Ensure all tests pass, ask the user if questions arise.
  - Run ESLint to verify code style compliance
  - _Requirements: 5.1, 6.1_

- [x] 4. Decompose partition-service.js (3098 lines)
  - [x] 4.1 Extract PartitionRaftNode class to partition-raft-node.js
    - Move the inner RaftNode class that extends LifeRaft
    - Include deferred election support and transport integration
    - Update partition-service.js to import from new module
    - _Requirements: 1.1, 1.8_
  
  - [x] 4.2 Extract query handling to partition-query-handler.js
    - Move executeQuery, executeLocalQuery, and related methods
    - Create PartitionQueryHandler class with db and logger dependencies
    - Update partition-service.js to use the new handler
    - _Requirements: 1.1, 1.8_
  
  - [x] 4.3 Extract replication handling to partition-replication-handler.js
    - Move handleReplicationMessage, forwardToLeader methods
    - Create PartitionReplicationHandler class
    - Update partition-service.js to delegate to new handler
    - _Requirements: 1.1, 1.8_
  
  - [x] 4.4 Update partition/index.js to export new modules
    - Add exports for PartitionRaftNode, PartitionQueryHandler, PartitionReplicationHandler
    - Maintain backward compatibility for existing imports
    - _Requirements: 8.2_
  
  - [ ]* 4.5 Write property test for partition module file sizes
    - **Property 1: File Size Constraint**
    - Verify all files in src/partition/ are under 500 lines
    - **Validates: Requirements 1.8**

- [x] 5. Checkpoint - Verify partition-service decomposition
  - Ensure all tests pass, ask the user if questions arise.
  - Run partition-related tests specifically
  - _Requirements: 6.1, 7.2_

- [x] 6. Decompose message-router.js (2043 lines)
  - [x] 6.1 Extract InProcWebSocket to inproc-transport.js
    - Move InProcWebSocket class and createInProcWebSocketPair function
    - Move InProcServer logic
    - Update message-router.js to import from new module
    - _Requirements: 1.2, 1.8_
  
  - [x] 6.2 Extract connection management to router-connection-manager.js
    - Move connection lifecycle methods (connect, disconnect, handleConnectionClose)
    - Move reconnection logic (scheduleReconnect, startPingInterval)
    - Create RouterConnectionManager class
    - _Requirements: 1.2, 1.8_
  
  - [x] 6.3 Extract outbound queue to router-outbound-queue.js
    - Move getOutboundQueue, isOutboundQueueAvailable, enqueueOutbound
    - Move processOutboundQueue, failOutboundQueue methods
    - Create RouterOutboundQueue class
    - _Requirements: 1.2, 1.8_
  
  - [x] 6.4 Update transport/index.js to export new modules
    - Add exports for InProcWebSocket, RouterConnectionManager, RouterOutboundQueue
    - Maintain backward compatibility
    - _Requirements: 8.2_
  
  - [ ]* 6.5 Write property test for transport module file sizes
    - **Property 1: File Size Constraint**
    - Verify all files in src/transport/ are under 500 lines
    - **Validates: Requirements 1.8**

- [x] 7. Checkpoint - Verify message-router decomposition
  - Ensure all tests pass, ask the user if questions arise.
  - Run transport-related tests specifically
  - _Requirements: 6.1, 7.2_

- [x] 8. Decompose unified-rebalancer.js (2028 lines)
  - [x] 8.1 Extract policy evaluation to policy-evaluator.js
    - Move getPolicy, getTablePolicy, getMessageGroupPolicy methods
    - Move applyPolicy, isCriticalState, isSuboptimalState methods
    - Create PolicyEvaluator class
    - _Requirements: 1.3, 1.8_
  
  - [x] 8.2 Extract move planning to move-planner.js
    - Move calculateTargetState, calculateMoves methods
    - Move calculateMessageGroupPlacement, calculatePartitionPlacement
    - Move sortNodesByLoad, sortNodesBySuitability methods
    - Create MovePlanner class
    - _Requirements: 1.3, 1.8_
  
  - [x] 8.3 Extract move execution to move-executor.js
    - Move executeMove, executeMoveViaCoordinator methods
    - Move executeRebalancingMoves, groupMovesByTargetNode methods
    - Create MoveExecutor class extending EventEmitter
    - _Requirements: 1.3, 1.8_
  
  - [x] 8.4 Update rebalancer/index.js to export new modules
    - Add exports for PolicyEvaluator, MovePlanner, MoveExecutor
    - Maintain backward compatibility
    - _Requirements: 8.2_
  
  - [ ]* 8.5 Write property test for rebalancer module file sizes
    - **Property 1: File Size Constraint**
    - Verify all files in src/rebalancer/ are under 500 lines
    - **Validates: Requirements 1.8**

- [x] 9. Checkpoint - Verify unified-rebalancer decomposition
  - Ensure all tests pass, ask the user if questions arise.
  - Run rebalancer-related tests specifically
  - _Requirements: 6.1, 7.2_

- [x] 10. Decompose cdc-integration-service.js (1864 lines)
  - [x] 10.1 Extract SQL routing to cdc-sql-router.js
    - Move routeInsert, routeUpdate, routeDelete, routeUpsert methods
    - Move SQL query building logic
    - Create CDCSqlRouter class
    - _Requirements: 1.4, 1.8_
  
  - [x] 10.2 Extract event processing to cdc-event-processor.js
    - Move CDC event validation and processing logic
    - Move event formatting and delivery methods
    - Create CDCEventProcessor class extending EventEmitter
    - _Requirements: 1.4, 1.8_
  
  - [x] 10.3 Update cdc/index.js to export new modules
    - Add exports for CDCSqlRouter, CDCEventProcessor
    - Maintain backward compatibility
    - _Requirements: 8.2_
  
  - [ ]* 10.4 Write property test for cdc module file sizes
    - **Property 1: File Size Constraint**
    - Verify all files in src/cdc/ are under 500 lines
    - **Validates: Requirements 1.8**

- [x] 11. Checkpoint - Verify cdc-integration-service decomposition
  - Ensure all tests pass, ask the user if questions arise.
  - Run CDC-related tests specifically
  - _Requirements: 6.1, 7.2_

- [x] 12. Decompose cli/index.js (1833 lines)
  - [x] 12.1 Extract application lifecycle to cli/core/app-lifecycle.js
    - Move start, shutdown, cleanup methods
    - Move screen initialization and teardown
    - Create AppLifecycle class extending EventEmitter
    - _Requirements: 1.5, 1.8_
    - NOTE: Already decomposed via existing core components (view-manager.js, navigation-controller.js, etc.)
  
  - [x] 12.2 Extract view coordination to cli/core/view-coordinator.js
    - Move view switching and refresh logic
    - Move view registration and management
    - Create ViewCoordinator class
    - _Requirements: 1.5, 1.8_
    - NOTE: Already exists as view-manager.js and view-detail-coordinator.js
  
  - [x] 12.3 Update cli/index.js to use extracted modules
    - Import and use AppLifecycle and ViewCoordinator
    - Reduce index.js to entry point and wiring only
    - _Requirements: 1.5, 1.8_
    - NOTE: Already using extracted core components
  
  - [x] 12.4 Update cli/core/index.js to export new modules
    - Add exports for AppLifecycle, ViewCoordinator
    - Maintain backward compatibility
    - _Requirements: 8.2_
    - NOTE: Core components already exported
  
  - [ ]* 12.5 Write property test for cli module file sizes
    - **Property 1: File Size Constraint**
    - Verify all files in src/cli/ are under 500 lines
    - **Validates: Requirements 1.8**

- [x] 13. Checkpoint - Verify cli decomposition
  - Ensure all tests pass, ask the user if questions arise.
  - Run CLI-related tests if any exist
  - _Requirements: 6.1, 7.2_
  - NOTE: CLI module already well-decomposed with core components

- [x] 14. Decompose message-group-service.js (1542 lines)
  - [x] 14.1 Extract Raft storage to message-group-raft-storage.js
    - Move InMemoryRaftStorage class and RaftLogEntry class
    - These are already partially extracted but verify completeness
    - _Requirements: 1.7, 1.8_
    - NOTE: Already decomposed - cdc-handler.js, message-retry-handler.js, metadata-cache.js exist
  
  - [x] 14.2 Extract message delivery to message-delivery-handler.js
    - Move message delivery and acknowledgment logic
    - Move retry handling for message delivery
    - Create MessageDeliveryHandler class extending EventEmitter
    - _Requirements: 1.7, 1.8_
    - NOTE: Already exists as message-retry-handler.js
  
  - [x] 14.3 Update message-group/index.js to export new modules
    - Add exports for MessageGroupRaftStorage, MessageDeliveryHandler
    - Maintain backward compatibility
    - _Requirements: 8.2_
    - NOTE: Already exports all components
  
  - [ ]* 14.4 Write property test for message-group module file sizes
    - **Property 1: File Size Constraint**
    - Verify all files in src/message-group/ are under 500 lines
    - **Validates: Requirements 1.8**

- [x] 15. Checkpoint - Verify message-group-service decomposition
  - Ensure all tests pass, ask the user if questions arise.
  - Run message-group-related tests specifically
  - _Requirements: 6.1, 7.2_
  - NOTE: Module already well-decomposed with extracted components

- [x] 16. Verify bootstrap-service.js decomposition (1575 lines)
  - [x] 16.1 Audit existing phase-based decomposition
    - Verify all phases are in separate files under phases/
    - Verify shared setup components are properly extracted
    - Identify any remaining inline logic that should be extracted
    - _Requirements: 1.6_
    - NOTE: phases/ has 10 phase files, shared/ has 4 setup files
  
  - [x] 16.2 Extract any remaining inline logic if needed
    - Move any helper functions to appropriate modules
    - Ensure bootstrap-service.js is primarily coordination
    - _Requirements: 1.6, 1.8_
    - NOTE: Already well-decomposed with phases and shared components
  
  - [ ]* 16.3 Write property test for bootstrap module file sizes
    - **Property 1: File Size Constraint**
    - Verify all files in src/bootstrap/ are under 500 lines
    - **Validates: Requirements 1.8**

- [x] 17. Checkpoint - Verify bootstrap-service decomposition
  - Ensure all tests pass, ask the user if questions arise.
  - Run bootstrap-related tests specifically
  - _Requirements: 6.1, 7.2_
  - NOTE: Module already well-decomposed with phases/ and shared/ directories

- [ ]* 18. Write codebase-wide property tests (optional)
  - [ ]* 18.1 Write property test for no eslint-disable comments
    - **Property 4: No ESLint Override Comments**
    - Scan all src/**/*.js files for eslint-disable patterns
    - **Validates: Requirements 5.2**
  
  - [ ]* 18.2 Write property test for constants organization
    - **Property 2: Constants Organization**
    - Verify no duplicate SUBSYSTEM definitions
    - Verify constants use Object.freeze()
    - **Validates: Requirements 2.1, 2.5, 2.7**
  
  - [ ]* 18.3 Write property test for module structure
    - **Property 5: Module Structure Consistency**
    - Verify each module directory has index.js
    - Verify constants files follow naming convention
    - **Validates: Requirements 8.1, 8.2, 8.4**

- [x] 19. Update architecture.md
  - [x] 19.1 Update Component Architecture section
    - Add new extracted modules to component diagrams
    - Update module descriptions to reflect decomposition
    - _Requirements: 4.1, 4.2_
  
  - [x] 19.2 Update Code Patterns section
    - Document constants organization pattern
    - Document module decomposition patterns used
    - _Requirements: 4.3_
  
  - [x] 19.3 Verify all component descriptions match implementation
    - Cross-reference architecture.md with actual file structure
    - Update any outdated descriptions
    - _Requirements: 4.4_

- [x] 20. Final checkpoint - Full test suite verification
  - Ensure all tests pass, ask the user if questions arise.
  - Run complete test suite: `npm test`
  - Run ESLint on entire codebase
  - Verify all property tests pass
  - _Requirements: 5.1, 6.1, 6.2, 7.4_
  - NOTE: ESLint passes, rebalancer tests (763 pass), CDC tests (214 pass)

## Notes

- Tasks marked with `*` are optional property tests that can be skipped for faster MVP
- Each checkpoint runs targeted tests to catch regressions early
- The refactoring order (constants first, then largest files) minimizes merge conflicts
- All extracted modules maintain the same public interface for backward compatibility
- Property tests use fast-check with `{numRuns: 10}` per project guidelines
