# Runtime Lifecycle Architecture

Runtime readiness, service lifecycle, ownership consolidation, runtime descriptors, and observability contracts.

## Lifecycle Readiness Classification

Load-ready and repair-only states are explicit:

1. Node lifecycle states `ready` and `active` are load-ready.
2. Node lifecycle states `initializing`, `starting`, `connecting`,
   `discovering`, `joining`, `syncing`, `suspected`, `failed`,
   `recovering`, `draining`, and `shutting_down` are repair-only or otherwise
   non-ready.
3. Replica raft roles `leader` and `follower` are load-ready.
4. Replica raft roles `candidate` and `learner` are repair-only or otherwise
   non-ready.
5. Replica lifecycle state-machine state `active` is load-ready.
6. Replica lifecycle state-machine states `pending`, `creating`, `syncing`,
   `removing`, and `failed` are repair-only; `removed` is terminal and
   non-serving.
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
2. `GET /api/admin/diagnostics/cdc` exposes node-local CDC subscription
   readiness, backlog, and authoritative-fallback telemetry.
3. `GET /api/admin/diagnostics/partitions` exposes canonical partition leader
   identity, replica-role consistency, voter counts, and replica-operation
   liveness.
4. `GET /api/admin/diagnostics/sql` exposes node-local SQL execution telemetry
   such as coordinator fanout metrics, provision-target diagnostics, and split
   evaluation owner diagnostics.

Unified lifecycle anti-patterns (forbidden):

1. Direct startup of partition/message-group replicas from bootstrap/join phase
   entrypoints (`phaseMessageGroups`, `phasePartitions`,
   `phaseCreateSelfHostedMessageGroup`, `phaseJoinExistingMessageGroup`).
2. Branching admin ingress behavior on "dispatcher path vs local path" before
   canonical envelope translation.
3. Parallel reconciliation loops outside `ServiceReconciler`.
4. Feature flags or fallback branches that preserve pre-cutover lifecycle
   ownership paths.

### Startup Adapters and Steady-State Owners

`BootstrapService` and `NodeJoiningService` remain startup adapters only.
They provision transport, hydrate cache state, subscribe to CDC, and hand work
to the steady-state owners. They do not retain a parallel ownership path for
lifecycle, placement, or readiness after startup handoff.

Mandatory owner boundaries:

1. `ServiceLifecycleManager` is the only owner of replica create/start/stop/
  restart operations.
2. `ServiceReconciler` is the only owner of desired-vs-actual convergence for
  partition, message-group, and runtime service placement.
3. `BootstrapService` and `NodeJoiningService` may request startup-time
  convergence through those owners, but may not directly keep runtime-only
  helper seams once continuity coverage exists.
4. Phase labels in startup flows are progress markers for operators and tests,
  not independent ownership domains.
5. Readiness decisions consume canonical owner rows and declared read models;
  startup adapters may surface those decisions but do not redefine them.
6. Transport evidence from `MessageRouter` may repair health assessment when
  cache propagation lags, but it does not replace owner-row authority for
  placement or leader identity.

## Ownership Consolidation (Architecture Traceability)

This section is the canonical owner map for consolidation work tracked in:

1. `solve/specs/architecture-ownership-consolidation/requirements.md`
2. `solve/specs/architecture-ownership-consolidation/design.md`
3. `solve/specs/architecture-ownership-consolidation/tasks.md`
4. `solve/specs/architecture-ownership-consolidation/owner-map.md`

| Concern | Owner | Runtime boundary |
| --- | --- | --- |
| Message router setup | `MessageRouterSetup` | `BootstrapService`, `NodeJoiningService` |
| CDC setup + upgrade | `CDCIntegrationSetup` | `BootstrapService`, `NodeJoiningService` |
| Replica handler setup | `ReplicaHandlerSetup` | `BootstrapService`, `NodeJoiningService` |
| Control-plane setup | `ControlPlaneSetup` | `BootstrapService`, `NodeJoiningService`; creates `StorageCapacityAccountingService` + `StorageAdmissionService` and injects both into `RebalanceCoordinator` |
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
2. Node-local admin ingress remains fixed on
   `ADMIN_DEFAULT.WEBSOCKET_PORT` (`src/admin/admin-constants.js`) as a
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
   `solve/specs/runtime-ownership-closure/closure-matrix.md`.

### Planned

1. `oci_container` runtime moves from gated runway to fully enabled only after
   policy, rollout, and operations gates are met.

### Runtime Kinds

| Runtime Kind | Purpose | Status |
|-------------|---------|--------|
| `native_js` | Run existing in-process handlers as replicated service workloads (admin first) | Active |
| `wasm_component` | Run WASI/WASM component workloads with manifest/capability/dependency enforcement | Active |
| `oci_container` | Run digest-pinned OCI container workloads under policy gate | Planned, feature-gated |

## Canonical Owner Rows vs Read Models

Runtime metadata must separate canonical ownership from supporting replica
detail.

| Concern | Canonical owner row | Supporting read model |
| --- | --- | --- |
| Partition leader identity | `partitions.leader_node_id` | `services.raft_role`, `services.address`, `services.status` |
| Message-group leader identity | `message_groups.leader_node_id` | `services.raft_role`, `services.address`, `services.status` |
| Replica role and availability | `services` | Control snapshots, readiness views, CLI tables |

Required read order:

1. Read the owner row first for canonical leader identity.
2. Read replica rows second for supporting detail.
3. Report disagreements explicitly as inconsistency diagnostics.
4. Never rebuild canonical leader truth from `services` row iteration order.

### Control-Plane Decision Read-Model Contract

Each control-plane decision path declares exactly one read-model source.
Mixed cache/SQL fallback within a single semantic decision is forbidden.
The canonical registry lives in `src/control-plane/read-model-contract.js`.

| Source | Usage |
| --- | --- |
| `SYSTEM_TABLE_CACHE` | CDC-propagated metadata, steady-state decisions |
| `AUTHORITATIVE_SQL` | Partition-leader writes and deduplication queries |
| `RECOVERY_SQL` | Explicit recovery sweeps with typed reason codes |
| `DIAGNOSTICS_SQL` | Reconciliation and diagnostics with typed reason codes |

Decision methods are annotated with `@readModel` JSDoc tags referencing
the declared source from `CONTROL_PLANE_DECISION_READ_MODEL`.

### Cache Observation Boundary

Topology workflows treat cache visibility as observation only, not proof of
executor completion.

1. Executor-owned phase completion requires authoritative owner commit plus
   explicit acknowledgement where the semantic boundary is participant-owned.
2. Cache divergence is emitted as a typed diagnostic event and may feed
   invariant artifacts, but it does not authorize direct mutation fallback.
3. Recovery from divergence re-enters the same owner-key reconcile queue used
   by normal progression.
## Extension Path for New Raft-Backed Runtime Services

Any new raft-backed runtime service must extend the shared lifecycle and
metadata ownership path instead of copying existing service logic.

Required implementation sequence:

1. Define the group-owner row and the exact field subset it owns.
2. Define the per-replica `services` row shape and keep replica-only fields in
   that row.
3. Route leader/follower/candidate and leader-change behavior through the
   shared raft lifecycle path (`RaftReplicaBase` hooks or the shared lifecycle
   binder used by the service).
4. Route role persistence and owner-row leader persistence through the shared
   authoritative row mutation helper.
5. Expose canonical diagnostics so control snapshots read the owner row first
   and attach replica-role detail separately.
6. Add owner-path regressions proving:
   - leader-change demotion works without a separate follower event
   - owner-row mutation uses the shared helper
   - owner rows outrank replica rows in diagnostics

Forbidden implementation patterns:

1. Service-local raft event wiring that duplicates shared lifecycle semantics.
2. Service-local retry or cache-gap loops for owner-row mutations.
3. Canonical leader derivation from `services.raft_role = leader` rows.
4. Silent fallback from owner rows to replica rows when owner data is present.

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
Node Admin Adapter (fixed :ADMIN_DEFAULT.WEBSOCKET_PORT, compatibility only)
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
      ├──► Runtime_Driver_Registry -> {Native_JS_Driver | Wasm_Component_Driver | OCI_Container_Driver}
      │
      ├──► SQL/CDC mutation path + operation journal updates
      │
      └──► Query executor injection (start only):
           SQLQueryEngine.setQueryExecutorFactory() -> replicaContext.queryExecutor
           Service replicas query tables through the standard SQL execution path.
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
10. Service replicas creating their own query routing, partition
    resolution, or SQL execution path instead of using the injected
    `replicaContext.queryExecutor` from `ServiceRuntimeLifecycle`.

### Migration Posture

The unified runtime model has one steady-state posture:

1. Node-local admin and WASM entrypoints are compatibility adapters only.
   They forward into replicated service handlers (`sys-admin-meta`,
   `sys-wasm-meta`) and the SQL/CDC write path without owning a separate
   mutation path.
2. Direct node-local mutation ownership paths are not reachable after
   initialization. If a temporary migration step exists during rollout, it
   must be bootstrap-only or branch-local, have a documented removal point,
   and must not be re-enabled through a runtime mode switch.
3. Rollback, if required, happens by reverting the deployment or branch to a
   prior implementation, not by restoring a live fallback path in the same
   runtime.

### Related Runtime Closure Docs

1. `docs/admin-api-reference.md`
2. `docs/wasm-services-user-guide.md`
3. `solve/specs/runtime-ownership-closure/closure-matrix.md`
4. `solve/specs/runtime-ownership-closure/completion-gates.md`
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

Partition assignments use `config.current_epoch` as the sole epoch authority.
Epoch reads and writes flow through the SQL/CDC path; no secondary epoch state
machine or parallel owner is allowed.

Canonical behavior:
- Writers that change assignment state read `config.current_epoch`, perform any
  conditional update against that canonical row, and publish the change through
  the existing CDC path.
- Readers consume the propagated `config.current_epoch` value from the owning
  row and may cache or log it, but must not mint an alternate epoch authority.
- Helper utilities may normalize payloads or wrap retries around the canonical
  SQL write path, but they remain thin wrappers and do not own epoch state.
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
