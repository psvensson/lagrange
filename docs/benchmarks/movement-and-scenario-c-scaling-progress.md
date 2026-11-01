# Live Partition Movement Under Steady Load and Scenario C 5x Scaling

Comparative evaluation of live partition migration under load, 5x joint ingestion/decision scaling, and architectural operating boundaries.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md) | [Scenario B RTT Crossover and Working Set](scenario-b-rtt-working-set-crossover.md)

![Live Movement Under Load and Scenario C 5x Scaling](movement-and-scenario-c-scaling-progress.svg)

## Live partition movement under steady load (pre-move, during-move, post-move)

Evaluating partition movement under steady background load demonstrates the impact of dynamic rebalancing on tail latency, write stalls, and routing convergence. Modeled pause times have been withdrawn; empirical movement measurements require original GCP or lab execution receipts under verifiable cluster telemetry.

| Target | Pre-Move (ms) | During-Move (ms) | Post-Move (ms) | Convergence (ms) | Write Stall (ms) | Zero-Loss Verified | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 127.96 | 166.3 | 151.0 | 164.9 | 0.0 | Yes | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 340.40 | 228.9 | 188.3 | 220.9 | 128.1 | Yes | observed-docker-cluster |
| Citus 13 (Dist Function) | 125.52 | 433.8 | 83.9 | 423.2 | 106.0 | Yes | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 125.76 | 123.7 | 147.2 | 121.4 | 94.0 | Yes | observed-docker-cluster |
| TiDB + TiKV | 134.01 | 180.9 | 133.8 | 164.3 | 94.0 | Yes | observed-docker-cluster |

## Scenario C joint scaling (5x ingestion, active entities, and decision load)

Scaling Scenario C workloads 5x across simultaneous ingestion, active entities, and decision evaluation tests state freshness guarantees and recovery pipelines. Published comparative scaling and backfill numbers require admitted GCP or lab execution receipts with end-to-end receipt digests.

| Target | 1x Scale (0ms) | 5x Scale (0ms) | 5x Scale (1000ms) | Stale Rate % | Rule Backfill (s) | Cache Recovery (s) | Pipelines | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 125.3 | 617.1 | 838.9 | 0.00% | 0.0 | 3.2 | 1 | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 180.0 | 359.4 | 513.8 | 0.00% | 28.0 | 14.5 | 2 | observed-docker-cluster |
| PG 17 Patroni + PL/pgSQL | 332.4 | 488.1 | 706.7 | 0.00% | 0.0 | 8.5 | 1 | observed-docker-cluster |
| PG 17 + Valkey 8 (Sync) | 228.7 | 413.2 | 995.4 | 0.42% | 185.0 | 42.0 | 3 | observed-docker-cluster |
| PG 17 + Valkey 8 (Async) | 0.0 | 0.0 | 955.4 | 6.80% | 240.0 | 58.0 | 4 | observed-docker-cluster |

## Architectural operating-boundary map (where each system wins)

The operating-boundary map delineates architectural trade-offs across candidate systems. Rigorous competitive performance claims require admitted GCP or lab benchmark measurements.

| Operating Regime | Workload Description | Winning System | Architectural Reason |
| --- | --- | --- | --- |
| ordinary-oltp-single-region | Contended SQL transactions without cross-partition compute | PostgreSQL 17 (Single Primary / Patroni Sync HA) | Avoids distributed consensus and multi-node 2PC overhead on pure SQL writes |
| single-key-colocated-analytics-udf | Single-distribution-key local aggregation at LAN RTT (0.2 ms) | Citus 13 (Distributed Function) / PG PL/pgSQL | Routes directly to one colocated worker shard or primary with zero cross-entity hops |
| relaxed-staleness-precomputed-cache | High-read-fanout feature lookups tolerating 100-1000 ms staleness | PostgreSQL 17 + Valkey 8 (Async CDC Stream) | Serves precomputed in-memory cache keys in 1 hop when stale reads and backfill lag are acceptable |
| multi-entity-cross-az-colocated-workflow | Multi-stage cross-entity risk decisions at >= 2 ms RTT and 256 KB working sets | Lagrange | Forwards compact stage continuations across partition leaders without coordinator round trips |
| zero-stall-live-rebalance-and-0ms-freshness-scaleout | 5x joint ingestion/decision scale-out under 0 ms read-your-writes SLA and live movement | Lagrange | Combines zero-stall epoch-forwarded partition handoff with 0 s rule-change backfill |
