# Implementation Plan: Code Clarity and Maintainability

## Overview

This plan implements ten code clarity and maintainability improvements in phases. Each phase builds on previous work, with checkpoints to verify correctness. The implementation prioritizes foundational changes (constants, utilities) before dependent changes (patterns, decomposition).

## Tasks

- [x] 1. Consolidate Raft Role Constants
  - [x] 1.1 Remove duplicate RAFT_ROLE from src/policy/policy-constants.js
    - Import RAFT_ROLE from src/raft/constants.js instead of defining locally
    - Re-export for backward compatibility
    - Update all imports in policy module
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 1.2 Remove duplicate role definitions from src/partition/partition-constants.js
    - Import RAFT_ROLE from src/raft/constants.js
    - Remove PARTITION_SERVICE_ROLE if it duplicates RAFT_ROLE
    - Update all partition module imports
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 1.3 Create constants naming convention guide
    - Create src/constants/README.md
    - Document canonical locations for shared constants
    - Document module-specific vs shared constant patterns
    - _Requirements: 1.4_

- [x] 2. Implement Correlation ID System
  - [x] 2.1 Create correlation ID utilities
    - Create src/utils/correlation.js
    - Implement generateCorrelationId(), getOrCreateCorrelationId(), withCorrelationId()
    - Export CORRELATION_HEADER constant
    - _Requirements: 8.6_
  
  - [x] 2.2 Write property test for correlation ID generation
    - **Property 10: Correlation ID Presence**
    - Test that all messages get a correlationId (new or preserved)
    - **Validates: Requirements 8.1, 8.2, 8.3**
  
  - [x] 2.3 Integrate correlation IDs into MessageRouter
    - Modify send() to add correlationId to all messages
    - Preserve existing correlationId if present
    - Include correlationId in log messages
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [x] 2.4 Write property test for error response correlation IDs
    - **Property 11: Error Response Correlation ID**
    - Test that failed operations include correlationId in response
    - **Validates: Requirements 8.5**

- [x] 3. Checkpoint - Verify foundation changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Message Handler Registry Pattern
  - [x] 4.1 Create MessageHandlerRegistry class
    - Create src/partition/message-handler-registry.js
    - Implement register(), handle() methods
    - Return error for unknown message types
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [x] 4.2 Write property test for message handler routing
    - **Property 1: Message Handler Registry Routing**
    - Test that registered handlers are invoked correctly
    - **Validates: Requirements 2.1, 2.2**
  
  - [x] 4.3 Write unit test for unknown message type handling
    - **Property 2: Unknown Message Type Handling** (edge case)
    - Test error response for unregistered message types
    - **Validates: Requirements 2.3**
  
  - [x] 4.4 Integrate MessageHandlerRegistry into PartitionService
    - Replace switch statement with registry
    - Register handlers during initialization
    - _Requirements: 2.1, 2.4_

- [x] 5. Extract QueryRouter Class
  - [x] 5.1 Create QueryRouter class
    - Create src/query/query-router.js
    - Implement routeToPartition() with retry logic
    - Implement findServiceCandidates()
    - Implement leader redirect following
    - Implement timeout management
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [x] 5.2 Write property test for service candidate discovery
    - **Property 3: QueryRouter Service Candidate Discovery**
    - Test that valid candidates are returned for existing partitions
    - **Validates: Requirements 3.2**
  
  - [x] 5.3 Write property test for retry behavior
    - **Property 4: QueryRouter Retry Behavior**
    - Test exponential backoff and retry count
    - **Validates: Requirements 3.3**
  
  - [x] 5.4 Write property test for leader redirect
    - **Property 5: QueryRouter Leader Redirect Following**
    - Test that redirects are followed before exhausting retries
    - **Validates: Requirements 3.4**
  
  - [x] 5.5 Write property test for timeout enforcement
    - **Property 6: QueryRouter Timeout Enforcement**
    - Test that operations fail after timeout regardless of retry state
    - **Validates: Requirements 3.5**
  
  - [x] 5.6 Integrate QueryRouter into QueryExecutor
    - Delegate routing operations to QueryRouter
    - Remove routing logic from QueryExecutor
    - _Requirements: 3.6, 3.7_

- [x] 6. Checkpoint - Verify pattern implementations
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Phase Pattern Base Class
  - [x] 7.1 Create PhaseBase class
    - Create src/utils/phase-base.js
    - Implement execute() with event emission
    - Implement abstract run() method
    - Track phase timing
    - _Requirements: 4.4, 4.6_
  
  - [x] 7.2 Write property test for phase lifecycle events
    - **Property 8: Phase Lifecycle Event Emission**
    - Test that started/completed/failed events are emitted
    - **Validates: Requirements 4.6**
  
  - [x] 7.3 Create PhaseStateMachine class
    - Create src/utils/phase-state-machine.js
    - Implement transition validation
    - Emit events on transitions
    - _Requirements: 4.5_
  
  - [x] 7.4 Write property test for state machine transitions
    - **Property 7: Phase State Machine Transition Validation**
    - Test that invalid transitions throw, valid transitions succeed
    - **Validates: Requirements 4.5**

- [x] 8. Unify Error Message Patterns
  - [x] 8.1 Audit existing error message patterns
    - Identify string concatenation errors in src/
    - Document locations needing migration
    - _Requirements: 7.5_
  
  - [x] 8.2 Migrate error messages to function pattern
    - Update query module error messages
    - Update partition module error messages
    - Update transport module error messages
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [x] 9. Checkpoint - Verify error handling changes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Decompose PartitionService
  - [x] 10.1 Extract PartitionRaftStorage
    - Create src/partition/partition-raft-storage.js
    - Move Raft log storage operations
    - Maintain existing API
    - _Requirements: 6.1, 6.4, 6.6_
  
  - [x] 10.2 Extract PartitionCDCGenerator
    - Create src/partition/partition-cdc-generator.js
    - Move CDC event generation logic
    - Maintain existing API
    - _Requirements: 6.2, 6.4, 6.6_
  
  - [x] 10.3 Extract PartitionTransactionHandler
    - Create src/partition/partition-transaction-handler.js
    - Move transaction management logic
    - Maintain existing API
    - _Requirements: 6.3, 6.4, 6.6_
  
  - [x] 10.4 Update PartitionService to use extracted modules
    - Import and coordinate extracted modules
    - Remove extracted code from partition-service.js
    - _Requirements: 6.5_
  
  - [x] 10.5 Write property test for API equivalence
    - **Property 9: Extracted Module API Equivalence**
    - Test that operations produce equivalent results
    - **Validates: Requirements 6.6**

- [x] 11. Add Service Interface Documentation
  - [x] 11.1 Document QueryExecutor interface
    - Add JSDoc @interface, @constructor, @method, @fires annotations
    - Document required vs optional dependencies
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 11.2 Document PartitionService interface
    - Add JSDoc @interface, @constructor, @method, @fires annotations
    - Document required vs optional dependencies
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 11.3 Document MessageRouter interface
    - Add JSDoc @interface, @constructor, @method, @fires annotations
    - Document required vs optional dependencies
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 11.4 Document remaining service interfaces
    - SystemTableCache, CDCIntegrationService, UnifiedRebalancer
    - Ensure consistent format across all services
    - _Requirements: 5.5_

- [x] 12. Document Constants with Rationale
  - [x] 12.1 Add rationale comments to timing constants
    - Document src/constants/time.js values
    - Explain relationships between related values
    - _Requirements: 9.1, 9.4_
  
  - [x] 12.2 Add rationale comments to threshold constants
    - Document rebalancer thresholds
    - Document query timeouts and retry counts
    - _Requirements: 9.2, 9.3_
  
  - [x] 12.3 Ensure consistent documentation format
    - Review all constant files for consistency
    - _Requirements: 9.5_

- [x] 13. Create Debugging Guide
  - [x] 13.1 Create DEBUGGING.md
    - Create DEBUGGING.md in repository root
    - Document query tracing flow
    - Document common failure patterns
    - _Requirements: 10.1, 10.2, 10.3_
  
  - [x] 13.2 Document log message interpretation
    - Add key log messages table
    - Document critical state to check
    - _Requirements: 10.4, 10.5_
  
  - [x] 13.3 Add correlation ID tracing examples
    - Document how to use correlation IDs for debugging
    - Include example trace scenarios
    - _Requirements: 10.6_

- [x] 14. Update architecture.md
  - Document new patterns (MessageHandlerRegistry, PhaseBase)
  - Document QueryRouter extraction
  - Document PartitionService decomposition
  - _Requirements: All_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required including property tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Property tests use fast-check with {numRuns: 10} per testing guidelines

