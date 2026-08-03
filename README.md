# Lagrange

Lagrange is a distributed runtime for data-intensive services. Write an HTTP
handler, partition-local functions, and reducers together. Deploy them as
one WASM Artifact. Lagrange exposes the endpoint and runs the data-heavy
parts beside the partitions holding the rows.

```text
Existing application
      |
      | POST /accounts/summary
      v
handleRequest()  in a request Cell
      |
      | callBinding("account-summary-inner", arguments)
      v
Lagrange
  |- run()    on partition host A     raw rows stay local
  |- run()    on partition host B     raw rows stay local
  `- reduce() -> one JSON result      only bounded partials move
      |
      v
one HTTP response
```

> Logically one ordinary service. Physically distributed across the data.

## Three Terms

```text
Artifact - immutable WASM component plus its service manifest
Binding  - named invocation of one export: request (an HTTP endpoint) or
           call (a data selector and its distributed operation), plus budgets
Cell     - a running instance, placed by Lagrange
```

## One Service, One Deployment Definition

The HTTP handler, partition function, and reducer are ordinary code authored
side by side in one source file, compiled into one WASM component, and
installed as one immutable Artifact. Two Bindings expose it, and one access
policy authorizes the handler's outbound call. Everything in this section is
the real, runnable
[account-summary example](examples/call-binding-account-summary/README.md).

**1. The service manifest** - one Artifact, both entry points declared:

```json
{
  "schema_version": 3,
  "name": "account-summary",
  "version": "1.0.0",
  "runtime": {"kind": "wasm_component"},
  "exports": [
    {"name": "handle-request", "interface": "request_v1"},
    {"name": "run", "interface": "call_v1"}
  ],
  "artifact": {"...": "immutable digest-pinned component"},
  "capabilities": []
}
```

**2. The component code** - the HTTP handler, the partition function, and
the reducer live together in one file, compiled against the canonical
committed [`wit/world.wit`](wit/world.wit) world `service-cell`.
`handleRequest` parses the request, asks the host for the named distributed
operation, and owns its endpoint's HTTP mapping - honest statuses for typed
failures included. It never names a node, partition, replica, package,
digest, or SQL statement:

```js
// service.js - HTTP handler, partition function, and reducer, side by side
import {callBinding} from 'lagrange:cell/context';
import {emit} from 'lagrange:cell/call-context';

// Each typed binding-call-error maps to an honest HTTP status; the
// component owns its endpoint responses, Lagrange does not hardcode them.
const HTTP_STATUS_BY_CALL_ERROR_CODE = {
  deadline_exhausted: 504,
  invalid_arguments: 400,
  target_not_allowed: 403,
  target_unavailable: 503,
};

// Runs in the request Cell for each POST /accounts/summary.
export function handleRequest(requestJson) {
  const request = JSON.parse(requestJson);
  try {
    const result = callBinding(
      'account-summary-inner',
      JSON.stringify({accountId: request.body.accountId}),
    );
    return JSON.stringify({
      status: 200,
      headers: [['content-type', 'application/json']],
      body: result,
    });
  } catch (error) {
    const failure = error?.payload ?? {};
    return JSON.stringify({
      status: HTTP_STATUS_BY_CALL_ERROR_CODE[failure.code] ?? 500,
      headers: [['content-type', 'application/json']],
      body: JSON.stringify({code: failure.code ?? 'target_failed'}),
    });
  }
}

// Runs once per relevant partition, on the node holding that partition's
// replica. Scans the local batch; only a few numbers per shard leave the
// node - the transaction rows never do.
export function run(batch, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);
  let matched = 0;
  let totalCents = 0;
  let shardKey = null;
  for (const row of batch) {
    if (integerColumn(row, 'account_id') !== accountId) continue;
    const id = integerColumn(row, 'id');
    const amountCents = integerColumn(row, 'amount_cents');
    if (id === null || amountCents === null) continue;
    if (shardKey === null || id < shardKey) shardKey = id;
    matched += 1;
    totalCents += amountCents;
  }
  if (matched > 0) {
    emit(`count:${shardKey}`, JSON.stringify(matched));
    emit(`total:${shardKey}`, JSON.stringify(totalCents));
  }
  return JSON.stringify({matched, scanned: batch.length});
}

// Runs once, over the complete partial set from every shard.
export function reduce(partials, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);
  let transactions = 0;
  let totalCents = 0;
  for (const [key, partialJson] of partials) {
    const value = JSON.parse(partialJson);
    if (key.startsWith('count:')) transactions += value;
    if (key.startsWith('total:')) totalCents += value;
  }
  return JSON.stringify({accountId, transactions, totalCents});
}

// (The largest/flagged metrics and the integerColumn helper are elided;
//  complete tested source: examples/call-binding-account-summary/service.js)
```

**3. The request Binding** - the public front door: an exact method and
path, targeting the component's `handle-request` export:

```json
{
  "schema_version": 2,
  "name": "account-summary-http",
  "source": {"kind": "request", "method": "POST", "path": "/accounts/summary"},
  "target": {
    "package_id": "<from the INSTALL SERVICE receipt>",
    "manifest_digest": "sha256:<canonical manifest digest>",
    "export_name": "handle-request"
  },
  "budgets": {"...": "request budgets, including wall_time_ms 30000"}
}
```

**4. The call Binding** - the inner distributed operation, against the same
package and manifest digest: which data the function runs over (a
single-table SELECT that Lagrange plans per partition without fetching
rows), which export it targets, and its execution budgets:

```json
{
  "schema_version": 2,
  "name": "account-summary-inner",
  "source": {
    "kind": "call",
    "name": "account-summary-inner",
    "statement": "SELECT id, account_id, amount_cents, flagged FROM account_activity"
  },
  "target": {
    "package_id": "<same package>",
    "manifest_digest": "<same manifest digest>",
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

**5. The service access policy** - durable outbound-call authorization,
applied with `CONFIGURE SERVICE ACCESS`: the request Binding may invoke
exactly the call Bindings it declares. Absent policy or an undeclared
target fails closed, before any dispatch:

```json
{
  "schema_version": 2,
  "binding_name": "account-summary-http",
  "tables": [],
  "calls": [{"binding": "account-summary-inner"}]
}
```

**6. The invocation** - one authenticated HTTP request:

```text
POST /accounts/summary
Authorization: Basic ...
Content-Type: application/json

{"accountId": 202}
```

and one JSON response, the reducer's final result:

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

Replaying the POST with the same `Idempotency-Key` returns the journaled
response byte-identical, without running the inner distributed call again.

The direct SQL surface stays covered too: `CALL BINDING $1` over an
authenticated pgwire session (holding `pgwire.binding.call`) invokes the
same call Binding directly and returns the identical summary.

**7. What runs where**:

```text
POST /accounts/summary {accountId: 202}
  |  (request Binding, authenticated ingress)
  v
handleRequest() in the request Cell
  |  callBinding("account-summary-inner", {accountId})
  |  (host-validated against the durable outbound-call policy)
  v
the one CallCellInvoker
  |- run()    on partition host A     raw rows stay local
  |- run()    on partition host B     raw rows stay local
  `- reduce() -> one JSON result      only bounded partials move
  |
  v
one HTTP response
```

No partitions, replicas, or placement appear anywhere in the service. The
handler names one declared, authorized Binding and passes bounded JSON
arguments; Lagrange owns everything below that line.

## Run It

```bash
npm install
npm run demo:account-summary
```

The demo builds the component from plain JavaScript, installs it into a
disposable local node, splits the ledger table across two partitions,
deploys both Bindings and the access policy over SQL, invokes the HTTP
endpoint and the direct `CALL BINDING` surface, verifies the summaries
against an independent oracle, and proves the undeclared-target refusal and
the idempotent replay. Details:
[the example's README](examples/call-binding-account-summary/README.md).

## What Happens At Runtime

One POST becomes a distributed operation. The request Binding routes the
request to a ready request Cell, where `handleRequest` runs. Its
`callBinding` import crosses a worker-to-parent bridge (the parent thread is
never blocked) into the one canonical `CallCellInvoker`, which validates the
target against the durable outbound-call policy, plans the call Binding's
SELECT into per-partition shards, dispatches `run` to each partition's host
node - where the rows are read locally from that node's own replica - and
dispatches `reduce` once, on the holder of a dedicated reduce lease. Only
the emitted partials cross the network; in the two-node integration proof
the shard tables see zero remote query deliveries.

The nested call runs under the caller's own frozen security context and a
system-owned child identity (`<outer invocation>#call-1`). Its effective
deadline is the tighter of the outer request deadline and the call
Binding's own deadline - never a fresh timeout - and a request invocation
may make one nested call today.

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

The service model itself carries the rest of the weight: the HTTP handler,
partition function, reducer, manifest, Bindings, and access policy are
written, reviewed, tested, versioned, and deployed together. No hand-built
fan-out layer, no shard maps in application code, no redeploy when a
partition splits. Components receive declared capabilities rather than
broad database credentials.

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
- request and call Bindings, including HTTP-to-call composition: a request
  handler invoking a declared call Binding through the service context
- data-local partition execution and bounded parallel fan-out
- leased reduction with one atomic result
- Raft-replicated partitioned storage

Not yet:

- JavaScript client SDK for direct calls (direct invocation is pgwire
  `CALL BINDING`)
- structured partials (numeric per-group values only)
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
