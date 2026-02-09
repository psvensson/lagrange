# Requirements Document

## Introduction

The SystemCacheProxy forwards all system cache queries to a local message group replica running in a worker process. Currently, the proxy only discovers that its selected replica is gone when a query fails (reactive), then retries once with a newly selected replica. ReplicaWorkerManager already emits lifecycle events (`REPLICA_CREATED`, `REPLICA_STOPPED`, `REPLICA_FAILED`) but SystemCacheProxy does not listen to them. The `onReplicaSetChanged()` method exists but nothing calls it automatically.

This feature wires ReplicaWorkerManager lifecycle events into SystemCacheProxy so that replica selection is proactive and health-aware, ensuring system cache access flows at all times with minimal overhead — especially for the common case where a node has exactly one message group replica.

## Glossary

- **SystemCacheProxy**: Stateless proxy in the main process that forwards cache queries to a selected local message group replica worker.
- **ReplicaWorkerManager**: Component that manages worker processes via piscina thread pool, emitting lifecycle events when replicas are created, stopped, or fail.
- **Message_Group_Replica**: A Raft group replica running in a piscina worker process that holds the node's SQLiteSystemCache.
- **Worker_Event**: Lifecycle event emitted by ReplicaWorkerManager (e.g., REPLICA_CREATED, REPLICA_STOPPED, REPLICA_FAILED).
- **Health_Status**: The health classification of a worker replica as reported by ReplicaWorkerManager health checks (HEALTHY, UNHEALTHY, UNKNOWN).
- **Selected_Replica**: The single message group replica that SystemCacheProxy currently forwards queries to.
- **WORKER_EVENT**: Constants object in worker-constants.js defining event names emitted by ReplicaWorkerManager.

## Requirements

### Requirement 1: Define Missing Worker Event Constants

**User Story:** As a developer, I want REPLICA_CREATED, REPLICA_STOPPED, and REPLICA_FAILED defined as constants in WORKER_EVENT, so that event wiring uses well-defined constants instead of undefined values.

#### Acceptance Criteria

1. THE WORKER_EVENT constants object SHALL include REPLICA_CREATED, REPLICA_STOPPED, and REPLICA_FAILED as named string constants.
2. WHEN ReplicaWorkerManager emits a lifecycle event, THE ReplicaWorkerManager SHALL use the WORKER_EVENT constant for the event name.

### Requirement 2: Wire Replica Stopped Events to SystemCacheProxy

**User Story:** As a system operator, I want SystemCacheProxy to be notified proactively when a message group replica is stopped, so that the proxy re-selects before any query fails.

#### Acceptance Criteria

1. WHEN ReplicaWorkerManager emits a REPLICA_STOPPED event for a message group replica, THE SystemCacheProxy SHALL invoke its replica set change handler within the same event loop tick.
2. WHEN the stopped replica is the currently Selected_Replica, THE SystemCacheProxy SHALL select a different healthy replica from the remaining local set.
3. IF no healthy message group replicas remain after a REPLICA_STOPPED event, THEN THE SystemCacheProxy SHALL set the Selected_Replica to null.

### Requirement 3: Wire Replica Created Events to SystemCacheProxy

**User Story:** As a system operator, I want SystemCacheProxy to be notified when a new message group replica is created on this node, so that the proxy can use it immediately — especially during bootstrap or when replicas are moved to this node.

#### Acceptance Criteria

1. WHEN ReplicaWorkerManager emits a REPLICA_CREATED event for a message group replica, THE SystemCacheProxy SHALL add the new replica to its local replica set.
2. WHEN a REPLICA_CREATED event arrives and no replica is currently selected, THE SystemCacheProxy SHALL select the newly created replica.
3. WHEN a REPLICA_CREATED event arrives and a healthy replica is already selected, THE SystemCacheProxy SHALL keep the current selection unchanged.

### Requirement 4: Wire Replica Failed Events to SystemCacheProxy

**User Story:** As a system operator, I want SystemCacheProxy to react to replica crash events, so that the proxy immediately stops sending queries to a crashed replica.

#### Acceptance Criteria

1. WHEN ReplicaWorkerManager emits a REPLICA_FAILED event for a message group replica, THE SystemCacheProxy SHALL remove the failed replica from its local replica set and re-select.
2. WHEN the failed replica is the currently Selected_Replica, THE SystemCacheProxy SHALL select a different healthy replica from the remaining local set.
3. IF no healthy message group replicas remain after a REPLICA_FAILED event, THEN THE SystemCacheProxy SHALL set the Selected_Replica to null.

### Requirement 5: Health-Aware Replica Selection

**User Story:** As a system operator, I want SystemCacheProxy to avoid selecting unhealthy replicas, so that cache queries are routed to responsive workers.

#### Acceptance Criteria

1. WHEN selecting a replica, THE SystemCacheProxy SHALL prefer replicas with Health_Status of HEALTHY over replicas with Health_Status of UNHEALTHY or UNKNOWN.
2. IF all local replicas are unhealthy, THEN THE SystemCacheProxy SHALL select the first available replica rather than selecting none.
3. WHEN the currently Selected_Replica becomes unhealthy via a health status change, THE SystemCacheProxy SHALL re-select only if a healthy alternative exists.

### Requirement 6: Event Listener Registration and Cleanup

**User Story:** As a developer, I want SystemCacheProxy to register and unregister its event listeners cleanly, so that there are no memory leaks or stale listeners.

#### Acceptance Criteria

1. WHEN SystemCacheProxy is initialized, THE SystemCacheProxy SHALL register listeners on ReplicaWorkerManager for REPLICA_CREATED, REPLICA_STOPPED, and REPLICA_FAILED events.
2. WHEN SystemCacheProxy is destroyed or shut down, THE SystemCacheProxy SHALL remove all listeners it registered on ReplicaWorkerManager.
3. THE SystemCacheProxy SHALL filter incoming events to only process those with entityType of MESSAGE_GROUP, ignoring partition replica events.

### Requirement 7: Remove Reactive Retry from sendCacheQuery

**User Story:** As a developer, I want to remove the reactive retry-on-failure logic from sendCacheQuery, so that there is one code path for replica selection — the proactive event-driven path.

#### Acceptance Criteria

1. WHEN a cache query fails, THE SystemCacheProxy SHALL propagate the error to the caller without retrying.
2. THE SystemCacheProxy SHALL rely on proactive event-driven re-selection as the single mechanism for switching replicas.

### Requirement 8: Remove Dual Cache Selection Path in NodeService

**User Story:** As a developer, I want to remove the parallel replica selection mechanism in NodeService (_primaryMessageGroup, setPrimaryMessageGroup, _getLocalMessageGroupReplica), so that SystemCacheProxy is the single code path for cache access.

#### Acceptance Criteria

1. THE NodeService SHALL delegate all system cache access to a SystemCacheProxy reference rather than maintaining its own _primaryMessageGroup selection.
2. WHEN bootstrap completes, THE bootstrap service SHALL set the SystemCacheProxy reference on NodeService.
3. THE NodeService SHALL NOT contain setPrimaryMessageGroup, _primaryMessageGroup, or _getLocalMessageGroupReplica methods or fields.

### Requirement 9: Remove Dead Code from SystemCacheProxy

**User Story:** As a developer, I want to remove the now-dead onReplicaSetChanged() method and the polling fallback in ensureReplicaSelected(), so that there is one mechanism for replica set management — the event-driven path.

#### Acceptance Criteria

1. THE SystemCacheProxy SHALL NOT expose a public onReplicaSetChanged() method.
2. THE ensureReplicaSelected() method SHALL check the current selection and throw if none exists, without polling the workerManager for updates.
3. THE updateLocalReplicaSet() method SHALL be renamed to loadInitialReplicaSet() and called only during initialization.

### Requirement 10: Architecture Documentation Update

**User Story:** As a developer, I want architecture.md to reflect the event-driven wiring between ReplicaWorkerManager and SystemCacheProxy, so that the system design is accurately documented.

#### Acceptance Criteria

1. WHEN the event-driven wiring is implemented, THE architecture.md document SHALL describe the proactive notification flow from ReplicaWorkerManager to SystemCacheProxy.
2. THE architecture.md document SHALL describe the health-aware replica selection behavior.
