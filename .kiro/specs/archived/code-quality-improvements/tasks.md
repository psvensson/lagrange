# Implementation Plan: Code Quality Improvements

## Overview

This implementation plan breaks down the code quality improvements into discrete coding tasks. Each task builds on previous steps and includes property-based tests where applicable.

## Tasks

- [x] 1. Create base error class and enhance assert utility
  - [x] 1.1 Create BaseError class in src/utils/base-error.js
    - Extend native Error class
    - Support cause parameter for error chaining
    - Support context object for metadata
    - Implement toJSON() for logging
    - Auto-set name to constructor name
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.2 Enhance assertCritical in src/utils/assert.js
    - Add optional ErrorClass parameter
    - Add optional context parameter
    - Add JSDoc type annotations with @template
    - Maintain backward compatibility
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 1.3 Write property tests for assertCritical
    - **Property 6: assertCritical Returns Value for Truthy Input**
    - **Property 7: assertCritical Throws for Falsy Input**
    - **Validates: Requirements 5.2, 5.3**

- [x] 2. Refactor bootstrap errors to extend BaseError
  - [x] 2.1 Update DependencyError to extend BaseError
    - Import BaseError
    - Call super with cause/context support
    - Maintain existing constructor signature
    - _Requirements: 4.6_

  - [x] 2.2 Update LifecycleError to extend BaseError
    - Import BaseError
    - Call super with cause/context support
    - Maintain existing constructor signature
    - _Requirements: 4.6_

  - [x] 2.3 Update remaining error classes to extend BaseError
    - PhaseTransitionError
    - PhaseTimeoutError
    - WriterDisabledError
    - _Requirements: 4.6_

  - [x] 2.4 Write property tests for error class hierarchy
    - **Property 5: Error Classes Extend BaseError and Set Name**
    - **Validates: Requirements 4.2, 4.6**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Standardize state value casing
  - [x] 4.1 Update src/constants/states.js to use lowercase values
    - Change 'NORMAL' to 'normal'
    - Verify all other values are already lowercase
    - _Requirements: 3.1_

  - [x] 4.2 Update all references to STATE.NORMAL in codebase
    - Search for usages of 'NORMAL' string literal
    - Update any comparisons or assignments
    - _Requirements: 3.2_

  - [x] 4.3 Write property tests for state constants
    - **Property 3: State Values Are Lowercase**
    - **Property 4: State Keys Are SCREAMING_SNAKE_CASE**
    - **Validates: Requirements 3.1, 3.3**

- [x] 5. Remove eslint-disable comment from test file
  - [x] 5.1 Create factory function pattern for mixin tests
    - Create createMixedClass helper function
    - Apply mixin without triggering new-cap rule
    - _Requirements: 2.2_

  - [x] 5.2 Update service-lifecycle.property.test.js
    - Replace eslint-disable comment with factory pattern
    - Update createTestServiceClass to use new pattern
    - Verify tests still pass
    - _Requirements: 2.1, 2.3_

  - [x] 5.3 Write unit test to verify no eslint-disable comments
    - Scan test file for eslint-disable pattern
    - Verify pattern is not found
    - **Validates: Requirements 2.1**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Extract RouterMessageHandler from message-router.js
  - [x] 7.1 Create src/transport/router-message-handler.js
    - Extract handleMessage method
    - Extract handleServiceMessage method
    - Extract handleAcknowledgment method
    - Extract handleIdentification method
    - Extract handleJoinRequest method
    - Extract handleJoinComplete method
    - Add JSDoc type definitions
    - _Requirements: 1.2, 1.4_

  - [x] 7.2 Update MessageRouter to use RouterMessageHandler
    - Import RouterMessageHandler
    - Delegate message handling to new class
    - Remove extracted methods from MessageRouter
    - _Requirements: 1.1, 1.4_

  - [x] 7.3 Write unit tests for RouterMessageHandler
    - Test message parsing
    - Test handler dispatch
    - Test acknowledgment handling
    - _Requirements: 1.4_

- [x] 8. Extract RouterServerManager from message-router.js
  - [x] 8.1 Create src/transport/router-server-manager.js
    - Extract startServer method
    - Extract startInProcessServer method
    - Extract handleIncomingConnection method
    - Extract server shutdown logic
    - Add JSDoc type definitions
    - _Requirements: 1.2, 1.4_

  - [x] 8.2 Update MessageRouter to use RouterServerManager
    - Import RouterServerManager
    - Delegate server management to new class
    - Remove extracted methods from MessageRouter
    - _Requirements: 1.1, 1.4_

  - [x] 8.3 Write unit tests for RouterServerManager
    - Test server startup
    - Test incoming connection handling
    - Test server shutdown
    - _Requirements: 1.4_

- [x] 9. Verify message-router.js line count reduction
  - [x] 9.1 Verify file is under 800 lines
    - Count lines in message-router.js
    - Document final line count
    - _Requirements: 1.3_

  - [x] 9.2 Write property tests for API compatibility
    - **Property 1: Message Router API Compatibility**
    - **Property 2: Connection State Behavior Equivalence**
    - **Validates: Requirements 1.1, 1.4**

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The file extraction tasks (7, 8) are the largest and should be done carefully to maintain API compatibility

