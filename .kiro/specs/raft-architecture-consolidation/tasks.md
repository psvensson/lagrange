# Implementation Plan: Raft Architecture Consolidation

## Overview

Refactor the distributed database's Raft consensus integration by extracting composable building blocks (PeerAddressResolver, RaftGroup, SQLiteStore, CDCEmitter), removing singleton coupling, converging on worker-based architecture, and decomposing the PartitionService god object. Each step is independently shippable.

## Tasks

- [x] 1. Extract PeerAddressResolver utility
  - [x] 1.1 Create `src/raft/peer-address-resolver-constants.js` with error messages and log messages
    - Define constants for error messages (peerAddressNotUnified, peerAddressUnresolved), log messages (PEER_ADDRESS_FROM_LIST, PEER_ADDRESS_FROM_CACHE), and the address separator
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 1.2 Create `src/raft/peer-address-resolver.js` implementing the PeerAddressResolver class
    - Constructor accepts addressManager, systemTableCache, entityType, and logger
    - Implement resolve(peerId, peerAddresses) with three resolution paths: unified format passthrough, peerAddresses array search, systemTableCache lookup
    - Throw descriptive errors for invalid addresses and unresolvable peers
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  - [x] 1.3 Write property tests for PeerAddressResolver in `test/raft/peer-address-resolver.property.test.js`
    - **Property 6: PeerAddressResolver unified address idempotence**
    - **Validates: Requirements 3.2**
    - **Property 7: PeerAddressResolver resolves from known sources**
    - **Validates: Requirements 3.3, 3.4**
    - **Property 8: PeerAddressResolver throws for unknown peers**
    - **Validates: Requirements 3.5**
  - [x] 1.4 Write unit tests for PeerAddressResolver in `test/raft/peer-address-resolver.test.js`
    - Test constructor validation (missing addressManager, missing systemTableCache)
    - Test resolve with already-unified address returns as-is
    - Test resolve with invalid unified address throws
    - Test resolve from peerAddresses array
    - Test resolve from systemTableCache
    - Test resolve throws for unknown peer with descriptive message
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2. Extract RaftGroup class
  - [x] 2.1 Create `src/raft/raft-group-constants.js` with event names, log messages, error messages, and default configuration values
    - Migrate relevant constants from raft-replica-base-constants.js
    - _Requirements: 1.1, 1.2_
  - [x] 2.2 Create `src/raft/raft-group.js` implementing the RaftGroup class
    - Constructor accepts all dependencies (replicaId, replicaIds, transport, entityType, peerAddressResolver, logAdapter, deferElection, heartbeatMs, electionMinMs, electionMaxMs, electionJitterPerReplicaMs, logger) — no singleton imports
    - Implement initialize() to create liferaft instance with jitter-based election timeouts and wire all six events (leader, follower, candidate, commit, leader-change, term-change)
    - Implement joinPeers() using PeerAddressResolver
    - Implement startElection() with single-replica leader promotion
    - Implement handleRaftPacket() with sender address validation
    - Implement shutdown() clearing all timers and ending liferaft
    - Emit events: leader, follower, candidate, commit, leaderChange, termChange, shutdown
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 6.1, 6.2, 6.3_
  - [x] 2.3 Write property tests for RaftGroup in `test/raft/raft-group.property.test.js`
    - **Property 1: RaftGroup initialize wires all expected events**
    - **Validates: Requirements 1.3**
    - **Property 2: RaftGroup joinPeers resolves all non-self peers**
    - **Validates: Requirements 1.4**
    - **Property 3: RaftGroup startElection on multi-replica group starts heartbeat**
    - **Validates: Requirements 1.5**
    - **Property 4: RaftGroup shutdown clears all state**
    - **Validates: Requirements 1.7**
    - **Property 5: RaftGroup handleRaftPacket validates sender and emits to liferaft**
    - **Validates: Requirements 1.8**
  - [x] 2.4 Write unit tests for RaftGroup in `test/raft/raft-group.test.js`
    - Test constructor validation (missing replicaId, missing entityType, missing transport)
    - Test single-replica group becomes leader immediately on startElection
    - Test deferred election clears timers
    - Test shutdown on uninitialized group is safe
    - Test double startElection is idempotent
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Remove singleton imports from RaftReplicaBase
  - [x] 4.1 Refactor `src/raft/raft-replica-base.js` to accept all dependencies via constructor
    - Remove `import {NodeService}` and `NodeService.getInstance()` call
    - Remove `LoggingService.getInstance()` call — accept logger as constructor option
    - Remove `AddressManager.getInstance()` call — accept addressManager as constructor option
    - Make systemTableCache a required constructor option (throw if missing)
    - Replace buildPeerAddress() with delegation to an injected PeerAddressResolver
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 6.4_
  - [x] 4.2 Update all callers of RaftReplicaBase to pass dependencies explicitly
    - Update PartitionService to pass systemTableCache, logger, and addressManager
    - Update MessageGroupService to pass systemTableCache, logger, and addressManager
    - Update any test files that construct RaftReplicaBase subclasses
    - _Requirements: 2.4_
  - [x] 4.3 Write unit tests verifying singleton removal in `test/raft/raft-replica-base.test.js`
    - Test that constructing without systemTableCache throws
    - Test that provided logger is used (not LoggingService singleton)
    - Test that provided addressManager is used (not AddressManager singleton)
    - Verify the module source does not contain `getInstance()` calls
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 6.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Extract SQLiteStore class
  - [x] 6.1 Create `src/storage/sqlite-store-constants.js` with error messages, log messages, and default values
    - Define constants for DB pragmas, default paths, error messages, SQL operation types
    - _Requirements: 5.1_
  - [x] 6.2 Create `src/storage/sqlite-store.js` implementing the SQLiteStore class
    - Constructor accepts dbPath, schema, tableName, logger
    - Implement initialize() to open database, set WAL/NORMAL pragmas, create table from schema
    - Implement executeQuery(sql, params) returning rows for SELECT, changes for writes
    - Implement close() for database shutdown
    - Implement getDatabase() for log adapter access
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 6.3 Write property tests for SQLiteStore in `test/storage/sqlite-store.property.test.js`
    - **Property 9: SQLiteStore query round-trip**
    - **Validates: Requirements 5.2, 5.3**
  - [x] 6.4 Write unit tests for SQLiteStore in `test/storage/sqlite-store.test.js`
    - Test initialize creates database and table from schema
    - Test executeQuery with SELECT returns rows
    - Test executeQuery with INSERT returns change count
    - Test close shuts down database cleanly
    - Test executeQuery on closed database throws
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 7. Extract CDCEmitter class
  - [x] 7.1 Create `src/cdc/cdc-emitter-constants.js` with error messages, log messages, and CDC operation constants
    - _Requirements: 5.4_
  - [x] 7.2 Create `src/cdc/cdc-emitter.js` implementing the CDCEmitter class
    - Constructor accepts partitionId, replicaId, tableName, hlcClock, logger
    - Implement emit(operation, data) generating CDC events with all required fields
    - Implement emitFromSQL(sql, params, info) extracting operation type and data from SQL
    - Implement subscribe(subscriber) and unsubscribe(subscriber)
    - Implement shutdown() clearing all subscribers
    - _Requirements: 5.4, 5.5_
  - [x] 7.3 Write property tests for CDCEmitter in `test/cdc/cdc-emitter.property.test.js`
    - **Property 10: CDCEmitter generates complete events for all write operations**
    - **Validates: Requirements 5.5**
  - [x] 7.4 Write unit tests for CDCEmitter in `test/cdc/cdc-emitter.test.js`
    - Test emit delivers to all subscribers
    - Test emit with missing operation throws
    - Test subscriber failure does not block other subscribers
    - Test unsubscribe removes subscriber
    - Test shutdown clears all subscribers
    - _Requirements: 5.4, 5.5_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Integrate RaftGroup into worker services
  - [x] 9.1 Refactor `src/worker/partition-worker-service.js` to use RaftGroup via composition
    - Replace inline liferaft creation in initializeRaft() with RaftGroup instantiation
    - Replace inline event handler setup with RaftGroup event forwarding
    - Replace inline joinPeers() with RaftGroup.joinPeers()
    - Use SQLiteStore for database management
    - Use CDCEmitter for CDC event generation
    - _Requirements: 1.9, 5.6_
  - [x] 9.2 Refactor `src/worker/message-group-worker-service.js` to use RaftGroup via composition
    - Replace inline liferaft creation with RaftGroup instantiation
    - Replace inline event handler setup with RaftGroup event forwarding
    - Replace inline joinPeers() with RaftGroup.joinPeers()
    - _Requirements: 1.9_
  - [x] 9.3 Refactor `src/raft/raft-replica-base.js` to delegate to RaftGroup
    - Replace createRaftInstance(), wireRaftEvents(), joinPeers(), startElection(), handleRaftPacket(), and shutdown() with delegation to an internal RaftGroup instance
    - Keep RaftReplicaBase as a backward-compatible wrapper during transition
    - _Requirements: 1.10_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Create PartitionCoordinator and thin facades
  - [x] 11.1 Create `src/partition/partition-coordinator.js` implementing the PartitionCoordinator class
    - Constructor accepts raftGroup, sqliteStore, cdcEmitter, and logger
    - Implement initialize() calling SQLiteStore → RaftGroup → CDCEmitter in sequence
    - Implement shutdown() calling CDCEmitter → RaftGroup → SQLiteStore in reverse
    - Implement executeQuery() delegating to SQLiteStore and triggering CDCEmitter for writes
    - Expose delegated accessors: getRole(), isLeaderReplica(), startElection()
    - _Requirements: 5.6, 5.7, 5.8, 5.9_
  - [x] 11.2 Convert PartitionService to thin facade
    - Remove all direct liferaft, SQLite, and CDC code from PartitionService
    - Delegate executeQuery, startElection, shutdown, getRole, isLeaderReplica to worker via ReplicaWorkerManager
    - Retain the public API surface for backward compatibility with callers
    - _Requirements: 4.1, 4.3, 4.5_
  - [x] 11.3 Convert MessageGroupService to thin facade
    - Remove all direct liferaft code from MessageGroupService
    - Delegate deliver, handleMessage, startElection, shutdown, getRole to worker via ReplicaWorkerManager
    - Retain the public API surface for backward compatibility with callers
    - _Requirements: 4.2, 4.4_
  - [x] 11.4 Write unit tests for PartitionCoordinator in `test/partition/partition-coordinator.test.js`
    - Test initialize calls components in correct order (SQLiteStore → RaftGroup → CDCEmitter)
    - Test shutdown calls components in reverse order (CDCEmitter → RaftGroup → SQLiteStore)
    - Test executeQuery delegates to SQLiteStore
    - Test write queries trigger CDCEmitter
    - _Requirements: 5.6, 5.7, 5.8, 5.9_

- [x] 12. Update architecture documentation
  - [x] 12.1 Update `architecture.md` to reflect the consolidated architecture
    - Add RaftGroup as the single source of Raft lifecycle management
    - Update PartitionService and MessageGroupService descriptions to reflect facade role
    - Document PeerAddressResolver as the single peer address resolution mechanism
    - Describe the PartitionCoordinator, SQLiteStore, CDCEmitter composition pattern
    - Remove references to duplicate Raft initialization patterns
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Run the full test suite. Ensure all tests pass, ask the user if questions arise.
  - _Requirements: 8.1_

## Notes

- All tasks including tests are required — no optional tasks
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major extraction
- The refactoring order ensures each step is independently shippable: PeerAddressResolver and RaftGroup have no dependencies on each other, singleton removal builds on PeerAddressResolver, SQLiteStore and CDCEmitter are independent extractions, and the final integration/facade steps build on all prior work
- Property tests use fast-check with `{numRuns: 10}` per project testing guidelines
- All new code follows Google JS lint standard with constants in dedicated files
