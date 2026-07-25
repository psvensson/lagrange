# Runtime Components

A catalogue of the moving parts on a node: node-local components, replicated
service owners, metadata services, and core runtime service components — what
each owns and how they connect.

Use this as the "who is who" reference when other architecture documents name
a component. The ownership rules the components must respect are in
[overview.md](overview.md) and [control-plane.md](control-plane.md); their
startup and readiness lifecycle is
[runtime-lifecycle.md](runtime-lifecycle.md).

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
In the unified runtime model, these services are selected via
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
- Fixed listening port: `ADMIN_DEFAULT.WEBSOCKET_PORT`
  (`src/admin/admin-constants.js`) on every node
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
- Bootstrap sub-phases: INFRASTRUCTURE -> MESSAGE_GROUPS -> PARTITIONS -> REGISTRATION -> CACHE_HYDRATION
- Joining sub-phases: CONTACTING_SEED -> CONNECTING_WEBSOCKET -> CREATING/JOINING_MG -> WAITING_LEADERSHIP -> QUERYING_STATE
- Phase gates can be registered per sub-phase for validation
- Terminal sub-phases auto-advance the parent state

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

#### CDC apply convergence semantics (order-insensitive)

CDC fan-out is point-in-time delivery with no global ordering, so the apply path
is a convergent state CRDT — the same set of events converges to the same cache
regardless of delivery order, drop, or duplication
(`src/cache/system-table-cache-row-merge.js`, `src/cache/system-table-cache.js`):

- **HLC-LWW compare.** `isStaleForExistingRecord` prefers each row's origin write
  HLC (`updated_at_hlc`, carried end-to-end on CDC `data` — see CDCIntegrationService /
  PartitionService) over wall-clock `updated_at`. The HLC is a total causal order
  (physical, logical, nodeId), so equal-millisecond UPDATE ties and cross-leader
  wall-clock skew resolve deterministically and identically on every replica. When a
  row carries no HLC the path falls back to the prior wall-clock comparison.
- **DELETE tombstones.** A DELETE records a per-table tombstone keyed by row key +
  delete HLC. A later-delivered but causally-older write (a reordered DELETE-before-
  INSERT) is fenced and cannot resurrect the row; a genuinely-newer write supersedes
  and clears the tombstone (legitimate re-create). Tombstones are GC'd by a TTL plus a
  per-table size cap.
- **Anti-entropy sweep.** `reconcileAgainstAuthoritativeTruth(snapshot, {evictOlderThanMs})`
  evicts cache-only rows absent from a COMPLETE authoritative row set — the backstop for
  a genuinely-lost DELETE (no tombstone could form). It is wired into the authoritative
  catch-up (see CDCIntegrationService) and runs only against owner-authoritative reads,
  with a race guard that preserves rows newer than the read snapshot.

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
- Single bootstrap writer for system-table mutation
- Runtime CDC event processing is instantiated once via `CDCEventHandler`
- `handleEpochChangeCDC` and `handleNodeStateCDC` delegate to that single runtime handler path
- Epoch propagation is cluster-scoped via `config.current_epoch` and `setEpochManager(...)`
- **Authoritative catch-up + anti-entropy sweep.**
  `hydrateCdcPropagatedTablesFromAuthority` re-reads every CDC-propagated table from
  the authoritative owner path at join/recovery readiness (closing the
  bootstrap-snapshot → fan-out-targetability window). The UPSERT-only catch-up cannot
  remove a row a lost DELETE resurrected, so on an **owner-authoritative** read
  (`source === OWNER_RPC_LANE`) it follows the upsert with
  `applyAuthoritativeCacheSweep`, which deletes cache-only rows absent from that
  complete authoritative set. Local-replica reads (a possibly-lagging follower) never
  drive eviction. No periodic owner-rate-limited sweep for stable nodes is
  implemented.

### PartitionService
- SQLite-backed Raft group for data storage
- Uses liferaft library for Raft consensus
- Generates CDC events on writes; the leader stamps each event's `data` with the
  origin write HLC (`updated_at_hlc`) at generation
  (`src/partition/partition-cdc-generator.js`). The stamp rides `data` unchanged to
  every replica's cache (the envelope-level timestamp is re-minted per receiver and is
  not origin-stable), making the cache LWW compare and tombstone fence skew-immune. It
  is cache-only — the durable-write path filters unknown columns, so it is not persisted.
- Owns participant-side distributed transaction behavior (`BEGIN`, `PREPARE`,
  `COMMIT`, `ROLLBACK`) for partition-local state
- `prepareTransaction()` validates write conflicts and durably appends a
  `PREPARE_TRANSACTION` Raft log entry before acknowledging prepare success
- Reconstructs prepared transaction state from Raft log entries on leader
  election and keeps prepared writes durable across failover
- Enforces participant prepared-state hold timeout and emits typed
  `PREPARE_LOST` responses after autonomous timeout release
- Implements epoch-based snapshot isolation on reads (committed-before-epoch
  visibility + read-your-own-writes) and first-committer-wins write-conflict
  detection at prepare

### MessageGroupService
- Reliable inter-service communication
- 3-replica Raft groups using liferaft
- Ensures message delivery with retry logic
- Every node has at least one message group replica

### RuntimeDriverRegistry
- Implemented by `src/runtime/runtime-driver-registry.js`
- Single owner mapping `runtime_kind` to runtime driver implementation
- Deterministic lookup; unknown kinds fail closed with typed errors
- No fallback to alternate runtime drivers

### ServiceRuntimeLifecycle
- Implemented by `src/runtime/service-runtime-lifecycle.js`
- Single owner for runtime `prepare/start/stop/health` orchestration
- Coordinates endpoint intent registration through one write path
- Coordinates operation lifecycle transitions through SQL/CDC-owned records
- Shared owner across `native_js`, `wasm_component`, and `oci_container`
- Injects service-scoped query executors into replica contexts during `start()`
  so service Cells can query tables through the standard SQL execution path.
  The query executor factory is owned by `SQLQueryEngine` and wired via
  `setQueryExecutorFactory()`. This is the single injection point for
  service-to-table query access — no driver or lifecycle module may create
  its own query path.

### Runtime Drivers
- `Native_JS_Driver`:
  runs existing admin/service handlers in replicated runtime execution
- `Wasm_Component_Driver`:
  runs WASM component/module workloads with existing policy checks
- `OCI_Container_Driver`:
  validates digest-pinned OCI descriptors and supports the in-memory lifecycle
  scaffold when `oci_container_enabled` is enabled; real container activation
  is not implemented

### Legacy WasmServiceReplica Scaffold
- `WasmServiceReplica` extends `RaftReplicaBase` with `entityType` set to
  `WASM_SERVICE` and composes `SessionKVStore`, `SafetyInterval`,
  `TimerManager`, and `WasmExecutor`.
- Production startup constructs neither `WasmServiceLifecycle` nor a
  `wasm_service` `UnifiedRebalancer`; its Raft field therefore has no active
  production initialization path.
- Treat the enum, lifecycle, and replica classes as legacy scaffold, not a
  replicated service-state guarantee.
- Current WASI execution uses `Wasm_Component_Driver` in placed
  `runtime_service` Cells; durable service data remains in tables.

### WasmMetaService (`sys-wasm-meta`)
- Built-in placed runtime service for external WASM entity management
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
- `PgWireCutoverGuard` — listener-uniqueness verification; rejects any
  standalone listener startup path outside the runtime service

Ownership rules:
- No standalone PG wire TCP listener path exists. The replicated
  runtime-service path is the only listener owner.
- Session state is replica-local by design. Horizontal scaling
  works through endpoint discovery and client reconnect.
- All metadata writes flow through SQL/CDC; the runtime module
  does not write system tables directly.
