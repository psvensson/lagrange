# Design Document: Integration Test Refactoring

## Overview

This design describes the approach for refactoring integration tests to use production code instead of excessive mocking. The goal is to transform tests that currently create mock versions of core components into tests that use real BootstrapService, NodeJoiningService, and other production components to verify actual system behavior.

The refactoring follows patterns established in good example tests like `seed-node-bootstrap.integration.test.js` and `admin-cdc-propagation.integration.test.js`, which demonstrate how to properly test multi-node cluster scenarios with real components.

## Architecture

The refactored integration tests will follow a layered architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Integration Test Layer                        │
│  - Test setup/teardown with unique ports                        │
│  - Assertions on real component behavior                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Test Helper Functions                           │
│  - initializeTestEnvironment()                                  │
│  - cleanupTestEnvironment()                                     │
│  - createInProcHttpPost()                                       │
│  - waitFor() polling helper                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Production Components                            │
│  - BootstrapService (seed node initialization)                  │
│  - NodeJoiningService (node joining)                            │
│  - BootstrapAPI (HTTP bootstrap endpoints)                      │
│  - MessageRouter (real WebSocket transport)                     │
│  - CDCIntegrationService (real CDC operations)                  │
│  - ControlPlaneService (real control plane)                     │
│  - RebalanceCoordinator (real rebalancing)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Use BootstrapService as the foundation**: All tests that need a cluster will start by bootstrapping a real seed node using BootstrapService, which creates all system tables, partitions, and services.

2. **Use in-process HTTP for BootstrapAPI**: Instead of starting real HTTP servers, tests use Fastify's inject() method to simulate HTTP requests, avoiding port conflicts and network overhead.

3. **Use unique ports per test**: Each test uses a unique WebSocket port (from a counter) to avoid conflicts when tests run in parallel or sequentially.

4. **Fast Raft configuration**: Tests configure Raft with fast election timeouts (100-200ms) to ensure leader election completes quickly.

5. **Polling instead of delays**: Tests use waitFor() helpers that poll for conditions rather than arbitrary sleep delays.

## Components and Interfaces

### Test Helper Functions

```javascript
/**
 * Initialize test environment with fast Raft elections.
 * Resets all singletons and configures logging to error level.
 */
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();
  ServiceThreadManager.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
    transport: {wsHost: '127.0.0.1'},
    raft: {
      electionTimeoutMinMs: 100,
      electionTimeoutMaxMs: 200,
      heartbeatIntervalMs: 50,
    },
    rebalancer: {
      periodicCheckIntervalMs: 1000,
      periodicCheckJitterMs: 100,
      stabilizationPeriodMs: 1000,
    },
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

/**
 * Clean up test environment.
 * Shuts down all services and resets singletons.
 */
async function cleanupTestEnvironment() {
  await NodeService.getInstance().shutdown().catch(() => {});
  await ServiceThreadManager.getInstance().shutdown().catch(() => {});
  await LoggingService.getInstance().shutdown().catch(() => {});
  NodeService.resetInstance();
  ServiceThreadManager.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

/**
 * Create in-process HTTP POST function for BootstrapAPI.
 * Uses Fastify inject() to avoid real HTTP connections.
 */
function createInProcHttpPost(seedApi) {
  return async (url, body) => {
    const {pathname} = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: pathname,
      payload: body,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`HTTP ${res.statusCode}: ${res.payload}`);
    }
    return res.json();
  };
}

/**
 * Wait for a condition with timeout.
 * Polls at short intervals to detect condition quickly.
 */
async function waitFor(condition, timeoutMs = 2000, intervalMs = 25) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
```

### Seed Node Setup Pattern

```javascript
// Create and bootstrap seed node
const seedNodeId = '550e8400-e29b-41d4-a716-446655440001';
const seedWsPort = uniquePort++;

const bootstrapService = new BootstrapService({
  nodeId: seedNodeId,
  nodeAddress: `ws://localhost:${seedWsPort}`,
  wsPort: seedWsPort,
  config: {
    leadershipWaitTimeoutMs: 1000,
    leadershipWaitInitialDelayMs: 10,
    leadershipWaitMaxDelayMs: 100,
    replicaStaggerDelayMs: 20,
  },
});

const bootstrapResult = await bootstrapService.bootstrap();
// bootstrapResult contains:
// - messageGroupServices: Map of real MessageGroupService instances
// - partitionServices: Map of real PartitionService instances
// - messageRouter: Real MessageRouter instance
// - epochManager: Real EpochManager instance

// Get system table cache from NodeService singleton
const systemTableCache = NodeService.getInstance().getSystemTableCache();

// Create SQL query engine for queries
const sqlQueryEngine = new SQLQueryEngine({
  systemCache: systemTableCache,
  messageRouter: bootstrapResult.messageRouter,
  nodeId: seedNodeId,
});

// Create BootstrapAPI for node joining
const seedApi = new BootstrapAPI({
  seedNodeId,
  seedNodeAddress: `ws://localhost:${seedWsPort}`,
  seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
  messageGroupServices: bootstrapResult.messageGroupServices,
  partitionServices: bootstrapResult.partitionServices,
  systemTableCache,
  messageRouter: bootstrapResult.messageRouter,
  epochManager: bootstrapResult.epochManager,
  bootstrapService,
});

await seedApi.initialize(0, {listen: false});
seedApi.setSqlQueryEngine(sqlQueryEngine);
```

### Node Joining Pattern

```javascript
// Create in-process HTTP post function
const httpPost = createInProcHttpPost(seedApi);

// Create joining service for new node
const joiningNodeId = '550e8400-e29b-41d4-a716-446655440002';
const joiningWsPort = uniquePort++;

const joiningService = new NodeJoiningService({
  nodeId: joiningNodeId,
  nodeAddress: `ws://localhost:${joiningWsPort}`,
  seedNodeAddress: 'http://localhost:0', // Not used with httpPost
  seedNodeWsAddress: `ws://localhost:${seedWsPort}`,
  wsPort: joiningWsPort,
  config: {
    httpTimeoutMs: 5000,
    leadershipWaitTimeoutMs: 2000,
    leadershipWaitInitialDelayMs: 10,
    leadershipWaitMaxDelayMs: 100,
    replicaStaggerDelayMs: 20,
  },
  httpPost, // Use in-process HTTP
});

const joinResult = await joiningService.join();
// joinResult contains:
// - success: boolean
// - messageGroupServices: Map of real MessageGroupService instances
// - partitionServices: Map of real PartitionService instances
```

### Cleanup Pattern

```javascript
try {
  // Test code here
} finally {
  // Cleanup in reverse order of creation
  if (joiningService) {
    await joiningService.cleanup().catch(() => {});
  }
  if (seedApi) {
    await seedApi.shutdown().catch(() => {});
  }
  if (bootstrapService) {
    await bootstrapService.shutdown().catch(() => {});
  }
  if (bootstrapResult?.messageRouter) {
    await bootstrapResult.messageRouter.shutdown().catch(() => {});
  }
}
```

## Data Models

### Test Configuration

```javascript
const TEST_CONFIG = {
  // Raft configuration for fast elections
  raft: {
    electionTimeoutMinMs: 100,
    electionTimeoutMaxMs: 200,
    heartbeatIntervalMs: 50,
  },
  // Bootstrap configuration for fast initialization
  bootstrap: {
    leadershipWaitTimeoutMs: 1000,
    leadershipWaitInitialDelayMs: 10,
    leadershipWaitMaxDelayMs: 100,
    replicaStaggerDelayMs: 20,
  },
  // Rebalancer configuration
  rebalancer: {
    periodicCheckIntervalMs: 1000,
    periodicCheckJitterMs: 100,
    stabilizationPeriodMs: 1000,
  },
  // Test timeouts
  timeouts: {
    testTimeout: 2000,
    waitForCondition: 2000,
    pollInterval: 25,
  },
};
```

### Port Management

```javascript
// Global port counter to ensure unique ports across tests
let portCounter = 18000;

function getUniquePort() {
  return portCounter++;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, most requirements for this refactoring are about code structure and patterns rather than runtime properties. The testable properties are:

### Property 1: Test Execution Time Bound

*For any* integration test in the refactored test files, the test execution time SHALL be less than 2 seconds.

**Validates: Requirements 5.1**

This property ensures that refactored tests maintain fast execution by using real components with fast Raft configuration rather than slow mocks or arbitrary delays.

### Property 2: Real Component Instantiation

*For any* cluster setup in a refactored integration test, the BootstrapService SHALL return messageGroupServices and partitionServices that are instances of the real production classes (MessageGroupService and PartitionService).

**Validates: Requirements 1.2**

This property ensures that tests use real production components rather than mocks.

### Non-Testable Requirements (Code Review)

The following requirements are code structure/pattern requirements that should be verified through code review rather than automated testing:

- Requirements 1.1, 1.3, 1.4: Use of BootstrapService and NodeJoiningService patterns
- Requirements 2.1-2.4: Use of real CDC and MessageRouter
- Requirements 3.1-3.4: Use of real ControlPlaneService and RebalanceCoordinator
- Requirements 4.1-4.4: Test isolation and cleanup patterns
- Requirements 5.2-5.4: Configuration and polling patterns
- Requirements 6.1-6.4: Test coverage maintenance
- Requirements 7.1-7.4: Following established patterns

## Error Handling

### Test Setup Errors

When test setup fails (e.g., BootstrapService fails to bootstrap):
1. The error should be logged with full stack trace
2. The test should fail immediately with a descriptive message
3. Cleanup should still execute via finally block

### Resource Cleanup Errors

When cleanup fails:
1. Errors should be caught and logged but not re-thrown
2. Use `.catch(() => {})` pattern to prevent cleanup errors from masking test failures
3. Continue with remaining cleanup steps

### Timeout Handling

When waitFor() times out:
1. Return false rather than throwing
2. Let the test assertion fail with a descriptive message
3. Ensure cleanup still executes

### Port Conflicts

When a port is already in use:
1. The test should fail with a clear error message
2. Use unique port counter to prevent conflicts
3. Consider retrying with a different port if needed

## Testing Strategy

### Dual Testing Approach

This refactoring primarily involves code transformation rather than new functionality. The testing strategy focuses on:

1. **Verification Testing**: Ensure refactored tests still verify the same functional requirements
2. **Performance Testing**: Ensure tests complete within 2 second limit
3. **Code Review**: Verify patterns and structure through manual review

### Unit Tests

Unit tests are not applicable for this refactoring since we are modifying integration tests, not production code.

### Integration Tests

The refactored integration tests themselves serve as the verification that:
1. Real components work together correctly
2. The test patterns are correct
3. Cleanup is proper

### Test Execution

After refactoring each test file:
1. Run the specific test file to verify it passes
2. Verify test execution time is under 2 seconds
3. Run the full integration test suite at checkpoints

### Property-Based Testing

Property 1 (Test Execution Time) can be verified by:
- Running each test and measuring execution time
- Failing if any test exceeds 2 seconds

Property 2 (Real Component Instantiation) can be verified by:
- Adding assertions in tests that check instanceof for returned services
- This is already implicitly tested by the fact that tests use real component methods

### Test File Refactoring Order

1. `node-joining-rebalance.integration.test.js` - Most mocking, good starting point
2. `control-plane-rebalance.integration.test.js` - Similar patterns
3. `failure-scenarios.integration.test.js` - More complex scenarios
4. `membership-consistency.integration.test.js` - CDC latency testing
5. `multi-node-cluster.integration.test.js` - Mixed patterns, some already good

