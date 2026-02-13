# Requirements Document

## Introduction

This document specifies the requirements for refactoring integration tests to use production code instead of excessive mocking. The current integration tests in `test/integration/` defeat the purpose of integration testing by creating mock versions of core components (SystemTableCache, CDCIntegrationService, MessageRouter, TablePolicyService, RebalanceCoordinator) instead of using real production code. The refactored tests should follow the patterns established in good examples like `seed-node-bootstrap.integration.test.js` and `admin-cdc-propagation.integration.test.js`.

## Glossary

- **Integration_Test**: A test that verifies the interaction between multiple real components working together
- **BootstrapService**: The production service that initializes a seed node with all system tables and services
- **NodeJoiningService**: The production service that handles a node joining an existing cluster
- **SystemTableCache**: The production cache that stores system table data fed by CDC events
- **CDCIntegrationService**: The production service that handles Change Data Capture operations
- **MessageRouter**: The production service that routes messages between nodes and services
- **RebalanceCoordinator**: The production service that coordinates replica operations during rebalancing
- **ControlPlaneService**: The production service that manages cluster control plane operations
- **Mock_Component**: A fake implementation that simulates behavior without real functionality
- **Production_Component**: The actual implementation used in the running system

## Requirements

### Requirement 1: Use Real BootstrapService for Cluster Initialization

**User Story:** As a developer, I want integration tests to use real BootstrapService, so that I can verify actual cluster initialization behavior.

#### Acceptance Criteria

1. WHEN an integration test needs a seed node, THE Integration_Test SHALL use BootstrapService to create it
2. WHEN BootstrapService completes bootstrap, THE Integration_Test SHALL receive real messageGroupServices and partitionServices
3. WHEN an integration test needs additional nodes, THE Integration_Test SHALL use NodeJoiningService to join them
4. THE Integration_Test SHALL NOT create mock SystemTableCache instances for cluster initialization

### Requirement 2: Use Real CDC and Message Routing

**User Story:** As a developer, I want integration tests to use real CDC and message routing, so that I can verify actual data propagation behavior.

#### Acceptance Criteria

1. WHEN an integration test needs CDC functionality, THE Integration_Test SHALL use the CDCIntegrationService from BootstrapService
2. WHEN an integration test needs message routing, THE Integration_Test SHALL use the MessageRouter from BootstrapService
3. THE Integration_Test SHALL NOT create mock CDCIntegrationService that bypasses SQL engine routing
4. THE Integration_Test SHALL NOT create mock MessageRouter that simulates delivery without real transport

### Requirement 3: Use Real Control Plane and Rebalancing

**User Story:** As a developer, I want integration tests to use real control plane and rebalancing, so that I can verify actual cluster management behavior.

#### Acceptance Criteria

1. WHEN an integration test needs control plane functionality, THE Integration_Test SHALL use real ControlPlaneService
2. WHEN an integration test needs rebalancing, THE Integration_Test SHALL use real RebalanceCoordinator and UnifiedRebalancer
3. THE Integration_Test SHALL NOT create mock RebalanceCoordinator that returns fake operation IDs
4. THE Integration_Test SHALL NOT create mock TablePolicyService unless testing policy variations

### Requirement 4: Proper Test Isolation and Cleanup

**User Story:** As a developer, I want integration tests to have proper isolation and cleanup, so that tests do not interfere with each other.

#### Acceptance Criteria

1. WHEN an integration test starts, THE Integration_Test SHALL use unique ports to avoid conflicts
2. WHEN an integration test completes, THE Integration_Test SHALL clean up all resources in finally blocks
3. WHEN an integration test uses singletons, THE Integration_Test SHALL reset them in beforeEach/afterEach
4. IF an integration test fails, THEN THE Integration_Test SHALL still execute cleanup code

### Requirement 5: Test Performance Requirements

**User Story:** As a developer, I want integration tests to complete quickly, so that the test suite remains fast.

#### Acceptance Criteria

1. THE Integration_Test SHALL complete within 2 seconds per test case
2. WHEN using Raft elections, THE Integration_Test SHALL configure fast election timeouts (100-200ms)
3. WHEN waiting for conditions, THE Integration_Test SHALL use polling with short intervals (10-50ms)
4. THE Integration_Test SHALL NOT use arbitrary sleep delays for synchronization

### Requirement 6: Maintain Test Coverage

**User Story:** As a developer, I want refactored tests to maintain coverage, so that existing functionality remains verified.

#### Acceptance Criteria

1. WHEN refactoring a test, THE Integration_Test SHALL verify the same functional requirements
2. WHEN a mock was testing specific behavior, THE Integration_Test SHALL verify that behavior with real components
3. THE Integration_Test SHALL test actual component interactions, not mocked behavior
4. IF a test scenario cannot be achieved with real components, THEN THE Integration_Test SHALL document why and use minimal mocking

### Requirement 7: Follow Established Patterns

**User Story:** As a developer, I want integration tests to follow established patterns, so that the test suite is consistent.

#### Acceptance Criteria

1. THE Integration_Test SHALL follow the pattern from seed-node-bootstrap.integration.test.js for cluster setup
2. THE Integration_Test SHALL follow the pattern from admin-cdc-propagation.integration.test.js for multi-node scenarios
3. THE Integration_Test SHALL use initializeTestEnvironment and cleanupTestEnvironment helper functions
4. THE Integration_Test SHALL use the in-process HTTP post pattern for BootstrapAPI communication
