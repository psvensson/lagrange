# Requirements Document

## Introduction

This feature addresses guideline violations found during a codebase audit. The violations include dead code, duplicate state tracking across multiple components, magic string literals in SQL queries, an unused shared component, and a cache-backed SQL engine facade that bypasses the real SQL engine. The goal is to bring the codebase into full compliance with the system guidelines, particularly the Zero Duplication Contract and the Single Source of Truth for State principles.

## Glossary

- **System_Table_Cache**: The in-memory cache of all system tables, updated only by CDC events. Single source of truth for in-memory state.
- **CDC_Integration_Service**: Service that routes all system table writes through SQL and generates CDC events.
- **Replica_Handler**: Component that handles CREATE_REPLICA and REMOVE_REPLICA requests on target nodes.
- **Pull_Based_Replica_Assigner**: Component that manages replica assignment from a joining node's perspective.
- **Failure_Detector**: Component that monitors node health via heartbeat timeouts and marks failed replicas.
- **Unified_Rebalancer**: Component that manages replica placement for partitions and message groups.
- **Rebalance_Coordinator**: Component that coordinates replica operation execution.
- **Replica_Handler_Setup**: Shared component for creating and configuring ReplicaHandler and ReplicaStateMachine.
- **Bootstrap_Service**: Service that handles seed node bootstrap.
- **Node_Joining_Service**: Service that handles joining node bootstrap.
- **Replica_Status**: Enum of valid replica states (pending, creating, syncing, active, removing, removed, failed).
- **Terminal_Status**: A replica status that represents a completed or failed operation (active, removed, failed).

## Requirements

### Requirement 1: Remove Dead State Field

**User Story:** As a developer, I want dead code removed from the codebase, so that the code accurately reflects runtime behavior and does not mislead future maintainers.

#### Acceptance Criteria

1. THE CDC_Integration_Service SHALL NOT contain the `_nodeStates` field in its constructor.
2. WHEN the CDC_Integration_Service is instantiated, THE CDC_Integration_Service SHALL delegate all node state tracking to the CDC_Event_Handler exclusively.

### Requirement 2: Remove Duplicate Replica State from Replica_Handler

**User Story:** As a developer, I want replica state to have a single source of truth in the System_Table_Cache, so that all components read consistent state and the system behaves predictably in a distributed environment.

#### Acceptance Criteria

1. THE Replica_Handler SHALL NOT maintain a local `localReplicas` Map for tracking replica status.
2. WHEN the Replica_Handler needs to check replica status for idempotency, THE Replica_Handler SHALL read from the System_Table_Cache.
3. WHEN the Replica_Handler needs to check if a replica exists locally, THE Replica_Handler SHALL query the System_Table_Cache services table filtered by node_id and replica_id.
4. WHEN the Replica_Handler tracks in-progress operations, THE Replica_Handler SHALL continue using the `inProgressOperations` Map since in-progress operations are transient local state not yet persisted.
5. WHEN the Replica_Handler registers bootstrap-created partitions, THE Replica_Handler SHALL store only the partition service reference without duplicating status tracking.

### Requirement 3: Remove Duplicate Replica State from Pull_Based_Replica_Assigner

**User Story:** As a developer, I want the Pull_Based_Replica_Assigner to read replica state from the System_Table_Cache, so that there is no third copy of replica state in the system.

#### Acceptance Criteria

1. THE Pull_Based_Replica_Assigner SHALL NOT maintain a local `_localReplicas` Map for tracking replica status.
2. WHEN the Pull_Based_Replica_Assigner needs to check local replica status, THE Pull_Based_Replica_Assigner SHALL read from the System_Table_Cache or delegate to the Replica_Handler.

### Requirement 4: Centralize Terminal Status Constants

**User Story:** As a developer, I want terminal replica statuses defined as a single constant, so that SQL queries and status checks reference one authoritative list instead of repeating magic strings.

#### Acceptance Criteria

1. THE Replica_Status module SHALL export a `TERMINAL_STATUSES` constant containing the list of terminal statuses (active, removed, failed).
2. WHEN the Unified_Rebalancer builds SQL queries that filter by terminal statuses, THE Unified_Rebalancer SHALL reference the `TERMINAL_STATUSES` constant from the Replica_Status module.
3. WHEN the Rebalance_Coordinator builds SQL queries that filter by terminal statuses, THE Rebalance_Coordinator SHALL reference the `TERMINAL_STATUSES` constant from the Replica_Status module.
4. THE Unified_Rebalancer and Rebalance_Coordinator SHALL build the SQL NOT IN clause programmatically from the `TERMINAL_STATUSES` constant.

### Requirement 5: Remove Magic Strings from Rebalancer SQL

**User Story:** As a developer, I want all string literals in rebalancer SQL queries replaced with named constants, so that the codebase complies with the no-magic-values guideline.

#### Acceptance Criteria

1. THE Unified_Rebalancer SHALL NOT contain inline string literals for replica statuses in SQL queries.
2. THE Unified_Rebalancer SHALL define direction constants for the `adjustToOddCount` function instead of using raw 'up' and 'down' string literals.
3. WHEN the `adjustToOddCount` function is called, THE caller SHALL use the named direction constants.

### Requirement 6: Failure_Detector SQL Engine Upgrade

**User Story:** As a developer, I want the Failure_Detector to use the real SQL engine as soon as it becomes available, so that there is only one query path in steady state and the cache-backed facade is limited to early bootstrap.

#### Acceptance Criteria

1. WHEN the Failure_Detector is initialized without a SQL engine but with a System_Table_Cache, THE Failure_Detector SHALL create a cache-backed SQL engine facade as a temporary fallback.
2. WHEN a real SQL engine becomes available after initialization, THE Failure_Detector SHALL replace the cache-backed facade with the real SQL engine.
3. THE Failure_Detector SHALL expose a method to upgrade from the cache-backed facade to the real SQL engine.

### Requirement 7: Wire In Shared Replica_Handler_Setup

**User Story:** As a developer, I want the shared Replica_Handler_Setup component used by both bootstrap paths, so that the duplicated setup logic in Bootstrap_Service and Node_Joining_Service is eliminated.

#### Acceptance Criteria

1. WHEN the Bootstrap_Service initializes the Replica_Handler, THE Bootstrap_Service SHALL delegate to the Replica_Handler_Setup shared component.
2. WHEN the Node_Joining_Service initializes the Replica_Handler, THE Node_Joining_Service SHALL delegate to the Replica_Handler_Setup shared component.
3. THE Bootstrap_Service and Node_Joining_Service SHALL NOT contain inline ReplicaHandler and ReplicaStateMachine creation logic.
4. WHEN the Replica_Handler_Setup creates a ReplicaHandler, THE Replica_Handler_Setup SHALL accept a `createPartitionService` factory function from the caller to preserve caller-specific partition creation logic.
