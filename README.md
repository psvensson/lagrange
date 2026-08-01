# Lagrange

### Distributed SQL that moves application functions toward the data they use

Lagrange is an experimental distributed database and execution platform. It
partitions and replicates tables, runs portable service code, and places that
code near the replicas it actually accesses.

The compatibility path is to deploy an existing workload with little change.
The larger architectural win comes from extracting data-intensive hot paths so
filtering, policy, transactions, and reduction happen before rows cross into a
separate application tier.

> **Current status:** Lagrange contains working distributed storage,
> transactions, SQL routing, genuine WASI service execution, automatic
> data-affinity placement, diagnostics, and distributed failure testing. The
> public component API is still narrow, managed OCI execution is unsupported,
> and public `call` and `pushdown` invocation adapters are not implemented.
> Lagrange is not yet a production-ready drop-in database.

Start with:

- [Why the programming model is different](docs/native-programming-model.md)
- [Conservative performance and network estimates](docs/performance-and-cost-estimation.md)
- [Conservative infrastructure-cost estimates](docs/infrastructure-cost-estimation.md)
- [A thorough hot-path rewrite example](docs/tutorials/rewrite-a-hot-path.md)
- [Current capabilities and limitations](docs/current-capabilities-and-limitations.md)

---

## Why Lagrange

A conventional service frequently pulls data away from the machines that own
it:

```text
client → arbitrary service replica → database partitions
       ← rows and intermediate results ←
       → writes and final decisions →
```

A Lagrange-native operation moves the function instead:

```text
client or outer service
  → data selector + function
  → partition-local work in parallel
  → compact partial results
  → reducer
  → response
```

The caller names the data and operation rather than a machine, shard endpoint,
or service replica. Lagrange owns routing and placement as partitions split,
replicas move, leaders change, and latency topology evolves.

## Three Ways To Adopt It

| Path | Application change | Primary win | Conservative target for a suitable workload* |
| --- | --- | --- | --- |
| Existing workload in OCI | Very low; managed OCI is planned | Migration, lifecycle, and coarse locality | `0–20%` lower latency when placement removes a meaningful remote hop; otherwise approximately unchanged |
| Existing logic as WASM | Low | Portability, capability isolation, lifecycle, and locality | Similar locality opportunity; do not assume WASM executes the code faster |
| Native Lagrange operation | Targeted hot-path rewrite | Fewer round trips, exact data targeting, and bounded reduction | `15–50%` lower latency for qualifying multi-step paths; `2–10×` end-to-end speedup and `10–1,000×` less transferred data for qualifying data-heavy operations |

*These are calculation-based target ranges, not measured product-wide benchmark
claims. The result depends on round trips, selectivity, bytes moved, partition
count, topology, and the actual bottleneck. See
[Estimating Performance, Throughput, And Network Cost](docs/performance-and-cost-estimation.md)
for equations, examples, and claim boundaries.

Infrastructure consolidation must be calculated separately. The remaining
Lagrange nodes are usually larger and still require replication and failure
headroom. Suitable native workloads may justify screening for `10–35%` fewer
instances and `5–20%` lower compute cost, while small, CPU-bound, or already
consolidated systems may save nothing or cost more. See
[Estimating Infrastructure Consolidation](docs/infrastructure-cost-estimation.md).

A migration does not require rewriting an application. Keep authentication,
HTTP handling, presentation, and external integrations in the existing service.
Extract one expensive transaction, aggregation, enrichment step, validation
path, or state transition.

## What The Native Path Buys

- **Less data movement.** Each partition can filter, score, aggregate, or
  transform locally and return only a compact partial result.
- **Fewer round trips.** A read, related read, validation, write, and audit
  sequence can become one routed partition-local operation.
- **Placement that follows access.** Successful service-issued reads and writes
  become fresh placement evidence, so Cells drift toward the replicas they use.
- **Less topology code.** Application code does not discover nodes, cache shard
  maps, select leaders, or redeploy after a partition split.
- **A stronger capability boundary.** Components receive declared host
  capabilities rather than broad database credentials and arbitrary network
  access.

Raft remains. Writes still reach a leader and quorum. Lagrange removes avoidable
application/data movement around the durability work; it does not weaken the
durability model.

## The Programming Model

Four concepts connect deployed code to distributed data:

- **Artifact:** immutable, digest-pinned service code and manifest
- **Binding:** immutable execution intent connecting an Artifact export to an
  invocation source
- **Cell:** a ready, replaceable instance derived from a Binding and placed by
  the cluster
- **Context:** the capability-controlled bridge from service code to durable
  data and kernel services

Durable service state belongs in ordinary partitioned and replicated tables,
not in Cell-local memory or disk.

### API available today

The current public request-component context is intentionally small:

```wit
interface context {
  read: func(table: u32, key: u32) -> s32;
  write: func(table: u32, key: u32, value: s32);
  capability: func(capability: u32) -> s32;
}
```

A service uses declared table slots rather than connection strings, pools, node
addresses, or leader lookup. Undeclared access is denied at the component
boundary. The runnable JavaScript path is documented in the
[request-binding example](examples/js-request-binding-deployment/README.md).

### Native call direction

The intended richer model makes the data target part of invocation:

```js
await lagrange.call({
  data: ratings.where({movieId: range}),
  function: 'rank-movies',
  reduce: 'merge-top-movies',
});
```

This syntax is directional pseudocode, not a supported public client today.
Only request Bindings currently have a public invocation adapter. The exact
current-versus-directional boundary is in
[The Lagrange Native Programming Model](docs/native-programming-model.md).

## A Concrete Example

The MovieLens example computes the same top-ten ranking through PostgreSQL
grouped SQL, Lagrange distributed grouped SQL, and a replicated Lagrange
service.

The strong SQL baseline returns one aggregate per movie and applies ranking
policy in the application. The data-local service applies that policy on
disjoint shards. Each of two service replicas emits at most ten candidates, so
the final merge sees at most twenty rather than every movie aggregate.

```sh
npm install
npm run demo:movielens
```

The demo proves correctness, bounded exchange, and placement learned from real
access. It deliberately does not claim a PostgreSQL-versus-Lagrange speedup
ratio, and its service path currently uses an internal runtime module.

Read [Rewrite A Hot Path For Lagrange](docs/tutorials/rewrite-a-hot-path.md) for
the baseline code, partition function, reducer, transfer arithmetic, failure
implications, and migration checklist.

## What Exists Today

- range-partitioned SQLite storage with Raft replication;
- multi-partition transactions with recovery and timeout handling;
- one SQL execution engine shared by clients, services, and internal queries;
- PostgreSQL wire support for a bounded measured SQL slice;
- genuine WASI component execution through Artifact / Binding / Cell;
- declared read, write, and capability access for request components;
- observed data-affinity placement and read-locality routing;
- distributed grouped SQL and an internal bounded-reduce demo;
- diagnostics, health probes, an admin CLI, and distributed failure testing.

Important limits include the narrow external context, request-only public
Binding invocation, unsupported managed OCI activation, and bounded rather than
general PostgreSQL compatibility. Read
[Current Capabilities And Limitations](docs/current-capabilities-and-limitations.md)
before evaluating a real workload.

## Try Lagrange

Requirements: Node.js 22.12 or newer and npm.

Install the published server package globally to use its two command-line
programs:

```bash
npm install --global lagrange-server
lagrange --dry-run
lagrange-admin --help
```

Applications can install it locally and import the side-effect-free public API:

```bash
npm install lagrange-server
```

```js
import {VERSION} from 'lagrange-server';
```

The npm package is named `lagrange-server`; the product and executable remain
named `lagrange`. The distributed test-run dashboard can display packaged
static resources, but starting repository-owned distributed scenarios still
requires a source checkout.

To run from a source checkout instead:

```bash
npm install
cp .env.example .env
npm start
```

Open the administration client in another terminal:

```bash
npm run cli -- localhost:8081
```

Continue with the [first-hour tutorial](docs/tutorials/first-hour.md) or the
[service deployment guide](docs/service-deployment-guide.md).

## Good Fit

Lagrange is most interesting when:

- services retrieve substantial data only to filter, score, aggregate,
  validate, or transform it;
- several sequential statements touch the same partition key;
- cross-partition work can return bounded partial results;
- service/database round trips or cross-zone traffic are material; or
- application placement must follow changing sharded data ownership.

It is a poor fit today when you need a mature drop-in database, unmodified OCI
execution, complete PostgreSQL compatibility, or when one cheap indexed query
already returns the final small result.

## Documentation

- [Start here](docs/start-here.md) — paths for evaluators, service authors,
  operators, and architecture readers
- [Native programming model](docs/native-programming-model.md) — adoption
  levels, API boundary, placement, and reduction
- [Performance and cost estimation](docs/performance-and-cost-estimation.md) —
  latency, throughput, transfer, and network-bill calculations
- [Infrastructure cost estimation](docs/infrastructure-cost-estimation.md) —
  capacity consolidation, VM-count, and compute-cost calculations
- [Hot-path rewrite tutorial](docs/tutorials/rewrite-a-hot-path.md) — detailed
  before-and-after example
- [Architecture index](architecture/INDEX.md) — system and process references
- [Current capabilities and limitations](docs/current-capabilities-and-limitations.md)
  — authoritative implementation status
- [Roadmap](roadmap.md) — product direction

Working on the codebase with an AI agent, including Codex? Start at
[AGENTS.md](AGENTS.md). Test and release workflows begin at
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

AGPL-3.0. See [LICENSE](LICENSE).

This project is open source but **closed to outside contributions**
("open-source, not open-contribution", like SQLite). Bug reports are welcome;
pull requests are disabled. See [CONTRIBUTING.md](CONTRIBUTING.md).
