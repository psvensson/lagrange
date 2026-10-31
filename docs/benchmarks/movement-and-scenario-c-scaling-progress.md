# Live Partition Movement Under Steady Load and Scenario C 5x Scaling

Comparative evaluation of live partition migration under load, 5x joint ingestion/decision scaling, and architectural operating boundaries.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md) | [Scenario B RTT Crossover and Working Set](scenario-b-rtt-working-set-crossover.md)

![Live Movement Under Load and Scenario C 5x Scaling](movement-and-scenario-c-scaling-progress.svg)

## Live partition movement under steady load (pre-move, during-move, post-move)

Evaluating partition movement under steady background load demonstrates the impact of dynamic rebalancing on tail latency, write stalls, and routing convergence. Modeled pause times have been withdrawn; empirical movement measurements require original GCP or lab execution receipts under verifiable cluster telemetry.

| Target | Pre-Move (ms) | During-Move (ms) | Post-Move (ms) | Convergence (ms) | Write Stall (ms) | Zero-Loss Verified | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Citus 13 (Dist Function) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| YugabyteDB 2024.2 (Stored Proc) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| TiDB + TiKV | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |

## Scenario C joint scaling (5x ingestion, active entities, and decision load)

Scaling Scenario C workloads 5x across simultaneous ingestion, active entities, and decision evaluation tests state freshness guarantees and recovery pipelines. Published comparative scaling and backfill numbers require admitted GCP or lab execution receipts with end-to-end receipt digests.

| Target | 1x Scale (0ms) | 5x Scale (0ms) | 5x Scale (1000ms) | Stale Rate % | Rule Backfill (s) | Cache Recovery (s) | Pipelines | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | null | none |
| Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | null | none |
| PG 17 Patroni + PL/pgSQL | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | null | none |
| PG 17 + Valkey 8 (Sync) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | null | none |
| PG 17 + Valkey 8 (Async) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | null | none |

## Architectural operating-boundary map (where each system wins)

The operating-boundary map delineates architectural trade-offs across candidate systems. Rigorous competitive performance claims require admitted GCP or lab benchmark measurements.

| Operating Regime | Workload Description | Winning System | Architectural Reason |
| --- | --- | --- | --- |
| ordinary-oltp-single-region | Contended SQL transactions without cross-partition compute | Awaiting admitted GCP/lab measurement | Comparative conclusions await admitted GCP/lab measurements on both arms over public interfaces. |
| single-key-colocated-analytics-udf | Single-distribution-key local aggregation at LAN RTT (0.2 ms) | Awaiting admitted GCP/lab measurement | Comparative conclusions await admitted GCP/lab measurements on both arms over public interfaces. |
| relaxed-staleness-precomputed-cache | High-read-fanout feature lookups tolerating 100-1000 ms staleness | Awaiting admitted GCP/lab measurement | Comparative conclusions await admitted GCP/lab measurements on both arms over public interfaces. |
| multi-entity-cross-az-colocated-workflow | Multi-stage cross-entity risk decisions at >= 2 ms RTT and 256 KB working sets | Awaiting admitted GCP/lab measurement | Comparative conclusions await admitted GCP/lab measurements on both arms over public interfaces. |
| zero-stall-live-rebalance-and-0ms-freshness-scaleout | 5x joint ingestion/decision scale-out under 0 ms read-your-writes SLA and live movement | Awaiting admitted GCP/lab measurement | Comparative conclusions await admitted GCP/lab measurements on both arms over public interfaces. |
