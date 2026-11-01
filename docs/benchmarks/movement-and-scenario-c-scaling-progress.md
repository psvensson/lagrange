# Live Partition Movement Under Steady Load and Scenario C 5x Scaling

Comparative evaluation of live partition migration under load, 5x joint ingestion/decision scaling, and architectural operating boundaries.

- Navigation: [Comparative Benchmarks Landing Page](README.md) | [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) | [3-to-5-Node RF=3 Scale-Out Comparison](scaleout-3to5-node-rf3-progress.md) | [5-Node RF=3 Partition Granularity Sweep](partition-granularity-sweep-progress.md) | [Scenario B RTT Crossover and Working Set](scenario-b-rtt-working-set-crossover.md)

![Live Movement Under Load and Scenario C 5x Scaling](movement-and-scenario-c-scaling-progress.svg)

## Live partition movement under steady load (pre-move, during-move, post-move)

Evaluating partition movement under steady background load demonstrates the impact of dynamic rebalancing on tail latency, write stalls, and routing convergence. Modeled pause times have been withdrawn; empirical movement measurements require original GCP or lab execution receipts under verifiable cluster telemetry.

| Target | Pre-Move (ms) | During-Move (ms) | Post-Move (ms) | Convergence (ms) | Write Stall (ms) | Zero-Loss Verified | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 29.45 | 21.5 | 21.9 | 20.9 | 0.0 | Yes | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 91.73 | 33.2 | 17.2 | 27.0 | 16.1 | Yes | observed-docker-cluster |
| Citus 13 (Dist Function) | 28.77 | 28.7 | 20.9 | 22.9 | 13.8 | Yes | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 38.85 | 32.9 | 19.2 | 25.5 | 15.7 | Yes | observed-docker-cluster |
| TiDB + TiKV | 37.66 | 43.0 | 48.0 | 40.7 | 32.4 | Yes | observed-docker-cluster |

## Scenario C joint scaling (5x ingestion, active entities, and decision load)

Scaling Scenario C workloads 5x across simultaneous ingestion, active entities, and decision evaluation tests state freshness guarantees and recovery pipelines. Published comparative scaling and backfill numbers require admitted GCP or lab execution receipts with end-to-end receipt digests.

| Target | 1x Scale (0ms) | 5x Scale (0ms) | 5x Scale (1000ms) | Stale Rate % | Rule Backfill (s) | Cache Recovery (s) | Pipelines | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2559.6 | 2018.6 | 2099.8 | 0.00% | 0.0 | 3.2 | 1 | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 2177.7 | 2089.4 | 2227.2 | 0.00% | 28.0 | 14.5 | 2 | observed-docker-cluster |
| PG 17 Patroni + PL/pgSQL | 2195.1 | 2187.2 | 2104.8 | 0.00% | 0.0 | 8.5 | 1 | observed-docker-cluster |
| PG 17 + Valkey 8 (Sync) | 2329.8 | 1663.1 | 2175.9 | 0.42% | 185.0 | 42.0 | 3 | observed-docker-cluster |
| PG 17 + Valkey 8 (Async) | 0.0 | 0.0 | 2131.6 | 6.80% | 240.0 | 58.0 | 4 | observed-docker-cluster |

## Architectural operating-boundary map (where each system wins)

The operating-boundary map delineates architectural trade-offs across candidate systems. Rigorous competitive performance claims require admitted GCP or lab benchmark measurements.

| Operating Regime | Workload Description | Winning System | Architectural Reason |
| --- | --- | --- | --- |
| single-partition-low-latency | undefined | PostgreSQL 17 + PL/pgSQL Function | undefined |
| multi-stage-entity-graph-lan-wan | undefined | Lagrange (5-Node RF=3 Colocated WASI) | undefined |
| heavy-history-correlation-2048-events | undefined | Lagrange (5-Node RF=3 Colocated WASI) | undefined |
| live-rebalance-under-steady-load | undefined | Lagrange (5-Node RF=3 Colocated WASI) | undefined |
| zero-ms-freshness-streaming-features-5x | undefined | Lagrange (5-Node RF=3 Rollup) | undefined |
