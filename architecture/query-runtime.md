# Query Runtime Architecture

How queries and distributed stage/plan primitives execute once they reach the
cluster: the programmatic runtime, service replica query bridge,
execution-mode dispatch, the distributed movement primitives, and resource
guardrails.

This is the execution layer beneath the ingress surfaces — SQL arrives via
[postgres-wire.md](postgres-wire.md) or the admin API and runs against
partitions placed by [rebalance.md](rebalance.md). The components named here
are catalogued in [runtime-components.md](runtime-components.md).

Externally installed WASI components use Binding-derived runtime-service
Cells, and partition-local WASI execution uses the call Binding path
(`CALL BINDING $1` → per-partition `run` on the partition-host nodes →
coordinated `reduce`); see
[Service Deployment Guide](../docs/service-deployment-guide.md) and
[Minimal Deployment Surface](minimal-deployment-surface.md).

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

### Programmatic Runtime v0
Programmatic distributed execution is implemented for internal stage/plan
pipelines:

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

This is distinct from `ctx.call()` in `ExecutionContext`:
- `ctx.call()` is request-scoped, budget-bounded, and supports
  iterator/stage/plan modes for functions inside `runtime.run()`.
- `replicaContext.queryExecutor` is service-scoped, long-lived, and provides
  raw SQL execution for service replica internals.
- Both route through `SQLQueryEngine.executeQuery()` — one query path, no
  duplication.

### Logical table names and client DML

Logical catalog names preserve the case returned by the SQL parser. `Logs` and
`logs` are distinct names: routing selects a logical partition before SQLite
interprets identifiers inside that partition's database. Table creation and its
durable provisioning identity retain that spelling across restart. Runtime
access grants compare the same exact case; ASCII uppercase letters are accepted
in grant table identifiers as well as lowercase letters. No case alias is added.

The system-table predicate owns reserved names, including the existing optional
`global.` namespace representation. User CREATE rejects an exact reserved name
before recording a schema job and again when provisioning or resuming a job,
independently of catalog-cache presence. Bootstrap owns those tables.

Client SQL admission covers `INSERT`, `UPDATE`, `DELETE` (including their
supported replacement forms), `ALTER TABLE`, and `DROP TABLE`. It refuses
exact-case system-table targets at engine entry (`SQL_STATEMENT`, `STAGE`, and
`PLAN` execution modes) and preserves client origin through forwarding to
partition execution; migration and partition schema-mutation boundaries likewise
refuse `ALTER TABLE`, `DROP TABLE`, and DDL on exact-case system tables, and
parallel-reduce runtime configuration rejects exact-case system tables for
coordination and result tables. Reads remain available; supported administrative
changes use their semantic owners. User `CREATE TABLE` rejects exact reserved
system-table names via its creation invariant (`SYSTEM_TABLE_NAME_RESERVED`).

### Execution-Mode Dispatch (Active)
`SqlCore.executeRequest(SqlRequest)` is the single owner for execution-mode
dispatch. All adapters produce frozen `SqlRequest` objects and delegate:

- `InternalSqlAdapter` -> `SqlRequest(executionMode: sql_statement)`
- `PostgresWireAdapter` -> `SqlRequest(executionMode: sql_statement)`

No adapter owns dispatch logic. `executeRequest` switches on `executionMode`
with dedicated branches:

- `sql_statement` -> `executeQuery` (standard SQL planning and execution)
- `stage` / `plan` modes -> distributed stage/plan pipeline (`reduceByKey` /
  `useBroadcast`)

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

### Resource Guardrails
Per-query and per-stage budgets enforced by `BudgetEnforcer`:

- CPU time, memory, wall time limits
- Lookup max keys and max bytes
- Emit max intermediate bytes
- Broadcast max payload bytes

Budget violations terminate the operation with a descriptive `BudgetLimitError`.
