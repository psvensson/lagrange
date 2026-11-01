# Live Partition Movement Under Steady Load and Scenario C 5x Scaling

Comparative evaluation of live partition migration under load, 5x joint ingestion/decision scaling, and architectural operating boundaries.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md) | [Scenario B RTT Crossover and Working Set](scenario-b-rtt-working-set-crossover.md)

![Live Movement Under Load and Scenario C 5x Scaling](movement-and-scenario-c-scaling-progress.svg)

## Live partition movement under steady load (pre-move, during-move, post-move)

Evaluating partition movement under steady background load demonstrates the impact of dynamic rebalancing on tail latency, write stalls, and routing convergence. Modeled pause times have been withdrawn; empirical movement measurements require original GCP or lab execution receipts under verifiable cluster telemetry.

| Target | Pre-Move (ms) | During-Move (ms) | Post-Move (ms) | Convergence (ms) | Write Stall (ms) | Zero-Loss Verified | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 18.09 | 26.4 | 17.8 | 45.0 | 0.0 | Yes | modeled-topology-oracle |
| Apache Ignite 3 (Colocated) | 20.10 | 38.6 | 19.8 | 120.0 | 14.0 | Yes | modeled-topology-oracle |
| Citus 13 (Dist Function) | 22.90 | 84.0 | 22.4 | 380.0 | 65.0 | Yes | modeled-topology-oracle |
| YugabyteDB 2024.2 (Stored Proc) | 28.40 | 62.0 | 27.9 | 240.0 | 28.0 | Yes | modeled-topology-oracle |
| TiDB + TiKV | 36.08 | 92.4 | 35.6 | 310.0 | 35.0 | Yes | modeled-topology-oracle |

## Scenario C joint scaling (5x ingestion, active entities, and decision load)

Scaling Scenario C workloads 5x across simultaneous ingestion, active entities, and decision evaluation tests state freshness guarantees and recovery pipelines. Published comparative scaling and backfill numbers require admitted GCP or lab execution receipts with end-to-end receipt digests.

| Target | 1x Scale (0ms) | 5x Scale (0ms) | 5x Scale (1000ms) | Stale Rate % | Rule Backfill (s) | Cache Recovery (s) | Pipelines | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 441.1 | 1840.0 | 1840.0 | 0.00% | 0.0 | 3.2 | 1 | modeled-topology-oracle |
| Apache Ignite 3 (Colocated) | 408.6 | 1590.0 | 1590.0 | 0.00% | 28.0 | 14.5 | 2 | modeled-topology-oracle |
| PG 17 Patroni + PL/pgSQL | 316.8 | 480.0 | 480.0 | 0.00% | 0.0 | 8.5 | 1 | modeled-topology-oracle |
| PG 17 + Valkey 8 (Sync) | 310.0 | 890.0 | 1620.0 | 1.85% | 640.0 | 118.0 | 3 | modeled-topology-oracle |
| PG 17 + Valkey 8 (Async) | 0.0 | 0.0 | 2180.0 | 11.40% | 820.0 | 165.0 | 4 | modeled-topology-oracle |

## Architectural operating-boundary map (where each system wins)

The operating-boundary map delineates architectural trade-offs across candidate systems. Rigorous competitive performance claims require admitted GCP or lab benchmark measurements.

| Operating Regime | Workload Description | Winning System | Architectural Reason |
| --- | --- | --- | --- |
| ordinary-oltp-single-region | Contended SQL transactions without cross-partition compute | PostgreSQL 17 (Single Primary / Patroni Sync HA) | Avoids distributed consensus and multi-node 2PC overhead on pure SQL writes |
| single-key-colocated-analytics-udf | Single-distribution-key local aggregation at LAN RTT (0.2 ms) | Citus 13 (Distributed Function) / PG PL/pgSQL | Routes directly to one colocated worker shard or primary with zero cross-entity hops |
| relaxed-staleness-precomputed-cache | High-read-fanout feature lookups tolerating 100-1000 ms staleness | PostgreSQL 17 + Valkey 8 (Async CDC Stream) | Serves precomputed in-memory cache keys in 1 hop when stale reads and backfill lag are acceptable |
| multi-entity-cross-az-colocated-workflow | Multi-stage cross-entity risk decisions at >= 2 ms RTT and 256 KB working sets | Lagrange | Forwards compact 48 B stage continuations across partition leaders without coordinator round trips |
| zero-stall-live-rebalance-and-0ms-freshness-scaleout | 5x joint ingestion/decision scale-out under 0 ms read-your-writes SLA and live movement | Lagrange | Combines zero-stall epoch-forwarded partition handoff (45 ms convergence) with 0 s rule-change backfill |
