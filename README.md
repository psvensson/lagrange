# Lagrange

Lagrange is a distributed runtime for data-intensive services. Write the
data-intensive operation as one WASM component - partition-local functions
and reduction code together - and call it from an existing service through a
named Binding. Lagrange runs each part on the database nodes holding the
relevant data.

```text
Existing service
      |
      | CALL BINDING "account-summary"
      v
Lagrange
  |- run()    on partition host A     raw rows stay local
  |- run()    on partition host B     raw rows stay local
  `- reduce() -> one JSON result      only bounded partials move
```

> Logically one ordinary service. Physically distributed across the data.

## Three Terms

```text
Artifact - immutable WASM component plus its service manifest
Binding  - named invocation: data selector, target export, budgets
Cell     - a running instance, placed by Lagrange
```

## One Service Component, One Deployment Definition

The partition function and reducer are ordinary code authored side by side.
A small service manifest defines what the component exports, and a call
Binding defines how it is invoked and which data it runs over. Everything in
this section is the real, runnable
[account-summary example](examples/call-binding-account-summary/README.md).

**A. The service manifest** - artifact identity, runtime, and the exported
interface:

```json
{
  "schema_version": 3,
  "name": "account-summary",
  "version": "1.0.0",
  "runtime": {"kind": "wasm_component"},
  "exports": [{"name": "run", "interface": "call_v1"}],
  "artifact": {"...": "immutable digest-pinned component"},
  "capabilities": []
}
```

**B. The component code** - the partition function and reducer live together
in one component. `run` receives the node's local rows and emits a few
numeric partials via the host `emit` import; `reduce` merges every
partition's partials into the final result:

```js
// service.js - partition function and reducer, side by side
import {emit} from 'lagrange:cell/call-context';

// Runs once per relevant partition, on the node holding that partition's
// replica. Scans the local batch; only four numbers per shard leave the
// node - the transaction rows never do.
export function run(batch, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);
  let matched = 0;
  let totalCents = 0;
  let largestCents = 0;
  let flagged = 0;
  let shardKey = null;
  for (const row of batch) {
    if (integerColumn(row, 'account_id') !== accountId) continue;
    const id = integerColumn(row, 'id');
    const amountCents = integerColumn(row, 'amount_cents');
    if (id === null || amountCents === null) continue;
    if (shardKey === null || id < shardKey) shardKey = id;
    matched += 1;
    totalCents += amountCents;
    if (amountCents > largestCents) largestCents = amountCents;
    if (integerColumn(row, 'flagged') === 1) flagged += 1;
  }
  if (matched > 0) {
    emit(`count:${shardKey}`, JSON.stringify(matched));
    emit(`total:${shardKey}`, JSON.stringify(totalCents));
    emit(`largest:${shardKey}`, JSON.stringify(largestCents));
    emit(`flagged:${shardKey}`, JSON.stringify(flagged));
  }
  return JSON.stringify({matched, scanned: batch.length});
}

// Runs once, over the complete partial set from every shard.
export function reduce(partials, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);
  let transactions = 0;
  let totalCents = 0;
  let largestCents = 0;
  let flagged = 0;
  const shards = new Set();
  for (const [key, partialJson] of partials) {
    const [metric, shardKey] = key.split(':');
    const value = JSON.parse(partialJson);
    shards.add(shardKey);
    if (metric === 'count') transactions += value;
    else if (metric === 'total') totalCents += value;
    else if (metric === 'largest') largestCents = Math.max(largestCents, value);
    else if (metric === 'flagged') flagged += value;
  }
  return JSON.stringify({
    accountId,
    transactions,
    totalCents,
    largestCents,
    meanCents: transactions === 0 ? 0 : Math.round(totalCents / transactions),
    flagged,
    contributingShards: shards.size,
  });
}

// (integerColumn helper elided; complete tested source:
//  examples/call-binding-account-summary/service.js)
```

**C. The call Binding** - the call declaration: which data the function runs
over (a single-table SELECT that Lagrange plans per partition without
fetching rows), which export it targets, and its execution budgets:

```json
{
  "schema_version": 2,
  "name": "account-summary",
  "source": {
    "kind": "call",
    "name": "account-summary",
    "statement": "SELECT id, account_id, amount_cents, flagged FROM account_activity"
  },
  "target": {
    "package_id": "<from the INSTALL SERVICE receipt>",
    "manifest_digest": "sha256:<canonical manifest digest>",
    "export_name": "run"
  },
  "budgets": {
    "cpu_time_ms": 2000,
    "wall_time_ms": 30000,
    "memory_bytes": 134217728,
    "input_bytes": 1048576,
    "output_bytes": 65536,
    "context_bytes": 8192
  }
}
```

**D. The invocation** - one statement over an authenticated PostgreSQL-wire
session:

```sql
CALL BINDING $1
-- $1 = '{"schema_version": 2, "name": "account-summary",
--        "arguments": {"accountId": 202}}'
```

and one row back, whose `result` is the reducer's final JSON:

```json
{
  "accountId": 202,
  "transactions": 50,
  "totalCents": 535775,
  "largestCents": 17991,
  "meanCents": 10716,
  "flagged": 12,
  "contributingShards": 2
}
```

No partitions, replicas, or placement appear in the caller's view, and a
session without the `pgwire.binding.call` action is refused before any
dispatch. A direct language-level call API is planned; today applications
invoke named Bindings over pgwire.

## Run It

```bash
npm install
npm run demo:account-summary
```

The demo builds the component from plain JavaScript, installs it into a
disposable local node, splits the ledger table across two partitions,
invokes the Binding, verifies the summaries against an independent oracle,
and proves the unauthorized-session refusal. Details:
[the example's README](examples/call-binding-account-summary/README.md).

## What Happens At Runtime

One `CALL` becomes a distributed operation. Lagrange plans the Binding's
SELECT into per-partition shards, dispatches `run` to each partition's host
node - where the rows are read locally from that node's own replica - and
dispatches `reduce` once, on the holder of a dedicated reduce lease. Only
the emitted partials cross the network; in the two-node integration proof
the shard tables see zero remote query deliveries.

If the required service instance is missing on a host, Lagrange makes it
exist - including the code itself:

```text
Cell already on the partition host?
  yes - run immediately
  no  - place a Cell there via a bounded lease and a placement pin,
        reconstruct the component from Lagrange's replicated artifact
        tables (chunked, digest-verified, sealed at install time),
        then run locally
```

Installed WASM bytes are cluster-owned: losing every node-local cache, or
the original OCI source, does not make an installed service unavailable.

Shard dispatch is parallel and bounded (default 8 concurrent runs,
deployment-tunable). Shards on distinct host nodes overlap; shards on one
host serialize, because a Cell runs one invocation at a time. The current
implementation targets each partition's canonical leader as the shard host;
broader replica selection is future work.

The reduce step refuses to publish unless every shard's partial set is
complete, fresh, and disjoint, and it publishes exactly one atomic result
snapshot.

## Why It Helps

The database is already distributed. The application work usually is not. A
conventional service pulls rows out of the partitions that own them, ships
them through the network into a central compute tier, filters and
aggregates them there, and throws most of the bytes away. When the work
spans shards, developers hand-build the fan-out, retries, routing, and
merge logic in a repository far from the data it depends on.

Lagrange distributes parts of the service invocation itself, and the win
scales with the ratio

```text
data scanned or transformed >> result returned
```

In the flagship example each shard reduces its slice of the ledger to four
numbers. The network carries eight partials and one small JSON summary -
the same bytes whether the table holds 150 rows or 150 million. Central
coordinators merge compact summaries instead of loading every matching row.
For worked equations and honest claim boundaries, see
[performance and cost estimation](docs/performance-and-cost-estimation.md)
and
[infrastructure cost estimation](docs/infrastructure-cost-estimation.md).

The service model itself carries the rest of the weight: the partition
function, reducer, manifest, and Binding are written, reviewed, tested,
versioned, and deployed together. No hand-built fan-out layer, no shard
maps in application code, no redeploy when a partition splits. Components
receive declared capabilities rather than broad database credentials.

Raft remains underneath. Writes still reach a leader and quorum; Lagrange
removes avoidable data movement around the durability work, it does not
weaken it.

## Good Fit

Lagrange is most interesting when services retrieve substantial data only
to filter, score, aggregate, validate, or transform it; when
cross-partition work can return bounded partial results; or when
service/database round trips or cross-zone traffic are material.

It is a poor fit today when you need a mature drop-in database, complete
PostgreSQL compatibility, or when one cheap indexed query already returns
the final small result.

You do not have to rewrite anything to start. An unmodified Node.js
PostgreSQL application can point at Lagrange's pgwire listener
([service-portability example](examples/service-portability/README.md)),
and existing HTTP workloads can run as WASM request bindings
([js-request-binding example](examples/js-request-binding-deployment/README.md)).
OCI containers and the legacy callback surface are
[compatibility and internals](docs/start-here.md#compatibility-and-internals)
material.

## Current State

Lagrange is alpha, with no backward-compatibility guarantee on `0.x`.

Works today:

- WASM installation and cluster-owned artifact storage
- request and call Bindings
- data-local partition execution and bounded parallel fan-out
- leased reduction with one atomic result
- Raft-replicated partitioned storage

Not yet:

- JavaScript or HTTP client for call Bindings (pgwire is the CALL ingress)
- structured partials (numeric per-group values only)
- published call-authoring WIT package (the world lives in test fixtures)
- general PostgreSQL compatibility (a bounded, measured slice)
- managed OCI activation (compatibility scaffold only)

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

The npm package is named `lagrange-server`; the product and executable
remain named `lagrange`. To run from a source checkout instead:

```bash
npm install
cp .env.example .env
npm start
```

Open the administration client in another terminal:

```bash
npm run cli -- localhost:8081
```

Continue with the [first-hour tutorial](docs/tutorials/first-hour.md) or
the [service deployment guide](docs/service-deployment-guide.md).

## Documentation

What it is:

- [Start here](docs/start-here.md) - reading paths from model to operations

How to build one:

- [Native programming model](docs/native-programming-model.md) - the
  service model, API boundary, placement, and reduction
- [WASM services user guide](docs/wasm-services-user-guide.md) - authoring
  and packaging components
- [Service deployment guide](docs/service-deployment-guide.md) - lifecycle
  SQL: install, bind, configure access, call
- [Execution semantics](docs/execution-semantics.md) - retries,
  idempotency, partial failure, limits, movement
- [First-hour tutorial](docs/tutorials/first-hour.md) and
  [hot-path rewrite tutorial](docs/tutorials/rewrite-a-hot-path.md)
- [Examples](examples/README.md), including the MovieLens
  placement-and-reduction comparison (`npm run demo:movielens`)

How it works:

- [Architecture overview](architecture.md) and the
  [architecture index](architecture/INDEX.md)
- [Performance and cost estimation](docs/performance-and-cost-estimation.md)
  and
  [infrastructure cost estimation](docs/infrastructure-cost-estimation.md)

Status and direction:

- [Current capabilities and limitations](docs/current-capabilities-and-limitations.md)
- [Roadmap](roadmap.md)

Working on the codebase with an AI agent, including Codex? Start at
[AGENTS.md](AGENTS.md). Test and release workflows begin at
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).

This project is open source but **closed to outside contributions**
("open-source, not open-contribution", like SQLite). Bug reports are
welcome; pull requests are disabled. See [CONTRIBUTING.md](CONTRIBUTING.md).
