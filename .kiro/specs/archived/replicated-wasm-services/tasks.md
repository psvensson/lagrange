# Implementation Plan: Replicated WASM Services

## Overview

Incremental implementation of WASM service groups as a third Raft group type. Tasks build from constants and data models up through core components, then wire everything together. Each task references specific requirements for traceability.

## Tasks

- [x] 1. Add constants, system table schemas, and data models
  - [x] 1.1 Add `WASM_SERVICE` to `SERVICE_TYPE` in `src/constants/service.js`, add `SERVICE_DEFINITIONS`, `SERVICE_ENDPOINTS`, `SERVICE_TIMERS` to `TABLES` in `src/constants/tables.js`, and add `WASM_SERVICE` to `REBALANCER_ENTITY_TYPE` in `src/rebalancer/rebalancer-constants.js`
    - _Requirements: 12.1, 12.2_
  - [x] 1.2 Create `src/wasm-service/wasm-service-constants.js` with all constants for the WASM service subsystem (consistency modes, timer statuses, error messages, log messages, default resource budget values, reserved KV prefixes)
    - _Requirements: 4.1, 4.4, 5.1, 5.2, 10.1, 10.2_
  - [x] 1.3 Create data model serialization/deserialization functions in `src/wasm-service/wasm-service-models.js` for ServiceDefinition, ResourceBudget, and TimerEntry (serialize to table row / JSON, deserialize back)
    - _Requirements: 14.1, 14.2, 14.3_
  - [x] 1.4 Write property tests for serialization round-trips in `test/wasm-service/wasm-service-models.test.js`
    - **Property 7: ServiceDefinition serialization round-trip**
    - **Property 8: ResourceBudget serialization round-trip**
    - **Property 9: TimerEntry serialization round-trip**
    - **Validates: Requirements 1.3, 14.1, 14.2, 14.3**
  - [x] 1.5 Add system table schemas for `service_definitions`, `service_endpoints`, and `service_timers` in `src/bootstrap/system-table-schemas-constants.js` — add to `SystemTableName`, create schema objects, add to `SYSTEM_TABLE_SCHEMAS` array, add to `INITIAL_PARTITION_IDS` and `INITIAL_REPLICA_IDS`
    - _Requirements: 12.3, 12.4, 12.5_

- [x] 2. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement ServiceDefinitionValidator and SessionKVStore
  - [x] 3.1 Create `src/wasm-service/service-definition-validator.js` — validates handler function exists in code table (via SQL query), replica count is odd >= 3, consistency modes are valid enum values, resource budget values are non-negative
    - _Requirements: 1.1, 1.4, 1.5_
  - [x] 3.2 Write property test for service definition validation in `test/wasm-service/service-definition-validator.test.js`
    - **Property 1: Service definition validation rejects invalid definitions**
    - **Validates: Requirements 1.1, 1.4, 1.5**
  - [x] 3.3 Create `src/wasm-service/session-kv-store.js` — SQLite-backed KV store with get/set/delete by session+key, size tracking per session and total, internal `_kv_store` table creation
    - _Requirements: 3.2, 3.3_
  - [x] 3.4 Write property test for KV store round-trip in `test/wasm-service/session-kv-store.test.js`
    - **Property 2: KV store round-trip preserves opaque bytes**
    - **Validates: Requirements 3.2, 3.3**
  - [x] 3.5 Add size limit enforcement to SessionKVStore — check per-session and per-service limits before applying writes, return descriptive errors identifying which limit was breached
    - _Requirements: 3.5, 3.6, 10.3, 10.4, 10.5_
  - [x] 3.6 Write property test for size limit enforcement in `test/wasm-service/session-kv-store.test.js`
    - **Property 4: Size limit enforcement rejects oversized writes**
    - **Validates: Requirements 3.5, 3.6, 10.3, 10.4, 10.5**

- [x] 4. Implement SafetyInterval and read routing
  - [x] 4.1 Create `src/wasm-service/safety-interval.js` — tracks leader broadcast state (committed index + timestamp), local applied index, exposes `canServeRead()` method, `broadcastState()` for leader, `updateLeaderState()` for followers
    - _Requirements: 4.2, 4.3_
  - [x] 4.2 Create `src/wasm-service/read-router.js` — given a consistency mode, replica role, and SafetyInterval state, returns routing decision (serve locally or forward to leader)
    - _Requirements: 3.4, 4.1, 4.3, 4.4, 4.5_
  - [x] 4.3 Write property test for read routing correctness in `test/wasm-service/read-router.test.js`
    - **Property 3: Read routing correctness across consistency modes**
    - **Validates: Requirements 3.4, 4.1, 4.3, 4.4, 4.5**

- [x] 5. Implement TimerManager
  - [x] 5.1 Create `src/wasm-service/timer-manager.js` — manages persistent timers using reserved `_timers/` KV prefix, supports create/cancel/reconstruct, only leader runs active timers, marks timer as fired in KV before invoking handler
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  - [x] 5.2 Write property test for timer reconstruction in `test/wasm-service/timer-manager.test.js`
    - **Property 5: Timer reconstruction skips non-active timers**
    - **Validates: Requirements 7.3, 7.6**

- [x] 6. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement PortAllocator and ModuleMirror
  - [x] 7.1 Create `src/wasm-service/port-allocator.js` — node-level port allocation from a configurable range, allocate/release/isAvailable methods
    - _Requirements: 8.1, 8.3_
  - [x] 7.2 Create `src/wasm-service/module-mirror.js` — local WASM module cache, hasModule/getModule/pullModule methods, listens for code table CDC events to detect new versions
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 8. Implement WasmExecutor and service endpoint metadata
  - [x] 8.1 Create `src/wasm-service/wasm-executor.js` — implements FunctionRegistry executor interface (`execute(func, context, args)`), uses ModuleMirror for module loading, enforces ResourceBudget CPU/memory limits, registers as `wasm_service` executor type
    - _Requirements: 6.1, 6.3, 6.4, 6.5_
  - [x] 8.2 Create `src/wasm-service/service-endpoint-builder.js` — builds service endpoint records with required metadata fields (service_name, version, protocol) for gateway integration
    - _Requirements: 11.1, 11.4_
  - [x] 8.3 Write property test for endpoint metadata completeness in `test/wasm-service/service-endpoint-builder.test.js`
    - **Property 6: Service endpoint metadata completeness**
    - **Validates: Requirements 11.4**

- [x] 9. Implement WasmServiceReplica
  - [x] 9.1 Create `src/wasm-service/wasm-service-replica.js` — extends `RaftReplicaBase` with entityType `WASM_SERVICE`, integrates SessionKVStore, SafetyInterval, TimerManager, WasmExecutor, and PortAllocator. Implements `applyCommittedEntry()` for KV writes and timer state changes, `handleMessage()` for incoming requests with read routing, `onBecameLeader()`/`onLostLeadership()` for timer reconstruction and safety interval broadcasts
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 5.1, 5.2, 5.3, 6.1, 6.2_
  - [x] 9.2 Create `src/wasm-service/wasm-service-lifecycle.js` — manages creation of WasmServiceReplica instances from service definitions, handles replica startup (module mirror check, port allocation, endpoint registration) and shutdown (port release, endpoint removal, timer cleanup)
    - _Requirements: 2.4, 8.1, 8.2, 8.3, 8.4, 9.1_
  - [x] 9.3 Add WASM service rebalancer policy in `src/rebalancer/rebalancer-constants.js` — add `REBALANCER_DEFAULT_POLICY.WASM_SERVICE` with default replica count 3 and placement constraints
    - _Requirements: 2.5_

- [x] 10. Checkpoint — Ensure all tests pass, ask the user if questions arise.

- [x] 11. Wire into bootstrap and system integration
  - [x] 11.1 Update `src/bootstrap/system-table-writer.js` to write initial rows for the new system tables during seed node bootstrap
    - _Requirements: 12.3_
  - [x] 11.2 Update `src/bootstrap/join-handler.js` to include snapshots of `service_definitions`, `service_endpoints`, and `service_timers` in the bootstrap response for joining nodes
    - _Requirements: 12.5_
  - [x] 11.3 Update `src/cache/` SystemTableCache to handle CDC events for the three new system tables
    - _Requirements: 12.4, 11.2, 11.3_
  - [x] 11.4 Create `src/wasm-service/index.js` barrel export for all WASM service components

- [x] 12. Update architecture documentation and README
  - [x] 12.1 Update `architecture.md` — add WASM service group to component architecture, document new system tables, Safety_Interval mechanism, timer persistence, exactly-once semantics, and the new `wasm_service` service type
    - _Requirements: 13.1, 13.3, 13.4, 13.5_
  - [x] 12.2 Update `README.md` — add WASM service capability description
    - _Requirements: 13.2_

- [x] 13. Final checkpoint — Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property tests are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All tests use fast-check with `{numRuns: 10}` per project guidelines
