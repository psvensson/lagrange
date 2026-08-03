# Lagrange

Lagrange is a distributed runtime for data-intensive services. Write an
ordinary service — endpoint, partition functions, and reducer together —
deploy it as WASM, and Lagrange runs each part of a request on the database
nodes holding the relevant data.

```text
Existing application
        |
        | normal endpoint call
        v
Lagrange service
        |
        | distributed call
        v
Functions run on relevant data partitions
        |
        | reduced result
        v
Endpoint response
```

> Logically one ordinary service. Physically distributed across the data.

## Why

The database is already distributed. The application work usually is not.

A conventional service pulls rows out of the partitions that own them, ships
them through the network into a central compute tier, filters and aggregates
them there, and throws most of the bytes away. When the work spans shards,
developers hand-build the fan-out, retries, routing, and merge logic — in a
repository far from the data it depends on.

Lagrange distributes parts of the service invocation itself. The heavy work —
filtering, scoring, aggregation — runs on the nodes that already hold the
rows. Only compact partial results cross the network. Placement, routing,
retries, and the merge belong to the runtime, not to your code.

## How It Feels To Use

One service, one file: the partition function and the reducer are authored
together, built into one WASM component. This is the real ABI — `run` receives
the local rows, emits one numeric partial per group key via the host `emit`
import, and `reduce` merges every partition's partials.

```js
// service.js — partition function and reducer, side by side
import {emit} from 'lagrange:cell/call-context';

// Partition function: runs on each node holding relevant rows.
// `batch` is that node's local slice of the binding's SELECT.
export function run(batch, argumentsJson) {
  const {topN} = JSON.parse(argumentsJson);
  const scored = [];
  for (const row of batch) {
    const id = column(row, 'id');
    const score = column(row, 'score');
    if (id.tag !== 'integer' || score.tag !== 'real') continue;
    scored.push({id: String(id.val), score: score.val});
  }
  scored.sort((a, b) => b.score - a.score);
  for (const candidate of scored.slice(0, topN)) {
    emit(candidate.id, JSON.stringify(candidate.score));
  }
  return JSON.stringify({emitted: Math.min(topN, scored.length)});
}

// Reducer: runs once, over the partials from every partition.
export function reduce(partials, argumentsJson) {
  const {topN} = JSON.parse(argumentsJson);
  const merged = partials.map(([key, partial]) => ({
    key,
    score: JSON.parse(partial),
  }));
  merged.sort((a, b) => b.score - a.score);
  return JSON.stringify(merged.slice(0, topN));
}

function column(row, name) {
  return row.columns.find((c) => c.name === name)?.val ?? {tag: 'null-value'};
}
```

The data selector lives in the call binding. Its `statement` is a
single-table SELECT; Lagrange plans which partitions hold matching rows
without fetching any of them:

```json
{
  "schema_version": 2,
  "name": "top-ratings",
  "source": {
    "kind": "call",
    "name": "top-ratings",
    "statement": "SELECT id, score, label FROM shard_ratings"
  },
  "target": {
    "package_id": "<package id>",
    "manifest_digest": "sha256:<manifest digest>",
    "export_name": "run"
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

Invocation is one statement over an authenticated PostgreSQL-wire session:

```sql
CALL BINDING $1
-- $1 = '{"schema_version": 2, "name": "top-ratings",
--        "arguments": {"topN": 3}}'
```

The result is one row `{name, result}` where `result` is the reducer's final
JSON. The session's server-derived identity carries authorization: the call
is rejected before dispatch unless the session holds the `pgwire.binding.call`
action.

An intended `ctx.call()`-style sugar exists as a design direction:

```js
// Intended API — not implemented. Today the data selector lives in the
// binding statement and invocation is `CALL BINDING $1` over pgwire.
const top = await ctx.call({
  query: 'SELECT id, score, label FROM shard_ratings',
  run: 'run',
  reduce: 'reduce',
  arguments: {topN: 3},
});
```

## What Happens At Runtime

One `CALL` becomes a distributed operation. Lagrange plans the binding's
SELECT into per-partition shards, dispatches `run` to each partition's host
node — where the rows are read locally from that node's own replica — and
dispatches `reduce` once, on the holder of a dedicated reduce lease:

```text
CALL BINDING "top-ratings"
  ├─ run()    on node A — partition 1 rows, read locally
  ├─ run()    on node B — partition 2 rows, read locally
  ├─ run()    on node B — partition 3 rows, read locally
  └─ reduce() on the reduce-lease holder → one JSON result
```

Only the emitted partials cross the network. In the two-node integration
proof, the shard tables see zero remote query deliveries: raw rows never
leave the node that owns them. If no runnable service instance exists on a
required node, Lagrange activates one there via a bounded lease and a
placement pin, then runs the function locally. The reduce step refuses to
publish unless every shard's partial set is complete, fresh, and disjoint,
and it publishes exactly one atomic result snapshot.

Shards currently dispatch sequentially; parallel fan-out is future work.

## Benefits

The mechanism is bounded reduction: each partition function reduces its local
slice — gigabytes of rows, potentially — to a few small partials. The network
carries the partials, not the rows. The reducer merges compact summaries
instead of loading every matching row into a central service.

The win scales with the ratio

```text
data scanned or transformed ≫ result returned
```

For qualifying workloads the conservative, calculation-based targets are
`15–50%` lower latency for multi-step paths, `2–10×` end-to-end speedup, and
`10–1,000×` less transferred data for data-heavy operations. These are not
product-wide benchmark claims; the outcome depends on round trips,
selectivity, bytes moved, partition count, and the actual bottleneck. See
[Estimating Performance, Throughput, And Network Cost](docs/performance-and-cost-estimation.md)
for the equations and claim boundaries.

Infrastructure consolidation must be calculated separately. Suitable
workloads may justify screening for `10–35%` fewer instances and `5–20%`
lower compute cost; small, CPU-bound, or already consolidated systems may
save nothing. See
[Estimating Infrastructure Consolidation](docs/infrastructure-cost-estimation.md).

Beyond cost, the service model itself carries weight: the endpoint, partition
function, and reducer are written, reviewed, tested, versioned, and deployed
together. No hand-built fan-out layer, no shard maps in application code, no
redeploy when a partition splits. Components receive declared capabilities
rather than broad database credentials.

Raft remains underneath. Writes still reach a leader and quorum; Lagrange
removes avoidable data movement around the durability work, it does not
weaken it.

## A Concrete Comparison

The MovieLens demo computes the same top-ten ranking three ways: PostgreSQL
grouped SQL, Lagrange distributed grouped SQL, and a replicated data-local
service where each replica emits at most ten candidates so the final merge
sees at most twenty rows instead of every movie aggregate.

```sh
npm install
npm run demo:movielens
```

The demo proves correctness, bounded exchange, and placement learned from
real access. It deliberately does not claim a PostgreSQL-versus-Lagrange
speedup ratio, and its service path currently uses an internal runtime
module rather than the public call path.

## Current State

Lagrange is alpha. What works, what doesn't:

- **Implemented and production-wired:** authenticated `CALL BINDING $1` over
  the PostgreSQL wire protocol, with typed failure codes; binding-declared
  partition-local SELECT planned into per-shard batches; data-local shard
  execution on the partition-host node (rows never leave it — proven in
  two-node integration); reduce under a dedicated lease with exactly one
  atomic result snapshot; missing-instance activation via bounded leases and
  placement pins; request bindings over HTTP; genuine WASI component
  execution; range-partitioned SQLite storage with Raft replication;
  multi-partition transactions; a bounded PostgreSQL wire slice; diagnostics,
  health probes, an admin CLI, and distributed failure testing.
- **Sequential fan-out:** shard dispatch is a sequential loop today;
  parallel fan-out is future work.
- **Numeric partials only:** each emitted partial is one finite number per
  group key. Structured partial values are not supported yet.
- **Declared-only binding kinds:** `pushdown`, `change`, `time`, `once`, and
  `boot` bindings are accepted and placed but have no invocation adapter.
- **No JS client SDK:** pgwire is the only CALL ingress; there is no HTTP or
  JavaScript client surface for it yet.
- **The call WIT world is not yet published** as an authoring artifact; it
  lives in the repository's test fixtures.
- **Managed OCI activation is unsupported** (compatibility scaffold only).
- **Not production-ready.** Bounded rather than general PostgreSQL
  compatibility; no backward-compatibility guarantee on `0.x`.

The authoritative status page is
[Current Capabilities And Limitations](docs/current-capabilities-and-limitations.md).

## Try Lagrange

Requirements: Node.js 22.12 or newer and npm.

```bash
npm install --global lagrange-server
lagrange --dry-run
lagrange-admin --help
```

Applications can install it locally and import the side-effect-free public
API:

```bash
npm install lagrange-server
```

```js
import {VERSION} from 'lagrange-server';
```

The npm package is named `lagrange-server`; the product and executable remain
named `lagrange`. To run from a source checkout instead:

```bash
npm install
cp .env.example .env
npm start
```

Open the administration client in another terminal:

```bash
npm run cli -- localhost:8081
```

To see the call path run, execute the flagship example — it builds a WASM
component from plain JavaScript, installs it, splits a ledger table across
two partitions, and invokes `CALL BINDING $1` end to end:

```bash
node examples/call-binding-account-summary/run-call-binding-account-summary.js
```

Continue with the [first-hour tutorial](docs/tutorials/first-hour.md), the
[service deployment guide](docs/service-deployment-guide.md), or the
[example's README](examples/call-binding-account-summary/README.md).

## Good Fit

Lagrange is most interesting when services retrieve substantial data only to
filter, score, aggregate, validate, or transform it; when cross-partition
work can return bounded partial results; or when service/database round trips
or cross-zone traffic are material.

It is a poor fit today when you need a mature drop-in database, complete
PostgreSQL compatibility, or when one cheap indexed query already returns the
final small result.

## Compatibility Paths

You do not have to rewrite anything to start. An unmodified Node.js
PostgreSQL application can point at Lagrange's pgwire listener
([service-portability example](examples/service-portability/README.md)), and
existing HTTP workloads can run as WASM request bindings
([js-request-binding example](examples/js-request-binding-deployment/README.md)).
OCI containers, the legacy callback surface, and experimental runtimes are
compatibility and internals material — see
[Compatibility and internals](docs/start-here.md#compatibility-and-internals).

## Documentation

What it is:

- [Start here](docs/start-here.md) — reading paths from model to operations

How to build one:

- [Native programming model](docs/native-programming-model.md) — the service
  model, API boundary, placement, and reduction
- [WASM services user guide](docs/wasm-services-user-guide.md) — authoring
  and packaging components
- [Service deployment guide](docs/service-deployment-guide.md) — lifecycle
  SQL: install, bind, configure access, call
- [Execution semantics](docs/execution-semantics.md) — retries, idempotency,
  partial failure, limits, movement
- [First-hour tutorial](docs/tutorials/first-hour.md) and
  [hot-path rewrite tutorial](docs/tutorials/rewrite-a-hot-path.md)
- [Examples](examples/README.md)

How it works:

- [Architecture overview](architecture.md) and the
  [architecture index](architecture/INDEX.md)
- [Performance and cost estimation](docs/performance-and-cost-estimation.md)
  and [infrastructure cost estimation](docs/infrastructure-cost-estimation.md)

Status and direction:

- [Current capabilities and limitations](docs/current-capabilities-and-limitations.md)
- [Roadmap](roadmap.md)

Working on the codebase with an AI agent, including Codex? Start at
[AGENTS.md](AGENTS.md). Test and release workflows begin at
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).

This project is open source but **closed to outside contributions**
("open-source, not open-contribution", like SQLite). Bug reports are welcome;
pull requests are disabled. See [CONTRIBUTING.md](CONTRIBUTING.md).
