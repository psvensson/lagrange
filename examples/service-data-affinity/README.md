# MovieLens: distributed SQL and data-affine services

This is the newcomer-facing demonstration of Lagrange's main idea:
distributed data and replicated application code belong to one placement
system. You do not enable data affinity. A deployed service publishes its
normal data access, and Lagrange learns where its replicas should run.

The demo processes the MovieLens 100k ratings three ways:

1. **PostgreSQL grouped SQL** — a primary with two synchronous streaming
   replicas executes `AVG` and `COUNT` per movie.
2. **Lagrange distributed grouped SQL** — the same grouped query runs
   across Lagrange partitions.
3. **A replicated Lagrange service** — two service replicas compute a
   confidence-adjusted Bayesian ranking on disjoint movie-id shards. Each
   publishes at most ten candidates; one replica merges at most twenty.

All three paths use the same ranking formula and must return the same
ordered top ten.

## Why the service exists

An average is easy SQL, so it is not a persuasive service workload. The
service instead applies an application policy that combines average rating,
rating support, a prior mean, and a confidence penalty:

```text
bayesianMean = (average × count + priorMean × priorWeight)
               / (count + priorWeight)
score = bayesianMean - confidencePenalty / sqrt(count)
```

This deliberately favors movies with strong, well-supported ratings over a
movie that received a single five-star vote. It is still small enough for a
new developer to understand, but represents the kind of evolving application
logic that belongs in deployed code rather than a growing SQL expression.

## Run it

Prerequisites:

- Node.js 22 and `npm install`;
- Docker, for the PostgreSQL 16 baseline;
- internet access on the first run, to download MovieLens 100k;
- enough local resources for PostgreSQL plus five Lagrange processes.

From the repository root:

```sh
npm run demo:movielens
```

The command downloads the dataset if needed and runs PostgreSQL first. The
Lagrange phase bootstraps the ratings schema and two small coordination tables
on its seed, joins four more nodes, and waits for the actual operation-ledger
quorum to spread. It then loads the dataset once, waits for the ratings table
to split across at least two nodes, and executes the SQL and service cases.
Loading after the expanded control plane is routable avoids manufacturing a
split retry before the cluster can serve it. A machine-readable live report is written under
`test-output/reports/`.

To download once without running the comparison:

```sh
node examples/service-data-affinity/download-movielens.js
```

## What to watch

The report separates measurements that are actually comparable:

| Path | Database result crossing its boundary | Additional service exchange |
| --- | ---: | ---: |
| PostgreSQL grouped SQL | one aggregate per movie | none |
| Lagrange grouped SQL | one aggregate per movie | none |
| Lagrange replicated service | shard scans remain behind service executors | at most `replicas × topN` candidates |

Startup, data loading, and topology differ, so the demo intentionally does
not print a misleading PostgreSQL-versus-Lagrange speedup ratio. It compares
correctness, transfer shape, and the placement learned from real service
access. Use a controlled deployment and repeated steady-state samples for a
performance claim.

The service starts wherever normal placement chooses because it has no access
history yet. Its attributed reads populate `service_partition_access`; the
runtime-service policy then uses the production node weights and converges on
the best weighted node set. `read_locality` still controls query routing, but
does not turn placement affinity on or off.

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

Useful observations while Lagrange runs:

```sql
SELECT node_id, latency_group_id FROM nodes;
SELECT partition_id, leader_node_id FROM partitions;
SELECT node_id, service_id, access_json FROM service_partition_access;
SELECT service_id, node_id, status FROM services;
SELECT slot_id, replica_id, lease_expires_at, partial_json, computed_at
FROM movielens_top10_reduce_slots;
SELECT result_json, computed_at FROM movielens_top10;
```

If the command fails before loading ratings, inspect the emitted failure
report and the archived node logs under
`data/examples/service-data-affinity-demo-archive/`. A green deterministic
guard proves the mechanisms are connected; only a live PASS proves that the
local cluster completed this demonstration.

The readiness message includes total and ledger-specific in-flight operation
counts plus the ledger voter shape. A quiet operation table is not enough: the
demo fails closed unless the ledger has at least three voters and no node is
required for its majority. If that second spread is not planned before the
no-progress cutoff, the run stops with a formation diagnosis instead of
starting a schema request that cannot succeed.

Live confirmation samples are only meaningful on a quiet host: runs on
2026-07-20 were invalidated by host scheduling gaps (tens of seconds of
stolen wall-clock across the run), so check temperatures and background CPU
load before starting a measured demonstration.
