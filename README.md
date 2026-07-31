# Lagrange

### Distributed SQL with a native data-local programming model

Lagrange is an experimental distributed database and execution platform that
moves application functions toward the data they use.

You can deploy a portable WASI component to Lagrange with little application
change. That is the compatibility path. The larger architectural win comes
when a data-intensive hot path uses the Lagrange context and, as the native
call surface matures, identifies **data plus operation** rather than a service
replica plus database endpoint.

That lets the cluster decide where the function should run, execute useful work
beside current replicas, and move compact partial results instead of raw or
intermediate rows.

> **Current status:** Lagrange contains working distributed storage,
> transactions, SQL routing, genuine WASI service execution, automatic
> data-affinity placement, diagnostics, and distributed failure testing. The
> public component API is still narrow, and public invocation adapters for
> native `call` and `pushdown` Bindings are not yet implemented. Lagrange is a
> substantial experimental system, not a production-ready drop-in database.

Start with:

- [The native programming model](docs/native-programming-model.md)
- [A thorough hot-path rewrite example](docs/tutorials/rewrite-a-hot-path.md)
- [Current capabilities and limitations](docs/current-capabilities-and-limitations.md)
- [First hour with Lagrange](docs/tutorials/first-hour.md)

---

## The Important Distinction

WASM and OCI describe how code is packaged and isolated. They do not, by
themselves, change the application/database boundary.

Lagrange supports an adoption ladder:

| Adoption level | Application change | Main benefit |
| --- | --- | --- |
| Deploy an existing artifact | Package existing code as WASM; OCI is planned | Lifecycle, isolation, restart, and policy-controlled placement |
| Use the Lagrange context | Replace direct database endpoints with declared context capabilities | Topology independence, capability enforcement, attributed access, and learned data affinity |
| Rewrite a hot path as a native operation | Express data target, function, and reduction | Fewer round trips, bounded data exchange, and exact per-invocation placement |

The first level makes Lagrange easier to adopt. The third is where the most
important latency, bandwidth, and operational wins appear.

A migration does not need to rewrite an application. Keep HTTP handling,
authentication, external integrations, and presentation in the existing
service. Extract one aggregation, transaction, enrichment step, validation
path, or state transition whose data movement is expensive.

---

## Move The Function, Not The Data

### Conventional architecture

```text
client
  → arbitrary service replica
  → database coordinator or remote partition
  → rows or intermediate aggregates cross into the service
  → application logic runs away from the data
  → writes and results cross the boundary again
```

Application placement and data placement are separate systems. Even when both
are individually well tuned, the application owns connection pools, shard
routing, retries, and a topology optimization that can decay after partitions
split or move.

### Lagrange-native architecture

```text
client or outer service
  → call(data selector, function, arguments)
  → function runs beside each relevant partition
  → local filtering, policy, and aggregation
  → bounded partial results
  → reducer
  → response
```

The caller names the data and operation, not the machine. Lagrange resolves the
current partitions, chooses suitable replicas, places or activates the pinned
function artifact, and reconciles that placement as ownership and latency
topology change.

The selector-driven client shown above is the intended public model. It is not
yet a supported external API; request Bindings are the only publicly invocable
Binding kind today. The distinction is documented precisely in
[The Lagrange Native Programming Model](docs/native-programming-model.md).

---

## What The Rewrite Buys

### Less data movement

Partition-local functions can filter, score, aggregate, or transform their own
rows and return only compact partials.

For a top-10 operation across `R` shards, the exchange can be bounded near
`R × 10` candidates. It does not need to move every matching row or even every
group into one application process.

### Fewer network round trips

A conventional read, validate, related-read, write, and audit sequence may
cross the service/database boundary several times. When those steps form one
partition-local operation, routing, serialization, and network latency can be
paid once.

Raft remains. Writes still reach a leader and quorum. Lagrange removes the
avoidable application hop around the consensus work; it does not weaken the
durability model.

### Placement that follows real data access

Successful service-issued reads and writes are attributed to the partitions
they actually execute against. Fresh access evidence becomes node and
latency-group placement weights:

- reads credit nodes holding active replicas;
- writes credit the leader's node; and
- hysteresis prevents weak gradients from causing constant movement.

Cells can therefore drift toward the data they use instead of relying on a
static co-location guess. Read-locality routing is a separate fast decision that
can prefer local or same-latency-group replicas.

### Less topology code

Native application code does not need to discover nodes, cache partition maps,
select leaders, or redeploy because a partition split. The cluster owns those
concerns.

### A stronger capability boundary

Components receive declared host capabilities through the Lagrange context.
They do not need broad database credentials or arbitrary network access.
Undeclared table access is denied at the component boundary.

### Application logic can remain code

Lagrange is not an argument for putting every policy into a stored procedure.
SQL remains ideal for relational filtering and grouping. Normal application
code remains useful for complex policy, reusable libraries, testing, and
versioning. The native model combines them beside the data.

---

## The API Today

The current public request-component context is intentionally small:

```wit
interface context {
  read: func(table: u32, key: u32) -> s32;
  write: func(table: u32, key: u32, value: s32);
  capability: func(capability: u32) -> s32;
}
```

A JavaScript component imports it directly:

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

Slot `0` is resolved through the service-access declaration. The code contains
no connection string, pool, node address, partition identifier, or leader
lookup.

The complete runnable path is in the
[JavaScript request-binding example](examples/js-request-binding-deployment/README.md).
It compiles JavaScript into a genuine WASI component, installs the Artifact,
creates the Binding, declares access, waits for a ready Cell, invokes it over
HTTP, and verifies that undeclared access is denied.

The richer selector, partition-local SQL, transaction, fan-out, and reduction
surface remains product direction. Accepted `call` and `pushdown` Binding kinds
reserve that direction, but they do not yet have public invocation adapters.

---

## A Concrete Hot-Path Rewrite

The MovieLens example computes the same top-ten ranking in three ways:

1. PostgreSQL grouped SQL;
2. Lagrange distributed grouped SQL; and
3. a replicated Lagrange service applying a Bayesian confidence-adjusted
   ranking on disjoint shards.

A strong conventional implementation lets the database return one `AVG` and
`COUNT` aggregate per movie, then applies policy and sorting in the service.
The Lagrange service pushes that policy to the shards. Each of two service
replicas publishes at most ten candidates, and the merge sees at most twenty.

```text
strong SQL baseline
  all partitions → one aggregate per movie → service → top ten

Lagrange service
  shard A → local score → ten candidates ┐
                                         ├→ merge → top ten
  shard B → local score → ten candidates ┘
```

All paths return the same ordered result. The demo intentionally does not claim
a PostgreSQL-versus-Lagrange speedup ratio because startup and topology differ.
It demonstrates correctness, transfer shape, and placement learned from real
service access.

Read [Rewrite A Hot Path For Lagrange](docs/tutorials/rewrite-a-hot-path.md) for
the complete baseline code, partition function, reducer, selector-driven call,
transfer arithmetic, failure implications, and migration checklist.

Run the existing proof with:

```sh
npm install
npm run demo:movielens
```

The service phase currently uses the internal `native_js` query-loop substrate.
It proves the execution and placement shape, not yet an externally installable
`call` or `pushdown` Binding.

---

## How Lagrange Works

### Partitioned replicated data

Every user table is range-partitioned. Each partition is a Raft group storing
its data in SQLite. Replicas move, hot partitions can split, and the query
engine routes statements across the current topology.

### Artifacts, Bindings, Cells, and context

- **Artifact:** immutable, digest-pinned service code and manifest
- **Binding:** immutable execution intent connecting an Artifact export to an
  invocation source
- **Cell:** a ready disposable instance derived from a Binding and placed by the
  cluster
- **Context:** the capability-controlled bridge from service code to durable
  data and kernel services

Durable service state belongs in ordinary replicated tables. Cells do not have
a separate per-service Raft log and must be treated as replaceable compute.

### Continuous affinity

Service-issued statements carry an issuing service identity. Lagrange records
which partitions were actually read or written, publishes bounded fresh
evidence, and incorporates that evidence into runtime-service placement.

This is not a one-time scheduler decision. Replica moves, node changes,
partition splits, and changing access patterns feed the same ongoing
reconciliation process.

### Distributed reduction

For multi-partition operations, useful work can fan out to the data. Local
functions emit bounded partials that are merged hierarchically or centrally,
instead of forcing all raw or intermediate data through one service process.

---

## Four Important Paths

### Single-partition requests: remove an avoidable hop

![Single-partition request comparison: a conventional service tier makes remote data calls, while Lagrange routes to replica-local execution](docs/images/single-partition-request.png)

Once the target partition is known, work can run beside a suitable replica
instead of requiring repeated calls from a separately placed service tier.

### Multi-partition operations: move work, not raw data

![Multi-partition operation comparison: a conventional service tier pulls raw rows inward, while Lagrange fans work out and returns compact partial results](docs/images/multi-partition-operation.png)

Filters, application policy, and partial aggregation can happen near the rows,
with compact results crossing the network.

### Writes: retain consensus, shorten the application path

![Write-path comparison: both approaches retain Raft replication, while Lagrange removes the remote service-to-leader hop](docs/images/write-path.png)

The leader still commits through a Raft quorum. Validation, state transition,
and response construction can run leader-local without trading away
durability.

### Rebalancing: keep locality aligned

![Placement and rebalancing sequence: execution follows a data replica as policy moves it to another node](docs/images/placement-and-rebalancing.png)

When replicas move because of pressure, failures, or policy, Lagrange
reconciles service placement and routing rather than requiring a manual service
redeployment.

---

## What Exists Today

This repository contains real distributed database machinery:

- range-partitioned tables backed by SQLite;
- Raft replication and partition ownership;
- multi-partition transactions with recovery and timeout handling;
- one SQL execution engine shared by clients, services, and internal queries;
- PostgreSQL wire support for a bounded measured SQL slice;
- genuine WASI component execution through Artifact / Binding / Cell;
- a public request-component context with declared read, write, and capability
  access;
- service placement and observed data-affinity machinery;
- distributed grouped SQL and an internal bounded-reduce service demo;
- diagnostics, health probes, live-query support, and an admin CLI; and
- distributed failure and stress-testing infrastructure.

Important current limits include:

- only request Bindings have a public invocation adapter;
- the external component context is still narrow;
- managed OCI container activation is unsupported;
- the MovieLens reduction service uses an internal runtime module; and
- PostgreSQL compatibility is bounded rather than general.

The authoritative status page is
[Current Capabilities And Limitations](docs/current-capabilities-and-limitations.md).

---

## Good Fit

Lagrange may be a good fit when:

- application servers retrieve substantial data only to filter, score,
  aggregate, validate, or transform it;
- request latency includes meaningful service-to-database round trips;
- several sequential statements repeatedly touch the same partition key;
- cross-partition work can return bounded partial results;
- custom logic should remain tested and versioned application code;
- placement must follow sharded data as ownership changes; or
- maintaining matching application and database topologies is expensive.

Lagrange is probably the wrong tool when:

- you need a mature drop-in production database today;
- one cheap indexed query already returns the final small result;
- the workload is dominated by third-party network calls;
- strict operational separation between database and service tiers is required;
- you need unmodified OCI container execution today; or
- data movement and topology management are not material costs.

---

## How It Compares

| Compared with | The important difference |
| --- | --- |
| Kubernetes plus a distributed database | Kubernetes places compute primarily from declared resources and topology constraints. Lagrange also derives service placement from current data ownership and observed partition access. Lagrange can itself run on Kubernetes. |
| Stored procedures | Stored procedures move logic into a database process. Lagrange aims to run portable, capability-controlled application functions across partitioned data, with fan-out, reduction, and continuously reconciled placement. |
| Spark or Flink | Those systems generally begin with compute applied to attached or external data. Lagrange begins with operational replicated data and brings selected application operations into the same ownership and placement system. |
| Generic serverless | Generic serverless centres on stateless function execution. Lagrange is anchored in partitions, replication, transactions, routing, and data locality. |
| Deploying WASM beside a database | Coarse co-location is useful but opaque. The Lagrange context attributes actual partition access, and the native model makes data selection and reduction part of invocation. |

Lagrange does not aim to eliminate all networking or replace every queue, cache,
stream processor, and application service. Its focus is narrower: make the
placement and movement costs around operational data explicit, then perform
useful work locally whenever possible.

---

## Try Lagrange

Requirements:

- Node.js 22.12 or newer
- npm

Start a local node:

```bash
npm install
cp .env.example .env
npm start
```

Default listeners:

- REST API: `8080`
- admin WebSocket: `8081`
- node transport: `8082`

Open the administration client in another terminal:

```bash
npm run cli -- localhost:8081
```

Continue with:

- [First hour with Lagrange](docs/tutorials/first-hour.md)
- [The native programming model](docs/native-programming-model.md)
- [Rewrite a hot path](docs/tutorials/rewrite-a-hot-path.md)
- [Service deployment guide](docs/service-deployment-guide.md)
- [JavaScript request-binding example](examples/js-request-binding-deployment/README.md)
- [MovieLens data-affinity example](examples/service-data-affinity/README.md)
- [Helm chart documentation](charts/lagrange-node/README.md)

---

## Architecture And Development

Start with:

- [Documentation journeys](docs/start-here.md)
- [Architecture index](architecture/INDEX.md)
- [Illustrated system model](architecture/system-model.md)
- [Process: Data Affinity](architecture/process-data-affinity.md)
- [Current capabilities and limitations](docs/current-capabilities-and-limitations.md)
- [Platform doctrine](platform-doctrine.md)
- [Roadmap](roadmap.md)
- [Edition matrix](edition-matrix.md)

Working on this codebase with an AI agent, including Codex? Start at
[AGENTS.md](AGENTS.md). Test, debugging, and release workflows begin at
[CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

AGPL-3.0. See [LICENSE](LICENSE).

This project is open source but **closed to outside contributions**
("open-source, not open-contribution", like SQLite). See
[CONTRIBUTING.md](CONTRIBUTING.md) for the rationale. Bug reports are welcome;
pull requests are disabled.
