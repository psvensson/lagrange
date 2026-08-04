# Lagrange

Lagrange runs the data-heavy parts of a service on the database nodes that
already hold the relevant rows.

Write an HTTP handler, a partition function, and a reducer in ordinary
JavaScript. Compile them into one WASM component. A Request Binding maps an
HTTP route to the handler. A Call Binding maps a named distributed operation
to its partition-local SELECT, its `run` export, and its budgets.

When the handler invokes that operation, Lagrange runs `run` beside each
matching partition, moves only the emitted partial results, calls `reduce`
once, and returns the result through the HTTP handler.

`INSTALL SERVICE` stores the verified WASM bytes in replicated Lagrange
tables, so starting the service does not depend on the original OCI
registry or on a particular node's filesystem cache.

```text
POST /accounts/summary
        |
        v
handleRequest()
        |
        | summarizeAccountActivity(accountId)
        |   -> Call Binding "summarize-account-activity"
        v
run() on matching partition hosts
        |
        | emitted counts and totals only
        v
reduce()
        |
        v
HTTP JSON response
```

Each partition sends only the numbers emitted by `run`; the selected table
rows remain on the partition host.

> Logically one ordinary service. Physically distributed across the data.

## Three Terms

```text
Artifact - immutable WASM component plus its service manifest
Binding  - named invocation of one export: request (an HTTP endpoint) or
           call (a data selector and its distributed operation), plus budgets
Cell     - a running instance, placed by Lagrange
```

## One WASM Component, Two Bindings

The example below deploys five records together, each with a distinct job:
one manifest, one WASM component, one Request Binding, one Call Binding,
and one access policy. All of it is the real, runnable
[account-summary example](examples/call-binding-account-summary/README.md).

The wiring, before any code:

```text
HTTP route
  POST /accounts/summary

Request Binding
  account-summary-http
  -> calls handleRequest()

Distributed operation
  summarize-account-activity
  -> SELECT rows from account_activity
  -> calls run() once per relevant partition
  -> calls reduce() once with the emitted partials
```

And the names, since several look alike:

| Name | Kind | Meaning |
| --- | --- | --- |
| `account-summary` | Artifact/service name | The installed WASM component and manifest |
| `handle-request` | WIT export | HTTP request entry point |
| `handleRequest` | JavaScript export | JS spelling generated from `handle-request` |
| `account-summary-http` | Request Binding name | Connects `POST /accounts/summary` to `handle-request` |
| `summarize-account-activity` | Call Binding name | Connects the selector and budgets to `run`/`reduce` |
| `run` | Call export | Runs once per selected partition |
| `reduce` | Paired call export | Combines all emitted partials |

The Call Binding targets `run`; the `call_v1` interface includes the paired
`reduce` export from the same component, so `reduce` needs no name of its
own in the manifest or Binding.

### The Idea In One Minute

The distributed operation is declared first, as a Call Binding. This is
the seven-line heart of it:

```json
{
  "name": "summarize-account-activity",
  "source": {
    "kind": "call",
    "statement": "SELECT id, account_id, amount_cents, flagged FROM account_activity"
  },
  "target": {"export_name": "run"}
}
```

`summarize-account-activity` is the name of a deployed Call Binding, not a
JavaScript export. The Binding connects that name to the `run` export, the
partition-local SELECT, the execution budgets, and the paired `reduce`
step.

A function reference identifies code. A Call Binding identifies:

- the code to execute;
- the rows it applies to;
- its resource budgets;
- whether the caller may invoke it;
- and how Lagrange should fan out and reduce the work.

The component invokes the operation through an ordinary-looking domain
function; the wrapper is where the unavoidable deployment name lives:

```js
// service.js - HTTP handler, partition function, and reducer, side by side
import {callBinding} from 'lagrange:cell/context';
import {emit} from 'lagrange:cell/call-context';

const DISTRIBUTED_OPERATIONS = Object.freeze({
  summarizeAccountActivity: 'summarize-account-activity',
});

function summarizeAccountActivity(accountId) {
  return callBinding(
    DISTRIBUTED_OPERATIONS.summarizeAccountActivity,
    JSON.stringify({accountId}),
  );
}

// Runs in the request Cell for each POST /accounts/summary. It maps
// typed call failures to HTTP status codes; the component owns its
// endpoint responses.
export function handleRequest(requestJson) {
  const request = JSON.parse(requestJson);
  const result = summarizeAccountActivity(request.body.accountId);
  return JSON.stringify({
    status: 200,
    headers: [['content-type', 'application/json']],
    body: result,
  });
}

// Runs once per relevant partition, on the node holding that partition's
// replica. Scans the local batch; only a few numbers per shard leave the
// node.
export function run(batch, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);
  let matched = 0;
  let totalCents = 0;
  let shardKey = null;
  for (const row of batch) {
    if (integerColumn(row, 'account_id') !== accountId) continue;
    shardKey = shardKey === null ? integerColumn(row, 'id') :
      Math.min(shardKey, integerColumn(row, 'id'));
    matched += 1;
    totalCents += integerColumn(row, 'amount_cents');
  }
  if (matched > 0) {
    emit(`count:${shardKey}`, JSON.stringify(matched));
    emit(`total:${shardKey}`, JSON.stringify(totalCents));
  }
  return JSON.stringify({matched});
}

// Runs once, over the complete partial set from every shard.
export function reduce(partials, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);
  let transactions = 0;
  let totalCents = 0;
  for (const [key, partialJson] of partials) {
    if (key.startsWith('count:')) transactions += JSON.parse(partialJson);
    if (key.startsWith('total:')) totalCents += JSON.parse(partialJson);
  }
  return JSON.stringify({accountId, transactions, totalCents});
}

// (Error-to-HTTP mapping, extra metrics, the demo's refusal-probe
//  parameter, and the integerColumn helper are elided; complete tested
//  source: examples/call-binding-account-summary/service.js)
```

Run it:

```bash
npm install
npm run demo:account-summary
```

The demo builds the component from plain JavaScript, installs it into a
disposable local node, splits the ledger table across two partitions,
deploys both Bindings and the access policy over SQL, invokes the HTTP
endpoint and the direct `CALL BINDING` surface, verifies the summaries
against an independent oracle, and proves the undeclared-target refusal
and the idempotent replay.

<details>
<summary><strong>Complete deployment</strong> - the full manifest, both
Bindings, the access policy, and the HTTP exchange</summary>

**The service manifest** - one component, compiled into one WASM component
and installed with a digest-pinned manifest, both entry points declared:

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

**The Request Binding** - the public front door: an exact method and path,
targeting the component's `handle-request` export:

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

**The Call Binding** - the complete declaration of the distributed
operation, against the same package and manifest digest:

```json
{
  "schema_version": 2,
  "name": "summarize-account-activity",
  "source": {
    "kind": "call",
    "name": "summarize-account-activity",
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

**The access policy** - an allowlist stored for the Request Binding
(formally: the durable outbound-call authorization), applied with
`CONFIGURE SERVICE ACCESS`. The request Binding may invoke exactly the
Call Bindings it declares; absent policy or an undeclared target fails
closed, before any dispatch:

```json
{
  "schema_version": 2,
  "binding_name": "account-summary-http",
  "tables": [],
  "calls": [{"binding": "summarize-account-activity"}]
}
```

**The HTTP exchange** - one authenticated request:

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
response byte-identical, without running the distributed operation again.

The direct SQL surface stays covered too: `CALL BINDING $1` over an
authenticated pgwire session (holding `pgwire.binding.call`) invokes the
same Call Binding directly and returns the identical summary.

The full `handleRequest` also maps typed call failures to HTTP status
codes (403 for a target the policy does not allow, 400 for invalid
arguments, 504 for an exhausted deadline, 503 for a temporarily
unavailable target, 500 otherwise) - see the example source.

</details>

## What Happens At Runtime

The handler supplies only the Call Binding name and JSON arguments. The
distributed call runtime then:

1. looks up that Binding for the authenticated tenant;
2. checks that the request service's access policy allows it;
3. parses the Binding's SELECT and resolves the relevant partitions;
4. ensures a ready Cell exists on each selected partition host;
5. executes `run` against rows read locally on each host;
6. sends only the emitted partials to `reduce`;
7. returns the reduced JSON to `handleRequest`.

The nested call runs under the same authenticated identity and cannot
outlive the HTTP request's deadline; a request invocation may make one
nested call today.

If the partition host has no ready Cell, the call runtime writes a
time-limited activation lease for that service and node. The normal
rebalancer treats the lease as a placement pin, starts a Cell there, and
the WASM driver loads the component from its local cache or from the
artifact payload tables.

Those tables are where installed code lives: `INSTALL SERVICE` verifies
the WASM component, splits its payload into chunks, and writes the
metadata and bytes to the internal `artifact_payloads` and
`artifact_payload_chunks` tables. These tables use Lagrange's normal
partition, Raft, and SQLite storage path. A node starting a Cell reads and
verifies those chunks, writes a disposable local cache copy, and starts
the component. The original OCI registry is no longer required after
installation - the landed tests prove reconstruction after every cache and
the original OCI source have been removed.

Shard dispatch is parallel and bounded (default 8 concurrent runs,
deployment-tunable). Shards on distinct host nodes overlap; shards on one
host serialize, because a Cell runs one invocation at a time. The current
implementation targets each partition's canonical leader as the shard
host; broader replica selection is future work.

The reduce step refuses to publish unless every shard's partial set is
complete, fresh, and disjoint, and it publishes exactly one atomic result
snapshot. In the two-node integration proof the shard tables see zero
remote query deliveries: the selected rows never leave their hosts.

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

- WASM installation with verified payloads stored in the replicated
  `artifact_payloads` / `artifact_payload_chunks` tables
- request and call Bindings, including HTTP-to-call composition: a request
  handler invoking a declared Call Binding through the service context
- data-local partition execution and bounded parallel fan-out
- leased reduction with one atomic result
- Raft-replicated partitioned storage

Not yet:

- JavaScript client SDK for direct calls (direct invocation is pgwire
  `CALL BINDING`); generated operation handles for `callBinding` are a
  likely future authoring surface
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
