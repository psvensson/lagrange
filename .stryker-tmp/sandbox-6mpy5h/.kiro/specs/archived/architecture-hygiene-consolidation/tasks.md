# Tasks: Architecture Hygiene Consolidation

## Overview

Tasks are ordered by dependency: constants consolidation first (other tasks
may depend on the new constant names), then dead code removal (independent
tasks that can proceed in any order), then the cache write audit (read-only
analysis that documents findings).

## Tasks

- [x] 1. Extract SERVICE_STATUS and reduce STATE enum (Requirement 1)
  - [x] 1.1 Create `src/constants/service-status.js` with `SERVICE_STATUS` enum
    - Define `SERVICE_STATUS = Object.freeze({ ACTIVE: 'active' })`
    - Export `SERVICE_STATUS`
    - Add re-export in `src/constants/index.js`
    - _Requirements: 1.1_
  - [x] 1.2 Migrate all `STATE.ACTIVE` service-status usages to `SERVICE_STATUS.ACTIVE`
    - Search all `src/` files for `STATE.ACTIVE` usage in service status context
    - Replace each with `SERVICE_STATUS.ACTIVE` and update imports
    - Key files (from audit): `src/bootstrap/bootstrap-service.js`,
      `src/bootstrap/bootstrap-api.js`, `src/bootstrap/node-joining-service.js`,
      `src/control-plane/heartbeat-service.js`, `src/control-plane/lease-service.js`,
      `src/control-plane/replica-dispatch-service.js`,
      `src/cache/leader-readiness-gate.js`, `src/cache/system-table-cache.js`,
      `src/query/query-executor.js`, `src/query/query-router.js`,
      `src/query/straggler-detector.js`, `src/query/table-creation-service.js`,
      `src/cdc/cdc-integration-service.js`, `src/node/node-readiness-policy.js`,
      `src/node/replica-handler.js`, `src/rebalancer/rebalancer-constants.js`,
      `src/topology/cdc-group-propagation-service.js`
    - _Requirements: 1.3_
  - [x] 1.3 Remove node-lifecycle and service-status values from STATE enum
    - Remove from `STATE`: `ACTIVE`, `STARTING`, `CONNECTING`, `DISCOVERING`,
      `JOINING`, `SYNCING`, `DRAINING`, `STOPPED`
    - Retain in `STATE`: `CONNECTED`, `DISCONNECTED`, `NORMAL`, `READY`
    - Verify no remaining imports use the removed values from `STATE`
    - _Requirements: 1.2_
  - [x] 1.4 Write tests for constants separation
    - Test `SERVICE_STATUS.ACTIVE === 'active'`
    - Test `STATE` does not contain `ACTIVE`, `STARTING`, `CONNECTING`,
      `DISCOVERING`, `JOINING`, `SYNCING`, `DRAINING`, `STOPPED`
    - Test `STATE` contains `CONNECTED`, `DISCONNECTED`, `NORMAL`, `READY`
    - Test `NODE_STATE` and `SERVICE_STATUS` have no overlapping key names
    - Property test (Property 1): verify value preservation
    - Property test (Property 2): verify every removed STATE value exists in
      exactly one of NODE_STATE or SERVICE_STATUS
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

- [x] 2. Checkpoint — run targeted tests for modified files
  - Run tests for constants, bootstrap, control-plane, cache, query, cdc,
    node, rebalancer, and topology modules
  - Fix any failures before proceeding

- [x] 3. Unify service lifecycle state enums (Requirement 2)
  - [x] 3.1 Verify ServiceLifecycleMixin has no production callers
    - Search `src/` for `ServiceLifecycleMixin(` usage (extending classes)
    - If no production callers found, proceed to 3.2
    - If production callers found, execute fallback plan from design doc:
      add INITIALIZED to SERVICE_LIFECYCLE_STATE, migrate mixin, then delete
      old constants file
    - _Requirements: 2.1, 2.2_
  - [x] 3.2 Delete dead lifecycle files
    - Delete `src/bootstrap/service-lifecycle-constants.js`
    - Delete `src/bootstrap/service-lifecycle-mixin.js`
    - Remove any re-exports from `src/bootstrap/index.js`
    - Verify no remaining imports reference deleted files
    - _Requirements: 2.3_
  - [x] 3.3 Delete associated tests
    - Delete test files that test `ServiceLifecycleMixin` or `SERVICE_STATE`
      from `service-lifecycle-constants.js` in isolation
    - _Requirements: 2.3_
  - [x] 3.4 Write verification test
    - Test that `service-lifecycle-constants.js` does not exist
    - Test that `service-lifecycle-mixin.js` does not exist
    - If mixin was preserved (fallback plan), test transition preservation
      (Property 4)
    - _Requirements: 2.3, 2.4_

- [x] 4. Remove dead transport delivery path from MessageRouter (Requirement 3)
  - [x] 4.1 Remove transport registry integration from MessageRouter
    - Remove `transportRegistry` and `connectionPool` fields from constructor
    - Remove `hasTransportRegistry()` method
    - Remove `setTransportRegistry(registry, pool)` method
    - Remove `deliverViaTransportRegistry(...)` method
    - Remove `deliverViaEndpoint(...)` method
    - Remove the `if (this.hasTransportRegistry())` branch from `deliver()`
    - Simplify `deliver()` to always use `deliverRemote()` for non-self targets
    - Remove associated imports (TransportRegistry, ConnectionPool references)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 4.2 Remove in-process fallback from startServer()
    - Remove `shouldFallbackToInProcess(error)` method
    - Remove the fallback branch in `startServer()` error handler that calls
      `startInProcessServer()` on EPERM/EACCES
    - On bind error, simply reject the startup promise
    - _Requirements: 3.8_
  - [x] 4.3 Update tests that mock transport registry
    - Search test files for `hasTransportRegistry`, `getTransportRegistry`,
      `transportRegistry`, `deliverViaTransportRegistry`, `deliverViaEndpoint`,
      `shouldFallbackToInProcess`
    - Remove those mocks/references from test setup
    - Tests that need in-process transport should use `{inProcess: true}`
      constructor option
    - _Requirements: 3.9, 3.10_
  - [x] 4.4 Write verification tests
    - Test that `MessageRouter` instance does not have `hasTransportRegistry`,
      `setTransportRegistry`, `deliverViaTransportRegistry`,
      `deliverViaEndpoint`, `shouldFallbackToInProcess` methods
    - Test that `deliver()` calls `deliverRemote()` for remote targets
    - Property test (Property 3): delivery equivalence
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8_

- [x] 5. Remove dead MetadataCache class (Requirement 4)
  - [x] 5.1 Verify MetadataCache has no production instantiation
    - Search `src/` for `new MetadataCache` — confirm zero results
    - If production usage found, migrate to SystemTableCache queries first
    - _Requirements: 4.4_
  - [x] 5.2 Delete MetadataCache and associated files
    - Delete `src/message-group/metadata-cache.js`
    - Remove `MetadataCache`, `CacheEntry`, `CacheEntryStatus` exports from
      `src/message-group/index.js`
    - _Requirements: 4.1, 4.2_
  - [x] 5.3 Delete associated tests
    - Delete `test/message-group/cache-ttl-expiration.property.test.js`
    - Delete `test/message-group/query-on-miss-behavior.property.test.js`
    - Delete any other test files that import from `metadata-cache.js`
    - _Requirements: 4.3_
  - [x] 5.4 Write verification test
    - Test that `MetadataCache` is not exported from
      `src/message-group/index.js`
    - _Requirements: 4.1, 4.2_

- [x] 6. Remove dead bootstrap phase delegation adapters (Requirement 5)
  - [x] 6.1 Verify phase adapters have no production importers
    - Search `src/` for imports from `src/bootstrap/phases/` — confirm zero
      results
    - If production imports found, migrate callers to canonical phase owners
      first
    - _Requirements: 5.4_
  - [x] 6.2 Delete phase adapter files
    - Delete `src/bootstrap/phases/infrastructure-phase.js`
    - Delete `src/bootstrap/phases/partition-phase.js`
    - Delete `src/bootstrap/phases/message-group-phase.js`
    - Delete `src/bootstrap/phases/cache-hydration-phase.js`
    - Delete `src/bootstrap/phases/registration-phase.js`
    - Remove any re-exports from `src/bootstrap/index.js`
    - _Requirements: 5.1, 5.2_
  - [x] 6.3 Delete associated tests
    - Delete test files in `test/bootstrap/phases/` that test the delegation
      adapters
    - _Requirements: 5.3_
  - [x] 6.4 Write verification test
    - Test that `src/bootstrap/phases/` directory contains no phase adapter
      files (or does not exist)
    - _Requirements: 5.1_

- [x] 7. Checkpoint — run full test suite
  - Run `npm test` with 150-second timeout, dump output to
    `/tmp/test-output.txt`
  - Analyze output for failures
  - Fix any failures before proceeding

- [x] 8. Audit and document direct cache write exceptions (Requirement 6)
  - [x] 8.1 Analyze registerMessageGroupService eager cache write
    - Read the join flow sequence from `join()` through
      `registerMessageGroupService()` to `phaseQuerySystemState()`
    - Determine whether the eager `applySystemTableChange` call at line ~1300
      is necessary by tracing what happens if it is removed:
      - Does `phaseWaitForLeadership()` need the services entry? (Check if it
        queries the cache for the node's own MG service)
      - Does `initializeControlPlaneService()` need the services entry?
      - Does `initializeReplicaHandler()` need the services entry?
      - Does any code between MG registration and CDC subscription activation
        query the local cache for this specific services row?
    - Document the finding in the annotation comment
    - _Requirements: 6.2_
  - [x] 8.2 Annotate all sanctioned cache write sites
    - Add bootstrap hydration exception comment to
      `NodeJoiningService.hydrateSystemCacheFromSnapshots()` (~line 2184)
    - Add bootstrap timing exception comment (or remove the call, per 8.1
      analysis) to `NodeJoiningService.registerMessageGroupService()` (~line
      1300)
    - Verify `CacheHydrationService.cdcEventApplier` already has adequate
      comment (it does)
    - Verify `CDCHandler.applyEvent()` is clearly the canonical CDC path (it
      is)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [x] 8.3 Update architecture.md with sanctioned call site list
    - Add a new subsection under "Data Architecture" or "Bootstrap Exception"
      listing all sanctioned `applySystemTableChange` call sites:
      1. `CDCHandler.applyEvent()` — canonical CDC apply path
      2. `CacheHydrationService.cdcEventApplier()` — bootstrap hydration
      3. `NodeJoiningService.hydrateSystemCacheFromSnapshots()` — join
         hydration
      4. `NodeJoiningService.registerMessageGroupService()` — bootstrap timing
         exception (if preserved per 8.1 analysis)
      5. `BootstrapService.hydrateSystemCache()` — seed bootstrap hydration
    - _Requirements: 6.5_
  - [x] 8.4 Write verification test
    - Grep `src/` for all `applySystemTableChange` call sites
    - Assert that every call site is in the sanctioned list
    - This is a structural test that prevents future unsanctioned cache writes
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 9. Final checkpoint — run full test suite
  - Run `npm test` with 150-second timeout, dump output to
    `/tmp/test-output.txt`
  - Analyze output for failures
  - Fix any failures

## Notes

- All tasks are required including tests — no optional tasks
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The cache write audit (task 8) is deliberately last because it is primarily
  an analysis and documentation task with minimal code changes, and benefits
  from the codebase being clean from prior tasks
- The registerMessageGroupService analysis (task 8.1) must be done carefully —
  the design doc provides the analysis framework but the implementer must
  trace the actual code path to confirm the conclusion
- TransportRegistry, TransportProvider, ConnectionPool, and
  RouterDeliveryManager are preserved as library code — only their integration
  into MessageRouter is removed
- Property tests use `{numRuns: 10}` per workspace rules
