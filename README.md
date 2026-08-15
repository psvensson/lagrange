# Lagrange

**Build one service. Run its data-heavy functions where the data lives.**

Lagrange is a distributed runtime for data-intensive services with an
integrated, partitioned SQL storage layer. Existing applications call ordinary
HTTP endpoints. Lagrange runs the service's partition functions on the nodes
holding the relevant rows, combines their partial results, and returns one
compact response.

Lagrange is not a plug-in for an existing PostgreSQL cluster. It speaks a
bounded slice of the PostgreSQL wire protocol to reduce application migration
work, but data-local execution requires the relevant data to live in Lagrange.

```text
existing application
        |
        | POST /accounts/summary
        v
Lagrange service handler
        |
        | call(distributedOperation, arguments)
        v
run() beside each relevant partition replica
        |
        | bounded partials only
        v
reduce() -> HTTP response
```

> Logically one ordinary service. Physically distributed across the data.

## Why

The database is already distributed. The application work usually is not.

A conventional service often asks several shards for rows or aggregates,
moves the results into a central application tier, applies policy there, and
throws most of the transferred data away. The application also owns shard
routing, fan-out, retries, placement, and merge logic.

Lagrange moves the function instead. Each partition does useful work locally;
the network carries partial results and the final answer rather than the rows
that produced them. The strongest fit is:

```text
data scanned or transformed >> result returned
```

That shape can reduce application/database round trips, intermediate transfer,
central coordinator work, and cross-zone traffic. It does not make every query
faster, and WASM packaging by itself is not a speedup.

## The service you write

`lagrange service init` creates a code-first WASM project. The authored source
contains the endpoint, distributed operation, and reducer together. Durable
Binding names, manifests, access policies, component entry code, and deployment
records are compiler output.

```js
import {defineService} from './authoring/define-service.js';
import {distributed} from './authoring/distributed-operation.js';
import {http} from './authoring/request-handler.js';
import {sql} from './authoring/sql-template.js';

function summarizeRun(rows, {accountId}, {emit}) {
  let count = 0;
  let totalCents = 0;
  let shardKey = null;

  for (const row of rows) {
    if (row.account_id !== accountId) continue;
    count += 1;
    totalCents += row.amount_cents;
    shardKey = shardKey === null ? row.id : Math.min(shardKey, row.id);
  }

  if (shardKey !== null) {
    emit(`count:${shardKey}`, count);
    emit(`total:${shardKey}`, totalCents);
  }
  return {matched: count};
}

function summarizeReduce(partials, {accountId}) {
  let transactions = 0;
  let totalCents = 0;
  for (const [key, value] of partials) {
    if (key.startsWith('count:')) transactions += value;
    if (key.startsWith('total:')) totalCents += value;
  }
  return {accountId, transactions, totalCents};
}

const summarizeAccountActivity = distributed({
  statement: sql`SELECT id, account_id, amount_cents FROM account_activity`,
  run: summarizeRun,
  reduce: summarizeReduce,
});

function handleAccountSummary(request, {call, json}) {
  const accountId = request.body?.accountId ?? null;
  return json(call(summarizeAccountActivity, {accountId}));
}

export default defineService({
  name: 'account-summary',
  version: '1.0.0',
  operations: {summarizeAccountActivity},
  handlers: {
    accountSummary: http.post('/accounts/summary', {
      calls: [summarizeAccountActivity],
      handle: handleAccountSummary,
    }),
  },
});
```

The complete exercised version is
[`examples/call-binding-account-summary/lagrange.service.js`](examples/call-binding-account-summary/lagrange.service.js).

## What happens at runtime

For one endpoint invocation, Lagrange:

1. authenticates the request and selects the request handler;
2. validates that the handler may call the declared distributed operation;
3. resolves the operation's fixed single-table `SELECT` to partitions;
4. activates a service Cell on each required partition host when needed;
5. reads each bounded shard batch from that host's local replica;
6. runs the authored `run()` function in the WASM component;
7. coordinates a complete, disjoint set of numeric partials;
8. runs `reduce()` once under a lease; and
9. returns one atomically published result to the handler.

Raw selected rows do not cross between shard hosts on this call path. Writes
still reach a partition leader and Raft quorum. Lagrange removes avoidable
movement around the durability work; it does not weaken consensus.

## Where it fits

Good first candidates:

- a service fetches substantial data only to filter, score, aggregate,
  validate, or transform it;
- one request performs several sequential database operations against the same
  partition key;
- workers mainly fan out over database shards and merge compact answers;
- service placement and database placement have to be tuned together; or
- cross-zone application/database traffic is material.

Poor candidates today:

- one indexed query already returns the final small answer;
- most work is external API or network I/O;
- the operation needs an unbounded shard scan, streaming exchange, arbitrary
  structured partials, or a global cross-partition snapshot;
- the application needs broad PostgreSQL or ORM compatibility; or
- the deployment needs production guarantees not listed in the current
  capability page.

## Adoption path

Lagrange does not require an all-at-once rewrite.

1. **Test SQL portability.** Point a representative PostgreSQL client at
   Lagrange and measure the exact SQL slice that works. This proves connection
   compatibility, not data-local execution.
2. **Deploy one WASM endpoint.** Package selected service code behind a request
   handler. This proves lifecycle, isolation, and declared capabilities.
3. **Extract one hot path.** Turn the data-heavy part into a distributed
   operation with `run()` and `reduce()`. This is where rows can stay on their
   partition hosts.

The relevant data must be loaded into Lagrange. There is not yet a supported
PostgreSQL-to-Lagrange migration, CDC, backup, or point-in-time recovery product
surface. Keep the existing system of record until a pilot has proven parity,
cutover, rollback, and recovery for the chosen workload.

Read the [migration and adoption guide](docs/migration.md) before planning a
pilot.

## Try the current public path

Requirements: Node.js 22.12 or newer and npm.

```bash
git clone https://github.com/psvensson/lagrange
cd lagrange
npm install
npm run demo:account-summary
```

The command builds the code-first service into a genuine WASI component,
starts a disposable node, splits a table into two partitions, deploys the
generated records, invokes the HTTP endpoint and direct call surface, and
checks authorization and idempotent replay.

It is a functional proof, not a scale benchmark: both partitions run on one
node, the table is small, and the current call surface refuses shard batches
that exceed its configured row and byte bounds.

To scaffold a service with the installed CLI:

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

### Embed Lagrange in an application

The package also exposes a side-effect-free embedded-runtime factory. Starting
the handle creates the same canonical SQL engine used by the daemon; it does
not create a second storage or query path.

```js
import {createEmbeddedLagrange} from 'lagrange-server';

const lagrange = createEmbeddedLagrange({
  configuration: {
    storage: {dataDir: './data/lagrange-images'},
  },
});

await lagrange.start();
const db = lagrange.openApplicationDatabase({applicationId: 'lagrange-images'});

await db.query('CREATE TABLE images (id TEXT PRIMARY KEY, url TEXT)');
await db.transaction(async (tx) => {
  await tx.query(
    'INSERT INTO images (id, url) VALUES (?, ?)',
    ['hero', 'https://example.test/hero.png'],
  );
});

await lagrange.stop();
```

Application sessions isolate transaction identity, not tables or tenant data.
Use table-level ownership and authorization for security boundaries. Direct
`BEGIN`, `COMMIT`, and `ROLLBACK` statements are reserved; use
`db.transaction(callback)`. The current embedded lifecycle permits one runtime
start per process lifetime.

## Current envelope

Lagrange is experimental alpha software. The current public data-local path has
important boundaries:

- one literal single-table selector per distributed operation;
- no SQL template interpolation or per-call selector parameters;
- 4,096 rows per shard batch by default;
- finite numeric partials with shard-disjoint keys;
- 64 emits and 1,024 partial entries by default;
- eight concurrent shard runs per invocation by default, while same-host runs
  serialize;
- one nested distributed call per HTTP request;
- no global snapshot across independently read partitions;
- no caller cancellation for a running distributed call;
- no caller idempotency key on direct PostgreSQL-wire calls;
- bounded PostgreSQL compatibility, without SCRAM or arbitrary ORM support;
- plain trusted-network node transport, without mTLS; and
- no supported backup/restore/PITR or rolling-upgrade contract for `0.x`.

The generated [current capabilities and limitations](docs/current-capabilities-and-limitations.md)
page is the status authority. The
[technical evaluation brief](docs/evaluate.md) separates what is implemented,
what has test evidence, and what is not yet a product guarantee.

## Documentation

- [Evaluate Lagrange](docs/evaluate.md) - product boundary, fit, evidence,
  risks, and a pilot decision checklist
- [First hour](docs/tutorials/first-hour.md) - run the public code-first proof
  and scaffold a service
- [Programming model](docs/native-programming-model.md) - handlers,
  distributed operations, reducers, and generated deployment records
- [Execution semantics](docs/execution-semantics.md) - retries, idempotency,
  consistency, movement, and hard limits
- [Migration and adoption](docs/migration.md) - staged adoption, data cutover,
  rollback, and exit planning
- [Security](docs/security.md) - current controls, trusted-network assumptions,
  and missing controls
- [Operations readiness](docs/operations-readiness.md) - topology, recovery,
  upgrades, backups, and pilot gates
- [Architecture](architecture/INDEX.md) - conceptual model and subsystem paths
- [Documentation index](docs/README.md) - the complete task-based map

## License and contributions

Lagrange is licensed under AGPL-3.0-only. See [LICENSE](LICENSE).

The source is public but the repository is closed to outside pull requests.
Bug reports are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

Agents working on the repository start at [AGENTS.md](AGENTS.md).
