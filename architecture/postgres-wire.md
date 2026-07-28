# PostgreSQL Wire And SQL Compatibility

How PostgreSQL clients (psql, drivers, ORMs) talk to the cluster: the wire
service flow, endpoint discovery, service packaging, the active SQL
compatibility layer, and its current limits.

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

### Measured Application Portability Example

[`examples/service-portability/`](../examples/service-portability/README.md)
builds one immutable Node/`pg` HTTP application image and runs it against stock
PostgreSQL and the production Lagrange listener. The runner inspects every
application container to prove the image ID, entrypoint, and command are
identical. Only connection, credential, TLS, and Lagrange service metadata may
change.

The measured slice covers the `pg` Pool, parameterized extended queries, a
transaction, portable schema mutation and inserts, and a deterministically
ordered multi-row select. The Lagrange stage authenticates from a separate
container with verified TLS; wrong-password and wrong-CA attacks produce no
`SqlRequest`. This is bounded evidence for a useful compatibility slice, not a
claim of arbitrary ORM or complete PostgreSQL compatibility. The application is
externally run in this milestone; managed OCI installation and supervision are
separate lifecycle capabilities.

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
- **WasmCallAdapter** (`src/query/wasm-call-adapter.js`) — legacy
  `DB.call(select, fn)` callback execution. This is not the current
  Artifact / Binding / Cell service path.

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

The compatibility layer described above lives in `SQLParser`.

### Multi-Partition Transactions

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
