# Lagrange

**Run the data-heavy parts of a service where its data already lives.**

Lagrange combines a distributed SQL database and a WebAssembly (WASM) service
runtime. WebAssembly is a portable code format; here it runs service functions
on the server, not in a browser.

Instead of putting the database on one set of machines and application workers
on another, every Lagrange node can hold database partitions **and** run service
code.

```text
                 Lagrange cluster

        node A          node B          node C
      +--------+      +--------+      +--------+
      | data   |      | data   |      | data   |
      | P1*    |      | P1     |      | P1     |
      | P2     |      | P2*    |      | P2     |  <- replicas
      | P3     |      | P3     |      | P3*    |
      |        |      |        |      |        |
      | WASM   |      | WASM   |      | WASM   |
      +--------+      +--------+      +--------+

        * = that partition's leader replica
```

When a service needs data from several partitions, Lagrange can run the
relevant function separately on the nodes holding those partitions. Rather
than fetching all selected rows into an application worker, it sends back
smaller intermediate results and combines them.

That is the main idea.

## What "distributed database" means here

A Lagrange database does not live on one server.

A table is divided into **partitions**, each owning a range of its primary
keys. Each partition has its own [Raft consensus group](https://raft.github.io/)
and normally three **replicas** on different nodes. Each replica has its own
SQLite database; there is no shared SQLite file.

Raft elects a leader and agrees the order of writes within that partition.
In a three-voter group, a majority of two must agree before a write commits.
Different partitions can have different leaders and make progress independently.

With three nodes and three replicas, every node holds every partition in the
illustration above. On larger clusters, different partitions can have different
sets of replica hosts.

Applications do not need to know which machine currently owns a partition.
Lagrange routes database and service work to the right nodes and handles
partition movement and replica changes.

This storage layer is part of Lagrange. Lagrange is **not** a compute layer
installed on top of an existing PostgreSQL cluster.

It speaks a subset of the **PostgreSQL wire protocol**: the network protocol
used by PostgreSQL clients. That helps existing clients connect; it does not
mean full PostgreSQL SQL, extension, or application compatibility.
See [partitioning](architecture/process-partitioning.md) and
[current capabilities](docs/current-capabilities-and-limitations.md).

## What runs where

A Lagrange service is compiled to a **WASM component**: portable executable
code with explicit interfaces for what it provides and may call.

In source, an endpoint and its data-heavy operation can live together.
This abbreviated example declares the operation and calls it from a handler:

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

Here, `statement` selects the input rows; `run` processes each partition's
rows; `reduce` combines the emitted results. `call` invokes that declared
operation, and `json` builds the HTTP response. The
[complete service](examples/call-binding-account-summary/lagrange.service.js)
includes the imports, route declaration, and function bodies.

**In this example, `accountId` filters inside `run()`, not inside SQL.** The
fixed selector has no `WHERE`, so it selects all of the table's partitions.
Each local batch must fit the input limits: 4,096 rows by default, plus byte
and deadline limits. This is not an unbounded scan.

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

For each selected partition, `run()` executes on the leader's node and reads
its local storage. The raw selected rows are not sent to another application
worker for this computation.

`run()` emits **partials**: small intermediate results, currently numeric
values under partition-disjoint keys. For example, two partitions might emit
counts of 2 and 1 and totals of 3,000 and 500 cents. `reduce()` returns a count
of 3 and a total of 3,500 cents. See the
[worked example](docs/native-programming-model.md#worked-example).

Reduction waits for every required partition. A failed partition fails the
call; it is not silently omitted. Retries do not promise exactly-once function
execution. The [execution contract](docs/execution-semantics.md) explains the
difference between executing code and publishing one complete result.

So code that looks like one service in the repository can be spread across the
cluster when it executes.

> **One service in source. Distributed execution when useful.**

## Which languages can I use?

**Today, the supported code-first language is JavaScript.**

`lagrange service init` creates a JavaScript project. The build produces a WASI
component, not a Node.js process. Existing code must fit the component's host
interfaces; arbitrary Node.js APIs are not automatically available.

**WASI** is the WebAssembly System Interface. **WIT** is the interface definition
language used to describe a component's imports and exports. Together with the
[Component Model](https://component-model.bytecodealliance.org/), these provide
a language-neutral execution boundary.

First-class TypeScript, Rust, Go, and Python SDKs are future directions, not
currently supported authoring paths. A compatible toolchain is necessary, but
a language also needs Lagrange's interfaces and deployment tooling.

## Why do this?

Consider an operation that examines 10 GB to produce a 20 KB answer. These
numbers illustrate the workload shape; they are not a Lagrange benchmark or
supported scan size.

When application workers need the raw rows, the path looks like this:

```text
database partitions -> many rows -> application computation -> small answer
```

With data-local computation:

```text
partition + run() -> small partials -> reduce() -> small answer
```

The useful shape is:

```text
data examined >> result returned
```

This can reduce database-to-application transfer and replace application-owned
shard routing, fan-out, and merging. It does not remove Raft replication,
coordination traffic, or the final reducer. Storage and service work also
compete for resources on the same hosts.

SQL engines already filter and aggregate near data. The account-summary demo
is deliberately easy to check, not proof that a sum requires WASM. When an
indexed or grouped SQL query already returns the final small answer cheaply,
moving code beside the data may buy little. Measure against that baseline.

[Related systems](docs/related-systems.md) explains the connections to
PostgreSQL functions, TiKV coprocessors, and Durable Objects, including where
each analogy stops. See [evaluation](docs/evaluate.md) for the measurement plan.

## What is required?

The relevant data must be stored in Lagrange, and the data-local operation must
be deployed as a WASM service with `run()` and `reduce()`. An existing application
can call its HTTP endpoint; the application does not manage shard routing.

PostgreSQL-wire compatibility is an integration aid, not what makes execution
local. Running SQL or deploying an endpoint alone does not demonstrate the
data-local computation path.

## The adoption ladder

You do not need to rewrite an application all at once.

### 1. Put representative data in Lagrange

Test the schema and queries using the supported PostgreSQL wire subset.
This evaluates the SQL layer, not yet the data-local service mechanism.

### 2. Deploy and call a service endpoint

Build and deploy the account-summary component, then call its health endpoint.
That route makes no distributed call, so it lets you inspect deployment,
authentication, and request routing separately.

The current default component still declares one distributed operation, even
when a handler does not call it. Do not remove that operation to make a
request-only project. WASM by itself is not the optimization.

### 3. Exercise the data-heavy operation

Call the summary endpoint and trace:

```text
run(rows, arguments)        <- beside each selected partition
reduce(partials, arguments) <- combines the complete result
```

For a real evaluation, extract one expensive operation and keep unrelated
application code outside. A new application can go directly to this model.

The relevant data must be loaded into Lagrange. There is no supported
PostgreSQL migration, change data capture (CDC) ingestion, backup, or
point-in-time recovery product surface yet. Keep the existing system of record
until a pilot proves parity, cutover, rollback, and recovery.
See [Migration and adoption](docs/migration.md).

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
- each partition read is bounded; no streaming or paging of a larger input;
- partial results are currently numeric and bounded;
- one HTTP request can make one distributed call;
- distributed reads do not form one global cross-partition snapshot;
- the current distributed call path is read-only for user tables;
- PostgreSQL compatibility is a subset, not drop-in PostgreSQL;
- secondary indexes are not supported;
- node-to-node transport currently assumes a trusted private network; and
- backup/restore, rolling upgrades, and production service-level objectives
  (SLOs) are not yet supported product contracts.

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
