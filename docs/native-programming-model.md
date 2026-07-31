---
audience: human
documentClass: current
---

# The Lagrange Native Programming Model

Lagrange can run portable artifacts, but packaging is not the main architectural
win.

A WASM component or, in the future, an OCI container can be deployed with very
little application change. That is a useful compatibility path. The larger win
comes when a data-intensive operation is expressed through the Lagrange API so
the cluster can understand:

- which durable data the operation uses;
- which code should execute;
- which capabilities that code is allowed to use; and
- where execution should run as partitions, leaders, and latency topology
  change.

The resulting model is **move the function to the data**, not "run a container
near a database and hope the topology remains favourable."

This document explains the model, the API that exists today, the direction of
the richer call and pushdown surface, and the benefits of rewriting a hot path.
For a complete before-and-after example, continue to
[Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md).

## Deployment Is The Entry Path, Not The End State

There are three useful adoption levels.

| Level | What changes | What Lagrange can understand | Main benefit |
| --- | --- | --- | --- |
| Portable workload | Existing code is packaged as WASM or, later, OCI | Artifact lifecycle and coarse service identity | Deployment, isolation, restart, and policy-controlled placement |
| Lagrange-aware service | The service uses the injected Lagrange context instead of direct database endpoints | Tables accessed, access mode, issuing service, and observed partition affinity | Capability enforcement, topology independence, local-read preference, and placement that follows real access |
| Native data-local operation | A hot path is invoked against a data selector and can fan out and reduce | Target partitions, operation semantics, partial-result shape, and execution policy | Minimal data movement, fewer network round trips, and exact per-invocation placement |

The levels are additive. An application does not need to be rewritten as one
large migration. A conventional HTTP service can remain in place while one
expensive aggregation, transaction, enrichment step, or state transition is
extracted into a Lagrange operation.

## The Four Core Concepts

### Artifact

An **Artifact** is immutable, digest-pinned service code and its manifest. The
runtime kind is part of the artifact contract. Genuine WASI components are
externally installable today.

### Binding

A **Binding** connects one Artifact export to an invocation source and its
budgets. The Binding describes desired execution intent; callers do not choose
nodes or replica counts.

`request`, `change`, `time`, `once`, `boot`, `call`, and `pushdown` are accepted
source kinds. Only request Bindings currently have a public invocation adapter.
The other source kinds can be declared and placed but are not yet a public
application API.

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
to the invoking service. That attribution is what lets the cluster learn where
the service should run.

A useful rule is:

> Code receives data access and locality through the context; it never selects
> machines or database endpoints.

## The Public Component API Today

The current request-component world is intentionally small:

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
or leader lookup. Slot `0` is resolved through the service-access declaration.
An undeclared read or write is denied at the component boundary.

The complete runnable version is in
[`examples/js-request-binding-deployment`](../examples/js-request-binding-deployment/README.md).
It compiles JavaScript into a genuine WASI component, installs the Artifact,
creates the Binding, declares table access, waits for a Cell, invokes it over
HTTP, and verifies both allowed and denied access.

### What the small API already enables

Even this narrow context changes the system boundary:

- the component cannot silently connect to arbitrary storage;
- every successful service-issued statement can be attributed to the service;
- read and write evidence can be mapped to the partitions actually used;
- placement policy can pull Cells toward nodes holding those replicas;
- read-locality policy can prefer a local or same-latency-group replica; and
- partitions can move or split without changing application configuration.

The API is deliberately smaller than a general database client today. It is a
real supported boundary, not yet the final native programming surface.

## The Native Call Direction

The intended native call makes the data target part of invocation. The
following API is **directional pseudocode, not a currently supported public
client**:

```js
const result = await lagrange.call({
  data: {
    table: 'ratings',
    where: {movieId: {between: [firstMovieId, lastMovieId]}},
  },
  function: 'rank-movies',
  arguments: {
    priorMean: 3.5,
    priorWeight: 25,
    confidencePenalty: 0.5,
    limit: 10,
  },
  reduce: 'merge-top-movies',
});
```

The important property is not the exact syntax. It is that the caller names
**data plus operation**, rather than a service replica plus database endpoint.
From that declaration the cluster can:

1. narrow the relevant partitions;
2. choose suitable replicas under consistency and locality policy;
3. make the function artifact available beside those replicas;
4. run partition-local work in parallel;
5. exchange compact partial results; and
6. reduce them into the response.

The accepted `call` and `pushdown` Binding kinds reserve this direction, but
public invocation adapters and the richer external context are not implemented
yet. Current status remains authoritative in
[Current Capabilities And Limitations](current-capabilities-and-limitations.md).

## What A Hot-Path Rewrite Buys

### 1. Computation moves instead of rows

A conventional service often asks the database for rows or per-key aggregates,
moves them into an application process, and applies business logic there. A
native operation lets each partition filter, transform, score, or aggregate its
own rows and return only a bounded partial result.

For a top-10 operation across `R` participating shards, the exchange can be
bounded near `R × 10` candidates instead of every matching row or every group.
The MovieLens demo uses two service replicas, so each publishes at most ten
candidates and the merge sees at most twenty.

### 2. Network round trips collapse

A sequence such as read, validate, read related state, write, and audit normally
crosses a client/database boundary repeatedly. When those steps belong to one
partition-local operation, routing, serialization, and network latency can be
paid once rather than once per statement.

Raft does not disappear. A committed write still reaches the leader and a
quorum. The saving is the avoidable application-to-database path around the
consensus work.

### 3. Placement becomes data-driven

A generic container scheduler can place a service in a region or availability
zone. It normally cannot infer which database partitions each service replica
actually uses.

Lagrange attributes successful service reads and writes to their executed
partitions. Fresh access evidence becomes node and latency-group weights:

- reads credit every node holding an active replica;
- writes credit the leader's node; and
- placement hysteresis prevents weak gradients from causing oscillation.

This lets Cells move toward their data as access patterns and ownership change.
See [Process: Data Affinity](../architecture/process-data-affinity.md) for the
mechanism.

### 4. The code stops owning topology

Native code does not manage connection pools per shard, cache partition maps,
retry a guessed leader, or redeploy when a partition splits. Those are kernel
responsibilities.

This is both a performance and maintenance win. A topology optimization that
would otherwise decay becomes continuously reconciled cluster state.

### 5. Capabilities and failure semantics become explicit

The context is capability-controlled. The manifest and access declaration can
state which tables and modes an Artifact may use. A function that attempts an
undeclared access fails at the component boundary.

As the native API grows, the same boundary can carry invocation identity,
deadlines, cancellation, transaction scope, retry state, idempotency, and
side-effect policy without each application inventing a parallel mechanism.

### 6. Application logic can stay application logic

Data-local execution is not an argument for turning all policy into SQL. A
function can use normal language constructs, tests, versioning, and packaging
while still executing beside its data. SQL remains the right tool for many
filters, joins, and aggregates; code is valuable where policy becomes awkward,
changes frequently, or needs reusable libraries.

The best result is often a combination: SQL narrows and groups locally, the
function applies application policy, and reduction moves only bounded partials.

## Choosing What To Rewrite

Good first candidates have one or more of these properties:

- they fetch substantial data only to filter, score, aggregate, or transform it;
- they perform several sequential database calls on the same partition key;
- latency is dominated by service-to-database round trips;
- they require custom logic that is cumbersome as stored procedures;
- they fan out across partitions and can return bounded partial results; or
- application and database topology have to be tuned together manually.

Poor first candidates are mostly external I/O, call many third-party services,
move little data, or already complete in one cheap indexed query.

## A Practical Migration Pattern

Keep the outer service and extract one hot path:

```text
existing API service
  ├─ authentication and HTTP policy
  ├─ third-party integrations
  └─ call(data selector, function, arguments)
       ├─ partition A: local function → small partial
       ├─ partition B: local function → small partial
       └─ reducer: partials → response
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

## Continue

- [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md) — a detailed
  best-of-breed baseline and data-local reduction example.
- [Service Deployment Guide](service-deployment-guide.md) — install an Artifact,
  create a Binding, declare access, and invoke a request Cell.
- [JavaScript request-binding example](../examples/js-request-binding-deployment/README.md)
  — the current public component context end to end.
- [MovieLens data-affinity example](../examples/service-data-affinity/README.md)
  — distributed SQL, bounded service reduction, and learned placement.
