# Implementation Plan: Message Group Resilient Proxy

## Overview

Wire ReplicaWorkerManager lifecycle events into SystemCacheProxy for proactive replica selection, add health-aware selection, remove the dual cache selection path in NodeService, and clean up dead/legacy code. All changes use JavaScript (Node.js) with the existing project conventions.

## Tasks

- [x] 1. Add missing WORKER_EVENT constants
  - [x] 1.1 Add REPLICA_CREATED, REPLICA_STOPPED, and REPLICA_FAILED to WORKER_EVENT in `src/worker/worker-constants.js`
    - Add `REPLICA_CREATED: 'replica_created'`, `REPLICA_STOPPED: 'replica_stopped'`, `REPLICA_FAILED: 'replica_failed'` to the WORKER_EVENT frozen object
    - _Requirements: 1.1, 1.2_
  - [x] 1.2 Write unit tests for WORKER_EVENT constants
    - Verify the three new constants exist and are non-empty strings
    - Verify they are distinct from existing event names
    - _Requirements: 1.1_

- [x] 2. Implement event-driven wiring in SystemCacheProxy
  - [x] 2.1 Add event listener registration and removal methods to `src/cache/system-cache-proxy.js`
    - Add `_onReplicaCreated`, `_onReplicaStopped`, `_onReplicaFailed` bound listener fields to constructor
    - Add `registerEventListeners()` method that binds and registers listeners on workerManager
    - Add `removeEventListeners()` method that removes all registered listeners
    - Import WORKER_EVENT and WORKER_HEALTH_STATUS from worker-constants
    - Call `registerEventListeners()` in `initialize()`
    - _Requirements: 6.1, 6.2_
  - [x] 2.2 Implement event handler methods in `src/cache/system-cache-proxy.js`
    - Add `handleReplicaCreated(event)` — filter by MESSAGE_GROUP entityType, add to set, select if none selected
    - Add `handleReplicaStopped(event)` — filter by MESSAGE_GROUP entityType, remove from set, re-select if was selected
    - Add `handleReplicaFailed(event)` — filter by MESSAGE_GROUP entityType, remove from set, re-select if was selected
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 6.3_
  - [x] 2.3 Implement health-aware `selectLocalReplica()` in `src/cache/system-cache-proxy.js`
    - Modify `selectLocalReplica()` to prefer replicas with healthStatus !== UNHEALTHY
    - Fall back to first available if all unhealthy
    - Import WORKER_HEALTH_STATUS from worker-constants
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 2.4 Write property test: Removal event triggers re-selection
    - **Property 1: Removal event triggers re-selection**
    - **Validates: Requirements 2.1, 2.2, 2.3, 4.1, 4.2, 4.3**
  - [x] 2.5 Write property test: Created replica is added and selected when none exists
    - **Property 2: Created replica is added and selected when none exists**
    - **Validates: Requirements 3.1, 3.2**
  - [x] 2.6 Write property test: Created replica does not displace existing healthy selection
    - **Property 3: Created replica does not displace existing healthy selection**
    - **Validates: Requirements 3.3**
  - [x] 2.7 Write property test: Health-aware selection prefers healthy replicas
    - **Property 4: Health-aware selection prefers healthy replicas**
    - **Validates: Requirements 5.1, 5.2, 5.3**
  - [x] 2.8 Write property test: Partition replica events are ignored
    - **Property 5: Partition replica events are ignored**
    - **Validates: Requirements 6.3**

- [x] 3. Remove reactive retry and dead code from SystemCacheProxy
  - [x] 3.1 Remove retry logic from `sendCacheQuery()` in `src/cache/system-cache-proxy.js`
    - Remove the catch block that calls updateLocalReplicaSet/selectLocalReplica and retries
    - Let errors propagate directly to the caller
    - _Requirements: 7.1, 7.2_
  - [x] 3.2 Simplify `ensureReplicaSelected()` — remove polling fallback
    - Remove calls to `updateLocalReplicaSet()` and `selectLocalReplica()` from `ensureReplicaSelected()`
    - Just check `selectedReplicaId` and throw if null
    - _Requirements: 9.2_
  - [x] 3.3 Rename `updateLocalReplicaSet()` to `loadInitialReplicaSet()` and remove `onReplicaSetChanged()`
    - Rename `updateLocalReplicaSet()` to `loadInitialReplicaSet()`
    - Remove the `setsEqual()` helper (no longer needed — initial load just sets the set)
    - Remove the public `onReplicaSetChanged()` method
    - Update `initialize()` to call `loadInitialReplicaSet()` instead
    - _Requirements: 9.1, 9.3_
  - [x] 3.4 Add `shutdown()` method to SystemCacheProxy
    - Call `removeEventListeners()`, clear selectedReplicaId, clear localReplicaIds, set initialized to false
    - _Requirements: 6.2_
  - [x] 3.5 Write property test: Failed queries propagate errors without retry
    - **Property 6: Failed queries propagate errors without retry**
    - **Validates: Requirements 7.1**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Remove dual cache selection path in NodeService
  - [x] 5.1 Remove `_primaryMessageGroup`, `setPrimaryMessageGroup()`, and `_getLocalMessageGroupReplica()` from `src/node/node-service.js`
    - Remove the `_primaryMessageGroup` field from constructor
    - Remove `setPrimaryMessageGroup()` method
    - Remove `_getLocalMessageGroupReplica()` method
    - Modify `getSystemTableCache()` to return `this._systemCacheProxy` (the SystemCacheProxy reference)
    - Modify `getReadOnlySystemTableCache()` to delegate to the proxy
    - Add a `setSystemCacheProxy(proxy)` method that stores the proxy reference
    - Remove the fallback `new SystemTableCache()` creation
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 5.2 Update bootstrap to wire SystemCacheProxy to NodeService
    - In `src/bootstrap/bootstrap-service.js`: after `createSystemCacheProxy()`, call `nodeService.setSystemCacheProxy(this.systemCacheProxy)`
    - In `src/bootstrap/node-joining-service.js`: after `createSystemCacheProxyForJoin()`, call `nodeService.setSystemCacheProxy(this.systemCacheProxy)`
    - Remove `setPrimaryMessageGroup()` calls from both bootstrap paths
    - In bootstrap shutdown, call `this.systemCacheProxy.shutdown()` before nulling the reference
    - _Requirements: 8.2_
  - [x] 5.3 Write property test: NodeService delegates cache access to SystemCacheProxy
    - **Property 7: NodeService delegates cache access to SystemCacheProxy**
    - **Validates: Requirements 8.1**

- [x] 6. Update architecture documentation
  - [x] 6.1 Update `architecture.md` SystemCacheProxy section
    - Update the SystemCacheProxy description to mention event-driven wiring with ReplicaWorkerManager
    - Add a subsection describing the proactive notification flow (REPLICA_CREATED, REPLICA_STOPPED, REPLICA_FAILED)
    - Document health-aware replica selection behavior
    - Remove any references to reactive retry or onReplicaSetChanged
    - Update the NodeService section to reflect that it delegates to SystemCacheProxy
    - _Requirements: 10.1, 10.2_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Property tests use fast-check with `{numRuns: 10}` per workspace testing guidelines
- Test framework: node:test with tap
