---
audience: human
documentClass: current
---

# The Lagrange Native Programming Model

Lagrange is a distributed runtime for data-intensive services. You write one
service — endpoints, partition functions, and a reducer together — deploy it
as a WASM component, and existing applications call its endpoints like any
other service. Lagrange runs each part of a request on the database nodes
holding the relevant data and combines the results.

> Colocated in source. Distributed in execution.

This document teaches the model in order: the service, its endpoints, the
partition functions, the reducer, and the data-local execution underneath.
Everything written in the present tense here is implemented and exercised by
tests at the current head. Intended extensions are collected in one clearly
labeled [Direction](#direction-not-yet-implemented) section — nowhere else.

For a complete before-and-after walkthrough, continue to
[Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md).

## The Service

The thing you build, version, deploy, observe, and call is a service. It is
declared through three nouns:

### Artifact

An **Artifact** is immutable, digest-pinned service code and its manifest.
The runtime kind is part of the artifact contract. Genuine WASI components
are externally installable today; WASM is the packaging and isolation format,
not the product idea.

### Binding

A **Binding** connects one Artifact export to an invocation source and its
budgets. The Binding describes execution intent; callers do not choose nodes
or replica counts.

`request`, `change`, `time`, `once`, `boot`, `call`, and `pushdown` are
accepted source kinds. Two of them are publicly invocable today:

- `request` — an HTTP endpoint on the main REST listener;
- `call` — a data-local invocation over authenticated pgwire.

The remaining kinds (`change`, `time`, `once`, `boot`, `pushdown`) can be
declared and placed but have no public invocation adapter yet. Current status
remains authoritative in
[Current Capabilities And Limitations](current-capabilities-and-limitations.md).

### Cell

A **Cell** is a ready running instance derived from a Binding. Cells are
replaceable compute. Durable state belongs in ordinary partitioned and
replicated tables, not in a Cell-local disk or memory contract.

The cluster decides Cell capacity and placement. Application code must not
select a machine, discover a partition leader, or assume that the same Cell
will handle the next request.

### Context

The **context** is the boundary between portable application code and the
Lagrange kernel. It supplies declared capabilities and attributes data access
to the invoking service. That attribution is what lets the cluster learn
where the service should run.

A useful rule is:

> Code receives data access and locality through the context; it never
> selects machines or database endpoints.

## Endpoints

An endpoint is the externally callable entry point of a service. There are
two live endpoint kinds.

### Request endpoints (HTTP)

A request Binding declares an exact method and path. The main REST listener
routes matching requests to a ready Cell, which runs the component's `run`
export with a JSON envelope in and out. The request-cell world is
intentionally small:

```wit
package lagrange:cell;

interface context {
  read: func(table: u32, key: u32) -> s32;
  write: func(table: u32, key: u32, value: s32);
  capability: func(capability: u32) -> s32;
}

world request-cell {
  import context;
  export run: func(request: string) -> string;
}
```

A JavaScript component imports the host functions directly:

```js
import {read, write} from 'lagrange:cell/context';

const LEDGER = 0;

export function run(requestJson) {
  const request = JSON.parse(requestJson);
  const {key, amount} = request.body;

  const previousTotal = read(LEDGER, key - 1);
  const total = previousTotal + amount;
  write(LEDGER, key, total);

  return JSON.stringify({
    status: 202,
    headers: [['content-type', 'text/plain']],
    body: `stored ${total} at key ${key}`,
  });
}
```

This code has no connection string, pool, node address, partition identifier,
or leader lookup. Slot `0` is resolved through the service-access
declaration. An undeclared read or write is denied at the component boundary.

The complete runnable version is in
[`examples/js-request-binding-deployment`](../examples/js-request-binding-deployment/README.md).
It compiles JavaScript into a genuine WASI component, installs the Artifact,
creates the Binding, declares table access, waits for a Cell, invokes it over
HTTP, and verifies both allowed and denied access.

### Call endpoints (pgwire `CALL BINDING`)

A call Binding is the data-local endpoint. The client sends one literal
statement over an authenticated pgwire session:

```sql
CALL BINDING $1
```

`$1` is a single JSON string parameter (max 1 MiB):

```json
{"schema_version": 2, "name": "top-ratings", "arguments": {"topN": 3}}
```

`schema_version` and `name` are required; `arguments` is an optional JSON
object. Unknown fields are refused — tenant identity comes from the
authenticated session, never from the payload. The statement maps to its own
pgwire authorization action (`pgwire.binding.call`) and fails closed for
sessions that lack it.

The result is one row: `{name, result}` where `result` is the final reduced
JSON produced by the service's reducer.

pgwire is the only ingress for call endpoints today. There is no HTTP route
and no JavaScript client SDK for them.

## Partition Functions

A partition function is the code Lagrange executes on each relevant data
partition. On the call path it is the component's `run` export, and the data
it operates on is selected by the Binding, not by the caller:

```json
{
  "schema_version": 2,
  "name": "top-ratings",
  "target": {
    "package_id": "<derived from manifest>",
    "manifest_digest": "sha256:…",
    "export_name": "run"
  },
  "source": {
    "kind": "call",
    "name": "top-ratings",
    "statement": "SELECT id, score, label FROM shard_ratings"
  },
  "budgets": {
    "cpu_time_ms": 1000,
    "wall_time_ms": 10000,
    "memory_bytes": 67108864,
    "input_bytes": 65536,
    "output_bytes": 65536,
    "context_bytes": 4096
  }
}
```

The `statement` is the data selector: a single-table SELECT, fixed when the
Binding is created. Anything else is refused typed
(`call_cell_statement_invalid`). A call Binding without a statement is a
valid durable registration but is not invocable (`call_cell_not_invocable`).
Per-call variation rides in `arguments`, not in the SQL.

The guest ABI is the `call-cell` WIT world. Its essential shape:

```wit
world call-cell {
  use call-context.{row};
  import call-context;
  export run:    func(batch: list<row>, arguments: string) -> string;
  export reduce: func(partials: list<tuple<string, string>>,
                      arguments: string) -> string;
}

interface call-context {
  variant cell-value { null-value, integer(s64), real(f64), text(string) }
  record column { name: string, val: cell-value }
  record row { columns: list<column> }
  enum deny-code { undeclared-capability, budget-exhausted, invalid-argument }
  emit: func(key: string, partial: string) -> result<_, deny-code>;
  call-bounded: func(export-name: string, argument: string)
    -> result<string, deny-code>;
}
```

`run` receives one typed `list<row>` per partition — the Binding statement's
rows, fetched locally on the node hosting that partition. The SQL-to-WIT
value mapping is fail-closed: unsafe integers, non-finite floats, and blobs
have no variant and refuse rather than corrupt.

Partials leave the function through the `emit(key, partialJson)` host import,
not through the return value (the `run` return value is component bookkeeping
and is not coordinated). Two hard rules apply today:

- the partial value must be a finite number — the coordination gate supports
  numeric per-group aggregation values only;
- group keys must be shard-disjoint — two shards emitting the same key is a
  typed refusal (`call_cell_reduce_incomplete`), never a silent double count.

A minimal partition function, condensed from the repository's exercised
call-cell guest fixture:

```js
import {emit} from 'lagrange:cell/call-context';

function col(row, name) {
  for (const column of row.columns) {
    if (column.name === name) return column.val;
  }
  return {tag: 'null-value'};
}

export function run(batch, argumentsJson) {
  const {topN} = JSON.parse(argumentsJson);
  const scored = [];
  for (const row of batch) {
    const id = col(row, 'id');
    const score = col(row, 'score');
    if (id.tag !== 'integer' || score.tag !== 'real') continue;
    scored.push({id: String(id.val), score: score.val});
  }
  scored.sort((a, b) => b.score - a.score);
  for (const {id, score} of scored.slice(0, topN)) {
    emit(id, JSON.stringify(score)); // numeric partial per group key
  }
  return JSON.stringify({considered: scored.length});
}
```

The world file currently ships in-repo at
`test/wasm-service/fixtures/call-cell-world/wit/world.wit`. Publishing it as
a first-class authoring artifact is an open item; the ABI itself is real and
proven through ComponentizeJS build, jco transpile, and host instantiation.

## Reducers

The reducer combines partial results into the endpoint response. It is a
second export — `reduce` — in the same component as the partition function.
One source file, one artifact, one deployment:

```js
export function reduce(partials, argumentsJson) {
  const {topN} = JSON.parse(argumentsJson);
  return JSON.stringify(
    partials
      .map(([key, partial]) => ({key, score: JSON.parse(partial)}))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN));
}
```

Before `reduce` runs, the coordinator enforces a completeness gate: every
expected shard slot present, no lease expired, no stale partial, every entry
a bounded `{groupKey, finite number}` pair. The merged input is deterministic
— value descending, then group key — so the reducer sees the same input for
the same partials regardless of arrival order.

The result is published as exactly one atomic snapshot per complete partial
set, with a witness naming every contributing replica. The guarantee is
**exactly-once visibility, not exactly-once execution**: a shard run may be
retried, but only one coherent result becomes visible.

One authoring wrinkle to know: the manifest declares only the `run` export
(`interface: call_v1`); `reduce` is resolved on the wire and is not
manifest-validated today.

## Data-Local Execution

What actually happens when a client sends `CALL BINDING $1`:

```text
CALL BINDING $1  (authenticated pgwire)
  │
  ├─ plan: parse the Binding statement, resolve partitions
  │        (no rows are fetched at the coordinator)
  ├─ for each partition:
  │    dispatch run to the node hosting that partition's leader replica
  │      └─ the node reads its OWN local replica → typed batch → run
  │      └─ run emits bounded numeric partials
  ├─ completeness gate over all shard slots
  └─ reduce, once, under a dedicated lease → one atomic snapshot → response
```

The load-bearing properties, each with two-node integration evidence:

- **Rows never leave the host node.** The shard batch is built from the
  node's own partition replica. In the two-node proof, shard-table query
  deliveries across the wire are exactly zero — the network carries partials
  and the final result, not rows.
- **Missing compute is activated, not errored.** If no ready Cell exists on
  a partition-host node, the invoker publishes a bounded activation lease;
  the placement planner pins a replica there; the invocation retries until
  ready or its deadline lapses. An expired lease stops pinning and the
  normal surplus cure removes the replica.
- **Movement is fenced, not raced.** Route drift, partition supersession,
  receiver ownership changes, and reduce-lease movement all surface as the
  typed retryable `call_cell_target_stale` — never a wrong result.
- **Failures are typed.** Every failure carries a `call_cell_*` code and a
  `terminal | retryable | ambiguous` classification; retries happen only for
  retryable failures where the component was provably not invoked.

Headline defaults (all per-deployment tunable): 30 s ingress deadline,
4096 rows per shard batch, 64 `emit` calls per invocation, 1024 partial
entries per slot. The full contract — retries, idempotency, ordering,
budgets, movement — lives in
[Execution Semantics](execution-semantics.md).

## What A Hot-Path Rewrite Buys

### 1. Computation moves instead of rows

A conventional service asks the database for rows or per-key aggregates,
moves them into an application process, and applies business logic there. A
partition function lets each shard filter, transform, score, or aggregate
its own rows and emit only a bounded partial.

For a top-10 operation across `R` participating shards, the exchange is
bounded near `R × 10` candidates instead of every matching row or every
group.

### 2. Network round trips collapse

A sequence such as read, validate, read related state, write, and audit
normally crosses a client/database boundary repeatedly. When those steps
belong to one partition-local operation, routing, serialization, and network
latency are paid once rather than once per statement.

Raft does not disappear. A committed write still reaches the leader and a
quorum. The saving is the avoidable application-to-database path around the
consensus work.

### 3. Placement becomes data-driven

A generic container scheduler can place a service in a region or
availability zone. It normally cannot infer which database partitions each
service replica actually uses.

Lagrange attributes successful service reads and writes to their executed
partitions. Fresh access evidence becomes node and latency-group weights:

- reads credit every node holding an active replica;
- writes credit the leader's node; and
- placement hysteresis prevents weak gradients from causing oscillation.

The call path adds a direct mechanism on top: activation leases pin compute
onto the exact nodes an invocation needs. See
[Process: Data Affinity](../architecture/process-data-affinity.md).

### 4. The code stops owning topology

Native code does not manage connection pools per shard, cache partition
maps, retry a guessed leader, or redeploy when a partition splits. Those are
kernel responsibilities.

This is both a performance and maintenance win. A topology optimization that
would otherwise decay becomes continuously reconciled cluster state.

### 5. Capabilities and failure semantics become explicit

The context is capability-controlled. The manifest and access declaration
state which tables and modes an Artifact may use; undeclared access fails at
the component boundary. On the call path, the security context (tenant,
principal, roles) is server-derived from the authenticated session — a
payload cannot claim an identity.

Invocation identity, deadlines, typed retry classification, and a durable
idempotency fence are already part of the call contract, not application
homework. See [Execution Semantics](execution-semantics.md).

### 6. Application logic can stay application logic

Data-local execution is not an argument for turning all policy into SQL. A
partition function uses normal language constructs, tests, versioning, and
packaging while executing beside its data. SQL remains the right tool for
many filters and aggregates; code is valuable where policy becomes awkward,
changes frequently, or needs reusable libraries.

The best result is often a combination: the Binding statement narrows
locally, the function applies application policy, and reduction moves only
bounded partials.

## Choosing What To Rewrite

Good first candidates have one or more of these properties:

- they fetch substantial data only to filter, score, aggregate, or transform
  it;
- they perform several sequential database calls on the same partition key;
- latency is dominated by service-to-database round trips;
- they require custom logic that is cumbersome as stored procedures;
- they fan out across partitions and can return bounded partial results; or
- application and database topology have to be tuned together manually.

Given today's surface, also check: the data selector is a single-table
SELECT, the per-group partial is a number, and group keys are disjoint
across shards.

Poor first candidates are mostly external I/O, call many third-party
services, move little data, or already complete in one cheap indexed query.

## A Practical Migration Pattern

Keep the outer service and extract one hot path:

```text
existing API service
  ├─ authentication and HTTP policy
  ├─ third-party integrations
  └─ CALL BINDING $1  (name + arguments)
       ├─ partition A: run() → bounded numeric partials
       ├─ partition B: run() → bounded numeric partials
       └─ reduce(): partials → response
```

Measure before and after using:

- requests and statements per operation;
- bytes crossing the service/database boundary;
- partitions and replicas touched;
- p50, p95, and p99 latency after warm-up;
- CPU consumed in the service tier and storage tier;
- retries and failure amplification; and
- operational configuration removed.

Do not claim an automatic speedup from deployment alone. The gain depends on
how much avoidable movement and coordination the original hot path contains.

## Direction (Not Yet Implemented)

Everything in this section is intended API, honestly labeled. None of it is
a supported surface today.

**A `ctx.call()`-style client.** The intended developer sugar names data
plus operation from inside application code:

```js
// Intended API — not yet implemented. Today the data selector is the
// Binding-declared statement and the ingress is pgwire CALL BINDING $1.
const result = await lagrange.call({
  data: {table: 'ratings', where: {movieId: {between: [first, last]}}},
  function: 'rank-movies',
  arguments: {priorMean: 3.5, priorWeight: 25, limit: 10},
  reduce: 'merge-top-movies',
});
```

The shape of this call exists today — the selector is the Binding
`statement`, `function` is the `run` export, `reduce` is the `reduce`
export, and arguments ride the `CALL BINDING` payload — but the surface is
SQL over pgwire, not a JavaScript client, and the selector is fixed at
Binding time rather than per call.

**Structured partials.** The coordination gate accepts finite numbers per
group key. Richer per-group structs (count + sum + max, sketches) are
future work.

**Concurrent runs per Cell instance.** Shard dispatch is parallel and
bounded (`maxConcurrentShardRuns`, default 8): shards on distinct host
nodes overlap, but a single component instance runs one invocation at a
time, so same-host shards serialize. Lifting that per-instance limit is
future work.

**Nested calls.** `call-bounded` is declared in the WIT world but the host
always denies it today.

**`pushdown`.** The Binding kind is accepted, compiles, and places, and the
runtime would execute it — but no routing surface can select it. It is
declared-only, reserved for query-planner-initiated invocation.

**HTTP ingress for call endpoints** and a typed capability enum for the
call context are likewise open.

## Continue

- [Execution Semantics](execution-semantics.md) — the contract: retries,
  idempotency, budgets, movement, exactly-once visibility.
- [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md) — a
  best-of-breed baseline and the data-local rewrite, end to end.
- [Service Deployment Guide](service-deployment-guide.md) — install an
  Artifact, create a Binding, declare access, invoke.
- [Examples index](../examples/README.md) — runnable examples, including
  the current call-path status.
- [Minimal Deployment Surface](../architecture/minimal-deployment-surface.md)
  — the sealed design contract behind Artifact, Binding, Cell, and the call
  surface.
- [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
  — the generated status authority.
