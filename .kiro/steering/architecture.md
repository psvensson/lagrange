# Distributed Database System Architecture

This document describes the architecture of the distributed database system. It should be updated as features are added or changed.

## Overview

A scalable distributed database where:
- ALL persistent information is stored in tables
- ALL tables are implemented as partitions
- ALL partitions are Raft consensus groups with odd-numbered replicas (minimum 3)
- ALL partitions use SQLite for storage
- Replicated service groups host service runtimes selected by
  `service_definitions.runtime_kind` (WASM, native admin, PG wire)

## Core Principles

1. **Tables as the Universal Storage Model** - System metadata and user data are stored in tables
2. **Partitions as Raft Groups** - Each partition is a Raft consensus group using liferaft
3. **System Cache as Single Source of Truth** - In-memory cache of
   CDC-propagated system tables, updated by CDC events. Non-propagated
   tables remain queryable from their owning partition via SQL.
4. **Message Router for All Communication** - All messages (local and remote) route through WebSocket-based MessageRouter
5. **No Fallback Code Paths** - Single code path for any given logic; no legacy or alternative mechanisms
6. **System Cache Read Policy** - The system cache is strictly read-only from
   the consumer perspective (updated only by CDC events). Components may read
   directly from the cache for performance-critical paths. No component may
   write to the cache outside the CDC event path (plus bootstrap hydration).
7. **Single Owner per Concern** - Each concern (state tracking, failure detection, replica state, writes) has exactly one owning component

## Single-Path Contract

To prevent overlap and contradictory runtime behavior:

1. **SQL Execution:** `SqlCore` (SQLQueryEngine) is the single SQL planner and
   executor. All entrypoints (internal, external protocol, WASM DB.call)
   normalize into `SqlRequest` and delegate to SqlCore. No fallback engine.
2. **Placement Planning:** `MovePlanner` is the only planner implementation.  
   `UnifiedRebalancer` may orchestrate, but must not duplicate planning logic.
3. **Operation Lifecycle:** `RebalanceCoordinator` + `replica_operations` owns
   operation state. Workflow transitions must be monotonic and idempotent.
4. **Dispatch:** `ReplicaDispatchService` dispatches only after an atomic
   workflow-step claim (`PENDING -> SENDING`) to prevent duplicate dispatch.
5. **Leader Discovery for Writes:** write routing uses `services` metadata via
   system cache/SQL routing; alternate leader hints are non-authoritative.
6. **Readiness Gating:** dispatch and rebalancer use a shared readiness policy.
7. **Epoch Propagation:** `config.current_epoch` + CDC is the single epoch
   authority; no secondary epoch source.
8. **SQL Scaling:** SQL service replicas use the replicated service lifecycle
   (`service_profile = 'sql_engine'`, active `runtime_kind = native_js`
   via `SQL_ENGINE_RUNTIME_KIND`). No parallel SQL-specific scaling framework.
9. **WASM Entity Management:** External module/service administration flows
   through the default replicated meta service (`sys-wasm-meta`). Other APIs
   may expose adapters, but must delegate to the meta-service command path.
10. **Admin API Ownership:** Node-local admin APIs are compatibility adapters.
    Service-owned handlers (`sys-admin-meta` and `sys-wasm-meta`) are the
    mutation/control owners.
11. **Programmatic Runtime API Ownership:** `runtime.run` + `ctx.call` is the
    single user-facing execution surface for programmatic distributed SQL
    workflows. No parallel runtime API may bypass this path.
12. **Execution Mode Dispatch Ownership:** `SqlCore.executeRequest(SqlRequest)`
    is the owner for execution-mode dispatch (`sql_statement`,
    `partition_callback`, and plan-object execution). Each mode has a dedicated
    dispatch branch; `partition_callback` is not aliased to statement execution.
    Adapters may normalize requests but must not own runtime dispatch logic.
13. **Runtime Selection Ownership:** `Runtime_Driver_Registry` is the single
    selector from `runtime_kind` to runtime driver. No fallback driver
    selection is allowed.
14. **Runtime Lifecycle Ownership:** `Service_Runtime_Lifecycle` is the single
    owner for runtime prepare/start/stop/health orchestration across all
    runtime kinds.
15. **Adapter Boundary Ownership:** Node-local admin endpoints are ingress
    adapters only (fixed port `8081`), not mutation owners.
16. **Runtime Mutation Ownership:** Runtime drivers must not write system
   metadata directly; service and operation mutations flow through SQL/CDC.
17. **Live Query Runtime Ownership:** `createLiveQueryStartupWiring` is the
    single startup-owned path that creates one `LiveQueryManager` per node,
    wires it into `AdminWebSocketAPI`, and bridges `SystemTableCache` CDC
    notifications to active live subscriptions.

### Distributed SQL Canonical Ownership (Hard Cutover)

The distributed SQL layer is now single-path and owner-specific:

1. `DistributedQueryPlanner` is the only owner of multi-table partition
   planning, predicate-shape diagnostics, join strategy selection, and
   pushdown planning.
2. `ParallelQueryCoordinator` is the only owner of fanout scheduling and
   per-partition execution outcomes. Partition limits are enforced through
   deterministic chunking; no partition truncation is allowed.
3. `DistributedMergeEngine` (over `StreamingAggregator`) is the only owner of
   global merge semantics (`DISTINCT`, `GROUP/HAVING`, `ORDER`, `LIMIT`,
   set-operation merge behavior).
4. `DistributedWriteCoordinator` is the only owner for distributed
   INSERT/UPDATE/DELETE routing, participant result aggregation, and
   idempotency envelope metadata.
5. `DistributedTransactionCoordinator` is the only owner for distributed
   transaction participant enlistment, prepare/commit/rollback state machine,
   and recovery from `sql_transactions`, `sql_transaction_participants`,
   and `sql_write_operations`.
6. `SQLQueryEngine` remains the orchestration entrypoint and delegates to the
   owners above. It does not keep alternate distributed execution branches.

Forbidden patterns for distributed SQL:

1. `failOpen` read/write behavior toggles.
2. External ad-hoc join-partition injection (`options.joinPartitions`) in
   execution entrypoints.
3. Legacy distributed planning/execution fallback branches in
   `SQLQueryEngine` or `QueryExecutor`.

## Unified Service Lifecycle Owners (Hard Cutover)

Final owner map for service lifecycle cutover:

1. `ServiceLifecycleManager` is the only owner of create/start/stop/restart
   for all service kinds (`partition`, `message_group`, `runtime_service`).
2. `ServiceReconciler` is the only owner of desired-vs-actual convergence and
   emits lifecycle actions only through `ServiceLifecycleManager`.
3. `ServiceDispatcher` is the only canonical dispatch path for
   `Service_Message` envelopes after ingress adapter translation.
4. `AdminWebSocketAPI` remains an ingress adapter and first translates
   dispatchable messages into canonical `Service_Message` envelopes.
5. `ServiceTypeAdapter` implementations are execution adapters only and do not
   own metadata writes.

Required observability dimensions across lifecycle, reconciliation, and
dispatch logs:

1. `serviceId`
2. `serviceType`
3. `runtimeKind`
4. `operationId`
5. `nodeId`

Unified diagnostics surface:

1. `GET /api/admin/diagnostics/services` exposes reconciler decision history
   and lifecycle adapter selection/metrics snapshots.

Unified lifecycle anti-patterns (forbidden):

1. Direct startup of partition/message-group replicas from bootstrap/join phase
   entrypoints (`phaseMessageGroups`, `phasePartitions`,
   `phaseCreateSelfHostedMessageGroup`, `phaseJoinExistingMessageGroup`).
2. Branching admin ingress behavior on "dispatcher path vs local path" before
   canonical envelope translation.
3. Parallel reconciliation loops outside `ServiceReconciler`.
4. Feature flags or fallback branches that preserve pre-cutover lifecycle
   ownership paths.

## Ownership Consolidation (Architecture Traceability)

This section is the canonical owner map for consolidation work tracked in:

1. `.kiro/specs/architecture-ownership-consolidation/requirements.md`
2. `.kiro/specs/architecture-ownership-consolidation/design.md`
3. `.kiro/specs/architecture-ownership-consolidation/tasks.md`
4. `.kiro/specs/architecture-ownership-consolidation/owner-map.md`

| Concern | Owner | Runtime boundary |
| --- | --- | --- |
| Message router setup | `MessageRouterSetup` | `BootstrapService`, `NodeJoiningService` |
| CDC setup + upgrade | `CDCIntegrationSetup` | `BootstrapService`, `NodeJoiningService` |
| Replica handler setup | `ReplicaHandlerSetup` | `BootstrapService`, `NodeJoiningService` |
| Control-plane setup | `ControlPlaneSetup` | `BootstrapService`, `NodeJoiningService` |
| Node storage budget registration | `NodeStorageBudgetService` | `BootstrapService`, `NodeJoiningService` |
| Message-group CDC apply path | `CDCHandler` | `MessageGroupService` |
| System cache key mapping | `SYSTEM_CACHE_KEY_DESCRIPTOR` | `SystemTableCache`, `SQLiteSystemCache` |
| Runtime startup wiring | `createRuntimeStartupWiring` | Startup constructors only |
| Dynamic config hot-reload wiring | `createDynamicConfigStartupWiring` | Entrypoint startup only |
| Partition callback runtime ownership | `RuntimeDriverRegistry` injection | `SQLQueryEngine`, `CallbackRuntimeDriverRegistry` |

No-dual-path policy for these concerns is mandatory:

1. No fallback owner creation is allowed at call sites.
2. No parallel key maps are allowed outside the canonical descriptor.
3. No direct runtime setup constructor duplication is allowed outside setup owners.
4. Ownership violations fail fast and must not silently continue.

## Latency Topology Ownership

Latency-aware topology follows the same single-owner contract as core bootstrap
and control-plane workflows.

| Concern | Owner | Runtime boundary |
| --- | --- | --- |
| RTT sampling and inter-group latency writes | `LatencyMeasurementService` | `LatencyTopologySetup` |
| Group assignment and reassignment lifecycle | `LatencyGroupManager` | `LatencyTopologySetup` |
| Representative/coordinator deterministic selection | `GroupSelectionService` | `LatencyTopologySetup` |
| In-memory latency graph/tree derivation | `LatencyTreeService` | `LatencyTopologySetup` |
| Grouped CDC fanout orchestration | `CDCGroupPropagationService` | `LatencyTopologySetup` |
| Final cache-apply CDC owner path | `CDCHandler` via `MessageGroupService.applyCDCEvent` | Message-group runtime |

### Latency Topology Data Flow

1. Authoritative topology metadata lives in system tables only:
   `nodes.latency_group_id`, `latency_groups`, `inter_group_latencies`.
2. `LatencyMeasurementService` and `LatencyGroupManager` persist updates via the
   SQL/CDC ownership path; no direct side caches are introduced.
3. `LatencyTreeService` derives an in-memory routing view from
   `SystemTableCache` and recomputes on topology-table cache changes.
4. `CDCGroupPropagationService` chooses grouped fanout targets from the tree and
   delegates final apply to `MessageGroupService.applyCDCEvent`.
5. Bootstrap and joining flows instantiate/start/stop topology owners through
   `LatencyTopologySetup`; they do not construct topology owners directly.

## Unified Service Runtime

State labels in this section are explicit and mandatory.

### Active

1. `sys-admin-meta`, `sys-wasm-meta`, and `sys-postgres-wire` are
   replicated control-plane / ingress services.
2. Node-local admin ingress remains fixed on port `8081` as a
   compatibility adapter.
3. Runtime lifecycle operations are owned by
   `Service_Runtime_Lifecycle` with runtime selection through
   `Runtime_Driver_Registry`.
4. SQL profile services map to `runtime_kind = native_js` through
   `SQL_ENGINE_RUNTIME_KIND`.
5. Callback invocation is owned by `CallbackExecutionHost`; callback
   runtime selection is through `CallbackRuntimeDriverRegistry` as a
   strict adapter over the unified runtime registry.
6. `sys-postgres-wire` is a built-in replicated runtime service
   providing PostgreSQL wire protocol ingress. Lifecycle, placement,
   and endpoint ownership follow the unified runtime model. No
   standalone listener path exists (hard cutover).

### Target

1. Runtime descriptor use stays explicit in `service_definitions`
   (`runtime_kind`, `runtime_ref`, `runtime_config`) for all runtime-aware
   services.
2. Adapter ingress remains fixed, and mutation ownership remains serviceized
   via replicated meta services.
3. Documentation, tests, and status claims stay closure-gated by
   `.kiro/specs/runtime-ownership-closure/closure-matrix.md`.

### Planned

1. `oci_container` runtime moves from gated runway to fully enabled only after
   policy, rollout, and operations gates are met.

### Runtime Kinds

| Runtime Kind | Purpose | Status |
|-------------|---------|--------|
| `native_js` | Run existing in-process handlers as replicated service workloads (admin first) | Active |
| `wasm_component` | Run WASI/WASM component workloads with manifest/capability/dependency enforcement | Active |
| `oci_container` | Run digest-pinned OCI container workloads under policy gate | Planned, feature-gated |

### Runtime Descriptor Model (`service_definitions`)

Runtime-aware service rows use:
1. `runtime_kind` - execution type selector
2. `runtime_ref` - artifact identity (module/handler id or image digest ref)
3. `runtime_config` - runtime-specific JSON configuration

Legacy WASM-centric fields remain readable during migration but runtime
selection and lifecycle ownership follow the unified runtime model above.

### Runtime Control Flow

```
Client/Admin CLI
      │
      ▼
Node Admin Adapter (fixed :8081, compatibility only)
      │
      ▼
Meta Service Router
      │
      ▼
Replicated Meta Service Handler (sys-admin-meta / sys-wasm-meta)
      │
      ▼
Service_Runtime_Lifecycle
      │
      ▼
Runtime_Driver_Registry -> {Native_JS_Driver | Wasm_Component_Driver | OCI_Container_Driver}
      │
      ▼
SQL/CDC mutation path + operation journal updates
```

### Runtime Anti-Patterns (Forbidden)

1. Parallel lifecycle systems by runtime kind.
2. Runtime fallback driver selection.
3. Node-local adapter mutation ownership.
4. Driver direct writes to system metadata bypassing SQL/CDC.
5. Parallel callback runtime engine outside
   `CallbackRuntimeDriverRegistry`.
6. Schema/model command drift for `service_definitions`.
7. Unlabeled active-vs-target documentation claims.
8. Marking closure tasks complete without production-path evidence.
9. Standalone PG wire TCP listener outside the replicated service
   path (`sys-postgres-wire` is the only PG wire listener owner).

### Migration Posture

The unified runtime model rolls out in two enforcement phases:

1. **Observe mode** — Node-local admin adapter bypass paths emit
   deprecation warnings via `AdminDeprecation` but continue to
   function. CLI/API compatibility envelopes (`AdminCliCompat`,
   `AdminApiAdapter`) preserve existing caller behavior unchanged.
2. **Enforce mode** — `AdminMutationGuard` rejects direct
   node-local mutation ownership paths. All mutations must flow
   through replicated service handlers (`sys-admin-meta`,
   `sys-wasm-meta`) and the SQL/CDC write path.

Rollback: revert enforcement mode to observe mode via the
`AdminMutationGuard` configuration. No schema changes are required
between phases; the runtime descriptor model is additive.

### Related Runtime Closure Docs

1. `docs/admin-migration-guide.md`
2. `docs/wasm-services-user-guide.md`
3. `.kiro/specs/runtime-ownership-closure/closure-matrix.md`
4. `.kiro/specs/runtime-ownership-closure/completion-gates.md`

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
| `debug_breakpoints` | Debug breakpoint state | `breakpoint_id` | Transient |
| `debug_snapshots` | Debug snapshot state | `snapshot_id` | Transient |

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

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Node                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │   Admin API     │  │  Bootstrap API  │  │      SQL Query Engine       │  │
│  │  (WebSocket)    │  │    (HTTP)       │  │                             │  │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘  │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        System Table Cache                             │   │
│  │              (In-memory, updated by CDC events only)                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Message Router                                │   │
│  │           (WebSocket-based, handles local and remote)                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           │                    │                          │                  │
│           ▼                    ▼                          ▼                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │ Message Group   │  │ Message Group   │  │    Partition Services       │  │
│  │ Replica 1       │  │ Replica 2       │  │    (SQLite + Raft)          │  │
│  │ (Raft)          │  │ (Raft)          │  │                             │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
│                                            ┌─────────────────────────────┐  │
│                                            │ Replicated Service Groups   │  │
│                                            │(SQLite + Raft + Runtime)    │  │
│                                            └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

Versioned management APIs are serviceized. Node-local admin and WASM API
routes are compatibility adapters forwarding to:
- `sys-wasm-meta` (WASM module/service ownership)
- `sys-admin-meta` (broader admin surfaces, delegates WASM ownership)
- `sys-postgres-wire` (PostgreSQL wire protocol ingress)
All three services are provisioned during seed bootstrap.
Under the unified runtime target, these services are runtime-selected via
`service_definitions.runtime_kind` and orchestrated through one lifecycle
owner.

## Key Components

### AdminWebSocketAPI
- Node-local compatibility adapter for administrative SQL/cache operations
- WebSocket endpoint: `/api/admin/stream`
- HTTP landing and test admin endpoints:
  - `/` and `/ui/tests` for operator dashboard
  - `/api/admin/tests` and `/api/admin/test-runs*` for test administration
  - `/ui/playback-viewer` and `/ui/test-output/*` for run artifact access
- Fixed listening port: `8081` on every node
- Port is intentionally fixed for operator predictability and is not
  configuration-driven in node startup
- Live run output stream uses SSE endpoint:
  `/api/admin/test-runs/:runId/stream`
- Test-run process orchestration and saved-run indexing is owned by
  `AdminTestRunService` (`src/admin/admin-test-run-service.js`)
- Standalone userland launcher (`scripts/start-test-run-dashboard.js`) starts
  the same HTTP test admin surface without bootstrap/node lifecycle coupling

### Debug Runtime Foundation Ownership
- Debug ingress is exposed on existing admin adapter routes:
  - `/api/admin/debug/sessions*`
  - `/api/admin/debug/snapshots/:snapshotId`
  - `/api/admin/debug/dap/request`
- Required debug ingress headers are:
  - `x-tenant-id`
  - `x-principal`
  - `x-roles`
- `DebugMetadataStore` is the single owner for debug metadata operations:
  - `debug_sessions`
  - `debug_breakpoints`
  - `debug_snapshots`
- Metadata persistence/reads are SQL/CDC-only through
  `SqlCore.executeRequest(SqlRequest)`; direct cache mutation is forbidden.
- `AdminWebSocketAPI` may route DAP envelopes, but DAP request handling is owned
  by the injected debug DAP router backend.
- Distributed stage handoff ownership is handled by `DebugCoordinator` using
  metadata + CDC updates for endpoint transitions.

Debug ownership flow:

```
Client (debug headers)
      │
      ▼
AdminWebSocketAPI debug route adapter
      │
      ├── metadata ops ─► DebugMetadataStore
      │                    │
      │                    ▼
      │              SqlCore.executeRequest(SqlRequest)
      │                    │
      │                    ▼
      │                SQL write/read + CDC propagation
      │
      └── DAP request ─► Debug DAP Router (backend owner)
```

### NodeService (Singleton)
- Administrative component present on every node
- Manages service lifecycle and health monitoring
- Owns the system table cache (singleton per node)

### NodeLifecycleStateMachine
- Unified state machine for all node lifecycle states using NODE_STATE enum
- Supports sub-phases within STARTING (bootstrap) and JOINING states
- Bootstrap sub-phases: INFRASTRUCTURE → MESSAGE_GROUPS → PARTITIONS → REGISTRATION → CACHE_HYDRATION
- Joining sub-phases: CONTACTING_SEED → CONNECTING_WEBSOCKET → CREATING/JOINING_MG → WAITING_LEADERSHIP → QUERYING_STATE
- Phase gates can be registered per sub-phase for validation
- Terminal sub-phases auto-advance the parent state
- Replaces the former independent BootstrapPhaseStateMachine, JoiningPhaseStateMachine, and EnhancedBootstrapStateMachine

### FailureDetector (Single Instance)
- Single failure detection component (no duplicate detection in NodeLifecycleService)
- Reads node state via SQL engine (not direct cache access)
- Writes status changes via CDC (single write per status change)
- Supports adaptive thresholds for flapping nodes
- Detects recovery when failed nodes resume heartbeating

### MessageRouter
- Unified message routing for local and remote communication
- WebSocket-based transport (mandatory)
- Self-connection for uniform routing (all messages go through WebSocket)
- Address format: `{nodeId}/{entityType}/{entityId}`

### SystemTableCache
- In-memory cache of all system tables
- Updated ONLY by CDC events (single source of truth)
- Provides read-only wrapper for safe access
- Supports cache change listeners for reactive updates

#### Sanctioned direct applySystemTableChange call sites

Direct `applySystemTableChange` usage is constrained to the following paths:

1. `src/message-group/cdc-handler.js` (`CDCHandler.applyEvent`) -
   canonical CDC cache-apply owner path.
2. `src/cache/cache-hydration-service.js`
   (`CacheHydrationService` default `cdcEventApplier`) -
   bootstrap hydration exception while seeding cache state.
3. `src/bootstrap/node-joining-service.js`
   (`NodeJoiningService.hydrateSystemCacheFromSnapshots`) -
   join-time bootstrap hydration exception before CDC subscriptions activate.
4. `src/bootstrap/node-joining-service.js`
   (`NodeJoiningService.registerMessageGroupService`) -
   bootstrap timing exception: eagerly seed local services cache after seed
   registration to avoid join-time cache races before CDC fanout arrives.

No other source file may call `applySystemTableChange` directly.

### CDCIntegrationService
- Routes all system table writes through SQL
- Bootstrap mode for seed node direct writes (temporary, cleared after registration)
- Normal mode routes through SQL engine to partition leaders
- Generates CDC events that update all node caches
- Single bootstrap writer: replaces the former BootstrapPartitionWriter and BootstrapSystemTableWriter
- Runtime CDC event processing is instantiated once via `CDCEventHandler`
- `handleEpochChangeCDC` and `handleNodeStateCDC` delegate to that single runtime handler path
- Epoch propagation is cluster-scoped via `config.current_epoch` and `setEpochManager(...)`

### PartitionService
- SQLite-backed Raft group for data storage
- Uses liferaft library for Raft consensus
- Generates CDC events on writes
- Supports transactions (single-partition only)

### MessageGroupService
- Reliable inter-service communication
- 3-replica Raft groups using liferaft
- Ensures message delivery with retry logic
- Every node has at least one message group replica

### Runtime_Driver_Registry (Target Owner)
- Single owner mapping `runtime_kind` to runtime driver implementation
- Deterministic lookup; unknown kinds fail closed with typed errors
- No fallback to alternate runtime drivers

### Service_Runtime_Lifecycle (Target Owner)
- Single owner for runtime `prepare/start/stop/health` orchestration
- Coordinates endpoint intent registration through one write path
- Coordinates operation lifecycle transitions through SQL/CDC-owned records
- Shared owner across `native_js`, `wasm_component`, and `oci_container`

### Runtime Drivers (Target Model)
- `Native_JS_Driver`:
  runs existing admin/service handlers in replicated runtime execution
- `Wasm_Component_Driver`:
  runs WASM component/module workloads with existing policy checks
- `OCI_Container_Driver`:
  runs digest-pinned OCI workloads under feature gate and policy controls

### WasmServiceReplica
- Third Raft group type alongside partitions and message groups
- Extends `RaftReplicaBase` with `entityType` set to `WASM_SERVICE`
- Integrates SessionKVStore (replicated KV), SafetyInterval (read consistency), TimerManager (persistent timers), and WasmExecutor (WASM function execution)
- Registers in `services` table with `service_type` set to `wasm_service`
- Managed by `UnifiedRebalancer` for replica placement using the same policy-based approach as other entity types

### WasmMetaService (`sys-wasm-meta`)
- Built-in replicated WASM service for external WASM entity management
- Provisioned during seed bootstrap via `MetaServiceFactory`
  (`src/wasm-service/meta-service-factory.js`)
- Lifecycle integration via `MetaServiceLifecycle`
  (`src/wasm-service/meta-service-lifecycle.js`)
- Routing and availability via `MetaServiceRouter`
  (`src/wasm-service/meta-service-router.js`)
- Command handlers (`src/wasm-service/meta-command-handlers.js`):
  `publishModule`, `getModule`, `listModules`, `createService`,
  `updateService`, `scaleService`, `rolloutService`, `deleteService`,
  `getOperation`, `listOperations`
- Validation pipeline (`src/wasm-service/meta-validation-pipeline.js`)
  reuses existing validators without duplication
- Write executor (`src/wasm-service/meta-write-executor.js`) routes all
  mutations through SQL/CDC ownership paths
- Operation lifecycle (`src/wasm-service/operation-lifecycle.js`) persists
  async workflow state in `wasm_operations` table
- Operation stream (`src/wasm-service/operation-stream.js`) publishes
  status updates for async command tracking
- Returns operation IDs for async workflows; no direct partition mutation
  path outside bootstrap exception rules

### AdminMetaService (`sys-admin-meta`)
- Built-in replicated service for generalized admin control surfaces
- Provisioned during seed bootstrap alongside `sys-wasm-meta`
- Command handlers (`src/admin/admin-meta-command-handlers.js`):
  `getCacheState`, `getClusterState`, `getNodeState`,
  `getReplicaOperations`, `getSystemLogs`, `getConfig`,
  `publishModule`, `createService`, `updateService`,
  `scaleService`, `rolloutService`, `deleteService`
- WASM-owned commands delegate to `sys-wasm-meta` via
  `AdminMetaDelegator` (`src/admin/admin-meta-delegator.js`)
- Endpoint records built by `AdminMetaEndpointBuilder`
  (`src/admin/admin-meta-endpoint-builder.js`)
- Existing admin CLI/API entrypoints are thin adapters via
  `AdminApiAdapter` (`src/admin/admin-api-adapter.js`)
- CLI compatibility preserved via `AdminCliCompat`
  (`src/admin/admin-cli-compat.js`)
- Deprecation warnings for direct node-local mutation paths via
  `AdminDeprecation` (`src/admin/admin-deprecation.js`)
- Mutation guard (`src/admin/admin-mutation-guard.js`) rejects
  bypass attempts in `reject` mode
- Preserves single-path mutation ownership in service handlers

### PostgresWireService (`sys-postgres-wire`)
- Built-in replicated runtime service for PostgreSQL wire protocol
  ingress (`META_SERVICE_ID.POSTGRES_WIRE = 'sys-postgres-wire'`)
- Provisioned during seed bootstrap alongside `sys-admin-meta` and
  `sys-wasm-meta` via `MetaServiceFactory`
- `service_type = runtime_service`, `runtime_kind = native_js`,
  `runtime_ref = postgres-wire-runtime`
  (`META_SERVICE_RUNTIME_REF.POSTGRES_WIRE`)
- Cluster-global `replica_count` semantics: the rebalancer treats
  the service as a single entity with a target replica count spread
  across nodes (not per-node)
- Placement managed by `UnifiedRebalancer` with entity type
  `REBALANCER_ENTITY_TYPE.RUNTIME_SERVICE`
- Replica operations (`ADD/REMOVE/REPLACE`) execute through
  `RuntimeServiceHandler` via `ServiceLifecycleManager`
- Endpoint publication: each replica writes a `service_endpoints`
  row with `protocol = postgresql`
  (`WASM_SERVICE_PROTOCOL.POSTGRESQL`) for client discovery

Key components:
- `PostgresWireRuntimeModule` — native runtime module implementing
  `prepare/start/stop/health`; `start()` binds TCP listener and
  returns endpoint intent
- `PgWireProtocolHandler` — wire protocol message handling
  (startup, auth handshake, simple/extended query protocol)
- `PgWireSession` — per-connection session state and lifecycle
- `PgWireAuthHandler` — authentication and tenant/principal context
  mapping for authorization before query execution
- `PgwirePortAllocator` — port allocation with fixed-port and
  dynamic-range modes; bind conflicts produce typed errors
- `PgWireStartupSafetyGate` — ensures control-plane readiness
  before PG wire startup; prevents bootstrap/join deadlocks on
  PG wire failure
- `PgWireCutoverGuard` — hard cutover verification; rejects any
  standalone listener startup path outside the replicated service

Ownership rules:
- No standalone PG wire TCP listener path exists. The replicated
  service path is the only listener owner (hard cutover).
- Session state is replica-local by design. Horizontal scaling
  works through endpoint discovery and client reconnect.
- All metadata writes flow through SQL/CDC; the runtime module
  does not write system tables directly.

### PostgreSQL Wire Data Flow

```
PG Client (psql, pg driver, ORM)
      │
      ▼ TCP connect (port from service_endpoints)
┌─────────────────────────────────────────────┐
│ PgWireStartupSafetyGate                     │
│ (control-plane readiness check)             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ PostgresWireRuntimeModule (TCP listener)    │
│ (sys-postgres-wire replica on this node)    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ PgWireProtocolHandler                       │
│ (startup/auth handshake, query dispatch)    │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ PgWireAuthHandler                           │
│ (authn → tenant/principal context)          │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ PostgresWireAdapter                         │
│ (normalize to SqlRequest, dialect=pg)       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ SqlCore (SQLQueryEngine)                    │
│ (parse, plan, route, execute)               │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
             Return Results
        (PG wire result encoding)
```

### PostgreSQL Wire Scale Operations

Scaling `sys-postgres-wire` follows the unified rebalancer model:

1. `replica_count` in `service_definitions` is cluster-global.
   The rebalancer spreads replicas across available nodes.
2. Scale-up: increase `replica_count` → rebalancer plans `ADD`
   operations → `RuntimeServiceHandler` materializes new replicas
   via `ServiceLifecycleManager` → each replica binds a TCP
   listener and publishes a `service_endpoints` row.
3. Scale-down: decrease `replica_count` → rebalancer plans `REMOVE`
   operations → replica stops listener, cleans up endpoint row.
4. Node failure: rebalancer detects under-replication → plans
   `REPLACE` operations on healthy nodes with elevated budget.
5. Convergence: rebalancer stabilization period prevents thrashing;
   budget coordination limits concurrent operations.

### PostgreSQL Wire Endpoint Discovery

Clients discover PG wire endpoints through `service_endpoints`:

- Rows with `protocol = 'postgresql'` identify PG wire replicas
- Each row includes `node_id`, `host`, `port` for connection
- Admin diagnostic views group endpoints by logical service
  (`sys-postgres-wire`) and show per-replica state and health
- UI distinguishes logical services (e.g., `sys-postgres-wire`)
  from individual replica rows for clarity

### Admin Security and Observability
- Auth middleware (`src/admin/admin-auth-middleware.js`) enforces
  authn/authz at the service command layer
- Quota enforcer (`src/admin/admin-quota-enforcer.js`) limits module
  size, package count, and concurrent operations
- Audit context (`src/admin/admin-audit-context.js`) attaches tenant
  and principal context to audit records
- Command metrics (`src/admin/admin-command-metrics.js`) tracks
  command rate, latency, and error counts
- Trace context (`src/admin/admin-trace-context.js`) propagates
  correlation IDs across adapter → meta service → SQL → lifecycle
- Audit queries (`src/admin/admin-audit-queries.js`) for source
  mapping decisions and dependency lock inspection

### Component Distribution Control
WASM package/module distribution follows component-style practicalities:

- Canonical package identity: `namespace:name@version`
- Namespace registry mapping with per-package overrides
- OCI-compatible source references with digest pinning
- Persisted dependency locks for deterministic activation and rollouts

### WASM Module Manifest and Activation
Every deployable WASM module requires a manifest declaring:

- `module_id`, `version`, `digest` (sha256 immutable identity)
- `run_export` — the named export serving as the callable entry function
- `exports` — all declared module exports
- `dependencies` — pinned digest references to capability modules
- `capabilities` — declared capability requirements (e.g., `sql.read`, `kv.session`)

Activation checks (in order):
1. `run_export` exists in module and matches runtime signature (2-3 params)
2. Dependencies resolve by pinned digest from approved sources
3. Capabilities are allowed by tenant/service policy (`CapabilityPolicy`)
4. Undeclared imports or dependencies are rejected

All resolution decisions are audit-logged via `ModuleAuditLogger`.

### SQLQueryEngine (SqlCore)
- Single SQL planner and executor for all SQL workloads
- All entrypoints (internal API, external protocol, WASM DB.call) converge here
- Routes queries through system cache to find partition leaders
- Supports SELECT, INSERT, UPDATE, DELETE, CREATE TABLE
- Transaction support (BEGIN, COMMIT, ROLLBACK)
- All system reads (outside cache/query internals) must go through this engine
- No fallback or alternate SQL execution path exists

### SQL Adapter Layer
Three adapters normalize different entrypoints into canonical `SqlRequest`
objects consumed by SqlCore:

- **InternalSqlAdapter** (`src/query/internal-sql-adapter.js`) — in-process SQL
  calls from system components
- **PostgresWireAdapter** (`src/query/postgres-wire-adapter.js`) — external SQL
  protocol sessions with authentication and feature negotiation
- **WasmCallAdapter** (`src/query/wasm-call-adapter.js`) — `DB.call(select, fn)`
  programmatic distributed execution from WASM services

All adapters produce a frozen `SqlRequest` (defined in `src/query/sql-request.js`)
with fields: tenantId, sessionId, statement, parameters, executionMode, budgets,
hints, and optional callbackModuleRef/callbackExport for partition callbacks.
`SqlCore.executeRequest(SqlRequest)` is the owning dispatch entrypoint for
execution-mode behavior.

### SQL Service Profile on Replicated Services
SQL service instances are modeled as replicated service definitions with
`service_profile = 'sql_engine'` (active runtime: `native_js` via
`SQL_ENGINE_RUNTIME_KIND`). They share the same placement, rebalancing,
failover, endpoint registration, and runtime lifecycle ownership as other
replicated services. No parallel SQL-specific scaling framework exists.

### PostgreSQL SQL Compatibility Layer (Active)

The SQL parser (`SQLParser`) supports a dual-dialect mode: `sqlite` (default)
and `postgresql`. When dialect is `postgresql`, the parser uses
`node-sql-parser`'s PostgreSQL mode and applies AST translations to produce
SQLite-compatible Internal_AST nodes. The translation is a pure preprocessing
step within the parse phase — no new execution paths are created.

Active translations:
- Positional parameters (`$1`, `$2`) → SQLite `?` with param reordering
- Boolean literals (`TRUE`/`FALSE`) → integer `1`/`0`
- Type casts (`::type`, `CAST AS pg_type`) → `CAST AS sqlite_affinity`
- Function name mapping (PG → SQLite equivalents via extensible registry)
- Date/time functions (`NOW()`, `EXTRACT`, `DATE_TRUNC`) → `strftime()`
- `ILIKE` → `LOWER() LIKE LOWER()`
- `INSERT ON CONFLICT` → `INSERT OR REPLACE`/`INSERT OR IGNORE`
- `RETURNING` clause pass-through (SQLite 3.35+)
- Subqueries, CTEs, CASE WHEN, derived tables, set operations pass-through

Dialect flows through `SqlRequest.dialect` from `PostgresWireAdapter` to
`SqlCore` to `SQLParser`. Internal system queries omit dialect, defaulting
to SQLite mode. No component outside the parse phase is aware of dialect.

Spec: `.kiro/specs/pg-sql-compat-layer/`

### PostgreSQL Compatibility — Future Directions (Planned)

The following capabilities are required for full PostgreSQL client
compatibility but are not yet implemented. Each item describes the gap,
the architectural challenge, and a sketch of the intended approach.

#### Window Functions

**Gap**: `ROW_NUMBER()`, `RANK()`, `DENSE_RANK()`, `LAG()`, `LEAD()`,
`NTILE()`, `OVER(PARTITION BY ... ORDER BY ...)`.

**Challenge**: SQLite supports window functions natively, so single-partition
queries can pass through. Cross-partition queries require the in-memory
aggregator in `QueryExecutor` to evaluate window functions after merging
partition results, which changes the aggregation pipeline.

**Approach**: Detect window functions during AST conversion. For
single-partition queries, pass through to SQLite. For multi-partition
queries, fetch all rows first, then apply window function evaluation
in `QueryExecutor.aggregateSelectResults()` using a post-merge window
evaluator. The evaluator would partition rows by the `PARTITION BY`
clause, sort within each partition, and compute window values.

#### Multi-Partition Transactions

**Gap**: PostgreSQL clients expect multi-statement transactions that span
multiple tables (and therefore multiple partitions).

**Challenge**: The system currently limits transactions to a single
partition. True distributed transactions require two-phase commit (2PC)
or a similar coordination protocol across partition leaders.

**Approach**: Implement a lightweight 2PC coordinator in `SqlCore`:
1. `BEGIN` creates a transaction context tracking all touched partitions
2. Each write records the target partition in the transaction context
3. `COMMIT` sends prepare messages to all partition leaders via
   `MessageRouter`, waits for all acks, then sends commit messages
4. `ROLLBACK` sends abort to all prepared partitions
5. Timeout and failure recovery: if any partition fails to prepare,
   abort all; if coordinator crashes after prepare, recovery log
   (persisted in a dedicated partition) drives resolution
6. Read-your-writes within a transaction: buffer uncommitted writes
   at the coordinator and merge with partition reads

This is a significant architectural addition. A phased approach would
start with read-only multi-partition transactions (no 2PC needed),
then add write support.

#### EXPLAIN / EXPLAIN ANALYZE

**Gap**: PG clients and ORMs use `EXPLAIN` and `EXPLAIN ANALYZE` to
inspect query plans. The system has no plan output format.

**Challenge**: The system's query planning is implicit (partition
resolution + scatter-gather), not a traditional cost-based optimizer
with a plan tree.

**Approach**: Intercept `EXPLAIN` statements in `SqlCore.executeQuery()`:
1. Parse the inner statement normally
2. Run partition resolution to determine target partitions
3. Build a synthetic plan tree describing: partition count, join
   strategy (nested loop, hash), aggregation location (partition
   vs coordinator), estimated row counts from partition metadata
4. For `EXPLAIN ANALYZE`, execute the query and annotate the plan
   with actual row counts, timing, and partition-level metrics
5. Return the plan as a result set with columns matching PG's
   `EXPLAIN` output format (`QUERY PLAN` text column)

#### Schema Introspection (pg_catalog, information_schema)

**Gap**: Every PG client, ORM, and tool queries `pg_catalog.pg_class`,
`pg_catalog.pg_type`, `pg_catalog.pg_attribute`,
`information_schema.tables`, `information_schema.columns`, etc. on
connect. Without these, `psql`, pgAdmin, Prisma, SQLAlchemy, and
similar tools cannot function.

**Challenge**: This is the single largest compatibility hurdle. The
system stores table metadata in the `tables` system table with a
different schema than PG's catalog tables.

**Approach**: Implement virtual table shims as query interceptors:
1. Detect queries targeting `pg_catalog.*` or `information_schema.*`
   tables during parsing
2. Rewrite these queries against the system cache (`tables`,
   `partitions`, `indices` system tables) with column mapping
3. Synthesize PG-compatible result sets with expected column names
   and types (e.g., `pg_class.relname`, `pg_class.relkind`,
   `pg_type.typname`)
4. Start with the minimum set required by common clients:
   - `information_schema.tables` (table name, type)
   - `information_schema.columns` (column name, type, nullable)
   - `pg_catalog.pg_type` (type OIDs for wire protocol)
   - `pg_catalog.pg_class` (relation metadata)
5. Expand coverage incrementally based on client compatibility
   testing

This can be implemented as a query rewrite layer in `SqlCore` that
intercepts catalog queries before they reach partition resolution.

#### PG-Specific Types (JSONB, ARRAY, UUID, SERIAL)

**Gap**: PostgreSQL has rich type system features that SQLite's type
affinity model does not support natively.

**Challenge**: SQLite stores everything as TEXT, INTEGER, REAL, BLOB,
or NULL. PG types like `JSONB` (with operators `->`, `->>`, `@>`),
`ARRAY` (with `ANY`, `ALL`, array indexing), and `UUID` have no
direct SQLite equivalent.

**Approach**:
- **JSONB**: SQLite has `json_extract()`, `json_each()`, etc. since
  3.38. Map PG JSONB operators to SQLite JSON functions:
  `col->>'key'` → `json_extract(col, '$.key')`,
  `col @> '{"k":"v"}'` → `json_extract(col, '$.k') = 'v'`
- **ARRAY**: Store as JSON arrays in TEXT columns. Map PG array
  operators to JSON functions: `ANY(array_col)` → `json_each()` join
- **UUID**: Store as TEXT with CHECK constraint for format validation.
  Map `gen_random_uuid()` to a custom SQLite function
- **SERIAL/BIGSERIAL**: Map to `INTEGER PRIMARY KEY AUTOINCREMENT`
  during CREATE TABLE translation

#### Sequences

**Gap**: PG sequences (`CREATE SEQUENCE`, `nextval()`, `currval()`,
`setval()`) are independent objects with their own state.

**Challenge**: SQLite has no sequence concept. `AUTOINCREMENT` is
table-bound and has different semantics (never reuses rowids).

**Approach**: Implement sequences as rows in a dedicated `_sequences`
system table with columns `(name, current_value, increment, min, max,
cycle)`. Map `nextval('seq')` to an atomic increment query against
this table. This requires the sequence table to be a single-partition
table (or use distributed counters) to guarantee uniqueness.

#### NOTIFY / LISTEN

**Gap**: PG's pub/sub mechanism for real-time event notification.

**Challenge**: The system already has CDC event propagation which is
conceptually similar but uses a different protocol.

**Approach**: Map PG `NOTIFY channel, payload` to CDC event emission
on a virtual `_notifications` table partitioned by channel name.
Map `LISTEN channel` to a CDC subscription on that channel's
partition. The `PostgresWireAdapter` would maintain per-session
subscription state and push async notification messages through the
wire protocol when CDC events arrive for subscribed channels.

### Distributed Movement Primitives
Cross-partition data movement is restricted to three explicit primitives,
preventing accidental N+1 chatter:

- **ctx.lookup(table, keys[])** — batched, deduplicated key fetch limited to
  primary key, unique index, or bounded index access paths
- **ctx.emit(key, value)** — engine-managed shuffle/group with quota-aware
  buffering, backpressure, and spill-to-disk
- **ctx.broadcast(ref, dataset)** / **ctx.useBroadcast(ref)** — versioned
  small dataset replication with hard size cap
- **ctx.out(value)** — final output emission into result stream budgets

### Programmatic Runtime v0 (Active)
Programmatic distributed execution is implemented and active:

- `runtime.run(async (ctx) => { ... }, opts?)` — injects session, snapshot, and
  budget defaults (`src/query/runtime-runner.js`)
- `ctx.call(query, params?, handler?, opts?)` — unified iterator/stage/plan
  entrypoint dispatched by call mode:
  - Iterator_Mode (no handler): returns async iterator via `CallIterator`
  - Stage_Mode (with handler): batches rows and invokes handler via `CallStage`
  - Plan_Mode (plan object): dispatches `reduceByKey` / `useBroadcast`
- `ctx.out(value, meta?)` — final output emission into result stream with
  budget enforcement and telemetry
- Stage options include explicit exchange controls (`exchangeBy: 'local' | 'key'`)
- Plan objects include `reduceByKey` and `useBroadcast` in v0

Nested `ctx.call` inside stage handlers is classified as bounded vs unbounded
by `NestedCallClassifier` (`src/query/nested-call-classifier.js`).
Unbounded nested calls are rejected by default in v0 with a teachable error
directing users to `ctx.emit(...)` + `ctx.call({kind: 'reduceByKey', ...})`.
Classification decisions are recorded in `PlanDiagnostics` for observability.

### Execution-Mode Dispatch (Active)
`SqlCore.executeRequest(SqlRequest)` is the single owner for execution-mode
dispatch. All three adapters produce frozen `SqlRequest` objects and delegate:

- `InternalSqlAdapter` → `SqlRequest(executionMode: sql_statement)`
- `PostgresWireAdapter` → `SqlRequest(executionMode: sql_statement)`
- `WasmCallAdapter` → `SqlRequest(executionMode: partition_callback)`

No adapter owns dispatch logic. `executeRequest` switches on `executionMode`
with dedicated branches:

- `sql_statement` → `executeQuery` (standard SQL planning and execution)
- `partition_callback` → `PartitionCallbackDispatcher` → `CallbackExecutionHost`
  (partition resolution, batch construction, per-partition callback invocation)
- Plan-object modes → plan pipeline (`reduceByKey` / `useBroadcast`)

`partition_callback` is a first-class execution mode with its own dispatch
path. It is never aliased to or folded into `sql_statement` execution.

### Partition Callback Runtime Bridge (Active)
`partition_callback` execution follows a dedicated pipeline from SqlCore
through to callback invocation:

```
WasmCallAdapter (DB.call)
      │
      ▼
SqlRequest(executionMode: partition_callback)
      │
      ▼
SqlCore.executeRequest
      │
      ▼
PartitionCallbackDispatcher
├── Resolve target partitions from callback select query
├── Construct per-partition row batches
└── Delegate to CallbackExecutionHost
      │
      ▼
CallbackExecutionHost (single invocation surface)
├── Select runtime driver via CallbackRuntimeDriverRegistry
├── Invoke callback per partition batch
├── Enforce budget/cancellation before and after each batch
├── Attach lineage IDs and consult dedupe registry on retries
└── Return structured per-partition batch results
      │
      ▼
CallbackContext (bounded primitives)
├── lookup, emit, broadcast, out
├── Nested-call guardrails (same policy as stage runtime)
└── Budget/telemetry enforcement
```

Key ownership rules:
- `PartitionCallbackDispatcher` owns partition resolution and batch planning
  for callback requests
- `CallbackExecutionHost` is the single callback invocation surface; no
  parallel callback executor path exists
- `CallbackRuntimeDriverRegistry` maps `runtime_kind` to callback drivers
  (`native_js`, `wasm_component`, gated `oci_container`)
- Callback contexts expose the same bounded primitives and nested-call
  guardrails as stage runtime contexts
- Budget enforcement, cancellation propagation, lineage dedupe, and telemetry
  are uniform across `sql_statement`, `partition_callback`, and plan-object
  execution modes

#### Unified Runtime Cross-Reference

Callback runtime selection reuses the unified runtime ownership model defined
in this document:

- `CallbackRuntimeDriverRegistry` uses the same `RUNTIME_KIND` enum
  (`native_js`, `wasm_component`, `oci_container`) as `Runtime_Driver_Registry`
- `CALLBACK_RUNTIME_KIND` is an alias for `RUNTIME_KIND` (same object reference)
- No parallel lifecycle owner exists for callback execution —
  `CallbackExecutionHost` has only `execute()`, not prepare/start/stop/health
- Unknown callback runtime kinds fail closed with typed errors, matching the
  no-fallback contract of `Runtime_Driver_Registry`
- `oci_container` is excluded from `SUPPORTED_RUNTIME_KINDS` in the callback
  host until the feature gate is lifted

See "Runtime_Driver_Registry (Target Owner)" and
"Service_Runtime_Lifecycle (Target Owner)" sections above for the unified
runtime ownership model. See "Runtime Anti-Patterns (Forbidden)" for the
no-fallback and no-parallel-lifecycle invariants that apply equally to
callback execution.

### Exchange and ReduceByKey Semantics (Active)
- `exchangeBy: 'key'` routes same keys to the same destination partition
  via `ExchangeManager` (`src/query/exchange-manager.js`)
- Exchange delivery is at-least-once; duplicates are possible on retry
- Emit metadata supports `dedupeKey` for idempotency control
- No global ordering guarantee across exchanged records
- `reduceByKey` consumes grouped batches:
  `[{key, records, continuation?}, ...]`
- Groups exceeding `maxRecordsPerGroup` are split with continuation tokens

### Strategy Selector
Chooses movement strategy for joins and distributed work:

1. If side dataset <= broadcast threshold → broadcast
2. Else if inner side is pk/unique/bounded lookup → lookup
3. Else → emit/shuffle

User hints can override the default, validated against guardrails. Strategy
decisions are exposed in EXPLAIN and query telemetry.

### Callback Stage Executor
Runs WASM callbacks in batch/stage mode (not per-row RPC). Groups rows by
partition and invokes the callback once per partition batch. Supports:

- Lineage ID attachment for retry safety
- Dedupe on retry via lineage ID + stage ID
- Cooperative cancellation and timeout propagation via CancellationToken

For `partition_callback` execution mode, `CallbackExecutionHost` replaces
ad-hoc callback wiring with a single invocation contract that reuses
runtime-driver ownership for callback dispatch.

### Resource Guardrails
Per-query and per-stage budgets enforced by `BudgetEnforcer`:

- CPU time, memory, wall time limits
- Lookup max keys and max bytes
- Emit max intermediate bytes
- Broadcast max payload bytes

Budget violations terminate the operation with a descriptive `BudgetLimitError`.

### ReplicaStateMachine (Single Replica State Owner)
- Single authority for all replica state tracking
- ReplicaLifecycleManager and ReplicaHandler delegate to it (no independent state maps)
- All replica state changes produce exactly one CDC write to the services table
- Replaces the former triple-tracking in ReplicaStateMachine, ReplicaLifecycleManager, and ReplicaHandler

### Control Plane Services (Decomposed)
The former monolithic ControlPlaneService is decomposed into four focused services, each with a CREATED → INITIALIZED → RUNNING → STOPPED lifecycle:

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

## Bootstrap Process

### Seed Node Bootstrap

```
Phase 1: Infrastructure
├── Initialize ConfigurationManager
├── Initialize NodeService (creates SystemTableCache)
├── Create MessageRouter with WebSocket server
└── Establish self-connection for uniform routing

Phase 2: Message Groups
├── Create 3 message group replicas (deferred election)
├── Register handlers with MessageRouter
└── Elections deferred until Phase 3 complete

Phase 3: Partitions
├── Create partition services for all system tables
├── Each partition is a 3-replica Raft group
├── Start elections for message groups and partitions
└── Wait for leadership establishment

Phase 4: Registration (Bootstrap Mode)
├── Enable bootstrap mode (direct writes)
├── Write initial system table data directly to partitions
├── Seed `config.current_epoch` when absent
├── Register nodes, services, partitions, tables
├── Register built-in runtime service definitions
│   (sys-admin-meta, sys-wasm-meta, sys-postgres-wire)
├── Resolve and persist node storage budget via NodeStorageBudgetService
└── Disable bootstrap mode

Phase 5: Cache Hydration
├── Read default cache-sync table data from local partitions (`logs` excluded)
├── Populate system cache with complete cluster state
├── Strict hydration verification fails hard on missing/incomplete required tables
├── Strict leader-readiness gate blocks on missing leader metadata (including addresses)
└── Only then swap to routed SQL writer/cdc mode for all subsequent writes
```

### Joining Node Bootstrap

```
1. HTTP Bootstrap Request → Contact seed node via /bootstrap endpoint
2. Receive Complete Snapshots → Bootstrap response includes default cache-sync
   tables (`logs` excluded)
3. Cache Hydration → Populate local system cache from snapshots
4. Leader Readiness Gate → Block until leader metadata is complete (including addresses)
5. CDC Subscription → Subscribe to CDC events for default cache-sync tables
6. Node Registration → Register self in nodes table (routes through SQL)
7. Storage Budget → Resolve and persist node storage budget via NodeStorageBudgetService
8. Ready → Node is ready to serve queries
```

## Data Flow

### Query Routing Flow

```
Client SQL Query (any entrypoint)
       │
       ├── Internal API ──► InternalSqlAdapter
       ├── PG Wire ────────► PostgresWireAdapter
       └── DB.call ────────► WasmCallAdapter
                                    │
                              ┌─────┴─────┐
                              │ SqlRequest │
                              └─────┬─────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │ SqlCore (Engine)  │
                           │   (Parse SQL)     │
                           └────────┬──────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │  System Cache     │
                           │ (Find partitions) │
                           └────────┬──────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │Partition Resolver │
                           │(Determine target) │
                           └────────┬──────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │  System Cache     │
                           │(Find leader addr) │
                           └────────┬──────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │ Message Router    │
                           │(Deliver to leader)│
                           └────────┬──────────┘
                                    │
                                    ▼
                           ┌──────────────────┐
                           │Partition Service  │
                           │ (Execute query)   │
                           └────────┬──────────┘
                                    │
                                    ▼
                              Return Results
```

### CDC Event Flow

```
Write Operation (INSERT/UPDATE/DELETE)
              │
              ▼
┌─────────────────────────┐
│   Partition Leader      │
│   (Write to SQLite)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   CDC Event Generated   │
│   (table, op, data)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Message Group         │
│   (Broadcast to nodes)  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   All Nodes             │
│   (Update local cache)  │
└─────────────────────────┘
```

### Meta Service Management Flow (Unified Runtime Target)

```
External Client (CI/SDK)
          │
          ▼
┌─────────────────────────┐
│  AdminApiAdapter        │
│ (compatibility layer)   │
└───────────┬─────────────┘
            │
            ├──► sys-admin-meta (AdminMetaCommandHandlers)
            │         │
            │         ├──► Own commands (cache/cluster/node state)
            │         └──► Delegates WASM commands ──┐
            │                                        │
            └──► sys-wasm-meta (MetaCommandHandlers) ◄┘
                        │
                        ├──► MetaValidationPipeline
                        │    (manifest/dependency/capability validators)
                        │
                        ├──► MetaWriteExecutor
                        │    (SqlCore + CDC writes)
                        │
                        ├──► Service_Runtime_Lifecycle
                        │    (prepare/start/health/stop ownership)
                        │
                        ├──► Runtime_Driver_Registry
                        │    (runtime_kind -> runtime driver)
                        │
                        ├──► OperationLifecycle
                        │    (wasm_operations/service operations state machine)
                        │
                        └──► OperationStream
                             (async status publishing)
```

## Address Format

All services use a unified address format:
```
{nodeId}/{entityType}/{entityId}
```

Examples:
- `node-1/partition/partition-nodes-p1-r1`
- `node-2/message-group/mg-1-r2`
- `node-3/wasm-service/my-service-r1`
- `seed-node/lifecycle`

Entity types:
- `partition` - Partition service replicas
- `message-group` - Message group replicas
- `wasm-service` - WASM service group replicas
- `runtime-service` - Runtime service replicas (e.g., PG wire)
- `lifecycle` - Node lifecycle handler

## Raft Consensus

### Configuration
- Heartbeat interval: 150ms (configurable)
- Election timeout: 1000-3000ms (configurable)
- Replica-index-based jitter (2500ms per index) prevents election storms
- Jitter >= election range width guarantees lower-indexed replicas always win first

### Leadership
- Single-replica groups become leader immediately
- Multi-replica groups use standard Raft election
- Deferred election start during bootstrap prevents storms
- Learner phase for new replicas joining existing groups

### Log Storage
- Message groups: In-memory log adapter
- Partitions: SQLite log adapter (persistent)
- Replicated service groups (`wasm_service`, `runtime_service`):
  SQLite log adapter (persistent)

## Rebalancing

### UnifiedRebalancer

The `UnifiedRebalancer` is the single rebalancer implementation for
partitions, message groups, and replicated service groups (entity types:
`wasm_service`, `runtime_service`). Each partition/message group/service
leader runs its own rebalancer instance, making independent decisions
that converge to optimal state.

Key characteristics:
- **Per-entity rebalancer**: Each partition/message group/service has its own
  rebalancer instance
- **Leader-driven**: Only the Raft leader runs the rebalancer for that entity
- **Event-driven**: Emits `nodeStateChange` and `rebalanceNeeded` events for observability
- **Policy-based**: Uses `TablePolicyService` for placement decisions
- **Coordinator delegation**: Delegates operation execution to `RebalanceCoordinator`

### Triggers
- Node join/leave (via CDC events)
- Replica failure
- Policy changes
- Periodic checks

### Budget Coordination
- Cluster-wide budget stored in `config` table (`rebalance_budget` key, default 10)
- Before planning moves, queries `replica_operations` via SQL engine for in-flight count
- Proposed moves capped at `max(0, budget - in_flight_count)`
- When budget exceeded, backs off with jitter and retries next cycle
- Critical moves (under-replicated) get `budget * CRITICAL_BUDGET_MULTIPLIER`

### Stabilization
- Minimum 1000ms, maximum 10000ms
- Prevents thrashing during cluster changes
- Timer resets on state changes

### Policies
- Target replica count (odd numbers: 3, 5, 7)
- Placement constraints (spread across nodes)
- Resource thresholds (CPU, memory, disk)

### Move Strategy
- ADD moves execute first to ensure data availability
- Critical REMOVE moves (failed replicas, wrong nodes) execute alongside ADDs
- Non-critical REMOVE moves (spread optimization) deferred until ADDs complete


## Storage Capacity-Aware Placement

Placement decisions are gated by per-node storage budgets, admission
checks, and reservation accounting. This prevents over-commitment of
node storage during replication, recovery, and split workflows.

### Ownership Map

| Concern | Owner | Notes |
|---------|-------|-------|
| Budget resolution/registration | `NodeStorageBudgetService` | Seed/join startup-owned integration |
| Replica size estimation + capacity snapshot | `StorageCapacityAccountingService` | Derives used/reserved/available from metadata |
| Admission decision + reservation API | `StorageAdmissionService` | Single gate for ADD/REPLACE/SPLIT increases |
| Operation lifecycle transitions | `RebalanceCoordinator` | Delegates reservation state changes |
| Placement planning | `MovePlanner` | Consumes admission/accounting APIs; no duplicate planner |
| Pressure-state behavior | `StoragePressureBehavior` | Gates moves by per-node pressure state |
| Split gating integration | `PartitionSplitMergeManager` | Calls admission owner for feasibility |
| Capacity metrics | `StorageCapacityMetrics` | Collects per-node metrics and admission counters |
| Migration/backfill | `StorageCapacityMigration` | Deterministic backfill for existing nodes |

### Metadata Model

Node budget metadata is stored as extensions to the `nodes` table:
- `storage_budget_bytes` — resolved budget in bytes
- `storage_budget_source` — origin of budget (`absolute`, `ratio`)
- `storage_budget_updated_at` — last budget update timestamp

The `storage_reservations` system table tracks in-flight reservations:
- `reservation_id` — unique identifier
- `operation_id` — associated replica operation
- `node_id` — target node
- `estimated_bytes` — reserved byte count
- `status` — reservation lifecycle state
- `created_at`, `expires_at` — TTL tracking

Capacity snapshots are derived projections (not persisted) computed by
`StorageCapacityAccountingService` from `nodes`, `services`,
`partitions`, and `storage_reservations` cache data.

### Admission Flow

```
Storage-Increasing Operation (ADD/REPLACE/SPLIT)
       │
       ▼
StorageAdmissionService.checkAdd/checkReplace/checkSplit
       │
       ├── Get capacity snapshot from StorageCapacityAccountingService
       │   (reads nodes, services, partitions, storage_reservations)
       │
       ├── Evaluate projected utilization against thresholds
       │   - Normal: allow
       │   - Soft: allow (non-critical with reduced priority)
       │   - Hard: deny non-critical, allow critical with headroom
       │   - Exhausted: deny non-critical, allow critical with headroom
       │
       ├── Apply observe/enforce mode override
       │
       └── Return structured decision (allow/deny, reason, projected %)
```

### Pressure States

| State | Threshold | Behavior |
|-------|-----------|----------|
| normal | < 70% utilization | All operations allowed |
| soft | 70–85% utilization | Critical allowed, non-critical reduced priority |
| hard | 85–100% utilization | Critical with emergency headroom only |
| exhausted | >= 100% utilization | Critical with emergency headroom only |

Thresholds are configurable via `rebalancer.storageSoftPressurePercent`
and `rebalancer.storageHardPressurePercent`.

### Configuration

Node startup keys:
- `node.storageBudgetBytes` — absolute budget in bytes
- `node.storageBudgetRatio` — fraction of physical disk

Rebalancer/storage keys:
- `rebalancer.storageSoftPressurePercent` — soft threshold (default 70)
- `rebalancer.storageHardPressurePercent` — hard threshold (default 85)
- `rebalancer.storageReservationTtlMs` — reservation expiry TTL
- `rebalancer.storageEmergencyHeadroomPercent` — critical-only headroom
- `rebalancer.minimumReplicaBytes` — floor for size estimation
- `rebalancer.splitAmplificationFactor` — split write-amplification multiplier
- `rebalancer.storageAdmissionMode` — `observe` or `enforce`
- `rebalancer.partitionReplicaOverheadBytes` — per-partition replica overhead
- `rebalancer.messageGroupReplicaOverheadBytes` — per-message-group replica overhead
- `rebalancer.serviceReplicaOverheadBytes` — per-service replica overhead

### Storage Capacity Anti-Patterns (Forbidden)

1. No duplicate capacity cache outside `SystemTableCache`.
2. No alternate admission path bypassing `StorageAdmissionService`.
3. No direct reservation management outside `RebalanceCoordinator`.
4. No parallel pressure-state tracking outside `StoragePressureBehavior`.
5. No ad-hoc storage accounting maps or sets in planner or coordinator.

## Safety Interval (Read Consistency)

WASM service groups use a CockroachDB-style closed-timestamp mechanism for strong reads without routing all reads to the leader.

- The leader periodically broadcasts its committed log index and timestamp to followers
- Followers track their local applied index and the last leader broadcast
- A follower can serve a strong read locally when its applied index >= the leader's last broadcast index AND the broadcast is within the configured safety interval
- When a follower's apply lag exceeds the safety interval, it forwards the read to the leader
- Three read consistency modes:
  - **leader_only** — all reads route to the Raft leader
  - **strong** — reads served locally when within safety interval, forwarded to leader otherwise
  - **eventual** — any replica serves reads from local state without staleness checks

## Timer Persistence and Exactly-Once Semantics

WASM service groups support persistent timers with exactly-once firing guarantees.

- Timer entries are stored in the Raft-replicated KV store under the reserved `_timers/` prefix
- Only the Raft leader runs active timers; followers store timer state but do not schedule execution
- On leader election, the new leader reconstructs all active timers from the KV store, skipping entries with `fired` or `cancelled` status
- **Fire-before-invoke**: when a timer fires, the leader marks it as `fired` via a Raft-committed write BEFORE invoking the handler function
- If the leader fails after committing the fired marker but before completing handler invocation, the new leader sees the `fired` status and does not re-fire, ensuring exactly-once semantics

## Epoch Management

Partition assignments are coordinated using versioned epochs with compare-and-swap (CAS) semantics.

### AssignmentEpoch (Value Object)

An immutable, versioned snapshot of all partition-to-node assignments:

```javascript
{
  epoch: number,           // Monotonically increasing version
  assignments: {           // Partition to node list mapping
    [partitionId]: [nodeId, nodeId, nodeId],
  },
  timestamp: string,       // HLC timestamp
  proposedBy: string       // nodeId that proposed this epoch
}
```

Key properties:
- **Immutable**: Once created, cannot be modified (Object.freeze)
- **Validated**: All fields validated on construction
- **Serializable**: Can be converted to/from JSON for CDC transmission

### AssignmentEpochManager (Stateful Coordinator)

Manages epoch transitions with CAS coordination:

- **proposeEpoch(expectedEpoch, newAssignments)**: CAS operation - only succeeds if current epoch matches expected
- **applyEpoch(epoch)**: Apply epoch received via CDC - rejects stale epochs
- **proposeEpochWithRetry()**: Handles CAS failures with exponential backoff

Events emitted:
- `epochChange`: When a new epoch is successfully proposed
- `epochApplied`: When an epoch is applied via CDC
- `proposalRetry`: When a CAS failure triggers retry

### Why Two Classes?

The separation follows single responsibility principle:
- `AssignmentEpoch`: Pure data structure (immutable value object)
- `AssignmentEpochManager`: Stateful coordination (mutable manager)

This allows epochs to be safely passed around and serialized without risk of modification.

## Message Group Assignment

When a new node joins the cluster, it needs at least one message group replica for communication. Two strategies determine how this is assigned:

### CREATE_SELF_HOSTED Strategy

Used when no existing replicas can be moved:

```
New Node joins
     │
     ▼
┌─────────────────────────┐
│ Create new message group│
│ with 3 local replicas   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ All 3 replicas on new   │
│ node (temporary)        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Rebalancer spreads      │
│ replicas to other nodes │
└─────────────────────────┘
```

When used:
- First node joining after seed node
- No existing message groups have movable replicas
- Cluster is scaling up rapidly

### MOVE_REPLICA Strategy

Used when an existing replica can be transferred:

```
New Node joins
     │
     ▼
┌─────────────────────────┐
│ Find node with excess   │
│ message group replicas  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Transfer replica ID to  │
│ new node (not copy)     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Update services table   │
│ to point to new node    │
└─────────────────────────┘
```

When used:
- Existing nodes have more than one message group replica
- Rebalancing message groups across cluster
- Preferred strategy for even distribution

### Strategy Selection

The bootstrap API automatically selects the strategy:

1. Query services table for message group replicas
2. Find nodes with multiple replicas (candidates for MOVE_REPLICA)
3. If found: Use MOVE_REPLICA with the excess replica
4. If not found: Use CREATE_SELF_HOSTED with new group ID

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

## Performance Metrics Instrumentation

Structured metrics logging is emitted on hot paths using the `metrics.*`
log tag namespace. All metrics use `logger.info()` level, structured
objects (no string interpolation), and `Ms` suffix for duration fields.
Most paths emit one metric per operation; ultra-hot transport delivery
metrics use trigger-based sampling to avoid log flood.

Constants: `METRICS_LOG_TAG` in `src/constants/metrics-constants.js`.

### Instrumented Paths

| Log Tag | Owner Component | Method |
|---------|----------------|--------|
| `metrics.query.lifecycle` | `SQLQueryEngine` | `executeQuery()` |
| `metrics.query.dispatch` | `SQLQueryEngine` | `executeRequest()` |
| `metrics.select.distributed` | `QueryExecutor` | `executeSelect()` |
| `metrics.fanout.complete` | `ParallelQueryCoordinator` | `executeParallel()` |
| `metrics.partition.sqlite` | `PartitionService` | `executeQuery()` |
| `metrics.partition.raft_propose` | `PartitionService` | `proposeWrite()` |
| `metrics.transport.deliver` | `MessageRouter` | `deliver()` |
| `metrics.transport.endpoint` | `MessageRouter` | `deliverViaEndpoint()` |
| `metrics.cdc.write` | `CDCIntegrationService` | `insertSystemTableRow()` / `updateSystemTableRow()` |
| `metrics.cdc.sql_route` | `CDCIntegrationService` | `executeSQL()` |
| `metrics.cdc.propagation` | `CDCEventHandler` / `MessageGroupService` | `applyCDCEvent()` |
| `metrics.hydration.table` | `CacheHydrationService` | `hydrateTable()` |
| `metrics.hydration.complete` | `CacheHydrationService` | `hydrateCache()` |
| `metrics.callback.throughput` | `CallbackExecutionHost` | `execute()` |
| `metrics.rebalance.operation` | `RebalanceCoordinator` | terminal state transitions |
| `metrics.pgwire.handshake` | `PgWireProtocolHandler` | startup/auth handshake |
| `metrics.pgwire.query` | `PgWireProtocolHandler` | query execution |
| `metrics.pgwire.session` | `PgWireSession` | session lifecycle |
| `metrics.pgwire.protocol_error` | `PgWireProtocolHandler` | protocol errors |

### Conventions

- All log tags use the `metrics.` prefix namespace.
- Duration fields use `Ms` suffix with integer milliseconds.
- Throughput fields use explicit units (e.g., `rowsPerSecond`).
- `metrics.transport.deliver` is sampled for steady-state success traffic;
  immediate emission still happens for faults, slow deliveries, and
  queue backpressure transitions.
- Metric-tagged logs are hidden from default process console output.
- Metrics persistence into the logs table is controlled by
  `logging.persistMetricsLogs` and defaults to disabled (`false`).
- CDC row-fetch info logs (`FETCHED_INSERT_ROW`, `FETCHING_UPDATE_ROW`,
  `FETCHED_UPDATE_ROW`) are suppressed for `logs` table writes to prevent
  write-amplification feedback loops in logging persistence.
- No new dependencies, caches, or state introduced by instrumentation.
- Metrics logging failures do not propagate to callers.

## Error Handling

- Try/catch errors MUST NOT be swallowed
- Errors must be re-thrown or clearly logged
- No try/catch for conditionals or communication flow
- Transient errors (no leader, cache unavailable) trigger retries

## Testing

- Node.js built-in test runner with tap
- Property-based testing with fast-check (max 10 iterations)
- Tests must complete in under 2 seconds
- No skipped tests allowed

## Kubernetes Endpoint Sync Controller

Kubernetes integration for runtime-managed replicated services uses a
projection controller model. Ownership remains split by concern:

1. Internal runtime ownership (`ServiceLifecycleManager`, `ServiceRuntimeLifecycle`,
   rebalancer, operation journal) remains authoritative for placement, lifecycle,
   and endpoint publication in `service_endpoints`.
2. Kubernetes endpoint sync is projection-only: it reads canonical endpoint rows
   via admin stream query execution and reconciles selector-less `Service` plus
   managed `EndpointSlice` resources.
3. The sync controller does not perform internal placement, does not mutate
   system tables, and does not introduce a parallel metadata store.

### Endpoint Sync Runtime Modules

Primary modules:

1. `src/runtime/endpoint-sync-config.js` — env contract parsing and validation.
2. `src/runtime/endpoint-sync-source-client.js` — admin stream source query with
   retries and typed failures.
3. `src/runtime/endpoint-sync-source-query.js` — source SQL builder and endpoint
   row normalization/filtering.
4. `src/runtime/endpoint-sync-naming.js` — deterministic DNS-1123 naming with
   hash truncation.
5. `src/runtime/endpoint-sync-planner.js` — logical service grouping, strict
   port validation, EndpointSlice chunk planning.
6. `src/runtime/endpoint-sync-k8s-reconciler.js` — upsert/GC reconciliation for
   managed `Service` and `EndpointSlice`, with per-group failure continuation.
7. `src/runtime/endpoint-sync-controller.js` — run-once orchestration of
   source -> filter -> plan -> reconcile with leader/follower write gating.
8. `src/runtime/endpoint-sync-leader-election.js` — Kubernetes Lease-based
   leadership election (`coordination.k8s.io/v1` Lease).
9. `src/runtime/endpoint-sync-metrics.js` — in-memory metric storage for
   reconcile duration/failures and exported object counts.
10. `src/runtime/endpoint-sync-k8s-client.js` — in-cluster Kubernetes API
    adapter implementing Service/EndpointSlice/Lease/Event operations.

### Endpoint Sync Safety and Observability

1. Leader election is lease-backed. Only the lease holder performs reconcile
   writes; followers no-op for write safety in multi-replica deployments.
2. Structured logs include one reconcile summary per cycle and per-group
   projection failures with `serviceKey`, `serviceName`, `protocol`, and stage.
3. Group-level projection failures emit Kubernetes warning Events when the
   Kubernetes client provides `recordEvent(...)`.
4. Metrics snapshot includes:
   `endpoint_sync_reconcile_duration_ms`,
   `endpoint_sync_reconcile_failures_total`,
   `endpoint_sync_exported_services`,
   `endpoint_sync_exported_endpoints`,
   `endpoint_sync_port_conflict_total`.

### Managed Resource Identity

Managed Kubernetes objects are identified by labels:

1. `endpointsync.system/managed=true`
2. `endpointsync.system/source=service_endpoints`
3. `endpointsync.system/service-key=<logical-service|protocol>`

Garbage collection is scoped strictly to resources carrying managed labels.
