# Error Message Pattern Audit

## Overview

This document identifies error messages in `src/` that use string concatenation or template literals with inline variables, which need to be migrated to the function-based generation pattern per Requirement 7.5.

**Target Pattern:**
```javascript
const ERROR_MSG = Object.freeze({
  invalidState: (state) => `Invalid state: ${state}`,
});
throw new Error(ERROR_MSG.invalidState(currentState));
```

## Priority Modules (Task 8.2)

### 1. Query Module (`src/query/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `sql-parser.js` | 120 | `'Unsupported statement type: ' + ast.type` | `unsupportedStatementType: (type) => \`Unsupported statement type: ${type}\`` |
| `sql-parser.js` | 193 | `'Unsupported CREATE type: ' + ast.keyword` | `unsupportedCreateType: (keyword) => \`Unsupported CREATE type: ${keyword}\`` |
| `sql-parser.js` | 271 | `'Unsupported DROP type: ' + ast.keyword` | `unsupportedDropType: (keyword) => \`Unsupported DROP type: ${keyword}\`` |
| `sql-parser.js` | 391 | `'Unknown expression type: ' + expr.type` | `unknownExpressionType: (type) => \`Unknown expression type: ${type}\`` |
| `sql-query-engine.js` | 731 | `` `${QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND_PREFIX}${partitionId}` `` | Already uses prefix pattern - convert to function |
| `sql-query-engine.js` | 764 | `` `${QUERY_ERROR_MSG.SYSTEM_CACHE_NOT_AVAILABLE}: ${tableName}` `` | `systemCacheNotAvailable: (tableName) => \`System cache not available for table: ${tableName}\`` |

### 2. Partition Module (`src/partition/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `partition-service.js` | 460 | `` `Peer address must be unified: ${peerId}` `` | `peerAddressNotUnified: (peerId) => \`Peer address must be unified: ${peerId}\`` |
| `partition-service.js` | 476 | `` `Peer address must be unified: ${addr}` `` | Same as above |
| `partition-service.js` | 514 | `` `Unable to resolve unified peer address for ${peerId}` `` | `unableToResolvePeerAddress: (peerId) => \`Unable to resolve unified peer address for ${peerId}\`` |
| `partition-service.js` | 3300 | `` `Delivery failed: ${errorMsg}` `` | `deliveryFailed: (errorMsg) => \`Delivery failed: ${errorMsg}\`` |

### 3. Transport Module (`src/transport/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `message-router.js` | 343 | `` `listen EADDRINUSE: address already in use 127.0.0.1:${portKey}` `` | `addressInUse: (portKey) => \`listen EADDRINUSE: address already in use 127.0.0.1:${portKey}\`` |
| `message-router.js` | 541 | `` `connect ECONNREFUSED ${connectionInfo.address}` `` | `connectionRefused: (address) => \`connect ECONNREFUSED ${address}\`` |

## Other Modules Requiring Migration

### Raft Module (`src/raft/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `sqlite-log-adapter.js` | 308 | `` `Entry not found at index ${index}` `` | `entryNotFound: (index) => \`Entry not found at index ${index}\`` |
| `raft-transport-adapter.js` | 105 | `` `Invalid unified address format: ${validation.error}` `` | `invalidUnifiedAddressFormat: (error) => \`Invalid unified address format: ${error}\`` |
| `raft-transport-adapter.js` | 116 | `` `Unable to resolve unified peer address for ${peerId}` `` | `unableToResolvePeerAddress: (peerId) => \`Unable to resolve unified peer address for ${peerId}\`` |

### Bootstrap Module (`src/bootstrap/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `bootstrap-partition-writer.js` | 186 | `` `No partition service found for table: ${tableName}` `` | `noPartitionServiceForTable: (tableName) => \`No partition service found for table: ${tableName}\`` |
| `bootstrap-partition-writer.js` | 198 | `` `No initialized partition service found for table: ${tableName}` `` | `noInitializedPartitionService: (tableName) => \`No initialized partition service found for table: ${tableName}\`` |
| `bootstrap-partition-writer.js` | 253 | `` `Unknown operation type: ${operation}` `` | `unknownOperationType: (operation) => \`Unknown operation type: ${operation}\`` |
| `node-joining-service.js` | 1413 | `` `Failed to register node: ${result.error}` `` | `failedToRegisterNode: (error) => \`Failed to register node: ${error}\`` |
| `node-joining-service.js` | 1462 | `` `Failed to register endpoint: ${endpointResult.error}` `` | `failedToRegisterEndpoint: (error) => \`Failed to register endpoint: ${error}\`` |
| `phases/join-message-group-phase.js` | 105 | `` `Unknown assignment strategy: ${assignment.strategy}` `` | `unknownAssignmentStrategy: (strategy) => \`Unknown assignment strategy: ${strategy}\`` |
| `phases/query-state-phase.js` | 370 | `` `Failed to register node: ${result.error}` `` | Same as node-joining-service |
| `phases/query-state-phase.js` | 435 | `` `Failed to register endpoint: ${endpointResult.error}` `` | Same as node-joining-service |
| `phases/registration-phase.js` | 230 | `` `Partition leadership timeout after ${timeoutMs}ms. Missing: ${missing.join(', ')}` `` | `partitionLeadershipTimeout: (timeoutMs, missing) => \`Partition leadership timeout after ${timeoutMs}ms. Missing: ${missing}\`` |

### Transaction Module (`src/transaction/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `transaction-manager.js` | 241 | `` `Transaction not found: ${transactionId}` `` | `transactionNotFound: (transactionId) => \`Transaction not found: ${transactionId}\`` |
| `transaction-manager.js` | 245 | `` `Transaction is not active: ${transaction.state}` `` | `transactionNotActive: (state) => \`Transaction is not active: ${state}\`` |

### CDC Module (`src/cdc/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `cdc-integration-service.js` | 248 | `` `${operation}${CDC_ERROR_MSG.DATA_REQUIRED_SUFFIX}` `` | Already uses suffix pattern - convert to function |
| `cdc-integration-service.js` | 283 | `` `Could not extract table name from SQL: ${sql}` `` | `couldNotExtractTableName: (sql) => \`Could not extract table name from SQL: ${sql}\`` |

### Message Group Module (`src/message-group/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `message-group-service.js` | 321 | `` `Peer address must be unified: ${peerId}` `` | `peerAddressNotUnified: (peerId) => \`Peer address must be unified: ${peerId}\`` |
| `message-group-service.js` | 336 | `` `Peer address must be unified: ${addr}` `` | Same as above |
| `message-group-service.js` | 361 | `` `Unable to resolve unified peer address for ${peerId}` `` | `unableToResolvePeerAddress: (peerId) => \`Unable to resolve unified peer address for ${peerId}\`` |

### CLI Module (`src/cli/`)

| File | Line | Current Pattern | Suggested Function |
|------|------|-----------------|-------------------|
| `core/component-registry.js` | 75 | `` `Circular dependency detected: ${circularDep.join(' -> ')}` `` | `circularDependency: (chain) => \`Circular dependency detected: ${chain}\`` |
| `core/component-registry.js` | 107 | `` `Component not registered: ${name}` `` | `componentNotRegistered: (name) => \`Component not registered: ${name}\`` |
| `core/component-registry.js` | 114 | `` `Dependency not found: ${depName} (required by ${name})` `` | `dependencyNotFound: (depName, requiredBy) => \`Dependency not found: ${depName} (required by ${requiredBy})\`` |
| `core/navigation-controller.js` | 168 | `` `Invalid view: ${view}` `` | `invalidView: (view) => \`Invalid view: ${view}\`` |
| `core/navigation-controller.js` | 214 | `` `Invalid view: ${view}` `` | Same as above |
| `core/navigation-controller.js` | 248 | `` `Unknown entity type: ${entityType}` `` | `unknownEntityType: (entityType) => \`Unknown entity type: ${entityType}\`` |
| `core/view-detail-coordinator.js` | 296 | `` `Invalid layout: ${layout}` `` | `invalidLayout: (layout) => \`Invalid layout: ${layout}\`` |
| `core/remote-cache.js` | 62 | `` `Unknown table: ${tableName}` `` | `unknownTable: (tableName) => \`Unknown table: ${tableName}\`` |
| `core/state-manager.js` | 140 | `` `Invalid state transition: ${validationError}` `` | `invalidStateTransition: (error) => \`Invalid state transition: ${error}\`` |
| `core/state-manager.js` | 236 | `` `Snapshot at index ${index} does not exist` `` | `snapshotNotFound: (index) => \`Snapshot at index ${index} does not exist\`` |
| `core/connection-manager.js` | 255 | `` `Failed to parse message: ${err.message}` `` | `failedToParseMessage: (error) => \`Failed to parse message: ${error}\`` |

## Summary Statistics

| Module | Files Affected | Error Patterns to Migrate |
|--------|---------------|--------------------------|
| Query | 2 | 6 |
| Partition | 1 | 4 |
| Transport | 1 | 2 |
| Raft | 2 | 3 |
| Bootstrap | 4 | 9 |
| Transaction | 1 | 2 |
| CDC | 1 | 2 |
| Message Group | 1 | 3 |
| CLI | 6 | 11 |
| **Total** | **19** | **42** |

## Notes

1. **Already Using Constants**: Some files already use `_ERROR_MSG` constants with `_PREFIX` or `_SUFFIX` patterns. These should be converted to function-based patterns for consistency.

2. **Shared Error Messages**: Several error messages are duplicated across modules (e.g., "Peer address must be unified"). Consider creating shared error functions in a common location.

3. **Priority Order**: Task 8.2 specifies migrating query, partition, and transport modules first. These should be addressed before other modules.

4. **Existing Constants Files**: Most modules already have `*-constants.js` files with `_ERROR_MSG` objects. New error functions should be added to these existing files.
