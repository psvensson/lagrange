# Distributed Database System Architecture

This document describes the architecture of the distributed database system. It should be updated as features are added or changed.

## Overview

A scalable distributed database where:
- ALL persistent information is stored in tables
- ALL tables are implemented as partitions
- ALL partitions are Raft consensus groups with odd-numbered replicas (minimum 3)
- ALL partitions use SQLite for storage
- Replicated service groups host service runtimes selected by
  `service_definitions.runtime_kind` (current focus: WASM and native admin)

## Core Principles

1. **Tables as the Universal Storage Model** - System metadata and user data are stored in tables
2. **Partitions as Raft Groups** - Each partition is a Raft consensus group using liferaft
3. **System Cache as Single Source of Truth** - In-memory cache of default
   system tables, updated by CDC events (`logs` is excluded from default cache
   sync/hydration and remains queryable from its partition)
4. **Message Router for All Communication** - All messages (local and remote) route through WebSocket-based MessageRouter
5. **No Fallback Code Paths** - Single code path for any given logic; no legacy or alternative mechanisms
6. **SQL Engine for All System Reads** - All reads of system information go through the SQL engine (which uses the system cache for routing); no direct cache reads outside cache/query internals
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

1. `sys-admin-meta` and `sys-wasm-meta` are replicated control-plane services.
2. Node-local admin ingress remains fixed on port `8081` as a compatibility
   adapter.
3. Runtime lifecycle operations are owned by
   `Service_Runtime_Lifecycle` with runtime selection through
   `Runtime_Driver_Registry`.
4. SQL profile services map to `runtime_kind = native_js` through
   `SQL_ENGINE_RUNTIME_KIND`.
5. Callback invocation is owned by `CallbackExecutionHost`; callback runtime
   selection is through `CallbackRuntimeDriverRegistry` as a strict adapter
   over the unified runtime registry.

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
5. Parallel callback runtime engine outside `CallbackRuntimeDriverRegistry`.
6. Schema/model command drift for `service_definitions`.
7. Unlabeled active-vs-target documentation claims.
8. Marking closure tasks complete without production-path evidence.

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

The following system tables store cluster metadata:

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `nodes` | All registered nodes with addresses and status | `node_id` |
| `partitions` | All partitions with key ranges and replica counts | `partition_id` |
| `services` | All partition, message group, and replicated service replicas with addresses and Raft roles | `service_id` |
| `tables` | All user tables with schemas and policies | `table_id` |
| `message_groups` | All message groups with replica counts | `group_id` |
| `replica_operations` | Pending replica operations (splits, merges, rebalancing) | `operation_id` |
| `indices` | Secondary indices for tables | `index_id` |
| `logs` | System logs | `log_id` |
| `config` | Dynamic configuration | `config_key` |
| `live_queries` | Active live query subscriptions | `query_id` |
| `contexts` | Function execution contexts | `context_id` |
| `code` | Stored functions/procedures | `code_id` |
| `service_definitions` | Runtime-agnostic service definitions (`runtime_kind`, `runtime_ref`, `runtime_config`, profiles, policy) | `service_id` |
| `service_endpoints` | Replicated service endpoint addresses for gateway integration | `endpoint_id` |
| `service_timers` | Persistent timers for runtime profiles that support timers (currently WASM) | `timer_id` |
| `storage_reservations` | In-flight storage reservations for capacity-aware placement | `reservation_id` |

WASM meta-service management tables:

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `module_manifests` | WASM module/package metadata (`namespace`, `name`, `version`, digest, run_export, dependencies, capabilities) | composite (`namespace`, `name`, `version`) |
| `package_registry_mappings` | Namespace to registry mapping rules for component distribution | `namespace` |
| `package_registry_overrides` | Per-package source override rules | composite (`namespace`, `name`) |
| `module_dependency_locks` | Immutable resolved dependency locks for deterministic activation | `lock_id` |
| `wasm_operations` | Async operation journal for publish/create/rollout/scale/delete workflows | `operation_id` |

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
- `sys-admin-meta` (broader admin surfaces, delegates WASM ownership areas)
Both services are provisioned during seed bootstrap.
Under the unified runtime target, these services are runtime-selected via
`service_definitions.runtime_kind` and orchestrated through one lifecycle owner.

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
- Manages replica placement for partitions, message groups, and replicated
  service groups (current service entity type: `wasm_service`)
- Operates autonomously (no manual placement)
- Uses policies to determine target replica count and placement
- Stabilization period prevents thrashing
- Cluster-wide rebalance budget limits concurrent moves (stored in config table)
- Critical moves (under-replicated from node failure) get elevated budget via multiplier
- Reads in-flight operation count via SQL engine before planning moves

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
- Replicated service groups (current `wasm_service`): SQLite log adapter
  (persistent)

## Rebalancing

### UnifiedRebalancer

The `UnifiedRebalancer` is the single rebalancer implementation for partitions,
message groups, and replicated service groups (current entity type:
`wasm_service`). Each partition/message group/service leader runs its own
rebalancer instance, making independent decisions that converge to optimal
state.

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
