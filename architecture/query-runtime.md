# Query Runtime Architecture

How queries and compute callbacks execute once they reach the cluster: the
programmatic runtime, service replica query bridge, execution-mode dispatch,
partition-callback execution, the distributed movement primitives, and
resource guardrails.

This is the execution layer beneath the ingress surfaces — SQL arrives via
[postgres-wire.md](postgres-wire.md) or the admin API and runs against
partitions placed by [rebalance.md](rebalance.md). The components named here
are catalogued in [runtime-components.md](runtime-components.md).

The `runtime.run`, `ctx.call`, `WasmCallAdapter`, and `partition_callback`
sections below describe the active **legacy distributed-query callback
surface**. They are not the supported Artifact / Binding / Cell installation
path. Current externally installed WASI components use Binding-derived
runtime-service Cells; see
[Service Deployment Guide](../docs/service-deployment-guide.md).

### Distributed Movement Primitives (Legacy Callback)
Cross-partition data movement is restricted to three explicit primitives,
preventing accidental N+1 chatter:

- **ctx.lookup(table, keys[])** — batched, deduplicated key fetch limited to
  primary key, unique index, or bounded index access paths
- **ctx.emit(key, value)** — engine-managed shuffle/group with quota-aware
  buffering, backpressure, and spill-to-disk
- **ctx.broadcast(ref, dataset)** / **ctx.useBroadcast(ref)** — versioned
  small dataset replication with hard size cap
- **ctx.out(value)** — final output emission into result stream budgets

### Programmatic Runtime v0 (Active Legacy Callback API)
Programmatic distributed execution is implemented and active on the legacy
callback surface:

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

### Service Replica Query Bridge (Active)

Service replicas can query tables through the standard SQL execution path
via `replicaContext.queryExecutor`. This bridges the service runtime and
query execution layers without introducing a parallel query path.

Wiring:
1. `SQLQueryEngine` owns a query executor factory that produces
   service-scoped closures: `(serviceId) => async (sql, params) => result`.
2. During construction or via `setServiceRuntimeLifecycle()`, the engine
   wires this factory into `ServiceRuntimeLifecycle.setQueryExecutorFactory()`.
3. During `ServiceRuntimeLifecycle.start()`, the factory is called with the
   service's identity to produce a scoped executor, which is attached to
   `replicaContext.queryExecutor` before the driver receives the context.
4. Drivers and lifecycle modules (e.g. `PostgresWireRuntimeModule`) can use
   `replicaContext.queryExecutor(sql, params)` to execute SQL queries.

Ownership boundaries:
- `SQLQueryEngine` owns query execution — the factory closure routes through
  `executeQuery()`, the same path used by `ctx.call()` and all other SQL
  entrypoints.
- `ServiceRuntimeLifecycle` owns the injection point — it attaches the
  executor to the replica context during `start()` and emits
  `QUERY_EXECUTOR_FACTORY_EVENT.EXECUTOR_INJECTED` for observability.
- Drivers and lifecycle modules are consumers only — they call the executor
  but do not own query routing, caching, or partition resolution.

This is distinct from the legacy `ctx.call()` in `ExecutionContext`:
- legacy `ctx.call()` is request-scoped, budget-bounded, and supports
  iterator/stage/plan modes for user functions inside `runtime.run()`.
- `replicaContext.queryExecutor` is service-scoped, long-lived, and provides
  raw SQL execution for service replica internals.
- Both route through `SQLQueryEngine.executeQuery()` — one query path, no
  duplication.

### Execution-Mode Dispatch (Active)
`SqlCore.executeRequest(SqlRequest)` is the single owner for execution-mode
dispatch. All three adapters produce frozen `SqlRequest` objects and delegate:

- `InternalSqlAdapter` -> `SqlRequest(executionMode: sql_statement)`
- `PostgresWireAdapter` -> `SqlRequest(executionMode: sql_statement)`
- legacy `WasmCallAdapter` -> `SqlRequest(executionMode: partition_callback)`

No adapter owns dispatch logic. `executeRequest` switches on `executionMode`
with dedicated branches:

- `sql_statement` -> `executeQuery` (standard SQL planning and execution)
- `partition_callback` -> `PartitionCallbackDispatcher` -> `CallbackExecutionHost`
  (partition resolution, batch construction, per-partition callback invocation)
- Plan-object modes -> plan pipeline (`reduceByKey` / `useBroadcast`)

`partition_callback` is a first-class execution mode with its own dispatch
path. It is never aliased to or folded into `sql_statement` execution.

### Partition Callback Runtime Bridge (Active Legacy Callback API)
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

See the "Runtime_Driver_Registry" and "Service_Runtime_Lifecycle" sections in
[`runtime-lifecycle.md`](runtime-lifecycle.md) and
[`runtime-components.md`](runtime-components.md) for the unified runtime
ownership model, and their "Runtime Anti-Patterns (Forbidden)" material for the
no-fallback and no-parallel-lifecycle invariants that apply equally to
callback execution.

### Exchange and ReduceByKey Semantics (Active)
- `exchangeBy: 'key'` routes same keys to the same destination partition
  via `ExchangeManager` (`src/query/distributed/exchange-manager.js`)
- Exchange delivery is at-least-once; duplicates are possible on retry
- Emit metadata supports `dedupeKey` for idempotency control
- No global ordering guarantee across exchanged records
- `reduceByKey` consumes grouped batches:
  `[{key, records, continuation?}, ...]`
- Groups exceeding `maxRecordsPerGroup` are split with continuation tokens

### Strategy Selector
Chooses movement strategy for joins and distributed work:

1. If side dataset <= broadcast threshold -> broadcast
2. Else if inner side is pk/unique/bounded lookup -> lookup
3. Else -> emit/shuffle

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
