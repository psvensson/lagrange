# Requirements Document

## Introduction

This specification covers a major system architecture consolidation effort to eliminate duplicated logic, unify state vocabularies, and enforce the system's core architectural principles. The codebase has accumulated parallel implementations for state tracking, failure detection, bootstrap writing, and replica management. This consolidation removes redundancy, establishes single sources of truth, and ensures all system information access follows the mandated SQL engine path.

## Glossary

- **Node_Lifecycle_State_Machine**: The in-memory state machine tracking a node's lifecycle phases (STARTING → CONNECTING → DISCOVERING → JOINING → READY → DRAINING → STOPPED)
- **Bootstrap_Phase_State_Machine**: The state machine tracking seed node bootstrap phases (NOT_STARTED → INFRASTRUCTURE → MESSAGE_GROUPS → PARTITIONS → REGISTRATION → CACHE_HYDRATION → COMPLETE)
- **Joining_Phase_State_Machine**: The state machine tracking joining node bootstrap phases (NOT_STARTED → CONTACTING_SEED → CONNECTING_WEBSOCKET → CREATING/JOINING_MESSAGE_GROUP → WAITING_LEADERSHIP → QUERYING_STATE → COMPLETE)
- **Enhanced_Bootstrap_State_Machine**: A subclass of Bootstrap_Phase_State_Machine that adds phase gates and timeout handling
- **NODE_STATUS**: The enum written to the nodes system table (INITIALIZING, ACTIVE, SUSPECTED, FAILED, RECOVERING, SHUTTING_DOWN, STOPPED)
- **STATE**: The enum used by Node_Lifecycle_State_Machine for in-memory lifecycle tracking (STARTING, CONNECTING, DISCOVERING, JOINING, READY, DRAINING, STOPPED)
- **Failure_Detector**: The standalone service that monitors node health via heartbeat timeouts with adaptive thresholds and flapping detection
- **Node_Lifecycle_Service**: The service managing node lifecycle events via CDC, which also contains a duplicate failure detection loop
- **Bootstrap_Partition_Writer**: A class that writes directly to local partition services during seed node registration, bypassing SQL and cache
- **Bootstrap_System_Table_Writer**: A class that wraps CDCIntegrationService bootstrap mode to write directly to local partitions through the CDC service
- **Replica_State_Machine**: A formal state machine tracking replica lifecycle states with timeout checking, metrics, and CDC persistence
- **Replica_Lifecycle_Manager**: A manager handling CREATE_REPLICA and REMOVE_REPLICA messages, which also tracks replica states via its own localReplicas Map and status transitions
- **Replica_Handler**: The handler that executes replica operations on target nodes, maintaining its own localReplicas Map
- **Unified_Rebalancer**: The per-entity rebalancer that makes independent placement decisions for partitions and message groups
- **Control_Plane_Service**: The service handling node registration, heartbeat leases, lease sweeping, endpoint management, replica operation dispatch, and CDC event handling
- **System_Table_Cache**: The in-memory cache of all system tables, updated only by CDC events
- **SQL_Engine**: The SQL query engine that routes queries through the system cache to partition leaders
- **CDC_Integration_Service**: The service routing system table writes through SQL, with a bootstrap mode for seed node direct writes
- **Rebalance_Budget**: A cluster-wide concurrency limit for rebalancing operations, stored in the config system table

## Requirements

### Requirement 1: Unified Node State Machine Hierarchy

**User Story:** As a system operator, I want a single authoritative state machine hierarchy for node lifecycle, so that there is one source of truth for node state and no risk of divergent state tracking.

#### Acceptance Criteria

1. THE Node_Lifecycle_State_Machine SHALL be the single top-level state machine for node lifecycle, owning bootstrap and joining sub-phases as internal implementation details
2. WHEN the Node_Lifecycle_State_Machine transitions to JOINING, THE Node_Lifecycle_State_Machine SHALL internally track the joining sub-phase (CONTACTING_SEED, CONNECTING_WEBSOCKET, CREATING_MESSAGE_GROUP, JOINING_MESSAGE_GROUP, WAITING_LEADERSHIP, QUERYING_STATE)
3. WHEN the Node_Lifecycle_State_Machine transitions to STARTING, THE Node_Lifecycle_State_Machine SHALL internally track the bootstrap sub-phase (INFRASTRUCTURE, MESSAGE_GROUPS, PARTITIONS, REGISTRATION, CACHE_HYDRATION)
4. WHEN a sub-phase transition occurs, THE Node_Lifecycle_State_Machine SHALL emit a sub-phase event containing the parent state and the sub-phase name
5. THE Enhanced_Bootstrap_State_Machine, Bootstrap_Phase_State_Machine, and Joining_Phase_State_Machine SHALL be removed as independent classes after their logic is absorbed into the Node_Lifecycle_State_Machine
6. WHEN a sub-phase completes its final step, THE Node_Lifecycle_State_Machine SHALL automatically advance to the next top-level state

### Requirement 2: Unified Node State Vocabulary

**User Story:** As a developer, I want a single state vocabulary for node status, so that the in-memory state and the persisted state use the same terms and no mapping is required.

#### Acceptance Criteria

1. THE System SHALL define a single NODE_STATE enum that covers both in-memory lifecycle states and persisted system table states
2. THE NODE_STATE enum SHALL include: INITIALIZING, STARTING, CONNECTING, DISCOVERING, JOINING, READY, ACTIVE, SUSPECTED, FAILED, RECOVERING, DRAINING, SHUTTING_DOWN, STOPPED
3. WHEN the Node_Lifecycle_State_Machine transitions to a new state, THE Node_Lifecycle_Service SHALL write the same state value to the nodes system table via CDC
4. THE separate STATE enum in src/constants/states.js and NODE_STATUS enum in src/node/node-constants.js SHALL be replaced by the unified NODE_STATE enum
5. WHEN any component reads node state from the system cache, THE returned state value SHALL be from the unified NODE_STATE enum

### Requirement 3: Single Bootstrap Writer

**User Story:** As a developer, I want a single mechanism for bootstrap writes, so that the chicken-and-egg problem during seed node startup is solved in exactly one place.

#### Acceptance Criteria

1. THE CDC_Integration_Service bootstrap mode SHALL be the single mechanism for direct partition writes during seed node bootstrap
2. THE Bootstrap_Partition_Writer class SHALL be removed after its callers are migrated to use CDC_Integration_Service bootstrap mode
3. WHEN the seed node enters the REGISTRATION bootstrap sub-phase, THE CDC_Integration_Service SHALL enable bootstrap mode to write directly to local partitions
4. WHEN the seed node completes the REGISTRATION bootstrap sub-phase, THE CDC_Integration_Service SHALL disable bootstrap mode
5. IF bootstrap mode is disabled, THEN THE CDC_Integration_Service SHALL reject direct partition write attempts and route through the SQL_Engine

### Requirement 4: Single Failure Detector

**User Story:** As a system operator, I want a single failure detection mechanism, so that node failures are detected consistently without duplicate CDC writes or racing detectors.

#### Acceptance Criteria

1. THE Failure_Detector SHALL be the single mechanism for detecting node failures across the cluster
2. THE Node_Lifecycle_Service failure detection methods (startFailureDetection, detectFailedNodes) SHALL be removed
3. WHEN the Failure_Detector marks a node as SUSPECTED, THE Failure_Detector SHALL write the status change to the nodes system table via CDC exactly once
4. WHEN the Failure_Detector marks a node as FAILED, THE Failure_Detector SHALL write the status change and mark affected replicas via CDC exactly once
5. WHEN the Failure_Detector detects node recovery, THE Failure_Detector SHALL write the RECOVERING status to the nodes system table via CDC
6. THE Failure_Detector SHALL retain adaptive thresholds and flapping detection capabilities

### Requirement 5: Single Replica State Ownership

**User Story:** As a developer, I want a single authoritative source for replica state, so that replica status is tracked in one place and written to CDC from one path.

#### Acceptance Criteria

1. THE Replica_State_Machine SHALL be the single authoritative source for replica lifecycle state
2. THE Replica_Lifecycle_Manager SHALL delegate all state tracking to the Replica_State_Machine and remove its own VALID_STATUS_TRANSITIONS and updateReplicaStatus logic
3. THE Replica_Handler SHALL delegate all state tracking to the Replica_State_Machine and remove its own localReplicas state management
4. WHEN a replica status changes, THE Replica_State_Machine SHALL be the single component that writes the status change to the services system table via CDC
5. WHEN the Replica_Lifecycle_Manager or Replica_Handler needs to query replica state, THE component SHALL read from the Replica_State_Machine

### Requirement 6: Rebalancer Cluster-Wide Coordination

**User Story:** As a system operator, I want rebalancing operations to be coordinated cluster-wide, so that simultaneous rebalancers do not overwhelm surviving nodes after a failure.

#### Acceptance Criteria

1. THE System SHALL store a rebalance_budget value in the config system table representing the maximum concurrent cluster-wide replica moves
2. WHEN a Unified_Rebalancer instance plans moves, THE Unified_Rebalancer SHALL query the replica_operations table via the SQL_Engine for in-flight operations cluster-wide
3. IF the count of in-flight operations is greater than or equal to the rebalance_budget, THEN THE Unified_Rebalancer SHALL back off with randomized jitter and retry on the next cycle
4. IF the count of in-flight operations is less than the rebalance_budget, THEN THE Unified_Rebalancer SHALL propose at most (rebalance_budget minus in-flight count) moves
5. THE Unified_Rebalancer SHALL prioritize critical moves (under-replicated partitions from node failure) over optimization moves (spread improvement)
6. THE existing INSERT OR IGNORE deduplication in the replica_operations table SHALL remain as the final safety net for concurrent move proposals

### Requirement 7: SQL Engine for All System Information Reads

**User Story:** As a developer, I want all system information reads to go through the SQL engine, so that the cache-then-partition fallback path is always used and no component bypasses it.

#### Acceptance Criteria

1. THE Node_Reintegration_Service SHALL read node information through the SQL_Engine instead of calling systemTableCache.getAll() and systemTableCache.filter() directly
2. THE Failure_Detector SHALL read node and service information through the SQL_Engine instead of calling systemTableCache.getAll() and systemTableCache.filter() directly
3. WHEN any component needs to read system table information, THE component SHALL use the SQL_Engine which checks the cache first and falls back to partition replicas
4. IF a direct systemTableCache.getAll() or systemTableCache.filter() call exists outside of the SQL_Engine and System_Table_Cache internal implementation, THEN THE System SHALL treat the call as a violation to be removed

### Requirement 8: Control Plane Service Decomposition

**User Story:** As a developer, I want the Control_Plane_Service broken into focused services, so that each service has a single responsibility and the codebase is easier to maintain.

#### Acceptance Criteria

1. THE Control_Plane_Service SHALL be decomposed into separate focused services: Heartbeat_Service, Lease_Service, Endpoint_Service, and Replica_Dispatch_Service
2. THE Heartbeat_Service SHALL own periodic heartbeat updates and heartbeat failure tracking
3. THE Lease_Service SHALL own lease-based readiness tracking and lease sweeping
4. THE Endpoint_Service SHALL own endpoint registration and management
5. THE Replica_Dispatch_Service SHALL own replica operation dispatch and message forwarding to leaders
6. WHEN the system initializes, THE focused services SHALL be wired together through constructor-based dependency injection following the existing service lifecycle interface (CREATED → INITIALIZED → RUNNING → STOPPED)
7. THE original Control_Plane_Service class SHALL be removed after its logic is distributed to the focused services
