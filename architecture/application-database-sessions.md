# Application database sessions

## Result

`createEmbeddedLagrange({configuration})` is a side-effect-free public factory.
Its returned handle starts a side-effect-free startup-composition module
extracted from the existing seed/join entrypoint, opens application database
sessions only after startup, and stops that same runtime without exiting the
host process. The runtime handle is the only public owner that can open an
application database; callers never provide a `SqlCore`.

`src/index.js` becomes a thin daemon adapter. It alone loads `.env`, parses CLI
arguments, installs process listeners and the watchdog, maps startup failure to
`process.exit`, and calls the reusable composition. The public embedded path
never imports `src/index.js`; reusable composition never calls `process.exit` or
installs host-process listeners.

An `applicationId` labels session identities. It is not a schema, table, tenant,
or authorization boundary: tables remain shared unless the application applies
its own namespacing policy.

## Reuse comparison

- **REUSED:** `SqlCore.executeQuery(sql, params, {sessionId, ...options})` is
  the transaction-aware execution seam
  (`src/query/sql-query-engine-statement-execution.js:340-472`). All accepted
  SQL continues through its parser, router, and transaction coordinator.
- **EXTENDED:** the existing SQL runtime composition that mints the sole
  `SQLQueryEngine` (`src/entrypoint-runtime-admin-composition.js:325-426`) also
  mints a closure-bound application-database opener and liveness generation.
- **EXTENDED:** the existing seed/join startup and shared shutdown choreography
  (`src/index.js:309-408`, `519-617`) move mechanically into a reusable startup
  owner. It returns typed outcomes plus an internal runtime handle and uses the
  same idempotent cleanup steps for embedded stop and daemon process signals.
- **EXTENDED:** the side-effect-free package barrel (`src/public-api.js:1-26`)
  exports only the public lifecycle factory, handle errors, and application
  errors. Calling `start()` dynamically loads the reusable startup composition;
  importing the package does not.
- **NEW:** one facade owns session identity, strict input snapshots, typed error
  translation, transaction statement admission/drain, nesting refusal, and
  handle expiry. No raw SQLite or alternate planner is introduced.

This follows the system model: public request paths converge on the one
`SqlCore` (`architecture/system-model.md:236-255`).

## Public surface

```js
const runtime = createEmbeddedLagrange({configuration});
await runtime.start();
const db = runtime.openApplicationDatabase({applicationId: 'lagrange-images'});

const image = await db.transaction(async (tx) => {
  await tx.query('INSERT INTO images (id, body) VALUES (?, ?)', [id, body]);
  return tx.query('SELECT * FROM images WHERE id = ?', [id]);
});

await runtime.stop();
```

The handle has `start()`, `stop()`, and `openApplicationDatabase()`. A module-
level process claim is synchronously reserved before `start()` first awaits, so
two handles cannot both start. One embedded runtime may start per process
lifetime: `STOPPED` and `FAILED` are terminal, a stopped handle cannot restart,
and later handles remain refused because configuration, data-directory, logging,
node, and Raft providers are process-lifetime singletons.

## Consumed surfaces

| Surface | Use |
| --- | --- |
| `SqlCore.executeQuery` (`src/query/sql-query-engine-statement-execution.js:340-472`) | Execute ordinary and transaction-control SQL with an internally owned session id. |
| `createSqlRuntimeComposition` (`src/entrypoint-runtime-admin-composition.js:325-426`) | Bind the opener to the exact canonical engine and own its liveness generation. |
| Seed/join startup (`src/index.js:309-408`, `519-617`) | Move into the reusable startup owner and return the runtime handle after canonical engine hydration. |
| Shared shutdown (`src/entrypoint-runtime-shutdown-lifecycle.js:282-383`) | Extract idempotent cleanup from the process-exiting signal wrapper so `stop()` never exits the host. |
| Query result `{success,error,errorCode}` (`src/query/sql-query-engine-statement-execution.js:381-390`) | Translate failed results into stable public errors. |
| Package barrel and import proof (`src/public-api.js:1-26`, `test/release/public-api-side-effect-boundary.test.js:1-19`) | Export lifecycle without daemon import/start side effects. |

## Statement policy at the canonical parser

Ordinary `db.query()` and `tx.query()` calls carry an unexported application-
session marker. After the canonical SQL parser has classified the AST, `SqlCore`
refuses `BEGIN`, `COMMIT`, and `ROLLBACK` unless the same internal options record
also carries the unexported transaction-control capability. Only the facade's
transaction owner can create that record. There is no second SQL parser and no
raw-text transaction classifier.

`db.query()` called from an active callback delegates to that callback's
transaction queue. It cannot allocate an autocommit session that bypasses the
transaction's failure state.

## Transaction state machine

One callback transaction owns one captured primitive session id and these
states:

`OPEN -> DRAINING -> COMMITTING -> CLOSED`

or, before commit begins:

`OPEN -> DRAINING -> ROLLING_BACK -> CLOSED`

After `BEGIN` succeeds, each accepted statement is synchronously appended to
one serialized promise tail. When the callback settles, admission changes to
`DRAINING` before any await; the owner drains every already-admitted statement,
then rechecks the first statement/callback failure. This makes unawaited and
parallel calls deterministic and prevents COMMIT overtaking in-flight work.

Synchronous validation failure also records the transaction's first failure
before throwing, so catching it cannot permit commit. After the first failure,
later queued calls settle with that failure without reaching `SqlCore`. Every
inherited record except `CLOSED` counts as nested; only a closed delayed
descendant may begin a fresh top-level transaction.

Any statement failure dooms the transaction even if callback code catches the
promise. A pre-commit failure issues exactly one `ROLLBACK`. Once `COMMIT` starts,
it is the sole terminal decision: a failed, deferred, or uncertain commit is
propagated and the facade never issues a competing rollback. The coordinator
may already be `COMMITTING` when it reports failure
(`src/query/distributed/distributed-transaction-protocol.js:285-326`).

One `AsyncLocalStorage` instance per facade detects same-facade active nesting.
Separate top-level concurrent callbacks receive distinct session ids. A closed
record inherited by a delayed descendant is not considered nested, while a
captured transaction handle remains closed permanently.

## Strict public input contract

- `applicationId` and SQL are bounded primitive strings; boxed strings,
  coercible objects, symbols, and accessors are rejected.
- Params must be a genuine dense array with own data descriptors, bounded by
  the SQL bind-variable ceiling. Accepted elements are `null`, primitive
  strings, booleans, finite safe numbers (`-0` normalized to `0`), and
  non-shared `Buffer`/`Uint8Array` values. Strings and bytes are bounded; byte
  arrays are copied. `undefined`, bigint, symbols, functions, boxes, accessors,
  sparse slots, objects, other views, and shared buffers are rejected before
  the first await.
- Query callers cannot provide an execution-options object. Session id,
  transaction capability, dialect, deadlines, work class, or authorization
  identity therefore cannot be overwritten or forged through this first API.
- Runtime/factory option records must be plain or null-prototype own-data
  records. Configuration's exact recursive domain is `null`, boolean, bounded
  primitive string, finite safe number (`-0` normalized), dense bounded arrays
  of accepted values, and bounded plain/null-prototype own-data records.
  `undefined`, bigint, functions, symbols, accessors, sparse arrays, cycles,
  exotic prototypes, and the keys `__proto__`, `prototype`, and `constructor`
  are rejected at every depth before dynamic import. The consumer deep merge
  is also changed to descriptor-based own reads and assignments so a future
  missed validator cannot pollute ordinary targets.
- Factory creation snapshots the relevant ambient environment into an owned
  string map. The extracted startup owner and `ConfigurationManager.initialize`
  receive that snapshot explicitly; embedded startup never rereads live
  `process.env` and never parses CLI. The daemon snapshots environment only
  after `.env` loading and passes the same explicit contract.
- Implementation uses captured/imported intrinsics and null-prototype internal
  option records. It never spreads caller records or failed query results.

## Typed failure edges

| Edge | Code | Closed behavior |
| --- | --- | --- |
| Invalid lifecycle/factory input | `INVALID_ARGUMENT` | Reject before dynamic import or runtime mutation. |
| Concurrent second embedded runtime | `RUNTIME_ACTIVE` | Reject before starting another process-owned singleton graph. |
| Open before start / after stop | `RUNTIME_NOT_STARTED` / `RUNTIME_STOPPED` | No opener or stale core is returned. |
| Missing/invalid application id | `APPLICATION_ID_REQUIRED` | Reject before allocating a session. |
| Runtime generation invalidated | `RUNTIME_STOPPED` | Every existing facade/query fails before reaching a stopped core. |
| Canonical SQL composition has no router | `SQL_CORE_UNAVAILABLE` | Startup fails closed before returning an opener. |
| Invalid query/params/callback | `INVALID_ARGUMENT` | Reject before executing SQL. |
| Raw transaction-control SQL | `TRANSACTION_CONTROL_RESERVED` | Canonical parsed-AST boundary refuses it. |
| `SqlCore` returns `success:false` | Preserved owned `errorCode`, or `QUERY_FAILED` | Throw immutable `ApplicationDatabaseError`; copy only known retry/deferred metadata. |
| `SqlCore` throws | Preserved primitive `code`, or `QUERY_FAILED` | Wrap with `cause`; never spread the thrown value. |
| Nested active callback transaction | `TRANSACTION_NESTED` | Refuse before `BEGIN`. |
| Transaction handle after draining/settlement | `TRANSACTION_CLOSED` | Refuse before reaching `SqlCore`. |
| Callback/statement failure after `BEGIN`, before commit | Original typed error | Attempt one rollback. A rollback failure is normalized into the immutable `rollbackError` field without replacing the original error. |
| Failed/deferred/uncertain `COMMIT` | Commit typed error | Propagate it; issue no rollback. |

## Embedded lifecycle and shutdown ownership

The public handle state machine is
`CREATED -> STARTING -> STARTED -> STOPPING -> STOPPED`, with
`STARTING -> FAILED` on startup error. Start is single-flight. Stop during
`STARTING` records cancellation, cancels join backoff, waits for startup unwind,
and resolves at `STOPPED`; later starts are refused.

The extracted startup owner appends each acquired resource to an idempotent
cleanup ledger. Error or cancellation invalidates the application opener and
unwinds acquired resources in reverse order, including partial seed/join, SQL,
dynamic-config, persistence, and admin acquisition. Startup throws a typed
error through the public handle instead of exiting.

Application generation owns top-level operation leases. `db.query()` holds one
through result conversion; `db.transaction()` holds one from before `BEGIN`
through its sole terminal statement. Stop atomically closes admission and
invalidates new openers, then drains all admitted leases before engine cleanup.
Transaction statements reuse their parent lease while draining.

The drain has one repository-owned timeout. If user callback code does not
settle within it, `stop()` rejects with `RUNTIME_STOP_TIMEOUT`, leaves cleanup
pending, and does not tear down `SqlCore` underneath the callback. Cleanup runs
exactly once if operations later drain. The daemon adapter may retain its
existing process-exit policy after its signal budget; that policy is outside the
embedded lifecycle.

## Cached-view and identity audit

The facade introduces no schema, routing, or row cache. Its contextual view is
the ALS transaction record, invalidated by the explicit state machine. Runtime
liveness is a generation/lease owner created beside canonical SqlCore
composition. Stop closes admission, drains admitted leases, and only then
permits cleanup.

Each runtime opener is closure-bound to one canonical engine and one generation;
no public API accepts `sqlCore` or an `executeQuery` duck type. Each facade is
anchored to a validated application id. Each operation gets a fresh id from the
captured `node:crypto` `randomUUID` binding; every statement in one transaction
uses the same captured primitive id. The coordinator's actual ownership key is
that session id, not application id or ALS identity.

## Proof

A deterministic evidence harness reruns:

1. public-session tests covering unique identity, copied bind values, owned
   typed failures, raw control refusal at the real parser, failed-commit with no
   rollback, swallowed failure, unawaited statement draining, in-callback
   `db.query`, active nesting, closed ALS descendants, callback admission races,
   hostile inputs and intrinsics, runtime invalidation, and expired handles;
2. canonical lifecycle/composition tests covering the package-visible bound
   opener, a real reusable dry-run startup, no-router failure, typed public
   startup failure, same-tick process claims, stop during startup and join
   backoff, bounded transaction drain, application drain before owner cleanup,
   and reverse cleanup including abort immediately after acquisition; and
3. package import plus factory creation checks covering public exports, selected
   active resources, and process-listener snapshots.

The strict-input suite separately covers detached configuration and environment
snapshots, accessors, cycles, dangerous keys, mutable validation intrinsics, and
descriptor-based merge behavior. These claims intentionally match the named
tests; broader seed/join production behavior remains covered by the repository's
existing startup suites and release ratchets.
