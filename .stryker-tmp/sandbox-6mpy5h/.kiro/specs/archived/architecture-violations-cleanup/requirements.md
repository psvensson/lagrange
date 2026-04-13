# Requirements Document

## Introduction

This feature addresses 11 identified architecture violations in the boot, join, and rebalancing flows of the distributed database system. The violations break core principles: zero duplication, single owner per concern, no fallback code paths, and SQL engine for all reads. The cleanup consolidates overlapping responsibilities, fills architectural gaps, and eliminates design debt to bring the codebase into compliance with the documented architecture.

## Glossary

- **FailureDetector**: The single canonical component (`src/node/failure-detector.js`) responsible for detecting node failures via heartbeat timeouts and marking affected replicas as unavailable.
- **NodeLifecycleService**: A service (`src/node/node-lifecycle-service.js`) that manages node lifecycle events (registration, heartbeat, state changes) via CDC. Currently duplicates failure detection logic that belongs in FailureDetector.
- **NodeLifecycleStateMachine**: The unified state machine (`src/node/node-lifecycle-state-machine.js`) for all node lifecycle states, including bootstrap and joining sub-phases.
- **BootstrapPhaseStateMachine**: A separate state machine (`src/bootstrap/bootstrap-phase-state-machine.js`) that tracks seed node bootstrap phases, overlapping with NodeLifecycleStateMachine's sub-phase support.
- **ReplicaStateMachine**: The single authority (`src/node/replica-state-machine.js`) for all replica state tracking and transitions.
- **ReplicaLifecycleManager**: A component (`src/node/replica-lifecycle-manager.js`) that manages partition replica lifecycles and should delegate to ReplicaStateMachine.
- **ReplicaHandler**: A component (`src/node/replica-handler.js`) that handles replica operations and should delegate to ReplicaStateMachine.
- **UnifiedRebalancer**: The rebalancer (`src/rebalancer/unified-rebalancer.js`) that manages replica placement for partitions and message groups.
- **RebalanceCoordinator**: The component (`src/rebalancer/rebalance-coordinator.js`) that owns the complete rebalancing operation lifecycle and workflow.
- **MovePlanner**: The single planner implementation (`src/rebalancer/move-planner.js`) for calculating replica placement moves.
- **AssignmentEpochManager**: The sole coordinator (`src/rebalancer/assignment-epoch-manager.js`) for epoch transitions using compare-and-swap semantics.
- **ReplicaDispatchService**: The service (`src/control-plane/replica-dispatch-service.js`) responsible for dispatching replica operations to target nodes.
- **ControlPlaneService**: A facade (`src/control-plane/control-plane-service.js`) that delegates to HeartbeatService, LeaseService, EndpointService, and ReplicaDispatchService.
- **SystemTableCache**: The in-memory cache (`src/cache/system-table-cache.js`) of all system tables, updated only by CDC events.
- **SQL_Engine**: The SQL query engine (`src/query/sql-query-engine.js`) through which all system reads must be routed.
- **CDC**: Change Data Capture — the mechanism by which system table writes propagate to all node caches.
- **MessageGroupAssignment**: The component (`src/bootstrap/message-group-assignment.js`) that determines how new nodes get message group access.

## Requirements

### Requirement 1: Consolidate Failure Detection into FailureDetector

**User Story:** As a system maintainer, I want failure detection logic to exist in exactly one component, so that node failure handling is consistent and there are no conflicting detection behaviors.

#### Acceptance Criteria

1. WHEN NodeLifecycleService is inspected, THE NodeLifecycleService SHALL NOT contain failure detection logic (heartbeat timeout checking, node suspicion marking, or node failure marking based on heartbeat delays)
2. WHEN a node heartbeat times out, THE FailureDetector SHALL be the sole component that transitions the node through suspected and failed states
3. WHEN NodeLifecycleService needs to mark a node as failed, THE NodeLifecycleService SHALL delegate to FailureDetector instead of directly writing status changes
4. THE NodeLifecycleService SHALL NOT maintain a knownNodes Map for tracking node heartbeat state independently of the system cache

### Requirement 2: Consolidate Rebalancing Safety Checks

**User Story:** As a system maintainer, I want safety checking logic for rebalancing operations to exist in exactly one component, so that safety decisions are never contradictory.

#### Acceptance Criteria

1. THE RebalanceCoordinator SHALL be the single owner of all safety checking logic for replica operations (including quorum protection and critical partition guards)
2. WHEN UnifiedRebalancer needs to validate a move, THE UnifiedRebalancer SHALL delegate safety validation entirely to RebalanceCoordinator via the existing getMoveSafetyError interface
3. THE UnifiedRebalancer SHALL NOT contain independent safety checking logic that duplicates or overlaps with RebalanceCoordinator safety checks

### Requirement 3: Unify Phase State Machines

**User Story:** As a system maintainer, I want a single state machine for node lifecycle phases, so that bootstrap phase tracking is not duplicated across two components.

#### Acceptance Criteria

1. THE NodeLifecycleStateMachine SHALL be the sole state machine for tracking all node lifecycle phases including bootstrap sub-phases
2. WHEN bootstrap phases need to be tracked, THE Bootstrap_Service SHALL use NodeLifecycleStateMachine sub-phase transitions instead of BootstrapPhaseStateMachine
3. WHEN BootstrapPhaseStateMachine is no longer referenced by any component, THE System SHALL remove the BootstrapPhaseStateMachine class and its associated file
4. THE NodeLifecycleStateMachine SHALL support all phase transitions currently handled by BootstrapPhaseStateMachine (NOT_STARTED through COMPLETE, including FAILED)

### Requirement 4: Enforce Single Replica State Authority

**User Story:** As a system maintainer, I want ReplicaStateMachine to be the sole authority for replica state, so that no component independently tracks replica state.

#### Acceptance Criteria

1. THE ReplicaStateMachine SHALL be the single source of truth for all replica state tracking
2. WHEN ReplicaLifecycleManager needs replica state information, THE ReplicaLifecycleManager SHALL read from ReplicaStateMachine instead of maintaining independent state
3. WHEN ReplicaHandler needs replica state information, THE ReplicaHandler SHALL read from ReplicaStateMachine instead of maintaining independent state
4. THE ReplicaLifecycleManager and ReplicaHandler SHALL NOT maintain their own Maps, Sets, or objects that track replica state independently

### Requirement 5: Clarify Epoch Management Ownership

**User Story:** As a system maintainer, I want clear epoch ownership boundaries, so that epoch management is not confused across multiple components.

#### Acceptance Criteria

1. THE AssignmentEpochManager SHALL be the sole coordinator for assignment epoch transitions
2. WHEN any component needs to read the current epoch, THE Component SHALL obtain it from AssignmentEpochManager or from config.current_epoch via CDC
3. THE System SHALL NOT maintain epoch state in any component other than AssignmentEpochManager and the config table
4. WHEN epoch values are propagated, THE System SHALL use CDC as the single propagation mechanism

### Requirement 6: Centralize Message Group Assignment Strategy

**User Story:** As a system maintainer, I want message group assignment strategy selection to be centralized, so that strategy logic is not scattered across multiple components.

#### Acceptance Criteria

1. THE MessageGroupAssignment class SHALL be the single location for all message group assignment strategy selection logic
2. WHEN the bootstrap API needs to assign a message group to a new node, THE Bootstrap_API SHALL delegate to MessageGroupAssignment.determineAssignment
3. THE System SHALL NOT contain strategy selection logic for message group assignment outside of the MessageGroupAssignment class

### Requirement 7: Add Bootstrap Failure Cleanup

**User Story:** As a system operator, I want bootstrap failures to be cleaned up completely, so that partial state does not remain in the system after a failed bootstrap.

#### Acceptance Criteria

1. WHEN a seed node bootstrap fails at any phase, THE Bootstrap_Service SHALL execute a cleanup procedure that removes all partial state created during the failed bootstrap
2. WHEN a joining node bootstrap fails, THE Node_Joining_Service SHALL execute a cleanup procedure that removes all partial state created during the failed join
3. IF cleanup itself fails, THEN THE System SHALL log the cleanup failure with sufficient detail for manual recovery
4. WHEN bootstrap cleanup executes, THE Cleanup_Procedure SHALL remove partial entries from the nodes, services, partitions, and message_groups system tables

### Requirement 8: Add Dispatch Readiness Validation

**User Story:** As a system maintainer, I want the dispatch service to verify replica handler registration before dispatching, so that operations are not sent to unregistered replicas.

#### Acceptance Criteria

1. WHEN ReplicaDispatchService dispatches an operation to a target node, THE ReplicaDispatchService SHALL verify that the target node has a registered handler for the operation's entity type before sending
2. IF the target node does not have a registered handler, THEN THE ReplicaDispatchService SHALL skip the dispatch and log a warning with the operation ID and target node
3. WHEN a dispatch is skipped due to missing handler registration, THE ReplicaDispatchService SHALL leave the operation in its current workflow step for retry on the next dispatch cycle

### Requirement 9: Complete Stabilization Reset Logic

**User Story:** As a system maintainer, I want stabilization timer resets to be explicitly defined, so that the rebalancer does not rebalance prematurely or delay unnecessarily.

#### Acceptance Criteria

1. WHEN a node joins or leaves the cluster (detected via CDC node state change), THE UnifiedRebalancer SHALL reset its stabilization timer
2. WHEN a replica fails (detected via CDC services table change), THE UnifiedRebalancer SHALL reset its stabilization timer
3. WHEN a policy change occurs, THE UnifiedRebalancer SHALL reset its stabilization timer
4. THE UnifiedRebalancer SHALL document all stabilization reset triggers as named constants

### Requirement 10: Complete Control Plane Decomposition

**User Story:** As a system maintainer, I want the ControlPlaneService facade to be fully eliminated, so that callers use the decomposed services directly.

#### Acceptance Criteria

1. WHEN any component needs heartbeat functionality, THE Component SHALL use HeartbeatService directly instead of through ControlPlaneService
2. WHEN any component needs lease functionality, THE Component SHALL use LeaseService directly instead of through ControlPlaneService
3. WHEN any component needs endpoint functionality, THE Component SHALL use EndpointService directly instead of through ControlPlaneService
4. WHEN any component needs dispatch functionality, THE Component SHALL use ReplicaDispatchService directly instead of through ControlPlaneService
5. WHEN all callers have been migrated to use decomposed services directly, THE System SHALL remove the ControlPlaneService facade class and its associated file

### Requirement 11: Route All System Reads Through SQL Engine

**User Story:** As a system maintainer, I want all system table reads to go through the SQL engine, so that the single read path principle is enforced consistently.

#### Acceptance Criteria

1. THE System SHALL NOT read directly from SystemTableCache or SystemCacheProxy outside of the SQL engine internals and cache/query infrastructure
2. WHEN a component needs to read system table data, THE Component SHALL use the SQL_Engine executeQuery interface
3. WHEN direct cache reads are identified in components outside cache/query internals, THE System SHALL replace them with equivalent SQL engine queries
4. IF the SQL_Engine is not yet available during early bootstrap, THEN THE System SHALL use the documented bootstrap exception (direct writes only, not reads) and transition to SQL engine reads immediately after bootstrap completes
