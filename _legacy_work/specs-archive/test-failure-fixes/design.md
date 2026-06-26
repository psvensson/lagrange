# Design Document: Test Failure Fixes

## Overview

This design addresses 52 failing tests across 27 test suites in the distributed database system. The failures fall into five main categories:

1. **Bootstrap Sequence Failures** - System tables not created before CDC operations
2. **Code Path Uniqueness Violations** - Duplicate `WorkerRaftNode` class definitions
3. **Integration Test Failures** - Leader election timeouts, UNIQUE constraint violations, routing failures
4. **Message Delivery Property Test Failures** - Transport message count not incrementing
5. **Empty Property Test Files** - Tests with no implementation

The fixes follow the system's core principles: single code path for any logic, no legacy/fallback code, and all communication through WebSocket-based MessageRouter.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Test Failure Fix Architecture                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Shared Raft Components                            │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  WorkerRaftNode (src/worker/worker-raft-node.js)            │    │   │
│  │  │  - Single implementation for both partition and msg group   │    │   │
│  │  │  - Extends LifeRaft with WorkerMessageBridge transport      │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Bootstrap Sequence Fix                            │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  RegistrationPhase                                          │    │   │
│  │  │  - Ensure system tables exist before CDC operations         │    │   │
│  │  │  - Create tables in correct order: nodes → services → etc   │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Message Router Fix                                │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  MessageRouter.deliver()                                    │    │   │
│  │  │  - Increment messageCount on every delivery attempt         │    │   │
│  │  │  - Track messages for property test verification            │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. WorkerRaftNode (New Shared Module)

Extract the duplicate `WorkerRaftNode` class to a shared module.

**Location**: `src/worker/worker-raft-node.js`

```javascript
/**
 * WorkerRaftNode - Shared Raft node class for worker processes.
 * Extends LifeRaft with WorkerMessageBridge transport.
 * Used by both MessageGroupWorkerService and PartitionWorkerService.
 */
class WorkerRaftNode extends LifeRaft {
  constructor(address, options, context) {
    super(address, options);
    this.context = context;
  }

  write(packet, callback) {
    const peerAddress = this.address;
    const {messageBridge, logger, entityId} = this.context;

    if (messageBridge) {
      messageBridge.send(peerAddress, packet)
        .then((result) => callback(null, result))
        .catch((err) => callback(err));
    } else {
      callback(new Error('WorkerMessageBridge not initialized'));
    }
  }
}
```

**Interface**:
- `constructor(address, options, context)` - Create node with context for message bridge access
- `write(packet, callback)` - Send Raft packet via WorkerMessageBridge

### 2. Bootstrap Registration Phase Fix

Ensure system tables exist before CDC operations.

**Modified**: `src/bootstrap/registration-phase.js`

```javascript
async execute() {
  // Step 1: Verify all system table schemas exist in partitions
  await this.ensureSystemTablesExist();
  
  // Step 2: Proceed with registration (CDC operations)
  await this.registerNode();
  await this.registerServices();
  // ...
}

async ensureSystemTablesExist() {
  const requiredTables = [
    SystemTableName.NODES,
    SystemTableName.SERVICES,
    SystemTableName.PARTITIONS,
    SystemTableName.TABLES,
    SystemTableName.MESSAGE_GROUPS,
    SystemTableName.REPLICA_OPERATIONS,
  ];
  
  for (const tableName of requiredTables) {
    await this.verifyTableExists(tableName);
  }
}
```

### 3. MessageRouter Message Count Fix

Ensure `messageCount` is incremented on every delivery.

**Modified**: `src/transport/message-router.js`

```javascript
async deliver(address, message) {
  // Increment message count at start of delivery
  this.messageCount = (this.messageCount || NUM.ZERO) + NUM.ONE;
  
  // Existing delivery logic...
  const result = await this.routeMessage(address, message);
  return result;
}
```

### 4. UNIQUE Constraint Handling

Use INSERT OR REPLACE for system table operations.

**Modified**: `src/cdc/cdc-integration-service.js`

```javascript
async insertSystemTableRow(tableName, data) {
  // Use INSERT OR REPLACE to handle UNIQUE constraint violations
  const sql = this.buildInsertOrReplaceSql(tableName, data);
  return this.executeQuery(sql, Object.values(data));
}

buildInsertOrReplaceSql(tableName, data) {
  const columns = Object.keys(data).join(', ');
  const placeholders = Object.keys(data).map(() => '?').join(', ');
  return `INSERT OR REPLACE INTO ${tableName} (${columns}) VALUES (${placeholders})`;
}
```

### 5. CREATE_REPLICA Timeout Error Handling

Return proper error response on timeout.

**Modified**: `src/worker/replica-worker-manager.js`

```javascript
async createPartitionReplica(options) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  
  try {
    const result = await this.withTimeout(
      this.doCreatePartitionReplica(options),
      timeoutMs,
    );
    return result;
  } catch (error) {
    if (error.message.includes('timeout')) {
      // Clean up any partially created resources
      await this.cleanupPartialReplica(options.replicaId);
      
      return {
        success: false,
        error: `CREATE_REPLICA timeout after ${timeoutMs}ms`,
        replicaId: options.replicaId,
      };
    }
    throw error;
  }
}
```

## Data Models

### Test Configuration Constants

```javascript
// src/constants/test-constants.js
const TEST_TIMEOUT = Object.freeze({
  UNIT_TEST_MAX_MS: 2000,
  INTEGRATION_TEST_MAX_MS: 30000,
  LEADER_ELECTION_MS: 10000,
  CDC_PROPAGATION_MS: 5000,
});

const PROPERTY_TEST_CONFIG = Object.freeze({
  NUM_RUNS: 10,
});
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Bootstrap System Table Invariant

*For any* successful bootstrap sequence, all system tables (nodes, services, partitions, tables, message_groups, replica_operations) SHALL exist in the system cache with valid schemas before any CDC operations are attempted.

**Validates: Requirements 1.1, 1.4**

### Property 2: Code Path Uniqueness

*For any* class definition in the codebase (excluding allowed duplicates like LiveQueryManager), there SHALL be exactly one implementation file containing that class.

**Validates: Requirements 2.1, 2.2**

### Property 3: Leader Election Completion

*For any* Raft group (partition or message group) with N replicas running in worker processes, leader election SHALL complete within the configured timeout (default 10 seconds) and exactly one replica SHALL report `isLeader: true`.

**Validates: Requirements 3.1, 3.2, 5.1, 5.2**

### Property 4: CDC Event Delivery

*For any* CDC event generated by a partition leader, the event SHALL be delivered to all subscribed message group leaders, and those leaders SHALL replicate the event to their followers via Raft consensus.

**Validates: Requirements 3.3, 3.4**

### Property 5: UNIQUE Constraint Handling

*For any* INSERT operation on system tables (nodes, services) that would violate a UNIQUE constraint, the system SHALL either update the existing record (INSERT OR REPLACE) or return a clear error message—never silently fail or corrupt data.

**Validates: Requirements 4.1, 4.2**

### Property 6: Message Router Delivery Tracking

*For any* message sent through MessageGroupService with a valid transport, the MessageRouter.messageCount SHALL increment by exactly one, and the send operation SHALL return a result with messageId and status.

**Validates: Requirements 8.1, 8.2, 8.3, 9.3**

### Property 7: No Silent Delivery Failures

*For any* message delivery attempt when transport is null or unavailable, the MessageGroupService SHALL throw an error containing "WebSocket transport required" and SHALL NOT emit local events as a fallback.

**Validates: Requirements 9.1, 9.2**

### Property 8: CREATE_REPLICA Timeout Response

*For any* CREATE_REPLICA request that times out, the system SHALL return an error response object (not undefined) containing the timeout duration, and SHALL clean up any partially created resources.

**Validates: Requirements 7.1, 7.2, 7.3**

### Property 9: Test Configuration Compliance

*For any* property test file using fast-check, the numRuns configuration SHALL be set to 10, and *for any* unit test, execution time SHALL be under 2 seconds.

**Validates: Requirements 11.1, 11.2**

### Property 10: No Skipped Tests

*For any* test file in the test directory, there SHALL be zero occurrences of .skip(), xit(), xdescribe(), or commented-out test blocks.

**Validates: Requirements 11.4**

## Error Handling

### Bootstrap Errors

| Error Condition | Handling Strategy |
|-----------------|-------------------|
| System table not found | Create table schema before proceeding |
| CDC operation fails | Log error with table name, retry with backoff |
| Registration timeout | Return detailed error with phase information |

### Message Delivery Errors

| Error Condition | Handling Strategy |
|-----------------|-------------------|
| Transport null | Throw Error("WebSocket transport required but not available") |
| Delivery timeout | Return {success: false, error: "timeout"} |
| Routing failure | Retry with exponential backoff, then return error |

### Raft Election Errors

| Error Condition | Handling Strategy |
|-----------------|-------------------|
| Election timeout | Log diagnostic info (replica states, terms), return error |
| Split brain | Rely on Raft term comparison to resolve |
| Network partition | Continue with available quorum |

## Testing Strategy

### Dual Testing Approach

This fix requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs using fast-check

### Property-Based Testing Configuration

- Library: fast-check
- Minimum iterations: 10 (per testing guidelines)
- Each property test references its design document property
- Tag format: **Feature: test-failure-fixes, Property {number}: {property_text}**

### Test Categories

1. **Bootstrap Sequence Tests**
   - Verify system tables exist before CDC
   - Verify cache populated after bootstrap
   - Verify error handling for missing tables

2. **Code Path Uniqueness Tests**
   - Scan codebase for duplicate class definitions
   - Verify WorkerRaftNode exists in single location
   - Verify transport files serve distinct purposes

3. **Integration Tests**
   - Leader election with real Raft (no mocking)
   - CDC event flow across workers
   - UNIQUE constraint handling

4. **Message Delivery Tests**
   - Verify messageCount increments
   - Verify error on null transport
   - Verify no silent failures

### Empty Property Test Files

The following files need implementation or removal:

| File | Action |
|------|--------|
| aggregate-function-correctness.property.test.js | Already implemented - verify passing |
| cache-based-routing.property.test.js | Already implemented - verify passing |
| sql-query-pbt.test.js | Already implemented - verify passing |
| cross-partition-join.property.test.js | Implement or remove if not applicable |
| no-orphaned-replicas-after-recovery.property.test.js | Implement or remove |
| operation-log-persistence.property.test.js | Implement or remove |
| recovery-handles-incomplete-operations.property.test.js | Implement or remove |
| remove-workflow-step-progression.property.test.js | Implement or remove |
| cross-partition-rejection.property.test.js | Implement or remove |
| single-partition-acid.property.test.js | Implement or remove |
| transaction-durability-raft.property.test.js | Implement or remove |
| phase-lifecycle-events.property.test.js | Implement or remove |
