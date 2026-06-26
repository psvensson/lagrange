# Design Document: Test Coverage Improvements

## Overview

This design document outlines the approach for improving test coverage across critical components of the distributed database system. The focus is on achieving the coverage targets specified in the testing guidelines:

- Core consensus (Raft, replication): 90%+ line coverage, 85%+ branch coverage
- Bootstrap/lifecycle: 85%+ line coverage, 80%+ branch coverage
- CDC: 85%+ line coverage, 80%+ branch coverage
- Query routing/partition: 80%+ line coverage, 75%+ branch coverage

The design follows the existing test patterns in the codebase, using the tap test framework and fast-check for property-based testing.

## Architecture

### Test Organization

Tests are organized by component in the `test/` directory:
- `test/raft/` - Raft consensus tests
- `test/cdc/` - CDC event handling tests
- `test/bootstrap/` - Bootstrap phase tests
- `test/partition/` - Partition service tests
- `test/integration/` - Integration tests with real Raft

### Test Types

1. **Unit Tests** - Test individual functions and methods in isolation
   - Must complete within 2 seconds
   - Can mock external dependencies
   - Focus on specific examples and edge cases

2. **Property Tests** - Test universal properties across generated inputs
   - Use fast-check with `{numRuns: 10}`
   - Must complete within 2 seconds
   - Focus on invariants and round-trip properties

3. **Integration Tests** - Test components working together
   - Must complete within 30 seconds
   - Must use real Raft consensus (no mocking liferaft)
   - Test end-to-end flows

## Components and Interfaces

### 1. RaftReplicaBase Test Suite

**File:** `test/raft/raft-replica-base.test.js` (extend existing)

**New Test Cases:**
- `createRaftInstance` configuration validation
- `wireRaftEvents` event handler wiring
- `joinPeers` peer joining logic
- `handleRaftPacket` packet routing and response
- `startElection` timer management
- `scheduleLearnerPromotion` and `checkLearnerPromotion` learner lifecycle
- Role update queueing and flushing

**Mock Requirements:**
- Mock transport for message delivery
- Mock liferaft for event simulation
- Mock systemTableCache for peer address lookup

### 2. RaftTransportAdapter Test Suite

**File:** `test/raft/raft-transport-adapter.test.js` (new)

**Test Cases:**
- Constructor validation (messageRouter, entityType, nodeId required)
- `write` method message delivery
- `buildPeerAddress` address resolution
- `getRaftMessageType` type mapping
- Error handling for invalid addresses
- Error handling for unavailable message router

**Property Tests:**
- Round-trip property for packet delivery

### 3. CDCEventHandler Test Suite

**File:** `test/cdc/cdc-event-handler.test.js` (new)

**Test Cases:**
- `handleEpochChangeCDC` with valid epoch events
- `handleEpochChangeCDC` with invalid JSON
- `handleEpochChangeCDC` with non-epoch config keys
- `handleEpochChangeCDC` without epoch manager
- `handleNodeStateCDC` with valid state changes
- `handleNodeStateCDC` with unchanged state
- `handleNodeJoinedCDC` with new node events
- `handleNodeJoinedCDC` self-skip behavior
- `deriveWsAddressFromNodeAddress` address derivation

**Mock Requirements:**
- Mock eventContext with epochManager, rebalancer, messageRouter
- Mock CDC events with various data shapes

### 4. CDCIntegrationService Test Suite

**File:** `test/cdc/cdc-integration-service.test.js` (extend existing)

**New Test Cases:**
- `executeSQL` retry logic with transient errors
- `executeSQL` max retry exceeded
- `executeSQLDirectToLocalPartition` bootstrap mode
- `waitForCacheUpdate` cache synchronization
- `prepareInsertData` schema defaults and primary key generation
- `setBootstrapMode` validation
- `isTransientCdcError` error classification
- `computeRetryDelayMs` exponential backoff

### 5. Bootstrap Phase Test Suite

**File:** `test/bootstrap/enhanced-bootstrap-state-machine.test.js` (extend existing)

**New Test Cases:**
- Phase transition success paths
- Phase transition failure paths
- Phase timeout handling
- READY phase join request allowance
- Event emission on transitions

**Property Tests:**
- State consistency invariant across transitions
- Valid phase sequence property

### 6. PartitionService Test Suite

**File:** `test/partition/partition-service.test.js` (extend existing)

**New Test Cases:**
- `executeLocalQuery` on leader
- `executeLocalQuery` on follower
- CDC event generation on write commit
- `handleRaftPacket` processing
- Uninitialized operation errors

## Data Models

### Test Fixtures

```javascript
// Mock Raft packet
const mockRaftPacket = {
  type: 'vote',
  term: 1,
  address: 'node-1/partition/replica-1',
  state: 0,
  leader: null,
  last: {index: 0, term: 0},
  data: null,
};

// Mock CDC event
const mockCDCEvent = {
  tableName: 'config',
  operation: 'UPDATE',
  data: {
    config_key: 'current_epoch',
    config_value: JSON.stringify({
      epoch: 1,
      assignments: {},
      timestamp: '12345',
      proposedBy: 'node-1',
    }),
  },
};

// Mock node state CDC event
const mockNodeStateCDCEvent = {
  tableName: 'nodes',
  operation: 'UPDATE',
  data: {
    node_id: 'node-1',
    status: 'ready',
  },
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Raft Packet Round-Trip Preservation

*For any* valid Raft packet with fields (type, term, address, state, leader, last, data), delivering through RaftTransportAdapter and receiving on the other end SHALL preserve all packet fields exactly.

**Validates: Requirements 2.5**

### Property 2: Node State Tracking Consistency

*For any* sequence of node state CDC events for the same node, the CDCEventHandler's tracked state SHALL always reflect the most recent state value, and state changes SHALL only emit events when the state actually changes.

**Validates: Requirements 3.4, 3.5**

### Property 3: WebSocket Address Derivation Correctness

*For any* valid node address in "hostname:port" format where port is a positive integer, deriving the WebSocket address SHALL produce a valid "ws://hostname:wsPort" URL where wsPort = port + WS_PORT_OFFSET (1).

**Validates: Requirements 3.8**

### Property 4: Retry Delay Exponential Backoff

*For any* retry attempt number n (1-based), the computed delay SHALL follow exponential backoff with the formula: min(MAX_DELAY_MS, baseDelayMs * 2^min(MAX_EXPONENT, n-1)).

**Validates: Requirements 4.1, 4.2**

### Property 5: Schema Default Application Completeness

*For any* table schema with columns that have default values, and any input data object missing those columns, prepareInsertData SHALL return data with all schema defaults applied for missing fields.

**Validates: Requirements 4.6**

### Property 6: Bootstrap Phase State Machine Invariant

*For any* valid sequence of phase transitions in the bootstrap state machine, the state SHALL always be one of the defined phases (INFRA, RAFT_ELECTION, SYSTEM_TABLE_SEED, CACHE_HYDRATION, CDC_SUBSCRIBE, CONTROL_PLANE_REGISTER, READY, FAILED), and appropriate events SHALL be emitted for each transition.

**Validates: Requirements 5.5, 5.6**

### Property 7: Raft Packet Routing Correctness

*For any* valid Raft packet received by handleRaftPacket, if the sender address is in valid unified format, the packet SHALL be routed to liferaft and a response SHALL be sent via transport.

**Validates: Requirements 1.4**

## Error Handling

### Test Error Scenarios

1. **Invalid Input Errors**
   - Missing required constructor parameters
   - Invalid address formats
   - Null/undefined data objects

2. **Transient Errors**
   - Network timeouts
   - Leader unavailable
   - System cache not ready

3. **Permanent Errors**
   - Invalid JSON parsing
   - Schema validation failures
   - Max retries exceeded

### Error Verification Pattern

```javascript
// Verify error is thrown with correct message
t.throws(() => {
  new RaftTransportAdapter({});
}, /messageRouter is required/);

// Verify async error handling
try {
  await service.executeSQL('SELECT * FROM invalid');
  t.fail('should throw error');
} catch (error) {
  t.ok(error.message.includes('expected error'), 'should have error message');
}
```

## Testing Strategy

### Unit Testing Approach

- Test each method in isolation
- Mock external dependencies
- Focus on edge cases and error paths
- Verify correct behavior for all input types

### Property-Based Testing Approach

- Use fast-check with `{numRuns: 10}` per testing guidelines
- Generate random valid inputs
- Verify properties hold for all generated inputs
- Tag tests with property references

### Integration Testing Approach

- Use real Raft consensus (no mocking liferaft)
- Create multi-replica groups (3 replicas minimum)
- Verify end-to-end flows
- Complete within 30 seconds

### Test Configuration

```javascript
// Property test configuration
fc.assert(
  fc.property(
    fc.string(),
    (input) => {
      // Property assertion
      return true;
    }
  ),
  {numRuns: 10}  // Per testing guidelines
);
```

### Coverage Verification

After implementing tests, verify coverage targets:
- Run `npm test -- --coverage`
- Check line and branch coverage for each component
- Identify remaining gaps and add targeted tests

