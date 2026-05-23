# Bootstrap And Data Flow

Seed and joining bootstrap, query routing, CDC continuity, and meta-service management flow.

## Bootstrap Process

Startup phase names in this section are progress labels only. They describe
operator-visible handoff checkpoints while lifecycle ownership stays with
`ServiceLifecycleManager`, placement ownership stays with
`ServiceReconciler`, and canonical topology truth stays in owner rows plus the
declared read-model contract.

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
1. HTTP Bootstrap Request -> Contact seed node via /bootstrap endpoint
2. Receive Complete Snapshots -> Bootstrap response includes default cache-sync
   tables (`logs` excluded)
3. Cache Hydration -> Populate local system cache from snapshots
4. Leader Readiness Gate -> Block until leader metadata is complete (including addresses)
5. CDC Subscription -> Subscribe to CDC events for default cache-sync tables
6. Node Registration -> Register self in nodes table (routes through SQL)
7. Storage Budget -> Resolve and persist node storage budget via NodeStorageBudgetService
8. Ready -> Node is ready to serve queries
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

### Query Routing Resilience During Topology Transitions

Per §1.10 and §1.12, the query path must remain functional during partition
splits, moves, and leader elections. `QueryExecutor.executeOnPartition()`
implements bounded retry and candidate fallthrough for read queries:

- Read queries get configurable retry attempts (default 3, via
  `QUERY_READ_RETRY_ATTEMPTS` config key) instead of the previous single
  attempt. Write queries retain their existing leader-retry behavior.
- When no service candidates are found for a read but the partition record
  exists, the executor retries with a delay to allow routing repair and
  cache convergence to discover candidates.
- Within each attempt, the candidate loop iterates all eligible replicas.
  Transient failures (non-success responses, transport errors) cause the
  executor to try the next candidate rather than hard-failing.
- If all candidates in an attempt fail, the executor retries the full
  attempt (re-resolving candidates) up to the configured limit.
- The admin API timeout path uses `QUERY_TIMEOUT` classification (not
  generic `REMOTE_CALL_TIMEOUT`) so timeout diagnostics distinguish
  query-plane timeouts from control-plane remote call timeouts.

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

### CDC Continuity During Topology Transitions

Steady-state CDC propagation is wired at bootstrap time. Topology
transitions (partition split, node restart, message group failover)
create windows where CDC subscribers may be absent or stale. The
following contracts ensure CDC continuity across these transitions.

#### Split Completion → Rebalance Trigger

When `PartitionSplitMergeManager` emits `SPLIT_COMPLETED`, the
composition root (`src/index.js`) triggers
`rebalancer.recordStateChange(STABILIZATION_RESET_TRIGGER.SPLIT_COMPLETED)`
on each child partition's `UnifiedRebalancer`. This resets the
stabilization timer so the rebalancer evaluates replica spread after
the cluster settles. The trigger is wired at the composition root
(both seed and join paths), not inside the split workflow. If the
child partition's rebalancer is not yet active (leader not elected),
the existing `setLeader(true)` → `scheduleNextCheck()` path handles
deferred activation.

#### CDC Subscriber Registration Timing

`createPartitionService` factories in both `BootstrapService` and
`NodeJoiningService` ensure `subscribeToCDCWithHandshake()` completes
before the factory returns. This guarantees CDC subscribers are
registered before the first Raft-committed entry is processed.
Buffered CDC events are replayed inline during the handshake catchup
phase. After handshake (whether full or partial replay), the buffer
replay delay resets to the initial value so follow-up replays use
initial backoff rather than escalated delay.

#### Restart CDC Re-establishment

`NodeJoiningService.subscribeToCDCEvents()` uses a bounded retry loop
for CDC subscription re-establishment on node restart. Constants in
`src/bootstrap/node-joining-constants.js` control the retry budget:
`CDC_REESTABLISHMENT.MAX_RETRIES`, `CDC_REESTABLISHMENT.RETRY_DELAY_MS`,
and `CDC_REESTABLISHMENT.TIMEOUT_MS`. Periodic structured diagnostics
are emitted during recovery showing per-table subscription status,
message group leader identity, and elapsed time. Node readiness is
gated on CDC subscription status via
`awaitCdcSubscriptionsForReadiness()` — the node does not advertise
readiness until subscriptions are confirmed active or the timeout
budget expires.

#### Message Group Failover CDC Continuity

`MessageGroupService.wireRaftEvents()` re-subscribes to all
CDC-propagated tables on leadership gain via
`cdcHandler.getSubscriptions()` → `subscribeToCDC(tableName)`. This
follows the same subscription path as initial setup (no parallel
mechanism). CDC events buffered on source partitions during the
failover window are replayed when the new leader's subscriber
registers via the existing `cdcEventBuffer` replay mechanism.

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
