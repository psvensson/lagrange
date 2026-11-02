# Live Partition Movement Under Steady Load and Scenario C 5x Scaling

Comparative evaluation of live partition migration under load, 5x joint ingestion/decision scaling, and architectural operating boundaries.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md) | [Scenario B RTT Crossover and Working Set](scenario-b-rtt-working-set-crossover.md)

![Live Movement Under Load and Scenario C 5x Scaling](movement-and-scenario-c-scaling-progress.svg)

## Live partition movement under steady load (pre-move, during-move, post-move)

Evaluating partition movement under steady background load demonstrates the impact of dynamic rebalancing on tail latency, write stalls, and routing convergence. Modeled pause times have been withdrawn; empirical movement measurements require original GCP or lab execution receipts under verifiable cluster telemetry.

| Target | Pre-Move (ms) | During-Move (ms) | Post-Move (ms) | Convergence (ms) | Write Stall (ms) | Zero-Loss Verified | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 971.61 | 1545.6 | 1598.5 | 1545.3 | 0.0 | Yes | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | No | not-measured |
| Citus 13 (Dist Function) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | No | not-measured |
| YugabyteDB 2024.2 (Stored Proc) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | No | not-measured |
| TiDB + TiKV | 65.31 | 75.0 | 77.6 | 73.6 | 20.3 | Yes | observed-docker-cluster |

## Scenario C joint scaling (5x ingestion, active entities, and decision load)

Scaling Scenario C workloads 5x across simultaneous ingestion, active entities, and decision evaluation tests state freshness guarantees and recovery pipelines. Published comparative scaling and backfill numbers require admitted GCP or lab execution receipts with end-to-end receipt digests.

| Target | 1x Scale (0ms) | 5x Scale (0ms) | 5x Scale (1000ms) | Stale Rate % | Rule Backfill (s) | Cache Recovery (s) | Pipelines | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 35.3 | 56.8 | 79.7 | 0.00% | 0.0 | 0.0 | 1 | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | 2 | not-measured |
| PG 17 Patroni + PL/pgSQL | 1176.1 | 713.3 | 527.5 | 0.00% | 0.1 | 4.2 | 1 | observed-docker-cluster |
| PG 17 + Valkey 8 (Sync) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | 3 | not-measured |
| PG 17 + Valkey 8 (Async) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | 4 | not-measured |

## Architectural operating-boundary map (where each system wins)

The operating-boundary map delineates architectural trade-offs across candidate systems. Rigorous competitive performance claims require admitted GCP or lab benchmark measurements.

| Operating Regime | Workload Description | Winning System | Architectural Reason |
| --- | --- | --- | --- |
| single-partition-low-latency | undefined | PostgreSQL 17 + PL/pgSQL Function | undefined |
| multi-stage-entity-graph-lan-wan | undefined | Lagrange (5-Node RF=3 Colocated WASI) | undefined |
| heavy-history-correlation-2048-events | undefined | Lagrange (5-Node RF=3 Colocated WASI) | undefined |
| live-rebalance-under-steady-load | undefined | Lagrange (5-Node RF=3 Colocated WASI) | undefined |
| zero-ms-freshness-streaming-features-5x | undefined | Lagrange (5-Node RF=3 Rollup) | undefined |
