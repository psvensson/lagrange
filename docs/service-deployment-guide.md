---
audience: human
documentClass: current
---

# Service Deployment Guide

This guide deploys a Lagrange service: the endpoints, partition functions,
and reducers you author together, packaged as WASM, installed through
lifecycle SQL, and run by the cluster as **Artifact / Binding / Cell**.

Two invocation surfaces are public today:

- **Endpoints** - `request` Bindings invoked over authenticated HTTP.
- **Distributed calls** - `call` Bindings that run a partition function on
  every relevant partition of a declared table, then a reducer over the
  emitted partials, invoked over authenticated pgwire with
  `CALL BINDING $1`.

The two surfaces compose: a request handler can invoke a declared call
Binding through its host context (`callBinding`), so one HTTP endpoint can
front a distributed call from the same immutable Artifact. The outbound
call must be authorized durably through the service access policy (below).

Packaging existing code as a WASI component gives you lifecycle, isolation,
restart, declared capabilities, and policy-controlled placement. The larger
data-local wins appear when the service uses the Lagrange context instead
of direct database endpoints, and when a data-intensive hot path becomes a
call Binding: a partition function plus a reducer against a declared data
selector.

Read [The Lagrange Native Programming Model](native-programming-model.md)
before choosing an application boundary. This guide does not use the older
uploaded JavaScript callback rehearsal.

## Decide What You Are Deploying

| Part of the service | Deployment surface |
| --- | --- |
| An externally callable endpoint | `request` Binding invoked over authenticated HTTP |
| A data-intensive operation over one table | `call` Binding: partition function + reducer + declared `SELECT` statement |
| Existing portable code, unchanged | Package it as a WASI component behind a request Binding first |

Do not assume that moving an unchanged service into the cluster changes its
data movement. If it still retrieves the same rows or aggregates into the
same service process, the algorithm and boundary remain the same. The data
movement changes when the scan-and-reduce part of the request becomes a
call Binding, because then only partials cross the network.

## The Four Objects At The Boundary

### Artifact

An **Artifact** is installed immutable code plus a schema-v3 manifest and a
digest-pinned payload.

Since the cluster-owned artifact store landed, `INSTALL SERVICE`
internalizes the verified WASM payload into replicated internal tables
(chunked, digest-verified, sealed) **before** any catalog row is written -
the external OCI source is an installation input, not a runtime dependency.
A wasm_component Artifact does not become bindable until its payload is
sealed. At activation, the node-local loader resolves the content-addressed
disk cache first, then reconstructs from the internal store (verifying every
chunk and the reassembled digest, then populating the cache atomically), and
only then falls back to the external repair source. Losing every local cache
does not make an installed service unavailable; the filesystem holds caches,
never canonical Artifacts.

### Binding

A **Binding** is immutable desired execution intent: one Artifact export,
one source kind, budgets, and no caller-selected replica count.

The catalog accepts `request`, `change`, `time`, `once`, `boot`, `call`,
and `pushdown` sources. Two of them have public invocation adapters today:
`request` (authenticated HTTP) and `call` (authenticated pgwire
`CALL BINDING $1`). The `change`, `time`, `once`, `boot`, and `pushdown`
kinds can be declared and converge to placed Cells but are declared-only -
they have no public invocation surface yet.

### Cell

A **Cell** is a ready running actual derived from a Binding. The cluster
chooses capacity and placement. Cells are disposable compute; durable
service state belongs in ordinary partitioned and replicated tables.

### Context

The **context** is the capability-controlled host interface available to
the component. It is the application/kernel boundary and the source of
attributed service data access.

The current request-component context (`lagrange:cell/context`) is:

```wit
interface context {
  read: func(table: u32, key: u32) -> s32;
  write: func(table: u32, key: u32, value: s32);
  capability: func(capability: u32) -> s32;
  call-binding: func(name: string, arguments: string)
    -> result<string, binding-call-error>;
}
```

Table numbers are capability slots resolved through the service-access
declaration. `call-binding` invokes a declared call Binding by name from a
request invocation; it is live only when the durable access policy
authorizes the target, and fails closed with a typed error everywhere
else. A component must not contain a database endpoint, connection pool,
partition map, or node-selection policy.

Call-Binding components use a second world, `lagrange:cell/call-context`,
whose central import is `emit` - the channel through which a partition
function publishes its partial result. It is described in
[Call Bindings](#call-bindings-partition-functions-and-reducers) below.

## What Lagrange Can Learn From Context Access

Successful statements issued with the service identity are attributed to
the partitions they actually execute against. That evidence can influence:

- slow topology-time placement of runtime-service Cells;
- node and latency-group affinity weights;
- local or same-latency-group read candidate ordering; and
- diagnostics explaining why a Cell was placed where it was.

This is why using the context is not merely syntactic. Direct external
database connections lose the execution identity and partition-access
evidence that makes automatic data affinity possible.

See [Process: Data Affinity](../architecture/process-data-affinity.md) for
the full mechanism.

## Lifecycle SQL

Lifecycle commands use one JSON bind parameter so code, configuration,
idempotency, and authenticated identity stay separate:

```sql
INSTALL SERVICE $1;
UPGRADE SERVICE $1;
REMOVE SERVICE $1;
SHOW SERVICE $1;
SHOW SERVICES;
CONFIGURE SERVICE ACCESS $1;
CREATE BINDING $1;
CALL BINDING $1;
```

External lifecycle control uses authenticated PostgreSQL wire ingress.
Trust mode is loopback-only development policy and is not accepted for
external lifecycle control.

## Deployment Sequence

1. Identify the smallest service or hot-path boundary you want to deploy.
2. Package a component and schema-v3 manifest.
3. Use `INSTALL SERVICE` with an artifact source and idempotency key.
4. Record the returned immutable `package_id`; compute the
   `manifest_digest` yourself (sha256 of the canonical manifest JSON).
5. Use `CREATE BINDING` to pin an export and source to that Artifact.
6. Use `CONFIGURE SERVICE ACCESS` to grant the minimum table slots and
   modes - and, for a composed service, the outbound-call allowlist.
7. Observe desired state in `service_definitions`.
8. Wait until a matching actual row is ready and running; that actual is a
   Cell.
9. Invoke: an authenticated HTTP request for a request route, or
   `CALL BINDING $1` over authenticated pgwire for a call Binding.
10. Verify allowed access, denied access, durable effects, and placement
    evidence.

The manifest format is documented in
[Lagrange Service Manifest](../architecture/lagrange-service-manifest.md).
The owner and convergence model is
[Minimal Deployment Surface](../architecture/minimal-deployment-surface.md).

## Configure Service Access

`CONFIGURE SERVICE ACCESS $1` is the durable authorization surface for a
Binding's runtime authority. A schema-v1 payload grants table slots:

```json
{
  "schema_version": 1,
  "binding_name": "js-request-binding-example",
  "tables": [
    {"slot": 0, "table": "table:global.js_request_binding_ledger",
     "operations": ["read", "write"]}
  ]
}
```

A schema-v2 payload additionally declares the request Binding's
outbound-call allowlist - the call Bindings its `callBinding` host import
may invoke:

```json
{
  "schema_version": 2,
  "binding_name": "account-summary-http",
  "tables": [],
  "calls": [{"binding": "account-summary-inner"}]
}
```

The `calls` semantics are fail-closed at every edge: an absent policy means
no outbound calls, an empty list means no outbound calls, and a target not
on the list is refused with a typed `target_not_allowed` before route
resolution or dispatch. Targets are tenant-local Binding names - sorted,
unique, bounded in count, with no wildcards. Observed calls never grant
authority; only the declared policy does.

## Endpoint Example: A JavaScript Request Component

Services can be authored in any language with a WASI-component toolchain.
For JavaScript, ComponentizeJS compiles a plain module into a genuine WASI
component.

```js
import {read, write} from 'lagrange:cell/context';

const LEDGER = 0;

export function run(requestJson) {
  const request = JSON.parse(requestJson);
  const {key, amount} = request.body;
  const total = read(LEDGER, key - 1) + amount;

  write(LEDGER, key, total);

  return JSON.stringify({
    status: 202,
    headers: [['content-type', 'text/plain']],
    body: `stored ${total} at key ${key}`,
  });
}
```

The build disables random, stdio, clocks, HTTP, and fetch-event imports, so
the component imports only `lagrange:cell/context`. The access declaration
maps slot `0` to the ledger table with read/write permission. An attempt to
use an undeclared slot is denied at the component boundary.

Run the complete example:

```sh
node examples/js-request-binding-deployment/run-js-request-binding-deployment.js
```

The
[JavaScript request-binding README](../examples/js-request-binding-deployment/README.md)
explains the source, WIT world, lifecycle SQL, expected output, and denial
case.

To build a component from committed WAT source instead:

```sh
node examples/request-binding-deployment/run-request-binding-deployment.js
```

Prerequisites are Node.js 22.12+, installed repository dependencies, and
`wasm-tools` on `PATH`. See the
[request-binding-deployment README](../examples/request-binding-deployment/README.md)
for exact assertions and expected output.

## Call Bindings: Partition Functions And Reducers

A call Binding is how the distributed part of the service ships. One
component carries both halves of the operation:

- `run` - the **partition function**. Lagrange invokes it once per relevant
  partition, on the node hosting that partition's replica, with a typed
  batch of rows read locally from that replica.
- `reduce` - the **reducer**. Lagrange invokes it exactly once, with the
  complete set of emitted partials, to produce the final result.

Raw rows never leave the host nodes. Only the emitted partials travel to
the reducer, and only the reduced result returns to the caller.

### The Guest Contract

The call-cell WIT world:

```wit
world call-cell {
  use call-context.{row};
  import call-context;
  export run:    func(batch: list<row>, arguments: string) -> string;
  export reduce: func(partials: list<tuple<string, string>>,
                      arguments: string) -> string;
}
```

Rules the guest must follow:

- `run` receives one typed `list<row>` per partition - up to `4096` rows by
  default. Rows map SQL values to a `cell-value` variant (`null`, `s64`,
  `f64`, `text`); unsafe integers, non-finite floats, and blobs are refused
  rather than silently coerced.
- Partials leave `run` through the host import `emit(key, partial)`, not
  through the return value. The `run` return value is component bookkeeping
  and is not coordinated.
- Each emitted partial must be a JSON finite number. Today the reduce
  coordination gate supports numeric per-group aggregation values only, not
  arbitrary partial structs.
- Group keys must be disjoint across partitions. A duplicate key across
  shards fails the call with a typed error instead of merging wrong data.
- `reduce` is a second export in the same component - not a separate
  artifact, not host-side code. Its return value is the call's result.
- Default budgets: `64` `emit` calls per invocation, `1,024` partial
  entries, a `30 s` deadline per call. Shard dispatch is parallel and
  bounded (`maxConcurrentShardRuns`, default `8`); same-host shards
  serialize.

The normative WIT package is the committed authoring artifact at
[`wit/world.wit`](../wit/world.wit); examples and tests compile against
it directly.

### Manifest

The manifest declares the `run` export under the `call_v1` interface:

```json
{
  "schema_version": 3,
  "runtime": {"kind": "wasm_component"},
  "exports": [{"interface": "call_v1", "name": "run"}]
}
```

A composed service declares its HTTP entry point in the same manifest as a
second export (`{"interface": "request_v1", "name": "handle-request"}`) -
one Artifact, two Bindings; see the flagship example below.

(Plus the usual `artifact` block with `ref`, `digest`, and
`media_type: "application/wasm"`.) Only the Binding's target export name is
validated against the component's real exports; the `reduce` export is not
declared in the manifest but must exist in the component.

### Binding

The call Binding names the export and declares the data selector:

```json
{
  "schema_version": 2,
  "name": "shard-ratings-top",
  "target": {
    "package_id": "<from the INSTALL SERVICE receipt>",
    "manifest_digest": "<sha256 of the canonical manifest JSON, computed client-side>",
    "export_name": "run"
  },
  "source": {
    "kind": "call",
    "name": "shard-ratings-top",
    "statement": "SELECT id, score, label FROM shard_ratings"
  },
  "budgets": {"...": "closed budget set, see below"}
}
```

- The `statement` must be a single-table `SELECT`. Anything else is
  rejected with `call_cell_statement_invalid`.
- The `statement` is optional in the schema, but it is what makes a call
  Binding invocable. A statement-less call Binding is a valid durable
  registration that fails closed with `call_cell_not_invocable` when
  called.
- Budgets are a closed set with hard ranges:

| Budget | Range |
| --- | --- |
| CPU time | 1–60,000 ms |
| Wall time | 1–300,000 ms |
| Memory | 1 B – 1 GiB |
| Input / output size | 0 – 16 MiB |
| Context size | 0 – 64 MiB |

The sealed field-level contract is
[Minimal Deployment Surface](../architecture/minimal-deployment-surface.md).

### Invoking With CALL BINDING

The client sends the literal statement with exactly one bind parameter:

```sql
CALL BINDING $1;
```

`$1` is a single JSON string, at most 1 MiB:

```json
{"schema_version": 2, "name": "shard-ratings-top", "arguments": {"topN": 3}}
```

- `schema_version` and `name` are required; `arguments` is optional and
  must be a JSON object (default `{}`).
- Unknown fields are refused. There is no `tenant_id` field - tenant
  identity comes from the authenticated session only.
- A successful call returns exactly one row with two columns: `name` (the
  called binding's name) and `result` (the final reduced JSON string from
  the guest `reduce` export). `changes` is `0`.

Authentication is fail-closed. `CALL BINDING` maps to the distinct pgwire
authorization action `pgwire.binding.call`, which is in the password-mode
default action set and **not** in trust mode. A session lacking the action
is rejected before any dispatch.

### What Happens At Runtime

1. Planning parses the declared statement and resolves the relevant
   partitions without fetching a single row.
2. Each partition's run is dispatched to the node hosting that partition's
   leader replica; the receiver builds the row batch from its own local
   replica.
3. If no Cell is running on a required host node, a bounded activation
   lease pins one there and the call retries until it is ready or the
   deadline lapses.
4. Emitted partials are coordinated per invocation; the reducer runs
   exactly once, under a dedicated lease, over a complete and fresh partial
   set, and one atomic result snapshot is published.
5. Partition or replica movement mid-call surfaces as a typed retryable
   error - never a silently wrong result.

The full retry, idempotency, movement, and reduction contract is in
[Execution Semantics](execution-semantics.md).

### Current Call-Path Boundaries

Stated plainly:

- pgwire is the direct ingress for `CALL BINDING`; there is no
  client-SDK surface, and no caller-supplied idempotency key on the direct
  pgwire path. HTTP reaches a call Binding through composition: a request
  handler invokes a policy-declared target via `callBinding` (at most one
  nested call per request, child identity `<outer>#call-1`, effective
  deadline `min(outer request deadline, call Binding deadline)`).
- Partials are numeric per-group aggregation values only.
- Shard dispatch is parallel and bounded (default 8 concurrent runs);
  shards on one host node serialize (one active invocation per Cell).
- The call-world `call-bounded` nested-call import exists in the WIT world
  but the host always denies it; request-side composition uses the
  separate `callBinding` context import.
- The runnable call-path example is
  [`examples/call-binding-account-summary`](../examples/call-binding-account-summary/README.md):
  an HTTP handler, partition function, and reducer in one file, deployed
  as one Artifact behind a request Binding and a call Binding, invoked
  over HTTP and directly with `CALL BINDING $1` across two partitions. The
  live invocation shape is also exercised in
  `test/integration/minimal-deployment-call-cell-invocation-live.integration.test.js`.

## From Deployment To A Partition-Function Rewrite

After the first component works, inspect the operation rather than
immediately moving more services.

Ask:

- How many database statements does one request execute?
- How many rows or aggregates cross into the service?
- Do several statements touch the same partition key?
- Can each partition return a bounded partial result?
- Which code is application policy that should remain versioned code?
- Which external calls must stay outside the data-local function?

A good extraction keeps authentication and third-party I/O in the outer
service and moves only the data-intensive operation into the partition
function.

The detailed MovieLens walkthrough in
[Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md) compares
a strong grouped-SQL baseline with shard-local scoring and bounded top-N
reduction, and states exactly which parts are runnable today.

## Current Invocation Boundary

Current public support:

- externally installed genuine WASI components;
- request Bindings invoked through authenticated HTTP;
- call Bindings invoked through authenticated pgwire `CALL BINDING $1`,
  with data-local partition functions, numeric per-group partials, and a
  single reducer;
- HTTP-to-call composition: a request handler invoking a declared call
  Binding through `callBinding`, authorized by the v2 access policy;
- `read`, `write`, `capability`, and `call-binding` context imports in the
  request world; `emit` in the call world;
- declared table-slot access and capability denial;
- service identity attribution and data-affinity placement; and
- Artifact / Binding / Cell lifecycle through authenticated SQL.

Not yet public:

- invocation adapters for `change`, `time`, `once`, `boot`, and `pushdown`
  sources (declared-only);
- structured or non-numeric partial values;
- concurrent invocations on one Cell instance (same-host shards serialize);
- nested `call-bounded` invocation in the call world, and call chains
  deeper than one bridged call per request; and
- managed OCI container activation.

Use
[Current Capabilities And Limitations](current-capabilities-and-limitations.md)
as the authoritative status page.

## Runtime Status

- `wasm_component`: the product runtime. Externally installable; runs
  genuine WASI component Cells in both the request and call worlds.
- `native_js`: kernel-internal, not externally installable.
- `oci_container`: compatibility scaffold only - descriptor and in-memory
  lifecycle, no managed container activation. It is not a peer deployment
  option; code that cannot yet run as WASM has no supported managed path
  today.
