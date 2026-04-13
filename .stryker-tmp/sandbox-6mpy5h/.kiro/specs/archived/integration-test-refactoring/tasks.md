# Implementation Plan: Integration Test Refactoring

## Overview

This implementation plan refactors five integration test files to use production code instead of excessive mocking. Each test file will be refactored following the patterns established in good example tests like `seed-node-bootstrap.integration.test.js` and `admin-cdc-propagation.integration.test.js`.

## Tasks

- [x] 1. Create shared test helper module
  - [x] 1.1 Create test/integration/helpers/cluster-test-helpers.js with shared helper functions
    - Extract initializeTestEnvironment() from existing tests
    - Extract cleanupTestEnvironment() from existing tests
    - Extract createInProcHttpPost() from existing tests
    - Extract waitFor() polling helper
    - Add getUniquePort() with global counter starting at 18000
    - _Requirements: 4.1, 7.3, 7.4_

- [x] 2. Refactor node-joining-rebalance.integration.test.js
  - [x] 2.1 Remove mock helper functions (createMockCache, createMockCDCIntegrationService, createMockTablePolicyService, createMockMessageRouter, createMockRebalanceCoordinator)
    - _Requirements: 1.4, 2.3, 2.4, 3.3, 3.4_
  - [x] 2.2 Refactor "rebalancing waits for NODE_READY and stabilization" test to use real BootstrapService
    - Use BootstrapService to create seed node
    - Use real SystemTableCache from NodeService.getInstance()
    - Use real CDCIntegrationService from bootstrap result
    - Use real UnifiedRebalancer with real dependencies
    - _Requirements: 1.1, 1.2, 2.1, 3.2_
  - [x] 2.3 Refactor "HTTP bootstrap does not trigger registration or rebalancing" test
    - Use real BootstrapAPI with real SystemTableCache
    - _Requirements: 1.1, 7.1_
  - [x] 2.4 Refactor "batched CREATE_REPLICA concurrency is capped per node" test
    - Use real BootstrapService for cluster setup
    - Use real RebalanceCoordinator
    - _Requirements: 1.1, 3.2_
  - [x] 2.5 Refactor "rebalancer dispatches replica operations after node ready" test
    - Use real BootstrapService and NodeJoiningService
    - Use real ControlPlaneService and RebalanceCoordinator
    - _Requirements: 1.1, 1.3, 3.1, 3.2_
  - [x] 2.6 Verify all tests pass and complete within 2 seconds
    - Run test file and verify timing
    - _Requirements: 5.1_

- [x] 3. Checkpoint - Verify node-joining-rebalance tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Refactor control-plane-rebalance.integration.test.js
  - [x] 4.1 Remove mock helper functions (createMockCDCService, createMockTablePolicyService, createMockSqlQueryEngine)
    - _Requirements: 2.3, 3.4_
  - [x] 4.2 Refactor "Control plane dispatch integration" test to use real components
    - Use BootstrapService to create seed node
    - Use real CDCIntegrationService from bootstrap
    - Use real RebalanceCoordinator with real SQL engine
    - Use real ControlPlaneService
    - Use real MessageRouter for delivery
    - _Requirements: 1.1, 2.1, 2.2, 3.1, 3.2_
  - [x] 4.3 Verify all tests pass and complete within 2 seconds
    - Run test file and verify timing
    - _Requirements: 5.1_

- [x] 5. Refactor failure-scenarios.integration.test.js
  - [x] 5.1 Remove mock helper functions (createMockCDCService, createMockTablePolicyService, createMockMessageRouter, createMockRebalanceCoordinator, createMockCache, createTestCache)
    - _Requirements: 1.4, 2.3, 2.4, 3.3, 3.4_
  - [x] 5.2 Refactor "Req 15.1 - node failure detection marks replicas unavailable" test
    - Use real BootstrapService for cluster setup
    - Use real SystemTableCache and CDCIntegrationService
    - Use real FailureDetector with real dependencies
    - _Requirements: 1.1, 2.1, 6.1_
  - [x] 5.3 Refactor "Req 15.2 - rebalancer creates replacement replicas" test
    - Use real BootstrapService for multi-node cluster
    - Use real UnifiedRebalancer with real RebalanceCoordinator
    - _Requirements: 1.1, 3.2, 6.1_
  - [x] 5.4 Refactor "Req 15.4 - recovered node triggers rebalancing" test
    - Use real BootstrapService and FailureDetector
    - _Requirements: 1.1, 6.1_
  - [x] 5.5 Refactor remaining failure detector tests to use real components where possible
    - Some tests may need minimal mocking for specific failure scenarios
    - Document any necessary mocking with justification
    - _Requirements: 6.4_
  - [x] 5.6 Verify all tests pass and complete within 2 seconds
    - Run test file and verify timing
    - _Requirements: 5.1_

- [x] 6. Checkpoint - Verify failure-scenarios tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Refactor membership-consistency.integration.test.js
  - [x] 7.1 Analyze which tests can use real components vs need CDC latency simulation
    - CDC latency tests may need controlled delay injection
    - Document decisions for each test
    - _Requirements: 6.2, 6.4_
  - [x] 7.2 Refactor tests that can use real BootstrapService
    - "timing parameters are properly coordinated" - configuration test
    - "bootstrap data is consistent after mode transition" - use real bootstrap
    - "getReadyNodes returns consistent results across caches" - use real cache
    - _Requirements: 1.1, 7.1_
  - [x] 7.3 Refactor CDC latency tests to use real components with controlled delays
    - Use real CDCIntegrationService with delay wrapper if needed
    - Minimize mocking to only the delay injection
    - _Requirements: 2.1, 6.4_
  - [x] 7.4 Refactor control plane and rebalancer tests
    - Use real ControlPlaneService and UnifiedRebalancer
    - _Requirements: 3.1, 3.2_
  - [x] 7.5 Verify all tests pass and complete within 2 seconds
    - Run test file and verify timing
    - _Requirements: 5.1_

- [x] 8. Refactor multi-node-cluster.integration.test.js
  - [x] 8.1 Remove mock helper functions (createMockCDCIntegrationService, createMockTablePolicyService, createMockMessageRouter, createMockRebalanceCoordinator)
    - _Requirements: 2.3, 2.4, 3.3, 3.4_
  - [x] 8.2 Verify "node joining - new node contacts seed and joins cluster" test already uses real components
    - This test already uses BootstrapService and NodeJoiningService
    - Verify it follows best practices
    - _Requirements: 7.1, 7.2_
  - [x] 8.3 Refactor "replica rebalancing - triggers on node join" test
    - Use real BootstrapService instead of mock cache
    - Use real RebalanceCoordinator
    - _Requirements: 1.1, 3.2_
  - [x] 8.4 Refactor "rebalancer - maintains odd replica count" test
    - Use real BootstrapService for cluster setup
    - _Requirements: 1.1_
  - [x] 8.5 Verify message routing tests already use real components
    - "message routing - local message delivery" uses real MessageRouter
    - "message routing - cross-replica communication" uses real MessageRouter
    - _Requirements: 2.2, 7.2_
  - [x] 8.6 Verify all tests pass and complete within 2 seconds
    - Run test file and verify timing
    - _Requirements: 5.1_

- [x] 9. Final checkpoint - Run full integration test suite
  - Run all integration tests to verify no regressions
  - Verify all tests complete within 2 seconds each
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Some tests in membership-consistency.integration.test.js may need minimal mocking for CDC latency simulation - this is acceptable if documented
- The shared helper module (task 1) should be created first as other tasks depend on it
