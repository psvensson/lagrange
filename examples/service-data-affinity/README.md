# MovieLens: distributed SQL and data-local application policy

This example shows the architectural difference between running a service near
a database and rewriting an operation so useful work happens beside each data
shard.

It computes the same MovieLens 100k top-ten ranking three ways:

1. **PostgreSQL grouped SQL** — a primary with two synchronous streaming
   replicas executes `AVG` and `COUNT` per movie.
2. **Lagrange distributed grouped SQL** — the same grouped query runs across
   Lagrange partitions.
3. **A replicated Lagrange service** — two service replicas apply a
   confidence-adjusted Bayesian ranking on disjoint movie-id shards. Each
   publishes at most ten candidates; one replica merges at most twenty.

All three paths use the same ranking formula and return the same ordered top
ten.

For a line-by-line before-and-after application walkthrough, read
[Rewrite A Hot Path For Lagrange](../../docs/tutorials/rewrite-a-hot-path.md).
For the current public component API and the future selector/call direction,
read
[The Lagrange Native Programming Model](../../docs/native-programming-model.md).

## Why This Is A Fair Baseline

The comparison does not make the conventional service pull every raw rating
into application memory. PostgreSQL groups first and returns one aggregate per
movie. That is a sensible best-of-breed implementation.

The remaining boundary is:

```text
all partitions
  → AVG and COUNT for every movie
  → application service
  → Bayesian score for every movie
  → global sort
  → ten results
```

The Lagrange service changes the execution shape:

```text
ratings shard A
  → local AVG and COUNT
  → local Bayesian policy
  → local top ten ┐
                  ├→ merge at most twenty → final top ten
ratings shard B  │
  → local AVG and COUNT
  → local Bayesian policy
  → local top ten ┘
```

The win is not that code has been packaged differently. The win is that policy
which previously ran after all grouped results crossed into an application
process now runs before the exchange, beside each shard.

## Why A Service, Not Just More SQL?

An average and count are natural SQL. The ranking formula is application
policy:

```text
bayesianMean = (average × count + priorMean × priorWeight)
               / (count + priorWeight)
score = bayesianMean - confidencePenalty / sqrt(count)
```

It combines observed rating quality, amount of support, a prior mean, and a
confidence penalty. This is the kind of logic teams often want to:

- keep in normal source control;
- unit test as application code;
- version independently;
- share with other application paths; and
- change without growing a stored-procedure surface.

Lagrange's native model is not "replace SQL with functions." The useful
combination is:

1. SQL performs relational scans and grouping locally;
2. application code applies policy locally; and
3. reduction exchanges only bounded candidates.

## What Was Rewritten

The outer request and result contract do not need to change. Only the ranking
hot path changes.

A conventional service would execute grouped SQL, receive every movie
aggregate, score all candidates, sort, and keep ten.

The data-local service instead gives each replica responsibility for a disjoint
movie-id shard. Each replica:

1. executes its grouped scan;
2. computes the Bayesian score in application code;
3. retains only its local top ten;
4. publishes the bounded partial under a lease; and
5. participates in producing an atomic final snapshot.

The generic runtime pieces are:

- `src/runtime/sql-query-loop-runtime-module.js`
- `src/runtime/sql-query-loop-parallel-reduce.js`

The demo-specific formula and orchestration remain in this example directory.

## Transfer Shape

The report keeps unlike measurements separate:

| Path | Database result crossing its boundary | Additional service exchange |
| --- | ---: | ---: |
| PostgreSQL grouped SQL | one aggregate per movie | none |
| Lagrange grouped SQL | one aggregate per movie | none |
| Lagrange replicated service | shard scans remain behind service executors | at most `replicas × topN` candidates |

For this run, `replicas = 2` and `topN = 10`, so the service merge receives at
most twenty candidates.

This bound matters as data grows. Let:

- `N` be matching raw rows;
- `M` be grouped movies;
- `R` be participating shards; and
- `K` be the requested result count.

Then the relevant boundary shapes are approximately:

| Strategy | Boundary volume |
| --- | ---: |
| Application aggregation | `N` rows |
| Strong grouped-SQL baseline | `M` aggregates |
| Shard-local policy and bounded reduction | at most `R × K` candidates |

The demo verifies this shape and result parity. It does not claim that every
workload should be rewritten or that every native function will be faster.

## Placement Is Part Of The Result

The service starts wherever ordinary placement chooses because no access
history exists yet.

Queries carry the issuing service identity. Successful reads populate
`service_partition_access`, which records the partitions actually executed
against. Fresh evidence becomes node and latency-group weights, and the runtime
service policy converges on the best weighted node set.

Two separate mechanisms are visible:

- **placement affinity** is a slow topology decision that moves service Cells
  toward replicas they use; and
- **read locality** is a fast query-routing decision that orders suitable
  replicas for an individual read.

`read_locality` does not switch placement affinity on. Placement is lifted from
observed access when fresh evidence exists.

Useful queries while Lagrange runs:

```sql
SELECT node_id, latency_group_id FROM nodes;
SELECT partition_id, leader_node_id FROM partitions;
SELECT node_id, service_id, access_json FROM service_partition_access;
SELECT service_id, node_id, status FROM services;
SELECT slot_id, replica_id, lease_expires_at, partial_json, computed_at
FROM movielens_top10_reduce_slots;
SELECT result_json, computed_at FROM movielens_top10;
```

The full mechanism is documented in
[Process: Data Affinity](../../architecture/process-data-affinity.md).

## Prerequisites

- Node.js 22 and `npm install`
- Docker, for the PostgreSQL 16 baseline
- internet access on the first run, to download MovieLens 100k
- enough local resources for PostgreSQL plus five Lagrange processes

## Run It

From the repository root:

```sh
npm run demo:movielens
```

The command downloads the dataset if needed and runs PostgreSQL first. The
Lagrange phase:

1. bootstraps the ratings schema and two coordination tables on its seed;
2. joins four more nodes;
3. waits for the operation-ledger quorum to spread;
4. loads the dataset once;
5. waits for the ratings table to split across at least two nodes;
6. executes distributed SQL and service cases; and
7. writes a machine-readable live report under `test-output/reports/`.

To download the dataset without running the comparison:

```sh
node examples/service-data-affinity/download-movielens.js
```

## How To Read The Report

Check four things in order:

1. **Correctness** — all paths produce the same ordered top ten.
2. **Transfer shape** — grouped SQL emits one result per movie; the service
   emits bounded top-N partials.
3. **Chronology** — partial leases and the final atomic snapshot represent one
   coherent reduce generation.
4. **Affinity** — attributed partition access produces placement evidence and
   the service converges toward a better weighted node set.

Startup, loading, and topology differ between PostgreSQL and Lagrange. The demo
therefore does not print a PostgreSQL-versus-Lagrange speedup ratio. Such a ratio
would be misleading.

For a performance claim, use a controlled deployment and repeated steady-state
samples. Measure at least:

- p50, p95, and p99 latency after warm-up;
- bytes crossing the service/database boundary;
- CPU per completed operation;
- partitions and replicas touched;
- retry and timeout rates; and
- background host load and scheduling gaps.

## Current API Boundary

This demo proves the data-local execution, bounded-reduction, and placement
shape, but it is not yet the public service-authoring path.

It drives the internal placement substrate directly: the harness writes a
`service_definitions` row for a kernel-internal `native_js` query-loop module
and pins two replicas so the disjoint-shard arithmetic is reproducible.

That direct write is demo scaffolding against a migration-input table. It is not
how externally authored services are deployed.

Public deployment uses Artifact / Binding / Cell. Genuine WASI request
components are externally installable today, and the current public context
provides `read`, `write`, and `capability`. The accepted `call` and `pushdown`
Binding source kinds do not yet have public invocation adapters, and the richer
partition-local SQL and reducer context remains product direction.

This distinction is intentional:

- the demo shows that the execution and placement substrate exists;
- the request-binding examples show the supported external component boundary;
- the missing work is the public native invocation and richer context surface.

## Troubleshooting

The demo fails closed rather than starting work the cluster cannot finish.
Readiness includes total and ledger-specific in-flight operation counts plus the
ledger voter shape. The run proceeds only once the ledger has at least three
voters with no single node required for its majority.

If that spread is not reached before the no-progress cutoff, the run stops with
a formation diagnosis instead of issuing a schema request that cannot succeed.

If the command fails before loading ratings, inspect the emitted failure report
and archived node logs under:

```text
data/examples/service-data-affinity-demo-archive/
```

## Follow The Implementation

| Concern | File |
| --- | --- |
| One-command comparison | `run-comparison.js` |
| PostgreSQL grouped baseline | `run-postgres-baseline.js` |
| Shared ranking contract | `movie-ranking.js` |
| Lagrange cluster, SQL, and service orchestration | `run-affinity-demo.js` |
| Generic replica reduce loop | `src/runtime/sql-query-loop-runtime-module.js` |
| Stable leases and atomic snapshots | `src/runtime/sql-query-loop-parallel-reduce.js` |
| Placement evidence | `affinity-demo-evidence.js` |
| Always-on affinity policy lift | `src/rebalancer/unified-rebalancer-policy-scheduler-methods.js` |
