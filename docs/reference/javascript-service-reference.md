---
audience: developer
documentClass: current
---

# JavaScript Service Reference

This is the canonical reference for authoring Lagrange services in JavaScript.
Lagrange services execute data-heavy operations near data as compiled WebAssembly
(WASI) components.

## Authoring Primitives

Lagrange provides a guest-safe authoring library in `src/authoring/` (exposed via the
`lagrange-server/authoring` package subpath and vendored into `authoring/` in
scaffolded projects). All descriptors are declarative, cycle-safe, and frozen.

### `defineService(definition)`

Root descriptor factory for defining a service. Supports the standard Fetch/Hono
application boundary (`fetch(request, context)`) as well as route handler tables:

```js
import {Hono} from 'hono';
import {defineService} from 'lagrange-server/authoring';

const app = new Hono();
app.post('/amounts/summary', async (c) => {
  const {accountId} = await c.req.json();
  const result = await c.env.lagrange.call(summarizeAmounts, {accountId});
  return c.json(result);
});

export default defineService({
  name: 'my-service',
  version: '0.1.0',
  operations: {
    summarizeAmounts,
  },
  fetch(request, context) {
    return app.fetch(request, context);
  },
});
```

- `name` (*string*): Kebab-case service name (`/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u`).
- `version` (*string*): Semantic version string (e.g. `'0.1.0'`).
- `operations` (*Record<string, DistributedOperation>*): Map of named distributed operations (may be empty `{}` for HTTP-only services on `service-cell-v2`).
- `fetch(request, context)` (*Function*): Standard Fetch entry returning `Response | Promise<Response>`, receiving `context.lagrange.call(operation, args)` (exposed in Hono as `c.env.lagrange.call`), `context.principal`, `context.tenantId`, `context.deadlineMs`, and `context.signal`.
- `mount` (*{host?: string, pathPrefix?: string}*): Optional service ingress mount (defaults to `pathPrefix: '/'`).
- `handlers` (*Record<string, RequestHandler>*): Map of named HTTP route handlers.

Service and operation identities derive strictly from explicit object keys, never from `Function.name`. Pre-successor single-operation `service-cell` artifacts are refused in successor mode with `legacy_artifact_rebuild_required` via `assertSuccessorServiceArtifact`.

### `distributed({statement, run, reduce})`

Defines a data-local distributed operation.

```js
import {distributed} from './authoring/distributed-operation.js';
import {sql} from './authoring/sql-template.js';

const summarizeAmounts = distributed({
  statement: sql`SELECT id, account_id, amount_cents FROM account_activity`,
  run: summarizeRun,
  reduce: summarizeReduce,
});
```

- `statement` (*SqlStatement*): SQL query descriptor created with `sql`.
- `run(rows, args, context)` (*Function*): Partition-local function executed on each partition leader host.
  - `rows` (*readonly object[]*): Shard batch of table rows matching `statement`.
  - `args` (*Record<string, unknown> | null*): Arguments passed from `context.call()`.
  - `context.emit(key, partial)` (*Function*): Host function emitting a partial reduction metric.
  - Returns execution metadata (e.g. `{matched: number, scanned: number}`).
- `reduce(partials, args)` (*Function*): Reducer function combining all emitted partials.
  - `partials` (*readonly [string, unknown][]*): Array of `[key, value]` pairs collected across shards.
  - `args` (*Record<string, unknown> | null*): Arguments passed from `context.call()`.
  - Returns the final combined result object.

### `http.get(path, route)` / `http.post(path, route)`

Defines an HTTP route handler descriptor.

```js
import {http} from './authoring/request-handler.js';

const amountSummary = http.post('/amounts/summary', {
  calls: [summarizeAmounts],
  handle: (request, context) => handleAmountSummary(request, context, summarizeAmounts),
});
```

- `path` (*string*): Route pathname (e.g. `'/amounts/summary'`).
- `route.calls` (*readonly DistributedOperation[]*): Allowlist of distributed operation descriptors this handler is authorized to invoke. Calling an undeclared operation fails closed.
- `route.handle(request, context)` (*Function*): Request handler function.
  - `request` (*ServiceRequest*): Inbound request envelope.
  - `context` (*HandlerContext*): Collaborator context providing `call` and `json`.

### `sql` Template Tag

Creates a frozen SQL statement descriptor.

```js
import {sql} from './authoring/sql-template.js';

const statement = sql`SELECT id, account_id, amount_cents FROM account_activity`;
```

- **No string interpolation allowed:** Calling `sql` with interpolations (e.g. `sql`SELECT * FROM t WHERE id = ${id}``) throws an `AuthoringError` immediately.
- Statement text is fixed at compilation and validated during deployment record generation. Dynamic filtering belongs inside `run()` or explicit call parameters.

## Request and Response Model

### `ServiceRequest`

Inbound HTTP requests are normalized by the ingress adapter into a frozen `ServiceRequest` object:

| Field | Type | Description |
| --- | --- | --- |
| `method` | `string` | Uppercase HTTP method (`'GET'` or `'POST'`). |
| `path` | `string` | Request pathname (e.g. `'/amounts/summary'`). |
| `headers` | `Readonly<Record<string, string>>` | Normalized forwarded headers (`accept`, `content-type`). |
| `query` | `Readonly<Record<string, string>>` | Parsed URL query parameters. |
| `body` | `Record<string, unknown> \| null` | Parsed JSON request body object, or `null` if no body was provided. |

*Security invariant:* Client authority headers (such as `x-principal`, `x-service-id`, `x-tenant-id`) are forbidden at public ingress and rejected with a typed routing failure before dispatch.

### `context.json(value, status = 200)`

Constructs an HTTP response envelope:

```js
return context.json({accountId, totalCents}, 200);
```

Returns `{body: string, status: number}` with `body` formatted as a JSON string and `status` set to the provided HTTP status code.

### `context.call(operation, args)`

Invokes a declared distributed operation:

```js
const summary = context.call(summarizeAmounts, {accountId: 101});
```

- `operation`: The operation handle declared in the route handler's `calls` allowlist.
- `args` (*Record<string, unknown> | null*): Serializable argument object passed to `run()` and `reduce()`.
- Dispatches synchronously through the host `lagrange:cell/context` bridge (`callBinding`).
- Calling an undeclared operation is rejected before dispatch.

## Execution Model

Lagrange compiles JavaScript services into WebAssembly (WASI) components using ComponentizeJS.

- **Synchronous Execution:** Service handlers, `run()`, and `reduce()` execute synchronously inside the guest WebAssembly runtime.
- **No Background Event Loop:** There are no background threads, microtask queue scheduling across host turns, or asynchronous timers (`setTimeout`, `setInterval`). Promises used within the guest must resolve synchronously.
- **Host Bridges:**
  - `lagrange:cell/context`: Host capability enabling synchronous `callBinding` invocations.
  - `lagrange:cell/call-context`: Host capability enabling synchronous `emit` partial reporting.

## SQL Selectors and Partition Input Bounds

- **Single-Table Literal Queries with Typed Narrowing:** The statement declared on a distributed operation must be a single-table `SELECT` with optional typed positional parameter predicates (`$1..$N`). Joins and multi-statement scripts are not supported in data-local operations.
- **Paged Shard Execution:** Each partition shard evaluates the selector locally in bounded pages of **4,096 rows** under an explicit per-shard row and byte cap (`maxShardRows`, `maxShardBytes`), invoking `run()` per page and merging shard-local contributions deterministically before returning to the coordinator.
- **Partition-Local Execution:** For each selected partition, `run()` executes on the node holding the leader replica for that partition, reading from that node's local storage engine.

## Partial Emission and Coordination Rules

Partials are intermediate structured or numeric values emitted by `run()` across partition shards and merged by `reduce()`:

1. **Bounded Canonical Finite-JSON v1 (`lagrange.partial.v1`):** Every emitted partial value must be a finite number or a bounded canonical JSON object, array, string, boolean, or null conforming to the declared `partialSchema` (`maxSerializedBytes`, `maxDepth`, `maxObjectKeys`, `maxArrayLength`). Emitting `NaN`, `Infinity`, functions, symbols, or values violating `partialSchema` fails closed with a typed coordination error.
2. **Per-Shard Emission Bound:** At most **64** `emit()` calls are permitted per partition shard page, bounded by the per-shard and total partial byte caps.
3. **Total Partial Bound:** The coordinator accepts at most **1,024** total partials across all shards for a single distributed invocation.
4. **Semantic Group Keys with Distinct Delivery Identities:** Multiple partition shards may emit the same semantic group key (such as `'all'` or a category key); each emission carries a distinct `(partitionId, shardBatchIndex, emitIndex)` delivery identity, and the coordinator sorts contributions deterministically before invoking `reduce()`.
   - *Example:* Emit by semantic group key or shard key:
     ```js
     emit('orders', { count: rows.length, revenueCents: totalCents });
     ```

## Unsupported Behaviors and Fail-Closed Guarantees

The following capabilities are deliberately unsupported in the guest sandbox and fail closed:

| Capability | Behavior | Failure Outcome |
| --- | --- | --- |
| Outbound Network (`fetch`, TCP/UDP) | Sockets and global networking APIs are absent from the WASI sandbox. | Runtime exception; sandbox traps. |
| Dynamic Code (`eval`, `new Function`) | Disabled in component sandbox. | Immediate compilation or runtime error. |
| Non-Finite or Schema-Violating Partials | `emit(key, NaN)`, `emit(key, Infinity)`, or payloads violating `partialSchema` bounds. | Typed coordination failure (`CALL_PARTIAL_SCHEMA_VIOLATION`). |
| Exceeded Shard or Partial Budgets | Input rows, pages, or emitted partial bytes exceeding configured caps. | Typed refusal (`CALL_SHARD_BUDGET_EXCEEDED` / `CALL_PARTIAL_BUDGET_EXCEEDED`). |
| Undeclared Outbound Calls | Calling an operation not listed in route `calls`. | Pre-dispatch policy rejection (`POLICY_VIOLATION`). |
| Interpolated SQL Statements | `sql`SELECT * FROM t WHERE id = ${id}``. | Immediate `AuthoringError` during service loading. |

## Project Structure and File Responsibilities

A standard service project generated with `lagrange service init <name>` has the following structure:

```text
my-service/
├── authoring/                     <- Vendored guest-safe authoring library
├── lagrange.service.js            <- Developer-edited: service and route declarations
├── package.json                   <- Developer-edited: npm scripts and metadata
├── src/
│   └── handler.js                 <- Developer-edited: endpoint logic (host unit-testable)
├── test/
│   └── handler.test.js            <- Developer-edited: host unit tests with mock context
└── .lagrange/                     <- Compiler-generated build artifacts
    ├── component.wasm             <- Compiled WebAssembly component
    ├── entry.js                   <- Generated component entrypoint
    ├── runtime-types.d.ts         <- Generated TypeScript declarations
    └── deployment/
        ├── access-policy.json     <- Outbound call permissions
        ├── bindings.json          <- Request and call binding declarations
        └── manifest.json          <- OCI service manifest
```

### Edit and Commit Responsibilities

- **Developer-Authored Files:**
  - `lagrange.service.js`: Define operations, SQL statements, and HTTP endpoints.
  - Handler file (`src/` directory, e.g. `handler.js`): Write business logic, data filtering, and response formation.
  - Unit test file (`test/` directory, e.g. `handler.test.js`): Write unit tests using plain JavaScript objects for mock `call` and `json` contexts.
  - Commit these files to version control.
- **Compiler-Generated Files (`.lagrange/`):**
  - Generated by `npm run build` (`lagrange service generate . && lagrange service build .`).
  - Contains build output, WASM bytecode, and deterministic lifecycle records.
  - **Never edit files in `.lagrange/` manually.** Any manual edits will be overwritten on the next build.
  - Add `.lagrange/` to `.gitignore` or treat as build artifacts.

## See Also

- [First Hour With Lagrange](../tutorials/first-hour.md)
- [The Lagrange Native Programming Model](../native-programming-model.md)
- [Execution Semantics](../execution-semantics.md)
- [The Lagrange System Model](../../architecture/system-model.md)
