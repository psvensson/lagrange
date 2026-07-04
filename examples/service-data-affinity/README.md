# Service↔Data Affinity Demo — code moves to its data

This is the live demonstration of lagrange's differentiator: a deployed
**service** whose replicas are placed as near as possible to the
**data** it accesses (epic:
[`solve/epics/service-data-affinity-placement.md`](../../solve/epics/service-data-affinity-placement.md)).

Unlike the [`movielens-access-affinity`](../movielens-access-affinity/)
benchmark — which ships *compute to data* via partition callbacks —
this demo deploys a real **runtime service** that issues SQL, and then
watches the placement machinery move the *service itself* into the zone
that holds its data.

## What happens

1. **Three nodes start pinned to `zone-a`** (the new `LATENCY_GROUP_ID`
   env var → `latency.pinnedGroupId`; the `LatencyGroupManager` honors
   the pin instead of RTT-clustering, so one host can form real zones).
   The movielens `ratings` table is loaded — every partition and every
   raft leader necessarily lives in `zone-a`.
2. **Two more nodes join pinned to `zone-b`.**
3. **A runtime service deploys** (`service_definitions` row):
   `runtime_kind: native_js`, `runtime_ref: sql-query-loop-runtime`
   (the generic query-loop module), `read_locality: 'same_group'`,
   `replica_count: 3`. Each placed replica issues the movielens top-10
   `SELECT` every 500ms through its injected, service-scoped query
   executor — so every statement carries the service's identity.
4. **The shipped machinery does the rest, unprompted:**
   - every statement is attributed into the CDC-propagated
     `service_partition_access` table (per-node delta rows);
   - because the service's `read_locality` is `same_group`, the
     runtime-service rebalancer lifts fresh attribution into
     per-zone `dataAffinity.groupWeights` and enables the
     `DATA_AFFINITY` placement dimension;
   - the placement kernel scores `zone-a` nodes ahead of `zone-b`
     nodes for this service (with the in-score incumbent movement
     cost damping churn), and the MovePlanner migrates the replicas.
5. The demo polls placement every 10s and declares convergence when
   **every service replica runs in `zone-a`** — the zone holding the
   data it reads.

## Run it

```sh
# one-time: fetch the movielens 100k dataset
node examples/movielens-access-affinity/download-movielens.js

# the demo (local processes only — no Docker)
node examples/service-data-affinity/run-affinity-demo.js
```

Expect a few minutes end to end: attribution publishes every ~30s, the
policy owner reads a staleness-bounded window, and the rebalancer plans
on its periodic cadence. The observation log shows the pieces landing:
attribution rows appearing, then replicas hopping zones.

## Observe it yourself

While (or after) the demo runs, against the seed admin endpoint:

```sql
-- who is in which zone
SELECT node_id, latency_group_id FROM nodes;
-- where the data lives
SELECT partition_id, leader_node_id FROM partitions;
-- the A[service][partition] attribution feed
SELECT node_id, service_id, access_json FROM service_partition_access;
-- where the service replicas are placed
SELECT service_id, node_id, status FROM services;
```

## The knobs this demo exercises

| Mechanism | Where |
| --- | --- |
| Zone pinning | `LATENCY_GROUP_ID` env → `latency.pinnedGroupId`; honored by `src/topology/latency-group-manager.js` |
| Per-service locality routing | `service_definitions.read_locality` (`src/query/sql-query-engine-table-routing-methods.js`) |
| Access attribution | `src/query/service-partition-access-{metrics,publisher}.js` → `service_partition_access` |
| Policy lift | `src/rebalancer/unified-rebalancer-policy-scheduler-methods.js` + `service-data-affinity-weights.js` |
| Placement dimension | `DATA_AFFINITY` in `src/rebalancer/placement-owner-decision.js` |
| The deployed service | `src/runtime/sql-query-loop-runtime-module.js` via the native_js handler map (`src/runtime/runtime-startup-wiring.js`) |

Flipping the service to `read_locality: 'any'` (an
`UPDATE service_definitions ...`) turns the affinity lift off — the
planner stops preferring the data zone, exactly because uniform routing
makes placement irrelevant to read locality (the epic's Tier-1a sweep A
finding).
