# PostgreSQL Wire And SQL Compatibility

How PostgreSQL clients (psql, drivers, ORMs) talk to the cluster: the wire
service flow, endpoint discovery, service packaging, the active SQL
compatibility layer, and planned compatibility extensions.

The key orientation point: the PostgreSQL endpoint is a replicated runtime
service (`sys-postgres-wire`), not a boot listener — a bare node does not open
port 5432; the listener appears only where that service is started and placed
like any other service (see [runtime-lifecycle.md](runtime-lifecycle.md) and
[rebalance.md](rebalance.md)). Query execution behind the wire protocol is
described in [query-runtime.md](query-runtime.md).

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
│ (authn -> tenant/principal context)          │
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

### Current Security Posture

- Runtime configuration must explicitly select `authMode: "trust"` or
  `authMode: "password"` and one `tlsMode`: `disable`, `prefer`, or `require`;
  implicit authentication and transport policy are rejected.
- Trust mode may bind only to `127.0.0.1`, `::1`, or `localhost`.
- Password mode performs PostgreSQL `AuthenticationCleartextPassword` before a
  session exists. The production composition root builds its verifier only from
  the complete `PGWIRE_AUTH_USER`, `PGWIRE_AUTH_PASSWORD`, and
  `PGWIRE_AUTH_DATABASE` environment tuple; partial configuration fails startup,
  and password material is not stored in `runtime_config` or audit records.
- PostgreSQL `SSLRequest` negotiation is owned by the production listener.
  `require` rejects plaintext startup before authentication or SQL, `prefer`
  accepts TLS or plaintext deliberately, and `disable` returns PostgreSQL's
  no-TLS response. Externally bound password deployments use `require`.
- Server key/certificate material is loaded from mounted paths named by
  `PGWIRE_TLS_KEY_PATH`, `PGWIRE_TLS_CERT_PATH`, and optional
  `PGWIRE_TLS_CA_PATH`, or injected directly by an embedding composition root.
  TLS material is not part of `runtime_config` and configuration failures do not
  echo paths or key bytes.
- Clients remain responsible for hostname and certificate-authority validation;
  SCRAM is still unsupported.
- Every authenticated session carries a security context, and every query is
  authorized before the adapter constructs and dispatches its `SqlRequest`.
- The admin WebSocket also defaults to loopback. External admin binding is
  rejected unless `ADMIN_ALLOW_INSECURE_EXTERNAL_BIND=true` accompanies an
  external `ADMIN_WEBSOCKET_HOST`; deployments must put authenticated ingress
  in front of that explicit insecure-trust posture.

### PostgreSQL Wire Scale Operations

Scaling `sys-postgres-wire` follows the unified rebalancer model:

1. `replica_count` in `service_definitions` is cluster-global.
   The rebalancer spreads replicas across available nodes.
2. Scale-up: increase `replica_count` -> rebalancer plans `ADD`
   operations -> `RuntimeServiceHandler` materializes new replicas
   via `ServiceLifecycleManager` -> each replica binds a TCP
   listener and publishes a `service_endpoints` row.
3. Scale-down: decrease `replica_count` -> rebalancer plans `REMOVE`
   operations -> replica stops listener, cleans up endpoint row.
4. Node failure: rebalancer detects under-replication -> plans
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
  correlation IDs across adapter -> meta service -> SQL -> lifecycle
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
- Owns the query executor factory for service replicas: during construction
  or via `setServiceRuntimeLifecycle()`, wires a `queryExecutorFactory` into
  `ServiceRuntimeLifecycle` so service replicas receive both the compatible
  service-scoped `queryExecutor` closure and its canonical
  `sqlRequestExecutor`. PG wire uses the latter to preserve session, tenant,
  dialect, and execution-mode fields through `executeRequest()`. This remains
  the single owner of query execution for user functions and service replicas.

### SQL Adapter Layer
Three adapters normalize different entrypoints into canonical `SqlRequest`
objects consumed by SqlCore:

- **InternalSqlAdapter** (`src/query/internal-sql-adapter.js`) — in-process SQL
  calls from system components
- **PostgresWireAdapter** (`src/query/pg/postgres-wire-adapter.js`) — external SQL
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
- Positional parameters (`$1`, `$2`) -> SQLite `?` with param reordering
- Boolean literals (`TRUE`/`FALSE`) -> integer `1`/`0`
- Type casts (`::type`, `CAST AS pg_type`) -> `CAST AS sqlite_affinity`
- Function name mapping (PG -> SQLite equivalents via extensible registry)
- Date/time functions (`NOW()`, `EXTRACT`, `DATE_TRUNC`) -> `strftime()`
- `ILIKE` -> `LOWER() LIKE LOWER()`
- User-table `INSERT ON CONFLICT` may translate to SQLite conflict handling
  forms where semantics are preserved, but system-table lifecycle/status writes
  must keep partial-update semantics and must not use `INSERT OR REPLACE`.
- `RETURNING` clause pass-through (SQLite 3.35+)
- Subqueries, CTEs, CASE WHEN, derived tables, set operations pass-through

Dialect flows through `SqlRequest.dialect` from `PostgresWireAdapter` to
`SqlCore` to `SQLParser`. Internal system queries omit dialect, defaulting
to SQLite mode. No component outside the parse phase is aware of dialect.

Spec: the `pg-sql-compat-layer` spec has been archived out of the tree; the
compatibility layer described above is shipped and lives in `SQLParser`.

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

#### Multi-Partition Transactions (Implemented)

Distributed transactions are implemented with
`DistributedTransactionCoordinator` as the single commit-mode owner and
`PartitionService` as the participant owner.

Implementation summary:
1. `BEGIN` assigns a monotonic `transactionEpoch` and a timeout budget
   deadline. The transaction kind is `EXPLICIT`; SQL-created statement
   transactions are `AUTOCOMMIT`.
2. Participant enlistment delivers `BEGIN` through `MessageRouter` with
   the assigned epoch.
3. SQL direct-autocommits an independent one-participant statement. A final
   post-mirror multi-participant statement is promoted to an owner-generated
   `AUTOCOMMIT` transaction. Active explicit transactions always enlist.
4. `COMMIT` waits for the session FIFO lane, freezes the final participant
   set, persists its exact count, and then selects the immutable commit mode.
   One participant uses 1PC only when the participant exposes a durable typed
   commit outcome; otherwise it safely falls back to 2PC. A rejected durable
   transaction or participant mutation fails closed before protocol fanout.
5. 2PC runs phase 1 prepare. Each participant executes
   `prepareTransaction()`, validates write conflicts, and appends
   `PREPARE_TRANSACTION` in its Raft log before prepare success.
6. On all-prepare success, coordinator persists `COMMITTING` before any
   participant commit message, then drives commit fanout with bounded
   retry/backoff.
7. On prepare failure or explicit rollback, coordinator persists
   `ROLLING_BACK` before rollback fanout and drives all participants to
   `ROLLED_BACK`.
8. Recovery validates staged rows before installing coordinator state, then
   validates the persisted transaction mode, participant-set state, commit
   mode, and frozen participant count before any callback. 1PC replay
   resolves `COMMITTED`, `NOT_COMMITTED`, or `UNKNOWN` from the participant's
   SQLite-atomic outcome record keyed by session and exact transaction epoch;
   `UNKNOWN` remains in `COMMITTING`. A periodic recovery sweep resolves
   timed-out non-terminal transactions.

The W10 schema cutover is full-restart/minimum-version only. Drain every
pre-W10 nonterminal transaction before upgrade. Mixed-version apply is not
supported, and legacy `PREPARING`, `PREPARED`, or `COMMITTING` rows with
`NOT_SELECTED` fail closed rather than inferring a mode.

9. Snapshot model: participants enforce epoch-based snapshot isolation
   (`commit_epoch < transaction_epoch` visibility), read-your-own-writes,
   and first-committer-wins write-conflict detection via write sets.

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
  `col->>'key'` -> `json_extract(col, '$.key')`,
  `col @> '{"k":"v"}'` -> `json_extract(col, '$.k') = 'v'`
- **ARRAY**: Store as JSON arrays in TEXT columns. Map PG array
  operators to JSON functions: `ANY(array_col)` -> `json_each()` join
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
