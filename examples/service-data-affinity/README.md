# MovieLens: distributed SQL and data-affine services

This example shows Lagrange's main idea in action: distributed data and
replicated application code belong to one placement system. You don't enable
data affinity — a deployed service just reads its data the normal way, and
Lagrange learns where its replicas should run.

You'll compute the same MovieLens 100k top-ten ranking three ways:

1. **PostgreSQL grouped SQL** — a primary with two synchronous streaming
   replicas executes `AVG` and `COUNT` per movie.
2. **Lagrange distributed grouped SQL** — the same grouped query runs
   across Lagrange partitions.
3. **A replicated Lagrange service** — two service replicas compute a
   confidence-adjusted Bayesian ranking on disjoint movie-id shards. Each
   publishes at most ten candidates; one replica merges at most twenty.

All three paths use the same ranking formula and return the same ordered
top ten.

## Why a service, not just SQL?

An average is easy SQL. The service applies the kind of application policy
you'd rather keep in deployed code than in a growing SQL expression: it
combines average rating, rating support, a prior mean, and a confidence
penalty:

```text
bayesianMean = (average × count + priorMean × priorWeight)
               / (count + priorWeight)
score = bayesianMean - confidencePenalty / sqrt(count)
```

This favors movies with strong, well-supported ratings over a movie that
received a single five-star vote — small enough to read in one sitting, but
real application logic all the same.

## Prerequisites

- Node.js 22 and `npm install`
- Docker, for the PostgreSQL 16 baseline
- internet access on the first run, to download MovieLens 100k
- enough local resources for PostgreSQL plus five Lagrange processes

## Run it

From the repository root:

```sh
npm run demo:movielens
```

The command downloads the dataset if needed and runs PostgreSQL first. The
Lagrange phase bootstraps the ratings schema and two small coordination tables
on its seed, joins four more nodes, and waits for the operation-ledger quorum
to spread. It then loads the dataset once, waits for the ratings table to
split across at least two nodes, and executes the SQL and service cases. A
machine-readable live report is written under `test-output/reports/`.

To download the dataset once without running the comparison:

```sh
node examples/service-data-affinity/download-movielens.js
```

## What to expect

The report separates measurements that are actually comparable:

| Path | Database result crossing its boundary | Additional service exchange |
| --- | ---: | ---: |
| PostgreSQL grouped SQL | one aggregate per movie | none |
| Lagrange grouped SQL | one aggregate per movie | none |
| Lagrange replicated service | shard scans remain behind service executors | at most `replicas × topN` candidates |

Startup, data loading, and topology differ between the systems, so the demo
does not print a PostgreSQL-versus-Lagrange speedup ratio — it would mislead.
It compares correctness, transfer shape, and the placement learned from real
service access. If you want a performance claim, use a controlled deployment
and repeated steady-state samples, and run on a quiet machine: background CPU
load and host scheduling gaps will distort timing samples.

The interesting part is placement. The service starts wherever normal
placement chooses, because it has no access history yet. Its attributed reads
populate `service_partition_access`; the runtime-service policy then uses the
production node weights and converges on the best weighted node set.
`read_locality` still controls query routing, but does not turn placement
affinity on or off.

Useful things to query while Lagrange runs:

```sql
SELECT node_id, latency_group_id FROM nodes;
SELECT partition_id, leader_node_id FROM partitions;
SELECT node_id, service_id, access_json FROM service_partition_access;
SELECT service_id, node_id, status FROM services;
SELECT slot_id, replica_id, lease_expires_at, partial_json, computed_at
FROM movielens_top10_reduce_slots;
SELECT result_json, computed_at FROM movielens_top10;
```

## Note: internal substrate, not the deployment surface

This demo drives the internal placement substrate directly: the harness
writes a `service_definitions` row for a `native_js` query-loop module and
pins two replicas so the disjoint-shard merge arithmetic is reproducible.
That direct write is demo scaffolding against a migration-input table — it is
not how you deploy services. Deployment is declared through the
Artifact / Binding / Cell surface
([`architecture/minimal-deployment-surface.md`](../../architecture/minimal-deployment-surface.md)),
where a Binding carries no replica intent and Cell capacity is system-policy
output — the same placement policy whose affinity behavior you watch here. A
`native_js` query-loop module has no component export, so this workload is not
expressible as a Binding until source invocation for non-request Bindings cuts
over.

## Troubleshooting

The demo fails closed rather than starting work the cluster cannot finish.
The readiness message includes total and ledger-specific in-flight operation
counts plus the ledger voter shape; the run proceeds only once the ledger has
at least three voters with no single node required for its majority. If that
spread is not reached before the no-progress cutoff, the run stops with a
formation diagnosis instead of issuing a schema request that cannot succeed.

If the command fails before loading ratings, inspect the emitted failure
report and the archived node logs under
`data/examples/service-data-affinity-demo-archive/`.

## Follow the implementation

| Concern | File |
| --- | --- |
| One-command comparison | `run-comparison.js` |
| PostgreSQL grouped baseline | `run-postgres-baseline.js` |
| Shared ranking contract | `movie-ranking.js` |
| Lagrange cluster, SQL and service orchestration | `run-affinity-demo.js` |
| Generic replica reduce loop | `src/runtime/sql-query-loop-runtime-module.js` |
| Stable leases and atomic snapshots | `src/runtime/sql-query-loop-parallel-reduce.js` |
| Placement evidence | `affinity-demo-evidence.js` |
| Always-on affinity policy lift | `src/rebalancer/unified-rebalancer-policy-scheduler-methods.js` |
