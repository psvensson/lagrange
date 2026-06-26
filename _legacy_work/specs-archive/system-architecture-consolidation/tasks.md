# Implementation Plan: System Architecture Consolidation

## Overview

Implementation follows the dependency graph: foundation (state vocabulary + state machine) → consolidation (bootstrap writer, failure detector, replica state, rebalance budget) → enforcement & decomposition (SQL reads, control plane split). Each phase builds on the previous and ends with a checkpoint.

## Tasks

- [x] 1. Unified NODE_STATE enum and state vocabulary
  - [x] 1.1 Create `src/constants/node-state.js` with the unified NODE_STATE enum containing all states: INITIALIZING, STARTING, CONNECTING, DISCOVERING, JOINING, READY, ACTIVE, SUSPECTED, FAILED, RECOVERING, DRAINING, SHUTTING_DOWN, STOPPED
    - Remove node-specific states from `src/constants/states.js` (keep CONNECTED, DISCONNECTED, NORMAL for non-node use)
    - Remove NODE_STATUS from `src/node/node-constants.js`
    - Export NODE_STATE from `src/constants/index.js`
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 1.2 Update all imports of STATE (for node states) and NODE_STATUS across the codebase to use NODE_STATE
    - Update `src/node/node-lifecycle-state-machine.js`, `src/node/node-lifecycle-service.js`, `src/node/failure-detector.js`, `src/node/node-reintegration-service.js`
    - Update `src/rebalancer/rebalancer-constants.js` (REBALANCER_NODE_STATUS)
    - Update `src/control-plane/control-plane-service.js` and constants
    - Update `src/bootstrap/bootstrap-service.js`, `src/bootstrap/node-joining-service.js`
    - _Requirements: 2.4, 2.5_

  - [x] 1.3 Write property test for NODE_STATE enum completeness and cache value membership
    - **Property 5: Cache state values are from unified enum**
    - **Validates: Requirements 2.5**

- [x] 2. Unified NodeLifecycleStateMachine with sub-phases
  - [x] 2.1 Add sub-phase tracking to `src/node/node-lifecycle-state-machine.js`
    - Add VALID_SUB_PHASES map (STARTING → bootstrap sub-phases, JOINING → joining sub-phases)
    - Add VALID_SUB_PHASE_TRANSITIONS map
    - Add `transitionSubPhase(newSubPhase)` method with validation and event emission
    - Add `transitionSubPhaseWithValidation(newSubPhase, context)` with phase gate support
    - Add `registerPhaseGate(subPhase, gate)`, `getSubPhase()`, `clearSubPhase()`
    - Auto-clear sub-phase on parent state transition
    - Auto-advance parent state when terminal sub-phase completes
    - Define sub-phase constants in `src/node/node-constants.js` (BOOTSTRAP_SUB_PHASE, JOINING_SUB_PHASE)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6_

  - [x] 2.2 Write property tests for sub-phase tracking
    - **Property 1: Sub-phase tracking correctness**
    - **Validates: Requirements 1.2, 1.3**

  - [x] 2.3 Write property test for sub-phase event context
    - **Property 2: Sub-phase events contain correct context**
    - **Validates: Requirements 1.4**

  - [x] 2.4 Write property test for terminal sub-phase auto-advance
    - **Property 3: Terminal sub-phase auto-advances parent state**
    - **Validates: Requirements 1.6**

  - [x] 2.5 Migrate BootstrapService and NodeJoiningService to use sub-phases on the NodeLifecycleStateMachine
    - Update `src/bootstrap/bootstrap-service.js` to call `stateMachine.transitionSubPhase()` instead of using BootstrapPhaseStateMachine
    - Update `src/bootstrap/node-joining-service.js` to call `stateMachine.transitionSubPhase()` instead of using JoiningPhaseStateMachine
    - Move CacheHydrationGate registration to NodeLifecycleStateMachine via `registerPhaseGate()`
    - _Requirements: 1.1, 1.5_

  - [x] 2.6 Remove independent phase state machine classes
    - Delete `src/bootstrap/bootstrap-phase-state-machine.js`
    - Delete `src/bootstrap/joining-phase-state-machine.js`
    - Delete `src/bootstrap/enhanced-bootstrap-state-machine.js`
    - Remove all imports of these classes across the codebase
    - _Requirements: 1.5_

  - [x] 2.7 Write property test for state machine to CDC consistency
    - **Property 4: State machine to CDC consistency**
    - **Validates: Requirements 2.3**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Single bootstrap writer
  - [x] 4.1 Migrate BootstrapPartitionWriter callers to CDCIntegrationService bootstrap mode
    - Update `src/bootstrap/bootstrap-service.js` registration phase to use `cdcIntegrationService.setBootstrapMode(true, partitionServices)` and `cdcIntegrationService.upsertSystemTableRow()` instead of BootstrapPartitionWriter
    - Ensure `cdcIntegrationService.clearBootstrapMode()` is called after registration completes
    - _Requirements: 3.1, 3.3, 3.4_

  - [x] 4.2 Remove BootstrapPartitionWriter and BootstrapSystemTableWriter
    - Delete `src/bootstrap/bootstrap-partition-writer.js`
    - Delete `src/bootstrap/system-table-writer.js`
    - Remove all imports of these classes
    - _Requirements: 3.2_

  - [x] 4.3 Write property test for bootstrap mode routing enforcement
    - **Property 6: Bootstrap mode routing enforcement**
    - **Validates: Requirements 3.5**

- [x] 5. Single failure detector
  - [x] 5.1 Remove duplicate failure detection from NodeLifecycleService
    - Remove `startFailureDetection()`, `detectFailedNodes()`, `stopFailureDetection()` methods from `src/node/node-lifecycle-service.js`
    - Remove `failureDetectionTimer` and `failureDetectionIntervalMs` fields
    - Remove `knownNodes` Map (was used for failure detection)
    - Keep heartbeat, node registration, and node status update methods
    - _Requirements: 4.1, 4.2_

  - [x] 5.2 Update FailureDetector to read via SQL engine
    - Add `sqlQueryEngine` as a constructor dependency to `src/node/failure-detector.js`
    - Replace `this.systemTableCache.getAll()` in `getNodes()` with SQL query via engine
    - Replace `this.systemTableCache.filter()` in `getPartitionReplicasOnNode()` and `getMessageGroupReplicasOnNode()` with SQL queries
    - Remove `systemTableCache` dependency from FailureDetector
    - _Requirements: 4.1, 7.2_

  - [x] 5.3 Write property tests for failure detector CDC writes
    - **Property 7: Failure detector single CDC write per status change**
    - **Validates: Requirements 4.3, 4.4**

  - [x] 5.4 Write property test for recovery detection
    - **Property 8: Failure detector recovery detection**
    - **Validates: Requirements 4.5**

  - [x] 5.5 Write property test for adaptive threshold
    - **Property 9: Adaptive threshold increases on flapping**
    - **Validates: Requirements 4.6**

- [x] 6. Single replica state ownership
  - [x] 6.1 Refactor ReplicaLifecycleManager to delegate state tracking to ReplicaStateMachine
    - Remove `VALID_STATUS_TRANSITIONS` from `src/node/replica-lifecycle-manager.js`
    - Remove `updateReplicaStatus()` method — delegate to `replicaStateMachine.transition()`
    - Make `localReplicas` a read-through reference to ReplicaStateMachine
    - Add `replicaStateMachine` as a required constructor dependency
    - _Requirements: 5.2, 5.5_

  - [x] 6.2 Refactor ReplicaHandler to delegate state tracking to ReplicaStateMachine
    - Remove `localReplicas` Map from `src/node/replica-handler.js`
    - Remove `updateReplicaStatus()` method — delegate to `replicaStateMachine.transition()`
    - Add `replicaStateMachine` as a required constructor dependency
    - Read replica state via `replicaStateMachine.getState(replicaId)`
    - _Requirements: 5.3, 5.5_

  - [x] 6.3 Write property test for single CDC write path
    - **Property 10: Single CDC write path for replica state changes**
    - **Validates: Requirements 5.4**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Rebalance budget coordination
  - [x] 8.1 Add rebalance budget support to UnifiedRebalancer
    - Add `sqlQueryEngine` as a constructor dependency to `src/rebalancer/unified-rebalancer.js`
    - Add `getClusterInFlightCount()` method that queries replica_operations via SQL engine
    - Add `getRebalanceBudget()` method that reads from config table via SQL engine
    - Add budget constants to `src/rebalancer/rebalancer-constants.js` (DEFAULT_REBALANCE_BUDGET, CRITICAL_BUDGET_MULTIPLIER, CONFIG_KEYS.REBALANCE_BUDGET)
    - Modify `rebalance()` to check budget before planning moves, cap moves at available budget
    - Add jitter-based backoff when budget is exceeded via `scheduleNextCheckWithJitter()`
    - Add critical move bypass: critical moves get `budget * CRITICAL_BUDGET_MULTIPLIER`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.2 Write property test for budget enforcement
    - **Property 11: Rebalance budget enforcement**
    - **Validates: Requirements 6.3, 6.4**

  - [x] 8.3 Write property test for critical move priority
    - **Property 12: Critical moves prioritized over optimization moves**
    - **Validates: Requirements 6.5**

- [x] 9. SQL engine for all system reads
  - [x] 9.1 Update NodeReintegrationService to read via SQL engine
    - Add `sqlQueryEngine` as a constructor dependency to `src/node/node-reintegration-service.js`
    - Replace `this.systemTableCache.getAll()` in `getNodes()` with SQL query
    - Replace `this.systemTableCache.filter()` in `getNode()` with SQL query
    - Make `getNodes()` and `getNode()` async
    - Update callers (`checkRecoveringNodes`, `verifyNodeHealth`) to await
    - Remove `systemTableCache` dependency
    - _Requirements: 7.1, 7.3_

  - [x] 9.2 Verify no remaining direct cache reads outside SQL engine and cache internals
    - Search codebase for `systemTableCache.getAll(`, `systemTableCache.filter(`, `systemTableCache.get(` outside of `src/cache/`, `src/query/`, and test files
    - Fix any remaining violations
    - _Requirements: 7.3, 7.4_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. ControlPlaneService decomposition
  - [x] 11.1 Create HeartbeatService
    - Create `src/control-plane/heartbeat-service.js` with periodic heartbeat updates and consecutive failure tracking
    - Create `src/control-plane/heartbeat-service-constants.js` for constants
    - Extract heartbeat logic from ControlPlaneService (localHeartbeatTimer, heartbeatConsecutiveFailures, heartbeat interval config)
    - Implement lifecycle interface (CREATED → INITIALIZED → RUNNING → STOPPED)
    - _Requirements: 8.2, 8.6_

  - [x] 11.2 Write property test for heartbeat periodic writes
    - **Property 13: Heartbeat service periodic writes**
    - **Validates: Requirements 8.2**

  - [x] 11.3 Create LeaseService
    - Create `src/control-plane/lease-service.js` with lease-based readiness tracking and lease sweeping
    - Create `src/control-plane/lease-service-constants.js` for constants
    - Extract lease logic from ControlPlaneService (leaseSweepTimer, readyLeaseMs, sweep interval config)
    - Implement lifecycle interface
    - _Requirements: 8.3, 8.6_

  - [x] 11.4 Write property test for lease sweep
    - **Property 14: Lease sweep removes expired leases**
    - **Validates: Requirements 8.3**

  - [x] 11.5 Create EndpointService
    - Create `src/control-plane/endpoint-service.js` with endpoint registration and management
    - Create `src/control-plane/endpoint-service-constants.js` for constants
    - Extract endpoint logic from ControlPlaneService
    - Implement lifecycle interface
    - _Requirements: 8.4, 8.6_

  - [x] 11.6 Write property test for endpoint registration round-trip
    - **Property 15: Endpoint registration round-trip**
    - **Validates: Requirements 8.4**

  - [x] 11.7 Create ReplicaDispatchService
    - Create `src/control-plane/replica-dispatch-service.js` with replica operation dispatch and message forwarding
    - Create `src/control-plane/replica-dispatch-service-constants.js` for constants
    - Extract dispatch logic from ControlPlaneService (dispatchInFlight, message forwarding, CDC event handling)
    - Implement lifecycle interface
    - _Requirements: 8.5, 8.6_

  - [x] 11.8 Write property test for replica dispatch routing
    - **Property 16: Replica dispatch forwards to correct leader**
    - **Validates: Requirements 8.5**

  - [x] 11.9 Wire focused services into bootstrap and joining flows
    - Update `src/bootstrap/bootstrap-service.js` to create and wire HeartbeatService, LeaseService, EndpointService, ReplicaDispatchService instead of ControlPlaneService
    - Update `src/bootstrap/node-joining-service.js` similarly
    - Remove `src/control-plane/control-plane-service.js`
    - _Requirements: 8.6, 8.7_

- [x] 12. Update architecture.md
  - Update `architecture.md` to reflect all consolidation changes: unified state vocabulary, collapsed state machine hierarchy, single bootstrap writer, single failure detector, single replica state owner, rebalance budget, SQL engine reads, control plane decomposition
  - _Requirements: all_

- [ ] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required (comprehensive from start)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check with `{numRuns: 10}`
- Unit tests validate specific examples and edge cases
- The implementation order follows the dependency graph to avoid breaking changes
