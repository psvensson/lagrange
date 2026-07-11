# Service↔Data Affinity Demo — code moves to its data

This is the live demonstration of Lagrange's differentiator: a deployed
**service** whose replicas are placed as near as possible to the
**data** it accesses (epic:
[`solve/epics/service-data-affinity-placement.md`](../../solve/epics/service-data-affinity-placement.md)).

Unlike the [`movielens-access-affinity`](../movielens-access-affinity/)
benchmark — which ships *compute to data* via partition callbacks —
this demo deploys a real **runtime service** that issues SQL, and then
watches the placement machinery move the *service itself* onto the nodes
with the strongest weighted share of the data it accesses.

## What happens

1. **Five nodes start in one latency domain.** The MovieLens `ratings`
   table is forced to split, producing multiple independently replicated
   data partitions with asymmetric node weights.
2. **A centralized reference runs.** It transfers the full ratings scan
   to the caller, reduces all rows there, and records the exact top-10.
3. **A runtime service deploys with affinity disabled**
   (`service_definitions` row):
   `runtime_kind: native_js`, `runtime_ref: sql-query-loop-runtime`
   (the generic query-loop module), `read_locality: 'any'`, and
   `replica_count: 2`.
   - leased reduce slot 1 scans movie IDs up to 1000;
   - leased reduce slot 2 scans movie IDs above 1000;
   - each replica reduces its disjoint group-key shard to a partial
     top-10;
   - the slot-1 replica merges at most 20 partial candidates into the
     exact global top-10.

   Reduce slots, not generation-shaped replica IDs such as `r1`/`r3`,
   own shard identity. Slot leases and partial JSON snapshots share one
   coordination row, so replacement clears the predecessor snapshot
   atomically before doing work.
4. **The demo records the affinity-off baseline**, including replica
   placement, weighted node-locality, partial-replica count, bounded
   merge-candidate count, and result correctness.
5. **Only `read_locality` changes to `same_group`:**
   - every statement is attributed into the CDC-propagated
     `service_partition_access` table (per-node delta rows);
   - the
     runtime-service rebalancer lifts fresh attribution into
     `dataAffinity.nodeWeights` and enables the
     `DATA_AFFINITY` placement dimension;
   - the MovePlanner migrates replicas when the weighted gain exceeds
     its incumbent movement cost.

The demo converges only when the two current replica generations occupy
the best achievable weighted node set, own the complete live slot set,
have published fresh bounded partial snapshots, and produced a fresh
merged result identical to the centralized reference.

## What the comparison means

There are two deliberately separate comparisons:

- **Reduce shape:** centralized full-row transfer and reduction versus
  two service replicas reducing disjoint group-key shards and exchanging
  only `replicas × topN` merge candidates.
- **Placement policy:** the same deployed workload with affinity off and
  then on. Placement quality is computed by the production node-weight
  owner, not by the weak test "this node holds any accessed partition."

The SQL engine may fan each shard scan across several data partitions;
that is partition-parallel scan. The two runtime replicas perform the
reduce shards concurrently; that is service-replica parallel reduce.
The final bounded candidate merge is a third, explicitly reported stage.

## Run it

```sh
# one-time: fetch the movielens 100k dataset
node examples/movielens-access-affinity/download-movielens.js

# the demo (local processes only — no Docker)
node examples/service-data-affinity/run-affinity-demo.js
```

Expect a few minutes end to end: attribution publishes periodically, the
policy owner reads a staleness-bounded window, and the rebalancer plans
on its periodic cadence. The observation log shows the centralized row
count, partial candidates, affinity-off/on weighted-locality ratios, and
the exact result comparison.

## Observe it yourself

While (or after) the demo runs, against the seed admin endpoint:

```sql
-- all nodes remain in one latency domain
SELECT node_id, latency_group_id FROM nodes;
-- where the data lives
SELECT partition_id, leader_node_id FROM partitions;
-- the A[service][partition] attribution feed
SELECT node_id, service_id, access_json FROM service_partition_access;
-- where the service replicas are placed
SELECT service_id, node_id, status FROM services;
-- stable shard leases plus atomic partial snapshots
SELECT slot_id, replica_id, lease_expires_at, partial_json, computed_at
FROM movielens_top10_reduce_slots;
-- atomically published exact global result
SELECT result_json, computed_at FROM movielens_top10;
```

## The knobs this demo exercises

| Mechanism | Where |
| --- | --- |
| Per-service locality routing | `service_definitions.read_locality` (`src/query/sql-query-engine-table-routing-methods.js`) |
| Access attribution | `src/query/service-partition-access-{metrics,publisher}.js` → `service_partition_access` |
| Policy lift | `src/rebalancer/unified-rebalancer-policy-scheduler-methods.js` + `service-data-affinity-weights.js` |
| Placement dimensions | `DATA_AFFINITY_NODE` plus coarse `DATA_AFFINITY` in `src/rebalancer/placement-owner-decision.js` |
| The deployed service | `src/runtime/sql-query-loop-runtime-module.js` via the native_js handler map (`src/runtime/runtime-startup-wiring.js`) |
| Stable reduce-slot owner | `src/runtime/sql-query-loop-parallel-reduce.js` (leased slots, atomic partial/result snapshots) |
| A/B evidence projection | `examples/service-data-affinity/affinity-demo-evidence.js` reusing the production weight builder |

The script performs the `any` → `same_group` transition itself so the
cluster, data, replica count, SQL shards, and load remain controlled.
Multiple zones are intentionally outside this completion claim; they
would demonstrate cross-domain traffic and CDC topology, a separate
question from node-granular service/data co-location.
