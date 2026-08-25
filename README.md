# Lagrange

**Run the data-heavy parts of a service where its data already lives.**

Lagrange combines a distributed SQL database and a WASM service runtime.

Instead of putting the database on one set of machines and application workers
on another, every Lagrange node can hold database partitions **and** run service
code.

```text
                 Lagrange cluster

        node A          node B          node C
      +--------+      +--------+      +--------+
      | data   |      | data   |      | data   |
      | P1, P3 |      | P2, P4 |      | P1, P4 |  <- replicas
      |        |      |        |      |        |
      | WASM   |      | WASM   |      | WASM   |
      +--------+      +--------+      +--------+
```

When a service needs data from several partitions, Lagrange can run the
relevant function separately on the nodes holding those partitions. The rows
stay there. Only the smaller intermediate results are sent back and combined.

That is the main idea.

## What "distributed database" means here

A Lagrange database does not live on one server.

A table is divided into **partitions**. A partition owns part of the table's
data.

Each partition has several **replicas** on different Lagrange nodes. A replica
is another copy of that partition. Raft consensus keeps the replicas consistent
and chooses a leader for writes.

For example:

```text
transactions table

partition 1            partition 2            partition 3
rows ...               rows ...               rows ...

leader: node A         leader: node B         leader: node C
copies: B, C           copies: A, C           copies: A, B
```

Applications do not need to know which machine currently owns a partition.
Lagrange routes database and service work to the right nodes and handles
partition movement and replica changes.

This storage layer is part of Lagrange. Lagrange is **not** a compute layer
installed on top of an existing PostgreSQL cluster.

It does speak a useful subset of the PostgreSQL wire protocol, mainly to make
integration and migration easier.

## What runs where

A Lagrange service is compiled to a WASM component.

In source, an endpoint and its data-heavy operation can live together:

```js
const summarize = distributed({
  statement: sql`
    SELECT id, account_id, amount_cents
    FROM account_activity
  `,
  run: summarizeRun,
  reduce: summarizeReduce,
});

function handle(request, {call, json}) {
  return json(call(summarize, {
    accountId: request.body.accountId,
  }));
}
```

Physically, one request can execute in several places:

```text
POST /accounts/summary
          |
          v
   service handler
          |
          | call(summarize)
          v
    Lagrange finds the
    relevant partitions
          |
     +----+----+----+
     |         |    |
     v         v    v
   node A    node B node C
   run()     run()  run()
   local     local  local
   rows      rows   rows
     |         |    |
     +----+----+----+
          |
     small partials
          |
          v
       reduce()
          |
          v
      one result
```

For each selected partition, `run()` executes on the node holding that
partition's leader replica.

Its input rows are read from that node's local storage. The raw selected rows
are not shipped to another application worker.

`run()` emits bounded partial results. Once every required partition has
completed, `reduce()` runs once and combines those partials into the result
returned to the handler.

So code that looks like one service in the repository can be spread across the
cluster when it executes.

> **One service in source. Distributed execution when useful.**

## Which languages can I use?

**Today, the supported code-first language is JavaScript.**

`lagrange service init` creates a JavaScript project, and the Lagrange compiler
turns the service into a WASI component for deployment.

JavaScript is the current authoring language, not a fundamental restriction of
the runtime. Lagrange's execution boundary is based on WebAssembly components
and WIT interfaces, so the service model is intended to be language-neutral.

Future first-class SDKs are intended for languages with good WASI Component
Model support, including:

- **TypeScript**;
- **Rust**;
- **Go**; and
- **Python**, as its WASI/component tooling matures.

Other languages that can produce compatible WASI components should be possible
as their toolchains mature as well.

The intended model stays the same:

```text
your language
     |
     | Lagrange SDK/compiler
     v
WASI component
     |
     v
Lagrange service
  handler
  run()
  reduce()
```

So choosing JavaScript today does not make JavaScript part of the Lagrange
storage or execution architecture. It is simply the first supported frontend
to a language-neutral runtime.

## Why do this?

Consider an ordinary sharded application that needs to examine 10 GB of data
to produce a 20 KB answer.

A conventional architecture might do this:

```text
database shards
     |
     | lots of rows
     v
application workers
     |
     | filter / score / aggregate
     v
20 KB result
```

Lagrange can instead do:

```text
database partition + run()
     |
     | small partial
     v
        reduce()
          |
          v
      20 KB result
```

The expensive work happens beside each piece of data.

This can remove:

- database-to-application data transfer;
- application-managed shard routing and fan-out;
- repeated database round trips;
- central aggregation work; and
- cross-node or cross-zone traffic.

The useful shape is roughly:

```text
data examined >> result returned
```

If one indexed SQL query already returns the final small answer, moving code
beside the data probably buys little.

## What is required?

There are a few concepts in Lagrange that are easy to mistake for alternative
modes.

For the **main data-local execution model**:

| Part | Required? | Why |
| --- | --- | --- |
| Lagrange cluster | **Yes** | It owns storage, routing and execution |
| Relevant data stored in Lagrange | **Yes** | Local execution only works if Lagrange holds the data |
| WASM service | **Yes** | This is the code Lagrange can place and execute |
| `run()` | **Yes for distributed work** | Executes independently beside each selected partition |
| `reduce()` | **Yes for distributed work** | Combines the partition results |
| HTTP endpoint | Usually | Normal application-facing service interface; distributed operations can also be invoked directly |
| PostgreSQL-wire compatibility | **No** | Migration/integration aid, not the mechanism that makes execution local |
| Application-managed shard routing | **No** | Lagrange owns this |

You can use parts of Lagrange without reaching the final row of that story, but
those are mostly useful adoption steps.

## The adoption ladder

You do not need to rewrite an application all at once.

### 1. Put representative data in Lagrange

Connect using the supported PostgreSQL wire subset and see whether the schema
and queries you care about fit.

At this stage Lagrange is essentially being exercised as a distributed SQL
system.

There is no data-local service benefit yet.

### 2. Move one service operation into Lagrange

Package one endpoint as a WASM service and let Lagrange run it.

This proves deployment, isolation, permissions and service lifecycle.

The code may still make ordinary database operations. WASM by itself is not
the optimization.

### 3. Make the expensive part distributed

Split the operation into:

```text
run(rows, arguments)        <- once per relevant partition
reduce(partials, arguments) <- once for the complete request
```

Now Lagrange can move the computation to the partitions instead of moving their
rows to a central service.

**This third step is the distinctive Lagrange mechanism.**

Steps 1 and 2 are useful ways to reach it safely, not separate architectural
requirements.

For a new application you can go directly to the service model.

For an existing application, the sensible first target is usually one
expensive operation rather than the whole system.

The relevant data must be loaded into Lagrange. There is not yet a supported
PostgreSQL-to-Lagrange migration, CDC, backup, or point-in-time recovery product
surface. Keep the existing system of record until a pilot has proven parity,
cutover, rollback, and recovery for the chosen workload.

## A good first workload

Lagrange is interesting when an existing service:

- reads a lot of rows to return a small answer;
- filters, scores, validates, transforms or aggregates data;
- manually fans out over database shards;
- performs several database round trips against the same data;
- runs workers mainly to merge results from shards; or
- spends meaningful money moving data between database and compute tiers.

It is less interesting when the work is mostly external API calls, when a
normal indexed query already produces the answer cheaply, or when the required
SQL semantics are outside Lagrange's current envelope.

## Try it

The current end-to-end example needs Node.js 22.12 or newer:

```bash
git clone https://github.com/psvensson/lagrange
cd lagrange
npm install
npm run demo:account-summary
```

The demo:

1. builds a real WASI component;
2. starts Lagrange;
3. creates and splits a table into two partitions;
4. deploys the service;
5. calls its HTTP endpoint;
6. runs the partition functions against local data; and
7. checks the combined result.

Both partitions are on one machine in this demo, so it proves the execution
path rather than cluster-scale performance.

To start a service project:

```bash
npm install --global lagrange-server

lagrange service init my-service
cd my-service

npm test
lagrange service generate .
lagrange service build .
```

Deployment needs a running cluster and authenticated PostgreSQL-wire lifecycle
configuration. The generated project README contains the exact `deploy`
command.

See [First hour](docs/tutorials/first-hour.md) for the complete walkthrough.

## Current status

Lagrange is experimental alpha software.

The data-local service path works, but its current public interface is
intentionally narrow. Among the important limits today:

- a distributed operation uses one fixed single-table `SELECT`;
- each partition read is bounded;
- partial results are currently numeric and bounded;
- one HTTP request can make one distributed call;
- distributed reads do not form one global cross-partition snapshot;
- the current distributed call path is read-only for user tables;
- PostgreSQL compatibility is a subset, not drop-in PostgreSQL;
- node-to-node transport currently assumes a trusted private network; and
- backup/restore, rolling upgrades and production SLOs are not yet supported
  product contracts.

See [Current capabilities and limitations](docs/current-capabilities-and-limitations.md)
for the exact current envelope.

## Read next

- [First hour](docs/tutorials/first-hour.md) - run the example
- [Programming model](docs/native-programming-model.md) - write handlers,
  `run()` and `reduce()`
- [Execution semantics](docs/execution-semantics.md) - placement, retries and
  consistency
- [Migration and adoption](docs/migration.md) - introduce Lagrange into an
  existing system
- [Evaluate Lagrange](docs/evaluate.md) - decide whether a workload is a good
  fit
- [Security](docs/security.md) - current trust and authentication model
- [Architecture](architecture/INDEX.md) - internals
- [Documentation index](docs/README.md) - the complete documentation map

## License and contributions

Lagrange is licensed under AGPL-3.0-only. See [LICENSE](LICENSE).

The source is public but the repository is closed to outside pull requests.
Bug reports are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

Agents working on the repository start at [AGENTS.md](AGENTS.md).
