# Implementation Plan: Guideline Violations Cleanup

## Overview

Incremental cleanup of seven guideline violations. Each task addresses one or two related violations, with tests placed close to the implementation they validate. Changes are ordered so that shared constants are created first, then consumers are updated, then structural refactors are applied.

## Tasks

- [x] 1. Add terminal status constants and direction constants to replica-status.js
  - [x] 1.1 Add `TERMINAL_STATUSES` array, `TERMINAL_STATUS_SQL_CLAUSE` string, and `ADJUST_DIRECTION` enum to `src/rebalancer/replica-status.js`
    - `TERMINAL_STATUSES = [ReplicaStatus.ACTIVE, ReplicaStatus.REMOVED, ReplicaStatus.FAILED]`
    - `TERMINAL_STATUS_SQL_CLAUSE` built programmatically from the array
    - `ADJUST_DIRECTION = { UP: 'up', DOWN: 'down' }`
    - Export all three new constants
    - _Requirements: 4.1, 5.2_
  - [x] 1.2 Write property test for terminal status SQL clause consistency
    - **Property 2: Terminal status SQL clause consistency**
    - **Validates: Requirements 4.1, 4.4**
  - [x] 1.3 Write unit test for TERMINAL_STATUSES and ADJUST_DIRECTION constants
    - Verify TERMINAL_STATUSES contains exactly [active, removed, failed]
    - Verify ADJUST_DIRECTION has UP and DOWN keys
    - _Requirements: 4.1, 5.2_

- [x] 2. Replace magic strings in rebalancer SQL queries
  - [x] 2.1 Update `src/rebalancer/unified-rebalancer.js` SQL_BUDGET to use `TERMINAL_STATUS_SQL_CLAUSE`
    - Import `TERMINAL_STATUS_SQL_CLAUSE` and `ADJUST_DIRECTION` from replica-status.js
    - Replace inline `('active', 'removed', 'failed')` with `(${TERMINAL_STATUS_SQL_CLAUSE})`
    - Replace `'up'` and `'down'` string literals in `adjustToOddCount` with `ADJUST_DIRECTION.UP` and `ADJUST_DIRECTION.DOWN`
    - _Requirements: 4.2, 5.1, 5.2, 5.3_
  - [x] 2.2 Update `src/rebalancer/rebalance-coordinator.js` SQL constants to use `TERMINAL_STATUS_SQL_CLAUSE`
    - Import `TERMINAL_STATUS_SQL_CLAUSE` from replica-status.js
    - Replace all inline `('active', 'removed', 'failed')` in SQL object with `(${TERMINAL_STATUS_SQL_CLAUSE})`
    - _Requirements: 4.3_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Remove dead `_nodeStates` field from CDCIntegrationService
  - [x] 4.1 Remove `this._nodeStates = new Map()` from `src/cdc/cdc-integration-service.js` constructor
    - _Requirements: 1.1, 1.2_
  - [x] 4.2 Write unit test verifying CDCIntegrationService has no `_nodeStates` field
    - _Requirements: 1.1_

- [x] 5. Add FailureDetector SQL engine upgrade capability
  - [x] 5.1 Add `upgradeSqlQueryEngine(sqlQueryEngine)` method and `_usingCacheBackedFacade` flag to `src/node/failure-detector.js`
    - Set `_usingCacheBackedFacade = true` in `createCacheBackedSqlQueryEngine()`
    - `upgradeSqlQueryEngine()` replaces `this.sqlQueryEngine` and sets flag to false
    - No-op if called with null/undefined
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 5.2 Write property test for FailureDetector SQL engine upgrade
    - **Property 3: FailureDetector SQL engine upgrade**
    - **Validates: Requirements 6.2, 6.3**
  - [x] 5.3 Write unit test for FailureDetector cache-backed facade creation and upgrade
    - Test facade is created when no SQL engine provided
    - Test upgrade replaces facade with real engine
    - Test upgrade with null is no-op
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Remove duplicate replica state from ReplicaHandler
  - [x] 7.1 Refactor `src/node/replica-handler.js` to remove `localReplicas` Map and add `localServices` Map
    - Replace `this.localReplicas = new Map()` with `this.localServices = new Map()` (stores only service references keyed by replicaId)
    - Update `getLocalReplica(replicaId)` to read from `systemTableCache.get(SystemTableName.SERVICES, replicaId)` and merge with `localServices` for the service reference
    - Update `getAllLocalReplicas()` to use `systemTableCache.filter(SystemTableName.SERVICES, row => row.node_id === this.nodeId)`
    - Update `registerExistingReplica()` to store only service reference in `localServices`
    - Update `handleCreateReplica()` idempotency checks to use cache + inProgressOperations
    - Update `handleRemoveReplica()` existence checks to use cache + inProgressOperations
    - Update `createReplicaAsync()` to store service in `localServices` instead of `localReplicas`
    - Update `removeReplicaAsync()` to clean up `localServices` instead of `localReplicas`
    - Update `isReplicaVoterReady()` to get service from `localServices`
    - Update `shutdown()` to clear `localServices`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x] 7.2 Write property test for ReplicaHandler idempotency using cache state
    - **Property 1: ReplicaHandler idempotency uses cache state**
    - **Validates: Requirements 2.2, 2.3**
  - [x] 7.3 Write unit tests for ReplicaHandler cache-based state access
    - Test getLocalReplica reads from cache
    - Test registerExistingReplica stores only service reference
    - Test handleCreateReplica idempotency with cache state
    - _Requirements: 2.1, 2.2, 2.5_

- [x] 8. Remove duplicate replica state from PullBasedReplicaAssigner
  - [x] 8.1 Refactor `src/rebalancer/pull-based-replica-assigner.js` to remove `_localReplicas` Map
    - Remove `this._localReplicas = new Map()` from constructor
    - Update `createLocalReplicas()` to not track status locally, just delegate to ReplicaHandler
    - Update `syncReplicaData()` to not track status locally, delegate to ReplicaHandler for status
    - Update `getLocalReplicaStatus()` to delegate to ReplicaHandler's `getLocalReplica()`
    - Remove `getAllLocalReplicas()` method (callers should use cache)
    - _Requirements: 3.1, 3.2_
  - [x] 8.2 Write unit test verifying PullBasedReplicaAssigner has no `_localReplicas` field
    - _Requirements: 3.1_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Wire in ReplicaHandlerSetup shared component
  - [x] 10.1 Update `src/bootstrap/bootstrap-service.js` to use `ReplicaHandlerSetup.create()`
    - Import `ReplicaHandlerSetup` from `../bootstrap/shared/replica-handler-setup.js`
    - Replace inline `initializeReplicaHandler()` body with call to `ReplicaHandlerSetup.create()`
    - Pass caller-specific `createPartitionService` factory
    - Keep `registerPartitionsWithReplicaHandler()` and `registerReplicasWithStateMachine()` calls after setup
    - Remove direct imports of `ReplicaHandler` and `ReplicaStateMachine` if no longer needed
    - _Requirements: 7.1, 7.3, 7.4_
  - [x] 10.2 Update `src/bootstrap/node-joining-service.js` to use `ReplicaHandlerSetup.create()`
    - Import `ReplicaHandlerSetup` from `../bootstrap/shared/replica-handler-setup.js`
    - Replace inline `initializeReplicaHandler()` body with call to `ReplicaHandlerSetup.create()`
    - Pass caller-specific `createPartitionService` factory
    - Remove direct imports of `ReplicaHandler` and `ReplicaStateMachine` if no longer needed
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required
- Each task references specific requirements for traceability
- Constants are created first (task 1) so consumers (tasks 2, 7, 8) can reference them
- ReplicaHandler refactor (task 7) is the most complex change and is placed after simpler changes
- ReplicaHandlerSetup wiring (task 10) is last because it depends on the ReplicaHandler refactor being stable
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
