# Control Plane Architecture

Control-plane predictability, system-table ownership, node state vocabulary, control-plane services, and configuration ownership.

## Control-Plane Predictability and Determinism

Control-plane progression (dispatch, rebalance, split) follows a
deterministic owner-key model. Events enqueue work; reconcile
executors drain it one-at-a-time per owner key. Supporting modules
enforce invariants, timeout budgets, failure closure, and migration
exit gates.

### Owner-Key Reconcile Queue

`OwnerKeyReconcileQueue` (`src/workflow/owner-key-reconcile-queue.js`)
is the single progression entry for dispatch, rebalance, and split.

| Rule | Detail |
| --- | --- |
| Enqueue only | Events enqueue owner keys with typed reasons; no inline progression |
| De-duplication | Pending items are merged by owner key; reasons accumulate |
| Single in-flight | At most one reconcile execution per owner key at any time |
| Fence validation | Stale fence tokens are rejected with typed diagnostics |
| Recovery path | Periodic polling enqueues into the same queue; no alternate mutation path |

Single-Path Contract items 4 and 8 reference this queue.

### Invariant Engine

`InvariantEngine` (`src/control-plane/invariant-engine.js`) evaluates
canonical control-plane invariants against a state snapshot.

| Invariant | Severity | Catalog ID |
| --- | --- | --- |
| Leader uniqueness by owner rows | hard | `LEADER_UNIQUENESS` |
| Workflow step monotonicity | hard | `MONOTONIC_STEPS` |
| Claim exclusivity by operation and owner key | hard | `CLAIM_EXCLUSIVITY` |
| No orphan in-flight operations | soft | `ORPHAN_IN_FLIGHT` |
| Single writer for owner-managed `replica_operations` fields | hard | `CONTROL_PLANE_REPLICA_OPERATIONS_SINGLE_WRITER` |
| Acknowledgement before executor-owned phase advance | hard | `CONTROL_PLANE_ACK_BEFORE_ADVANCE` |
| Split resume completeness | hard | `CONTROL_PLANE_SPLIT_RESUME_COMPLETENESS` |
| Readiness dimension correctness | hard | `CONTROL_PLANE_READINESS_DIMENSION_CORRECTNESS` |
| Transaction coordinator required for atomic cut points | hard | `CONTROL_PLANE_TRANSACTION_COORDINATOR_REQUIRED` |

Hard breaches fail deterministic test gates. Diagnostics bundles also emit
catalog-shaped artifact records so the same failures can surface in harness
reports. Invariant definitions live in `src/invariants/invariant-catalog.js`.

### Failure Class Registry

`FailureClassRegistry` (`src/control-plane/failure-class-registry.js`)
maps harness-discovered failures to deterministic test IDs.

Closure policy:

1. A failure class is `open` until a deterministic reproduction
   exists below full harness scale.
2. Each closed class requires a deterministic repro test, an
   owner-path regression, and an invariant assertion.
3. Harness reruns are confirmation artifacts, not sole closure
   evidence.

### Phase Exit Criteria

`PhaseExitCriteria` (`src/control-plane/phase-exit-criteria.js`)
defines measurable exit gates per migration phase.

| Phase | Exit gates |
| --- | --- |
| Queue consolidation | No inline progression; single in-flight enforced |
| Workflow and transaction unification | No ad-hoc multi-row commits; monotonic transition history |
| Read-model and readiness closure | One read-model contract per decision; typed divergence events |
| Timeout and invariant enforcement | Typed timeout classes emitted; hard invariant gates active |
| Dual-path removal | No remaining dual progression paths; docs match implementation |

Each phase carries rollback notes. Phase constants live in
`src/control-plane/phase-exit-constants.js`.

### Dual-Path Closure Verification

`DualPathClosure` (`src/control-plane/dual-path-closure.js`) verifies
no dual progression paths remain after phase closure.

Detected violation types:

1. Temporary toggles not removed at phase boundary.
2. Duplicate progression branches for the same concern.
3. Legacy code paths that should have been deleted.

Each concern (dispatch, rebalance, split) must have exactly one
progression owner path after closure.

### Forbidden Patterns

1. Running long progression logic inline from event handlers.
2. Multiple reconcile executions in flight for the same owner key.
3. Mixing cache and SQL fallback in one semantic decision path.
4. Starting nested operations with fresh timeout budgets instead
   of deriving from remaining budget.
5. Closing harness-discovered failures without a deterministic
   reproduction test.
6. Leaving dual progression paths after a migration phase closes.
## System Tables

### CDC Propagation Classification

A system table is CDC-propagated when every node must hold an up-to-date
copy in its local `SystemTableCache` for routing, placement, rebalancing,
or topology decisions. A table MUST be propagated when any rule applies:

1. **MEMBERSHIP** — describes which nodes, partitions, message groups, or
   replicated services exist and where they live.
2. **ROUTING** — consulted during query routing, leader discovery, or
   endpoint resolution.
3. **PLACEMENT** — read by the rebalancer, move planner, or admission
   service to decide replica placement.
4. **CLUSTER CONFIG** — carries cluster-wide configuration (epoch, budgets,
   feature flags) that every node must observe.
5. **TOPOLOGY** — defines network topology, latency groups, or inter-group
   measurements used for CDC fanout or routing.

A table MUST NOT be propagated when ALL of the following hold:

- It is high-cardinality or high-write-rate.
- It is scoped to a specific service, session, or execution context
  rather than cluster-wide topology.
- It can be queried on demand from its owning partition without affecting
  routing, placement, or cluster-health decisions.

Any new system table MUST be classified in `CDC_PROPAGATED_TABLES` or
`CDC_NON_PROPAGATED_TABLES` in `src/cache/cache-constants.js`. Tables
not in `CDC_PROPAGATED_TABLES` are excluded from cache hydration
snapshots and CDC subscriptions by default.

### CDC-Propagated Tables (cached on every node)

| Table | Purpose | Primary Key | Propagation Rule |
|-------|---------|-------------|------------------|
| `nodes` | Node registry and state | `node_id` | MEMBERSHIP |
| `partitions` | Partition key ranges and replica counts | `partition_id` | MEMBERSHIP |
| `services` | Replica locations and Raft roles | `service_id` | MEMBERSHIP, ROUTING |
| `tables` | Table schemas and policies | `table_id` | MEMBERSHIP |
| `schema_migrations` | Durable schema migration workflow state | `migration_id` | CLUSTER CONFIG |
| `message_groups` | Message group membership | `group_id` | MEMBERSHIP |
| `indices` | Secondary index definitions | `index_id` | MEMBERSHIP |
| `config` | Cluster-wide configuration (epoch, budgets) | `config_key` | CLUSTER CONFIG |
| `replica_operations` | In-flight rebalancing operations | `operation_id` | PLACEMENT |
| `node_endpoints` | Node transport endpoints | `endpoint_id` | ROUTING |
| `service_definitions` | Service runtime definitions | `service_id` | ROUTING |
| `service_endpoints` | Replicated service endpoints | `endpoint_id` | ROUTING |
| `debug_sessions` | Distributed debug trace session state | `session_id` | CLUSTER CONFIG |
| `storage_reservations` | In-flight storage reservations | `reservation_id` | PLACEMENT |
| `latency_groups` | Latency group assignments | `group_id` | TOPOLOGY |
| `inter_group_latencies` | Inter-group RTT measurements | `source_group_id` | TOPOLOGY |

#### `services` Row Ownership Matrix

`services` is a shared control-plane table. Ownership is split by field subset
and must remain single-path:

| Field subset | Owner | Mutation rule |
|-------------|-------|---------------|
| Identity: `service_id`, `service_type`, `node_id`, `partition_id`, `group_id`, `replica_id`, `address`, `created_at` | Canonical service-row creation owner for that service kind | Written on initial row creation only; later code must not recreate or replace these fields ad hoc |
| Lifecycle: `status`, `state_entered_at`, `previous_state`, `trigger_reason`, `error_message`, `updated_at` | `ReplicaStateMachine` for partition replicas; corresponding canonical lifecycle owner for other service kinds | Updated through the lifecycle owner only |
| Raft metadata: `raft_role` | `PartitionService` / `MessageGroupService` role persistence path | Written independently of lifecycle state; no other component may shadow or rewrite it |

Hard rules:

1. Initial row creation and later lifecycle transitions are separate operations.
2. Missing `services` rows must be handled by the canonical creation owner, not
   by a status updater.
3. `INSERT OR REPLACE` is not allowed for steady-state lifecycle updates.
4. Cache rows may be observed for routing or diagnostics, but must not be used
   to reconstruct owner-managed fields for writes.

### Non-Propagated Tables (queryable from owning partition only)

| Table | Purpose | Primary Key | Exclusion Reason |
|-------|---------|-------------|------------------|
| `logs` | System logs | `log_id` | High cardinality, append-only |
| `contexts` | Function execution contexts | `context_id` | Per-execution, transient |
| `code` | Stored functions/procedures | `code_id` | Query on demand |
| `live_queries` | Active live query subscriptions | `query_id` | Per-session |
| `service_timers` | WASM persistent timers | `timer_id` | Service-scoped |
| `module_manifests` | WASM module metadata | composite (`namespace`, `name`, `version`) | Query on demand |
| `package_registry_mappings` | Namespace registry mappings | `namespace` | Query on demand |
| `package_registry_overrides` | Per-package source overrides | composite (`namespace`, `name`) | Query on demand |
| `module_dependency_locks` | Immutable dependency locks | `lock_id` | Query on demand |
| `wasm_operations` | Async operation journal | `operation_id` | Transient workflow state |
| `schema_migration_partitions` | Per-partition schema migration progress | composite (`migration_id`, `partition_id`) | High-write workflow progress, owner-local |
| `debug_breakpoints` | Debug breakpoint state | `breakpoint_id` | Transient |
| `debug_snapshots` | Debug snapshot state | `snapshot_id` | Transient |

### Schema Migration Workflow Ownership

Schema migration execution is explicitly single-owner:

1. `MigrationCoordinator` is the sole lifecycle owner for
   `schema_migrations` and `schema_migration_partitions`.
   It creates rows, advances stages, persists retry/cursor/error state,
   and performs cancellation/rollback transitions.
2. `PartitionService` owns local partition-side ALTER execution only.
   It applies migration ALTER SQL through the partition Raft log and
   does not mutate migration lifecycle rows directly.
3. `SQLQueryEngine` (`SqlCore`) owns SQL routing into the migration
   entrypoint (`MigrationPipeline`) and exposes migration observability
   through normal SELECT query paths.
4. Stage progression is monotonic through
   `pending -> dual_write -> dual_write_complete -> backfill ->
   backfill_complete -> cutover_pending -> completed`, with terminal escape
   states for `failed` and `cancelled` (via `cancelling`).
5. Cutover is atomic: `MigrationCoordinator` composes
   `DistributedTransactionCoordinator` to commit `tables.schema_definition`
   and per-partition completion updates in one transaction.
6. Recovery is startup-owned: `recoverMigrations()` is invoked on startup and
   on leader-election recovery paths to resume non-terminal migrations.
7. CDC visibility split is strict: `schema_migrations` is cluster-propagated
   in `SystemTableCache`; `schema_migration_partitions` remains owner-local and
   queryable from its owning partition.

## Node State Vocabulary

All node states use the unified `NODE_STATE` enum from `src/constants/node-state.js`. There is no separate `NODE_STATUS` or node-specific `STATE` enum.

| State | Meaning |
|-------|---------|
| INITIALIZING | Node starting up, pre-bootstrap |
| STARTING | Seed node bootstrap in progress |
| CONNECTING | Establishing connections |
| DISCOVERING | Discovering cluster topology |
| JOINING | Joining node bootstrap in progress |
| READY | Node ready to serve queries |
| ACTIVE | Node fully operational |
| SUSPECTED | Heartbeat delayed, under suspicion |
| FAILED | Confirmed failure |
| RECOVERING | Recovery detected, health checks in progress |
| DRAINING | Graceful shutdown, draining traffic |
| SHUTTING_DOWN | Shutdown in progress |
| STOPPED | Fully stopped |

The general `STATE` enum (`src/constants/states.js`) retains only non-node values: CONNECTED, DISCONNECTED, NORMAL.
### ReplicaStateMachine (Single Replica State Owner)
- Single authority for all replica state tracking
- ReplicaLifecycleManager and ReplicaHandler delegate to it (no independent state maps)
- All replica state changes produce exactly one CDC write to the services table
- Replaces the former triple-tracking in ReplicaStateMachine, ReplicaLifecycleManager, and ReplicaHandler
- Owns partition-replica lifecycle persistence in `services`:
  initial row creation for runtime-created replicas and later partial lifecycle
  transitions
- Does not own `raft_role`; Raft-role persistence remains with the replica
  service (`PartitionService` / `MessageGroupService`)

### Control Plane Services (Decomposed)
The former monolithic ControlPlaneService is decomposed into four focused services, each with a CREATED -> INITIALIZED -> RUNNING -> STOPPED lifecycle:

- **HeartbeatService** (`src/control-plane/heartbeat-service.js`) — periodic heartbeat updates, consecutive failure tracking
- **LeaseService** (`src/control-plane/lease-service.js`) — lease-based readiness tracking, expired lease sweeping
- **EndpointService** (`src/control-plane/endpoint-service.js`) — endpoint registration and management
- **ReplicaDispatchService** (`src/control-plane/replica-dispatch-service.js`) — replica operation dispatch, message forwarding to leaders

A thin `ControlPlaneService` facade remains for backward compatibility, delegating to these focused services.

### UnifiedRebalancer
- Manages replica placement for partitions, message groups, and
  replicated service groups (entity types: `wasm_service`,
  `runtime_service`)
- Operates autonomously (no manual placement)
- Uses policies to determine target replica count and placement
- Runtime services (`sys-postgres-wire`) use cluster-global
  `replica_count` semantics (not per-node)
- Stabilization period prevents thrashing
- Cluster-wide rebalance budget limits concurrent moves (stored in
  config table)
- Critical moves (under-replicated from node failure) get elevated
  budget via multiplier
- Reads in-flight operation count via SQL engine before planning
  moves
## Configuration

Configuration is centralized in ConfigurationManager with sections:
- `node` - Node identity and addresses
- `raft` - Raft consensus parameters
- `messageGroup` - Message group settings
- `partition` - Partition management
- `logging` - Logging configuration
- `transport` - WebSocket transport settings
- `query` - Query execution settings
- `bootstrap` - Bootstrap process settings

Runtime dynamic configuration wiring is startup-owned and CDC-fed from the
`config` system table:
- `logging.persistMetricsLogs` applies immediately to `LoggingService`.
- `raft.heartbeatIntervalMs`, `raft.electionTimeoutMinMs`,
  `raft.electionTimeoutMaxMs` apply immediately to live `MessageGroupService`
  and `PartitionService` replicas through `applyRaftTimingConfig()`.
- The same raft timing values are written into `ConfigurationManager` so
  replicas created after a dynamic update use the latest timing values.
