# Implementation Plan: Bootstrap Architecture Refactoring

## Overview

This implementation plan breaks down the bootstrap architecture refactoring into discrete, incremental tasks. Each task builds on previous tasks and ends with wiring things together. The focus is on code changes that can be executed by a coding agent.

## Tasks

- [x] 1. Create service lifecycle infrastructure
  - [x] 1.1 Create service lifecycle constants and state enum
    - Create `src/bootstrap/service-lifecycle-constants.js` with ServiceState enum (CREATED, INITIALIZED, RUNNING, STOPPED)
    - Create lifecycle transition map defining valid state transitions
    - _Requirements: 4.1, 4.2, 4.3, 4.4_
  
  - [x] 1.2 Create ServiceLifecycleMixin for consistent lifecycle behavior
    - Create `src/bootstrap/service-lifecycle-mixin.js` with initialize(), start(), stop(), getState() methods
    - Implement state transition validation with appropriate errors
    - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_
  
  - [x] 1.3 Write property test for service lifecycle state transitions
    - **Property 2: Service Lifecycle State Transitions**
    - **Property 3: Invalid Lifecycle Transition Handling**
    - **Validates: Requirements 4.5, 4.6, 4.7, 4.8, 4.9, 4.10**

- [x] 2. Create error types and validation utilities
  - [x] 2.1 Create bootstrap error types
    - Create `src/bootstrap/bootstrap-errors.js` with DependencyError, LifecycleError, PhaseTransitionError, PhaseTimeoutError, WriterDisabledError
    - Ensure error messages include context (service name, dependency name, phase name)
    - _Requirements: 7.1, 7.2, 10.5, 10.6_
  
  - [x] 2.2 Write property test for required dependency validation
    - **Property 1: Required Dependency Validation**
    - **Validates: Requirements 1.1, 1.2, 1.3, 6.3, 7.1, 7.2**

- [ ] 3. Create phase state machine
  - [-] 3.1 Create BootstrapPhaseStateMachine class
    - Create `src/bootstrap/bootstrap-phase-state-machine.js`
    - Implement transition validation against SeedBootstrapTransitions map
    - Emit events on phase transitions
    - Track phase durations
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7_
  
  - [~] 3.2 Create JoiningPhaseStateMachine class
    - Create `src/bootstrap/joining-phase-state-machine.js`
    - Implement transition validation against JoiningNodeTransitions map
    - Reuse event emission and duration tracking from base implementation
    - _Requirements: 5.2_
  
  - [~] 3.3 Write property test for phase state machine enforcement
    - **Property 4: Phase State Machine Enforcement**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**

- [~] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Create BootstrapPartitionWriter
  - [~] 5.1 Create BootstrapPartitionWriter class
    - Create `src/bootstrap/bootstrap-partition-writer.js`
    - Require partitionServices in constructor using assertCritical
    - Implement write() method for direct partition writes
    - Implement disable() method to prevent use after registration
    - _Requirements: 1.5, 6.1, 6.2, 6.7_
  
  - [~] 5.2 Write property test for bootstrap partition writer lifecycle
    - **Property 5: Bootstrap Partition Writer Lifecycle**
    - **Property 10: Direct Partition Writes Without Cache**
    - **Validates: Requirements 1.6, 6.1, 6.6**

- [ ] 6. Refactor SQLQueryEngine to require dependencies at construction
  - [~] 6.1 Update SQLQueryEngine constructor to require systemCache and messageRouter
    - Modify `src/query/sql-query-engine.js` constructor to use assertCritical for systemCache and messageRouter
    - Remove setSystemCache(), setMessageRouter(), setCDCIntegrationService() setter methods
    - Update sub-component initialization to pass required dependencies
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.3_
  
  - [~] 6.2 Update all SQLQueryEngine instantiation sites
    - Update bootstrap-service.js to create SQLQueryEngine after cache hydration
    - Update node-joining-service.js to create SQLQueryEngine after cache hydration
    - Update any test files that instantiate SQLQueryEngine
    - _Requirements: 1.7, 6.5_

- [ ] 7. Create shared setup components
  - [~] 7.1 Create MessageRouterSetup component
    - Create `src/bootstrap/shared/message-router-setup.js`
    - Extract message router creation and configuration from bootstrap-service.js
    - Implement static create() method returning configured MessageRouter
    - _Requirements: 3.1_
  
  - [~] 7.2 Create ReplicaHandlerSetup component
    - Create `src/bootstrap/shared/replica-handler-setup.js`
    - Extract replica handler creation from bootstrap-service.js
    - Implement static create() method returning ReplicaHandler and ReplicaStateMachine
    - _Requirements: 3.2_
  
  - [~] 7.3 Create ControlPlaneSetup component
    - Create `src/bootstrap/shared/control-plane-setup.js`
    - Extract control plane service creation from bootstrap-service.js
    - Implement static create() method returning configured ControlPlaneService
    - _Requirements: 3.3_
  
  - [~] 7.4 Create CDCIntegrationSetup component
    - Create `src/bootstrap/shared/cdc-integration-setup.js`
    - Extract CDC integration service creation from bootstrap-service.js
    - Implement static create() method returning configured CDCIntegrationService
    - _Requirements: 3.4_

- [~] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Extract bootstrap phases into separate classes
  - [~] 9.1 Create InfrastructurePhase class
    - Create `src/bootstrap/phases/infrastructure-phase.js`
    - Extract phaseInfrastructure() logic from bootstrap-service.js
    - Use MessageRouterSetup shared component
    - Implement execute() returning {nodeService, messageRouter}
    - Implement cleanup() for failure recovery
    - _Requirements: 2.1, 2.6, 2.7, 2.8_
  
  - [~] 9.2 Create MessageGroupPhase class
    - Create `src/bootstrap/phases/message-group-phase.js`
    - Extract phaseMessageGroups() logic from bootstrap-service.js
    - Implement execute() returning {messageGroupServices}
    - Implement cleanup() for failure recovery
    - _Requirements: 2.2, 2.6, 2.7, 2.8_
  
  - [~] 9.3 Create PartitionPhase class
    - Create `src/bootstrap/phases/partition-phase.js`
    - Extract phasePartitions() logic from bootstrap-service.js
    - Implement execute() returning {partitionServices}
    - Implement cleanup() for failure recovery
    - _Requirements: 2.3, 2.6, 2.7, 2.8_
  
  - [~] 9.4 Create RegistrationPhase class
    - Create `src/bootstrap/phases/registration-phase.js`
    - Extract phaseRegistration() logic from bootstrap-service.js
    - Use BootstrapPartitionWriter for direct writes
    - Implement execute() returning {systemTableWriter}
    - Implement cleanup() for failure recovery
    - _Requirements: 2.4, 6.4, 6.7_
  
  - [~] 9.5 Create CacheHydrationPhase class
    - Create `src/bootstrap/phases/cache-hydration-phase.js`
    - Extract phaseCacheHydration() logic from bootstrap-service.js
    - Create SQLQueryEngine with populated cache
    - Implement execute() returning {systemCache, sqlQueryEngine}
    - Implement cleanup() for failure recovery
    - _Requirements: 2.5, 1.7, 6.5_
  
  - [~] 9.6 Write property test for phase class contract
    - **Property 6: Phase Class Contract**
    - **Validates: Requirements 2.6, 2.7, 2.8**

- [ ] 10. Refactor BootstrapService to use phase classes
  - [~] 10.1 Update BootstrapService to use extracted phases
    - Modify `src/bootstrap/bootstrap-service.js` to instantiate and execute phase classes
    - Use BootstrapPhaseStateMachine for phase tracking
    - Use shared setup components for ReplicaHandler and ControlPlane
    - Wire phase results together
    - _Requirements: 3.6, 8.1_
  
  - [~] 10.2 Write property test for backward compatible return values
    - **Property 7: Backward Compatible Return Values**
    - **Validates: Requirements 9.3**
  
  - [~] 10.3 Write property test for phase failure handling
    - **Property 8: Phase Failure Handling**
    - **Validates: Requirements 10.1, 10.2, 10.5, 10.6**

- [~] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Extract joining node phases into separate classes
  - [~] 12.1 Create ContactSeedPhase class
    - Create `src/bootstrap/phases/contact-seed-phase.js`
    - Extract phaseContactSeed() logic from node-joining-service.js
    - Implement execute() returning {bootstrapResponse}
    - _Requirements: 2.6, 2.7, 2.8_
  
  - [~] 12.2 Create ConnectWebSocketPhase class
    - Create `src/bootstrap/phases/connect-websocket-phase.js`
    - Extract phaseConnectWebSocket() logic from node-joining-service.js
    - Use MessageRouterSetup shared component
    - Implement execute() returning {messageRouter}
    - _Requirements: 2.6, 2.7, 2.8, 3.7_
  
  - [~] 12.3 Create JoinMessageGroupPhase class
    - Create `src/bootstrap/phases/join-message-group-phase.js`
    - Extract phaseCreateSelfHostedMessageGroup() and phaseJoinExistingMessageGroup() logic
    - Implement execute() returning {messageGroupServices}
    - _Requirements: 2.6, 2.7, 2.8_
  
  - [~] 12.4 Create QueryStatePhase class
    - Create `src/bootstrap/phases/query-state-phase.js`
    - Extract phaseQuerySystemState() logic from node-joining-service.js
    - Implement execute() returning {systemCache}
    - _Requirements: 2.6, 2.7, 2.8_

- [ ] 13. Refactor NodeJoiningService to use phase classes
  - [~] 13.1 Update NodeJoiningService to use extracted phases
    - Modify `src/bootstrap/node-joining-service.js` to instantiate and execute phase classes
    - Use JoiningPhaseStateMachine for phase tracking
    - Use shared setup components for ReplicaHandler and ControlPlane
    - Wire phase results together
    - _Requirements: 3.7, 8.2_
  
  - [~] 13.2 Write property test for join backward compatible return values
    - **Property 7: Backward Compatible Return Values (join)**
    - **Validates: Requirements 9.4**

- [~] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Update dependent components
  - [~] 15.1 Update PartitionResolver to not use setters
    - Modify `src/query/partition-resolver.js` to require systemCache in constructor
    - Remove setSystemCache() method
    - _Requirements: 1.4_
  
  - [~] 15.2 Update QueryExecutor to not use setters
    - Modify `src/query/query-executor.js` to require dependencies in constructor
    - Remove setter methods
    - _Requirements: 1.4_
  
  - [~] 15.3 Update TableCreationService to not use setters
    - Modify `src/query/table-creation-service.js` to require dependencies in constructor
    - Remove setter methods
    - _Requirements: 1.4_

- [ ] 16. Update architecture documentation
  - [~] 16.1 Update architecture.md with new bootstrap architecture
    - Document phase-scoped services pattern
    - Document shared setup components
    - Update bootstrap process diagram
    - _Requirements: 8.1, 8.2_

- [~] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
