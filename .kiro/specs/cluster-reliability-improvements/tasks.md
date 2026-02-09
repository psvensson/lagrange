# Implementation Tasks

## Overview

This task list implements the cluster reliability improvements specified in the requirements and design documents. Tasks are organized by requirement area and follow the testing guidelines (unit tests < 2s, integration tests < 30s, PBT with numRuns: 10).

## Task List

### 1. LeaderReadinessGate Unit Tests (Requirement 5)

- [x] 1.1 Create unit test file for LeaderReadinessGate
  - Create `test/cache/leader-readiness-gate.test.js`
  - Import getMissingSystemServiceLeaders from leader-readiness-gate.js
  - Set up mock system table cache helper functions

- [x] 1.2 Test getMissingSystemServiceLeaders returns empty arrays when all leaders present
  - Create mock cache with all partitions having leader services with addresses
  - Create mock cache with all message groups having leader services with addresses
  - Verify missingPartitionLeaders is empty array
  - Verify missingMessageGroupLeaders is empty array
  - Verify missingPartitionLeaderAddresses is empty array
  - Verify missingMessageGroupLeaderAddresses is empty array
  - **Validates: Requirements 5.1**

- [x] 1.3 Test getMissingSystemServiceLeaders identifies missing partition leaders
  - Create mock cache with partitions but no leader services for some
  - Verify missingPartitionLeaders contains the partition IDs without leaders
  - **Validates: Requirements 5.2**

- [x] 1.4 Test getMissingSystemServiceLeaders identifies missing message group leaders
  - Create mock cache with message groups but no leader services for some
  - Verify missingMessageGroupLeaders contains the group IDs without leaders
  - **Validates: Requirements 5.3**

- [x] 1.5 Test getMissingSystemServiceLeaders handles partial metadata correctly
  - Create mock cache with some leaders present, some missing
  - Create mock cache with some leaders having addresses, some without
  - Verify correct identification of all missing items
  - **Validates: Requirements 5.4**

- [x] 1.6 (PBT) Property test for LeaderReadinessGate missing leader detection
  - Generate random cache states with varying leader completeness
  - Verify getMissingSystemServiceLeaders correctly identifies all missing leaders
  - Verify empty arrays only when all leaders present with complete metadata
  - Use {numRuns: 10}
  - **Validates: Property 6**

### 2. CacheHydrationGate Implementation (Requirement 4)

- [x] 2.1 Create PhaseGate base class
  - Create `src/bootstrap/phase-gate.js`
  - Define validate(context) method returning {success, errors, diagnostics}
  - Export PhaseGate class

- [x] 2.2 Create CacheHydrationGate class
  - Create `src/bootstrap/cache-hydration-gate.js`
  - Extend PhaseGate
  - Import getMissingSystemServiceLeaders from leader-readiness-gate.js
  - Implement validate() to check all partition and message group leaders
  - Return diagnostic details on failure
  - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [x] 2.3 Create unit tests for CacheHydrationGate
  - Create `test/bootstrap/cache-hydration-gate.test.js`
  - Test passes when all leader metadata complete
  - Test fails when partition leaders missing
  - Test fails when message group leaders missing
  - Test returns diagnostic details on failure

- [x] 2.4 (PBT) Property test for cache hydration leader metadata completeness
  - Generate random cache states
  - Verify gate passes only when all leaders have addresses
  - Use {numRuns: 10}
  - **Validates: Property 4**

- [x] 2.5 (PBT) Property test for incomplete cache hydration reporting
  - Generate random incomplete cache states
  - Verify diagnostics report all missing items
  - Use {numRuns: 10}
  - **Validates: Property 5**

### 3. EnhancedBootstrapStateMachine Implementation (Requirement 3)

- [x] 3.1 Create PhaseGateError class
  - Add PhaseGateError to `src/bootstrap/bootstrap-errors.js`
  - Include phase name, validation errors, and diagnostics in error
  - **Validates: Requirements 3.2, 3.6**

- [x] 3.2 Create EnhancedBootstrapStateMachine class
  - Create `src/bootstrap/enhanced-bootstrap-state-machine.js`
  - Extend BootstrapPhaseStateMachine
  - Add phaseGates Map for registering gates per phase
  - Add phaseTimeouts Map for configurable timeouts
  - Add failedPhase and failureReason tracking
  - **Validates: Requirements 3.1**

- [x] 3.3 Implement registerGate and setPhaseTimeout methods
  - registerGate(phase, gate) stores gate in phaseGates Map
  - setPhaseTimeout(phase, timeoutMs) stores timeout in phaseTimeouts Map

- [x] 3.4 Implement validateGate method
  - Get gate for current phase from phaseGates Map
  - Call gate.validate(context) if gate exists
  - Return {success: true} if no gate registered

- [x] 3.5 Implement transitionWithValidation method
  - Call validateGate before transition
  - If validation fails, set failedPhase and failureReason
  - Throw PhaseGateError on failure
  - Call parent transition() on success
  - **Validates: Requirements 3.4**

- [x] 3.6 Implement hasFailed and getFailureDetails methods
  - hasFailed() returns true if failedPhase is set
  - getFailureDetails() returns {phase, reason} or null

- [x] 3.7 Create unit tests for EnhancedBootstrapStateMachine
  - Create `test/bootstrap/enhanced-bootstrap-state-machine.test.js`
  - Test blocks transition when gate fails
  - Test allows transition when gate passes
  - Test records failure details on gate failure
  - Test tracks phase durations correctly

- [x] 3.8 (PBT) Property test for phase gate failure diagnostics
  - Generate random failure scenarios
  - Verify failure result contains phase name, errors, and diagnostics
  - Use {numRuns: 10}
  - **Validates: Property 2**

- [x] 3.9 (PBT) Property test for phase transition gate invariant
  - Generate random gate validation results
  - Verify transition only succeeds when gate passes
  - Verify state machine remains in current phase on failure
  - Use {numRuns: 10}
  - **Validates: Property 3**

### 4. Services-P1 Diagnostic Logger (Requirement 1)

- [x] 4.1 Create ServicesP1DiagnosticLogger class
  - Create `src/node/services-p1-diagnostic-logger.js`
  - Add operationTimings Map for tracking step timings
  - Implement startStep(operationId, step) method
  - Implement endStep(operationId, step, metadata) method
  - Implement logTimeout(operationId, metadata) method
  - **Validates: Requirements 1.4, 1.5**

- [x] 4.2 Create unit tests for ServicesP1DiagnosticLogger
  - Create `test/node/services-p1-diagnostic-logger.test.js`
  - Test records step start times
  - Test calculates step durations correctly
  - Test logs timeout with all pending steps

- [x] 4.3 Integrate diagnostic logger into ReplicaHandler
  - Import ServicesP1DiagnosticLogger in replica-handler.js
  - Add diagnostic logging for services-p1 CREATE_REPLICA operations
  - Log timing for: services table insert, CREATE_REPLICA send, ACK receipt
  - **Validates: Requirements 1.4, 1.5**

### 5. Leader Metadata Validation Integration Tests (Requirement 2)

- [x] 5.1 Create integration test for leader metadata validation on join
  - Create test in `test/integration/leader-metadata-validation.integration.test.js`
  - Bootstrap seed node
  - Simulate incomplete leader metadata by manipulating cache
  - Verify join fails with LEADER_METADATA_INCOMPLETE error
  - Verify error contains missing partition leader details
  - Verify error contains missing message group leader details
  - Test must complete within 30 seconds
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**

- [x] 5.2 Create integration test for successful join with complete metadata
  - Bootstrap seed node with complete metadata
  - Verify join succeeds
  - Verify joining node receives accurate system state
  - Test must complete within 30 seconds
  - **Validates: Requirements 2.4, 2.5**

### 6. Deterministic Test Timeout Updates (Requirements 6, 7)

- [x] 6.1 Review and update node-join-replica-activation.integration.test.js timeouts
  - Ensure all waits use bounded polling with configurable intervals
  - Verify no unbounded waits or infinite loops
  - Ensure test completes within 30 seconds
  - Add diagnostic information to timeout failures
  - **Validates: Requirements 7.1, 7.3, 7.4, 7.5**

- [x] 6.2 Review and update node-joining-rebalance.integration.test.js timeouts
  - Ensure all waits use bounded polling with configurable intervals
  - Verify no unbounded waits or infinite loops
  - Ensure test completes within 30 seconds
  - Add diagnostic information to timeout failures
  - **Validates: Requirements 7.2, 7.3, 7.4, 7.5**

- [x] 6.3 Create test timeout constants file
  - Create `src/test-helpers/test-timeout-constants.js`
  - Define UNIT_TEST_TIMEOUT_MS = 2000
  - Define INTEGRATION_TEST_TIMEOUT_MS = 30000
  - Define TEST_LEADERSHIP_WAIT_MS = 1000
  - Define TEST_ACK_TIMEOUT_MS = 5000
  - Define TEST_STABILIZATION_MS = 100
  - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### 7. Services Table Self-Reference Handling (Requirement 8)

- [x] 7.1 Verify services-p1 self-referential write handling
  - Review isSystemTableWriteReady in leader-readiness-gate.js
  - Verify relaxed check for services table (no address required)
  - Ensure no deadlock possible in self-referential writes
  - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 7.2 Create integration test for services-p1 self-referential write
  - Bootstrap seed node
  - Trigger services-p1 to write to itself
  - Verify write completes without deadlock
  - Verify CDC propagates to cache
  - Test must complete within 30 seconds
  - **Validates: Requirements 8.1, 8.2, 8.4, 8.5**

- [x] 7.3 (PBT) Property test for concurrent services table writes
  - Generate random concurrent write operations
  - Verify all operations complete without blocking
  - Verify final state reflects all writes
  - Use {numRuns: 10}
  - **Validates: Property 1**

### 8. Final Verification

- [x] 8.1 Run full test suite checkpoint
  - Run `npm test` to verify all tests pass
  - Verify no test exceeds timeout limits
  - Verify all property tests use {numRuns: 10}

- [x] 8.2 Update architecture.md if needed
  - Document EnhancedBootstrapStateMachine and phase gates
  - Document CacheHydrationGate integration
  - Document ServicesP1DiagnosticLogger
