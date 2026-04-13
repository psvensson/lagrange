# Implementation Plan: Architecture Violations Cleanup

## Overview

This plan addresses 11 architecture violations in order of dependency and risk. Each task removes duplicate logic, consolidates ownership, or fills architectural gaps. Tasks are ordered so that foundational changes (state machine unification, failure detection consolidation) come first, followed by dependent changes (control plane decomposition, SQL read path migration).

## Tasks

- [x] 1. Consolidate failure detection into FailureDetector (Violation 1)
  - [x] 1.1 Remove failure detection logic from NodeLifecycleService
    - Remove `detectFailedNodes()`, `startFailureDetection()`, `stopFailureDetection()`, `markNodeFailed()`, `markNodeSuspected()`, `markNodeActive()` methods
    - Remove `knownNodes` Map, `failureDetectionTimer`, `heartbeatTimeoutMs`, `failureDetectionIntervalMs` fields
    - Remove local node tracking in `registerNode()` and `updateHeartbeat()` (the `this.knownNodes.set/get` calls)
    - Keep `registerNode()`, `updateHeartbeat()`, `removeNode()`, `startHeartbeat()`, `stopHeartbeat()` as write-only helpers
    - Update `shutdown()` to remove `stopFailureDetection()` call and `knownNodes.clear()`
    - Remove unused imports (NODE_STATUS references used only by detection logic)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 1.2 Update callers of removed NodeLifecycleService methods
    - Search for all callers of `markNodeFailed`, `markNodeSuspected`, `markNodeActive`, `startFailureDetection`, `stopFailureDetection`, `detectFailedNodes`
    - Redirect those callers to use FailureDetector instead
    - _Requirements: 1.2, 1.3_
  - [x] 1.3 Write property test for failure detection delegation
    - **Property 1: Safety check delegation** (adapted — verify FailureDetector is sole detector)
    - Test that NodeLifecycleService instance does not have failure detection methods
    - Test that FailureDetector correctly transitions nodes through suspected → failed on heartbeat timeout
    - **Validates: Requirements 1.1, 1.2**

- [x] 2. Remove overlapping safety checks from UnifiedRebalancer (Violation 2)
  - [x] 2.1 Remove getMoveSafetyError wrapper from UnifiedRebalancer
    - Delete the `getMoveSafetyError()` method from UnifiedRebalancer
    - In `executeMoveViaCoordinator()`, replace `this.getMoveSafetyError(move)` with direct call to `this.rebalanceCoordinator.getMoveSafetyError({...move, partitionId: move.partitionId || this.entityId, entityType: move.entityType || this.entityType, entityId: move.entityId || this.entityId})`
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 2.2 Write property test for safety check delegation
    - **Property 1: Safety check delegation**
    - Generate random move objects with fc.record, verify that the safety result from UnifiedRebalancer's executeMoveViaCoordinator matches what RebalanceCoordinator.getMoveSafetyError returns directly
    - **Validates: Requirements 2.2**

- [x] 3. Unify phase state machines (Violation 3)
  - [x] 3.1 Add phase duration tracking to NodeLifecycleStateMachine
    - Add `_subPhaseDurations` Map and `_subPhaseStartTimes` Map to NodeLifecycleStateMachine
    - Update `transitionSubPhase()` to record start times and calculate durations (matching BootstrapPhaseStateMachine's timing behavior)
    - Add `getSubPhaseDuration(subPhase)` and `getAllSubPhaseDurations()` methods
    - _Requirements: 3.4_
  - [x] 3.2 Migrate BootstrapService from BootstrapPhaseStateMachine to NodeLifecycleStateMachine
    - In `src/bootstrap/bootstrap-service.js`, remove import of BootstrapPhaseStateMachine
    - Remove `this.phaseStateMachine` field creation
    - Replace all `this.phaseStateMachine.transition(phase)` calls with `this.lifecycleStateMachine.transitionSubPhase(subPhase)` using the mapping: INFRASTRUCTURE→BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE, MESSAGE_GROUPS→BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS, etc.
    - Replace `this.phaseStateMachine.getCurrentPhase()` with `this.lifecycleStateMachine.getSubPhase()`
    - Replace `this.phaseStateMachine.isComplete()` with checking if state has advanced past STARTING
    - Replace phase duration queries with `this.lifecycleStateMachine.getSubPhaseDuration()`
    - Handle FAILED phase by transitioning NodeLifecycleStateMachine to STOPPED
    - _Requirements: 3.1, 3.2_
  - [x] 3.3 Delete BootstrapPhaseStateMachine
    - Delete `src/bootstrap/bootstrap-phase-state-machine.js`
    - Remove any re-exports from `src/bootstrap/index.js`
    - Verify no remaining imports reference the deleted file
    - _Requirements: 3.3_
  - [x] 3.4 Write property test for sub-phase transition completeness
    - **Property 2: Sub-phase transition completeness**
    - For each bootstrap sub-phase (INFRASTRUCTURE, MESSAGE_GROUPS, PARTITIONS, REGISTRATION, CACHE_HYDRATION), verify NodeLifecycleStateMachine accepts the transition when in STARTING state
    - **Validates: Requirements 3.4**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Enforce single replica state authority (Violation 4)
  - [x] 5.1 Audit ReplicaLifecycleManager and ReplicaHandler for independent state tracking
    - Review `localServices` Map in ReplicaHandler — this tracks live process handles, not replica state. Acceptable, no change needed.
    - Review `inProgressOperations` Map in ReplicaHandler — this is a concurrency dedupe lock, not state tracking. Acceptable, no change needed.
    - Review `pendingOperations` Map in ReplicaLifecycleManager — this tracks request/response correlation, not replica state. Acceptable, no change needed.
    - Search for any Maps/Sets that shadow replica lifecycle status (active/failed/creating). Remove any found.
    - Ensure all replica state queries go through ReplicaStateMachine.getState() or ReplicaStateMachine.getReplicasInState()
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  - [x] 5.2 Write unit tests verifying delegation
    - Test that ReplicaLifecycleManager does not maintain independent replica state maps
    - Test that ReplicaHandler's localServices and inProgressOperations are operational bookkeeping, not state duplication
    - _Requirements: 4.2, 4.3, 4.4_

- [x] 6. Clarify epoch management and message group assignment (Violations 5, 6)
  - [x] 6.1 Audit and document epoch ownership boundaries
    - Verify AssignmentEpochManager is the sole coordinator for epoch transitions
    - Verify no component maintains epoch state outside AssignmentEpochManager and config table
    - Add JSDoc comments to AssignmentEpochManager clarifying it as the single epoch authority
    - Verify CDC is the sole propagation mechanism for epoch values
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x] 6.2 Audit and centralize message group assignment strategy
    - Verify MessageGroupAssignment.determineAssignment is the single location for strategy selection
    - Verify bootstrap-api.js delegates to MessageGroupAssignment for strategy selection
    - Remove any strategy selection logic found outside MessageGroupAssignment
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 7. Add bootstrap failure cleanup (Violation 7)
  - [x] 7.1 Implement seed node bootstrap cleanup in BootstrapService
    - Add `cleanupFailedBootstrap(failedPhase, cleanupContext)` method to BootstrapService
    - Implement reverse-order cleanup: CACHE_HYDRATION → clear cache; REGISTRATION → remove entries from nodes/services/partitions/message_groups tables; PARTITIONS → stop partition services; MESSAGE_GROUPS → stop MG services; INFRASTRUCTURE → stop router
    - Wrap each cleanup step in try/catch — log errors but do not throw
    - Wire cleanup into existing bootstrap failure handling (where phase transitions to FAILED)
    - Transition NodeLifecycleStateMachine to STOPPED after cleanup
    - _Requirements: 7.1, 7.3_
  - [x] 7.2 Implement joining node bootstrap cleanup in NodeJoiningService
    - Add `cleanupFailedJoin(failedPhase, cleanupContext)` method to NodeJoiningService
    - Implement cleanup: remove self from nodes table, remove service entries, stop MG replicas, disconnect from seed
    - Wrap each cleanup step in try/catch — log errors but do not throw
    - Wire cleanup into existing join failure handling
    - Transition NodeLifecycleStateMachine to STOPPED after cleanup
    - _Requirements: 7.2, 7.3_
  - [x] 7.3 Write property tests for bootstrap cleanup
    - **Property 3: Seed bootstrap failure cleanup**
    - Generate random failure phases, verify cleanup leaves zero partial entries in system tables
    - **Validates: Requirements 7.1**
  - [x] 7.4 Write property tests for join cleanup
    - **Property 4: Join failure cleanup**
    - Generate random join failure phases, verify cleanup leaves zero partial entries
    - **Validates: Requirements 7.2**

- [x] 8. Add dispatch readiness validation (Violation 8)
  - [x] 8.1 Add handler registration check to ReplicaDispatchService
    - In `dispatchOperationRow()`, after the `isNodeReady()` check, add a check for handler registration on the target node
    - Query the services table for an active service entry matching the operation's entity type on the target node
    - If no handler found, log a warning with operation ID, target node, and entity type, then return without dispatching
    - The operation stays in its current workflow step for retry on next cycle
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 8.2 Write property test for dispatch handler verification
    - **Property 5: Dispatch handler verification**
    - Generate random operations with and without registered handlers, verify dispatch is skipped when handler is missing and operation workflow step is unchanged
    - **Validates: Requirements 8.1**

- [x] 9. Complete stabilization reset logic (Violation 9)
  - [x] 9.1 Define stabilization reset trigger constants and wire CDC listeners
    - Add `STABILIZATION_RESET_TRIGGER` constant to `src/rebalancer/rebalancer-constants.js` with values: NODE_JOINED, NODE_LEFT, NODE_FAILED, REPLICA_FAILED, POLICY_CHANGED
    - In UnifiedRebalancer, ensure CDC event listeners for node state changes and service state changes call `recordStateChange()` with the appropriate trigger constant
    - Verify policy change events also trigger `recordStateChange()`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 9.2 Write property test for stabilization reset
    - **Property 6: Stabilization reset on trigger events**
    - For each trigger event type, deliver the event to UnifiedRebalancer and verify lastStateChangeTime is updated
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Complete control plane decomposition (Violation 10)
  - [x] 11.1 Migrate BootstrapService callers from ControlPlaneService to decomposed services
    - In `src/bootstrap/bootstrap-service.js`, replace ControlPlaneService usage with direct HeartbeatService, LeaseService, EndpointService, and ReplicaDispatchService instantiation
    - Update `initializeControlPlaneService()` to create decomposed services directly
    - Update `registerSeedNodeWithControlPlane()` to use HeartbeatService directly
    - Update shutdown to stop decomposed services directly
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [x] 11.2 Migrate NodeJoiningService callers from ControlPlaneService to decomposed services
    - In `src/bootstrap/node-joining-service.js`, replace ControlPlaneService usage with direct decomposed service calls
    - Update `initializeControlPlaneService()` to create decomposed services directly
    - Update `signalReadyForReplicas()` to use HeartbeatService directly
    - Update shutdown to stop decomposed services directly
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [x] 11.3 Migrate ControlPlaneSetup shared helper
    - Update `src/bootstrap/shared/control-plane-setup.js` to create and return decomposed services instead of ControlPlaneService
    - Update return type to `{heartbeatService, leaseService, endpointService, dispatchService, rebalanceCoordinator}`
    - Update all callers of ControlPlaneSetup.setup() to destructure the new return shape
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [x] 11.4 Delete ControlPlaneService facade
    - Delete `src/control-plane/control-plane-service.js`
    - Remove any re-exports from control-plane index
    - Verify no remaining imports reference the deleted file
    - _Requirements: 10.5_

- [x] 12. Route system reads through SQL engine (Violation 11)
  - [x] 12.1 Migrate control-plane services to SQL engine reads
    - Update `ReplicaDispatchService` to use sqlQueryEngine for reading nodes and replica_operations tables instead of direct systemTableCache.get()
    - Update `LeaseService` to use sqlQueryEngine for reading nodes table instead of systemTableCache.getAll()
    - Update `EndpointService` to use sqlQueryEngine for reading node_endpoints table instead of systemTableCache.get()
    - Add sqlQueryEngine as a constructor dependency to these services
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 12.2 Migrate policy and config services to SQL engine reads
    - Update `TablePolicyService` to use sqlQueryEngine for reading tables and partitions instead of systemTableCache.get()
    - Update `RaftRoleTracker` to use sqlQueryEngine for reading services table instead of systemTableCache.get/filter()
    - Update `DynamicConfigService` to use sqlQueryEngine for reading config table instead of systemTableCache.getAll/get()
    - Add sqlQueryEngine as a constructor dependency where missing
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 12.3 Migrate function and index services to SQL engine reads
    - Update `FunctionRegistry` to use sqlQueryEngine for reading code table
    - Update `ContextManager` to use sqlQueryEngine for reading contexts table
    - Update `IndexService` to use sqlQueryEngine for reading indices and partitions tables
    - Add sqlQueryEngine as a constructor dependency where missing
    - _Requirements: 11.1, 11.2, 11.3_
  - [x] 12.4 Write unit tests for SQL engine read migration
    - Test that migrated components call sqlQueryEngine.executeQuery instead of direct cache access
    - Test that queries return equivalent results to former cache reads
    - _Requirements: 11.2_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required including tests — no optional tasks
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Bootstrap mode bypass (direct writes during seed node bootstrap) is a documented exception and is NOT treated as a violation
