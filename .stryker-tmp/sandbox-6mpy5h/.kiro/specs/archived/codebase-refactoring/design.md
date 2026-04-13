# Design Document: Codebase Refactoring

## Overview

This design document describes the approach for refactoring the distributed database system codebase to improve code quality, understandability, and navigability. The refactoring focuses on three main areas:

1. **Large File Decomposition**: Breaking down 7 files exceeding 1500 lines into smaller, focused modules
2. **Constants Centralization**: Consolidating scattered constants into dedicated files
3. **Documentation Consistency**: Adding comprehensive JSDoc documentation to all public interfaces

The refactoring maintains all existing functionality and test coverage while following established codebase patterns.

## Architecture

### Current State Analysis

The codebase has solid architectural foundations with good patterns already in place:
- `src/constants/` directory with domain-specific constant files
- `*-constants.js` files co-located with modules
- Constructor-based dependency injection
- Phase state machines for multi-step operations
- Message handler registry pattern for routing

However, several large files have accumulated multiple responsibilities:

| File | Lines | Primary Issues |
|------|-------|----------------|
| `partition-service.js` | 3098 | Raft node class inline, multiple handler types |
| `message-router.js` | 2043 | InProc transport inline, connection management mixed with routing |
| `unified-rebalancer.js` | 2028 | Policy evaluation, move planning, execution all in one |
| `cdc-integration-service.js` | 1864 | Bootstrap mode, SQL routing, CDC processing combined |
| `cli/index.js` | 1833 | Application lifecycle, view coordination, keyboard handling |
| `bootstrap-service.js` | 1575 | Already partially decomposed, needs verification |
| `message-group-service.js` | 1542 | Raft storage inline, message handling mixed |

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Refactored Module Structure                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  src/constants/                                                             │
│  ├── subsystems.js          (NEW - all SUBSYSTEM identifiers)               │
│  ├── time.js                (EXTENDED - all timeout values)                 │
│  ├── ... (existing files)                                                   │
│                                                                             │
│  src/partition/                                                             │
│  ├── partition-service.js   (REDUCED - coordinator only)                    │
│  ├── partition-raft-node.js (NEW - extracted RaftNode class)                │
│  ├── partition-query-handler.js (NEW - query execution logic)               │
│  ├── partition-replication-handler.js (NEW - replication logic)             │
│  └── ... (existing extracted modules)                                       │
│                                                                             │
│  src/transport/                                                             │
│  ├── message-router.js      (REDUCED - routing only)                        │
│  ├── inproc-transport.js    (NEW - in-process transport)                    │
│  ├── connection-manager.js  (NEW - connection lifecycle)                    │
│  ├── outbound-queue.js      (NEW - queue management)                        │
│  └── ... (existing files)                                                   │
│                                                                             │
│  src/rebalancer/                                                            │
│  ├── unified-rebalancer.js  (REDUCED - coordination only)                   │
│  ├── policy-evaluator.js    (NEW - policy evaluation logic)                 │
│  ├── move-planner.js        (NEW - move calculation)                        │
│  ├── move-executor.js       (NEW - move execution)                          │
│  └── ... (existing files)                                                   │
│                                                                             │
│  src/cdc/                                                                   │
│  ├── cdc-integration-service.js (REDUCED - coordination only)               │
│  ├── cdc-sql-router.js      (NEW - SQL routing logic)                       │
│  ├── cdc-event-processor.js (NEW - event processing)                        │
│  └── ... (existing files)                                                   │
│                                                                             │
│  src/cli/                                                                   │
│  ├── index.js               (REDUCED - entry point only)                    │
│  ├── app-lifecycle.js       (NEW - application lifecycle)                   │
│  ├── view-coordinator.js    (NEW - view management)                         │
│  └── ... (existing subdirectories)                                          │
│                                                                             │
│  src/message-group/                                                         │
│  ├── message-group-service.js (REDUCED - coordination only)                 │
│  ├── message-group-raft-storage.js (NEW - Raft storage)                     │
│  ├── message-delivery-handler.js (NEW - delivery logic)                     │
│  └── ... (existing files)                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Partition Service Decomposition

The `PartitionService` (3098 lines) will be decomposed into focused modules:

```javascript
// partition-raft-node.js - Extracted RaftNode class
class PartitionRaftNode extends LifeRaft {
  constructor(options) { /* ... */ }
  initialize() { /* deferred election support */ }
  write(data) { /* Raft write operation */ }
}

// partition-query-handler.js - Query execution logic
class PartitionQueryHandler {
  constructor({db, partitionId, logger}) { /* ... */ }
  executeQuery(sql, params) { /* ... */ }
  executeLocalQuery(sql, params) { /* ... */ }
}

// partition-replication-handler.js - Replication logic
class PartitionReplicationHandler {
  constructor({raftNode, messageRouter, logger}) { /* ... */ }
  handleReplicationMessage(message) { /* ... */ }
  forwardToLeader(message) { /* ... */ }
}
```

### 2. Message Router Decomposition

The `MessageRouter` (2043 lines) will be decomposed:

```javascript
// inproc-transport.js - In-process transport for testing
class InProcWebSocket extends EventEmitter { /* ... */ }
class InProcServer { /* ... */ }
function createInProcWebSocketPair() { /* ... */ }

// connection-manager.js - Connection lifecycle management
class ConnectionManager extends EventEmitter {
  constructor({nodeId, logger}) { /* ... */ }
  connect(nodeId, address) { /* ... */ }
  disconnect(nodeId) { /* ... */ }
  getConnection(nodeId) { /* ... */ }
}

// outbound-queue.js - Outbound message queue management
class OutboundQueue {
  constructor({maxConcurrent, logger}) { /* ... */ }
  enqueue(nodeId, deliverFn) { /* ... */ }
  isAvailable(nodeId) { /* ... */ }
}
```

### 3. Unified Rebalancer Decomposition

The `UnifiedRebalancer` (2028 lines) will be decomposed:

```javascript
// policy-evaluator.js - Policy evaluation logic
class PolicyEvaluator {
  constructor({tablePolicyService, systemTableCache}) { /* ... */ }
  getPolicy(entityType, entityId) { /* ... */ }
  applyPolicy(policy, currentReplicas) { /* ... */ }
  isCriticalState(replicas, policy) { /* ... */ }
}

// move-planner.js - Move calculation logic
class MovePlanner {
  constructor({systemTableCache, logger}) { /* ... */ }
  calculateTargetState(currentReplicas, policy) { /* ... */ }
  calculateMoves(currentReplicas, targetState) { /* ... */ }
  sortNodesBySuitability(nodes, policy) { /* ... */ }
}

// move-executor.js - Move execution logic
class MoveExecutor extends EventEmitter {
  constructor({rebalanceCoordinator, logger}) { /* ... */ }
  executeMove(move) { /* ... */ }
  executeMovesBatch(moves, batchSize) { /* ... */ }
}
```

### 4. CDC Integration Service Decomposition

The `CDCIntegrationService` (1864 lines) will be decomposed:

```javascript
// cdc-sql-router.js - SQL routing logic
class CDCSqlRouter {
  constructor({sqlQueryEngine, logger}) { /* ... */ }
  routeInsert(tableName, data) { /* ... */ }
  routeUpdate(tableName, data, where) { /* ... */ }
  routeDelete(tableName, where) { /* ... */ }
}

// cdc-event-processor.js - CDC event processing
class CDCEventProcessor extends EventEmitter {
  constructor({systemTableCache, logger}) { /* ... */ }
  processEvent(event) { /* ... */ }
  validateEvent(event) { /* ... */ }
}
```

### 5. CLI Decomposition

The `AdminCLI` (1833 lines) will be decomposed:

```javascript
// app-lifecycle.js - Application lifecycle management
class AppLifecycle extends EventEmitter {
  constructor({screen, logger}) { /* ... */ }
  start() { /* ... */ }
  shutdown() { /* ... */ }
}

// view-coordinator.js - View management
class ViewCoordinator {
  constructor({viewManager, navigation, eventBus}) { /* ... */ }
  switchView(viewName) { /* ... */ }
  refreshCurrentView() { /* ... */ }
}
```

### 6. Message Group Service Decomposition

The `MessageGroupService` (1542 lines) will be decomposed:

```javascript
// message-group-raft-storage.js - In-memory Raft storage
class MessageGroupRaftStorage {
  constructor() { /* ... */ }
  appendEntry(data) { /* ... */ }
  getEntriesFrom(startIndex) { /* ... */ }
}

// message-delivery-handler.js - Message delivery logic
class MessageDeliveryHandler extends EventEmitter {
  constructor({raftNode, messageRouter, logger}) { /* ... */ }
  deliver(message, targetAddress) { /* ... */ }
  handleDeliveryAck(messageId) { /* ... */ }
}
```

### 7. Constants Centralization

#### New Subsystems Constants File

```javascript
// src/constants/subsystems.js
const SUBSYSTEM = Object.freeze({
  // Bootstrap
  BOOTSTRAP: 'bootstrap',
  MESSAGE_ROUTER_SETUP: 'message-router-setup',
  CONTROL_PLANE_SETUP: 'control-plane-setup',
  REPLICA_HANDLER_SETUP: 'replica-handler-setup',
  CDC_INTEGRATION_SETUP: 'cdc-integration-setup',
  SERVICE_LIFECYCLE: 'service-lifecycle',
  MESSAGE_GROUP_ASSIGNMENT: 'message-group-assignment',
  
  // Transport
  MESSAGE_ROUTER: 'message-router',
  WEBSOCKET_TRANSPORT: 'websocket-transport',
  WEBSOCKET_TRANSPORT_PROVIDER: 'websocket-transport-provider',
  TRANSPORT_REGISTRY: 'transport-registry',
  CONNECTION_POOL: 'connection-pool',
  RPC_CLIENT: 'rpc-client',
  
  // Node
  NODE_SERVICE: 'node-service',
  NODE_LIFECYCLE: 'node-lifecycle',
  NODE_LIFECYCLE_STATE_MACHINE: 'node-lifecycle-state-machine',
  FAILURE_DETECTOR: 'failure-detector',
  NODE_REINTEGRATION: 'node-reintegration',
  REPLICA_HANDLER: 'replica-handler',
  REPLICA_STATE_MACHINE: 'replica-state-machine',
  REPLICA_LIFECYCLE: 'replica-lifecycle',
  REPLICA_RECOVERY: 'replica-recovery',
  
  // Core Services
  PARTITION: 'partition',
  MESSAGE_GROUP: 'message-group',
  CDC: 'cdc',
  CONTROL_PLANE: 'control-plane',
  REBALANCER: 'rebalancer',
  
  // Other
  HLC: 'hlc',
  STORAGE: 'storage',
  THREADING: 'threading',
  TRANSACTION: 'transaction-manager',
});

export {SUBSYSTEM};
```

#### Extended Time Constants

```javascript
// src/constants/time.js (additions)
const TIME_MS = Object.freeze({
  // ... existing constants ...
  
  // Timeouts
  DEFAULT_RPC_TIMEOUT: 30000,
  DEFAULT_QUERY_TIMEOUT: 30000,
  DEFAULT_MESSAGE_TIMEOUT: 5000,
  DEFAULT_PING_TIMEOUT: 1000,
  DEFAULT_HTTP_TIMEOUT: 10000,
  DEFAULT_LEADERSHIP_WAIT_TIMEOUT: 30000,
  DEFAULT_MOVE_TIMEOUT: 10000,
  
  // Intervals
  DEFAULT_PING_INTERVAL: 30000,
  DEFAULT_CLEANUP_INTERVAL: 60000,
  DEFAULT_STATS_COLLECTION_INTERVAL: 10000,
  DEFAULT_EVALUATION_INTERVAL: 300000,
  
  // Delays
  DEFAULT_RECONNECT_INTERVAL: 1000,
  DEFAULT_STALE_REQUEST_BUFFER: 5000,
  DEFAULT_CACHE_DUMP_TIMEOUT: 5000,
  
  // Bootstrap-specific
  BOOTSTRAP_INFRA_TIMEOUT: 5000,
  BOOTSTRAP_RAFT_ELECTION_TIMEOUT: 30000,
  BOOTSTRAP_SYSTEM_TABLE_SEED_TIMEOUT: 10000,
  BOOTSTRAP_CACHE_HYDRATION_TIMEOUT: 10000,
  BOOTSTRAP_CDC_SUBSCRIBE_TIMEOUT: 5000,
  BOOTSTRAP_CONTROL_PLANE_REGISTER_TIMEOUT: 10000,
  BOOTSTRAP_REBALANCE_DELAY: 45000,
});
```

## Data Models

No new data models are introduced. The refactoring preserves all existing data structures and only reorganizes code into smaller modules.



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties can be verified through automated testing. Note that many requirements in this refactoring spec are about code organization and process, which are verified through integration tests (running the test suite) rather than property-based tests.

### Property 1: File Size Constraint

*For any* source file in the refactored directories (partition, transport, rebalancer, cdc, cli, message-group), the file SHALL have fewer than 500 lines of code.

**Validates: Requirements 1.8**

This property ensures that the decomposition achieves its goal of creating smaller, focused modules. It can be verified by scanning all JavaScript files in the target directories and checking their line counts.

### Property 2: Constants Organization

*For any* constant value used in the codebase, it SHALL be defined in exactly one location (either a central `src/constants/*.js` file or a co-located `*-constants.js` file), and all constant objects SHALL use `Object.freeze()` for immutability.

**Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.7**

This property ensures that:
- Subsystem identifiers are centralized in `src/constants/subsystems.js`
- Timeout values are centralized in `src/constants/time.js`
- No naked scalar values appear in implementation code
- All constant objects are immutable
- No duplicate constant definitions exist

### Property 3: Documentation Completeness

*For any* exported class, public method, or constants file in the codebase, it SHALL have complete JSDoc documentation including: file-level module description, @interface blocks for classes, @param/@return/@throws for methods, and Requirements references.

**Validates: Requirements 2.6, 3.1, 3.2, 3.3, 3.4, 3.5**

This property ensures consistent documentation across the codebase.

### Property 4: No ESLint Override Comments

*For any* source file in the codebase, it SHALL NOT contain eslint-disable, eslint-enable, or eslint-ignore comments.

**Validates: Requirements 5.2**

This property ensures that all code follows the ESLint rules without exceptions.

### Property 5: Module Structure Consistency

*For any* module directory in the codebase, it SHALL follow the established patterns: related files co-located in the same directory, an index.js file exporting the public interface, and constants files following the `{module-name}-constants.js` naming convention.

**Validates: Requirements 8.1, 8.2, 8.4**

This property ensures predictable module organization.

## Error Handling

The refactoring does not introduce new error handling patterns. All existing error handling is preserved:

1. **Try/catch errors**: Must be re-thrown or clearly logged (never swallowed)
2. **Validation errors**: Thrown at construction time for missing dependencies
3. **Runtime errors**: Propagated through the existing error handling chain

When extracting modules, error handling code moves with its associated logic. No new error types are introduced.

## Testing Strategy

### Dual Testing Approach

The refactoring verification uses both unit tests and property-based tests:

**Unit Tests (Existing)**:
- All existing unit tests must pass without modification
- Tests verify specific examples and edge cases
- Run after each file decomposition to catch regressions

**Property Tests (New)**:
- Verify universal properties across the codebase
- Use fast-check with `{numRuns: 10}` per project guidelines
- Focus on structural properties (file sizes, constants organization, documentation)

### Property-Based Testing Configuration

- Library: fast-check
- Iterations: 10 per property (per testing-guidelines.md)
- Tag format: **Feature: codebase-refactoring, Property {number}: {property_text}**

### Test Execution Strategy

1. **Per-file refactoring**: Run targeted tests for the module being refactored
2. **Checkpoints**: Run full test suite after completing each major file
3. **Final verification**: Run complete test suite after all refactoring

### Verification Approach

Since this is a refactoring spec (not new functionality), the primary verification is:

1. **All existing tests pass**: The refactoring must not break any existing functionality
2. **ESLint passes**: All code must follow the Google JS style guide
3. **Structural properties hold**: File sizes, constants organization, and documentation meet requirements

### Property Test Implementation Notes

The structural properties (1-5) are best implemented as static analysis tests that scan the codebase:

```javascript
// Example: Property 1 - File Size Constraint
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';

// Feature: codebase-refactoring, Property 1: File Size Constraint
test('all refactored files are under 500 lines', () => {
  const targetDirs = ['partition', 'transport', 'rebalancer', 'cdc', 'cli', 'message-group'];
  const files = getAllJsFiles(targetDirs);
  
  fc.assert(
    fc.property(
      fc.constantFrom(...files),
      (filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        const lineCount = content.split('\n').length;
        return lineCount < 500;
      }
    ),
    {numRuns: 10}
  );
});
```

```javascript
// Example: Property 4 - No ESLint Override Comments
// Feature: codebase-refactoring, Property 4: No ESLint Override Comments
test('no eslint-disable comments in codebase', () => {
  const files = getAllJsFiles(['src']);
  
  fc.assert(
    fc.property(
      fc.constantFrom(...files),
      (filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        return !content.includes('eslint-disable') && 
               !content.includes('eslint-enable') &&
               !content.includes('eslint-ignore');
      }
    ),
    {numRuns: 10}
  );
});
```
