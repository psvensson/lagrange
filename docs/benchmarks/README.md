# Comparative Benchmark Statistics

Deterministic multi-system comparative benchmark statistics across PostgreSQL, TiDB/TiKV, and Lagrange.

- [Interactive Comparative Statistics Dashboard (HTML)](index.html)
- Scenario specifications:
  - [Scenario A: Contended OLTP Baseline (tidb-oltp-baseline)](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline)
  - [Scenario B: Distributed Risk Decision & Partition Movement (tidb-distributed-risk-decision)](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision)
  - [Scenario C: streaming-feature-risk-decision](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)
  - [Paired Benchmark Owner](tidb-reference-paired-owner.md)
  - [Scenario A Semantic Evidence Gate (scenario-a-semantic-closure)](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)
- Detail pages:
  - [Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.md) ([HTML](lagrange-metrics-evolution.html)) | [TiDB / TiKV & Lagrange Comparison Progress](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html))
  - [PostgreSQL Single-Primary & Patroni Sync-HA Comparison](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html))
  - [Citus Colocated Tables & Distributed Functions Comparison](citus-comparison-progress.md) ([HTML](citus-comparison-progress.html))
  - [YugabyteDB & Apache Ignite 3 Colocated Compute Comparison](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html))
  - [Scenario C: PostgreSQL 17 + Valkey 8 Feature-Store & Freshness Comparison](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html))
  - [3-to-5-Node RF=3 Scale-Out & Scenario A 3-Mode Comparison](scaleout-3to5-node-rf3-progress.md) ([HTML](scaleout-3to5-node-rf3-progress.html))
  - [5-Node RF=3 Partition Granularity Sweep (P=6..60)](partition-granularity-sweep-progress.md) ([HTML](partition-granularity-sweep-progress.html))
  - [Scenario B Network RTT Crossover & Working-Set Growth](scenario-b-rtt-working-set-crossover.md) ([HTML](scenario-b-rtt-working-set-crossover.html))
  - [Live Partition Movement & Scenario C 5x Joint Scaling](movement-and-scenario-c-scaling-progress.md) ([HTML](movement-and-scenario-c-scaling-progress.html))
- Cloud reproduction (GCP, AWS, Azure & SSH):
  - [Reproducing Comparative Benchmarks on GCP, AWS, and Azure](cloud-reproduction-guide.md) ([HTML](cloud-reproduction-guide.html))
  - Provisioning & runner scripts: [`cloud/provision-gcp.sh`](cloud/provision-gcp.sh) | [`cloud/provision-aws.sh`](cloud/provision-aws.sh) | [`cloud/provision-azure.sh`](cloud/provision-azure.sh) | [`cloud/run-comparative-benchmarks.mjs`](cloud/run-comparative-benchmarks.mjs)

![Multi-system comparative benchmark overview](comparative-overview.svg)

Standalone charts: [Scenario B standalone chart](tidb-scenario-b-comparison.svg) | [TiDB comparison progress chart](tidb-comparison-progress.svg)

## Evidence-tier and measurement boundary qualification

This comparative benchmark suite admits only multi-machine over-the-wire cluster measurements:
- `observed-docker-cluster` (`live-cluster-wire`): live containerized cluster execution where each service, coordinator, cache, or storage replica runs on a dedicated physical machine (`boot_id` verified) and all inter-component communication traverses the physical network interface.
- No estimated, simulated, modeled, or single-host loopback figures are included anywhere in this matrix.

Two distinct measurement boundaries are evaluated:
- **Scenario A database transaction path**: isolates single-transaction latency and throughput under high row contention, measuring lock acquisition, commit durability, and transaction retry frequency on the primary storage engine.
- **Scenario B complete end-to-end business decision**: evaluates the full multi-stage risk decision pipeline (account, merchant, device, and related-account risk evaluation) traversing cross-partition graph relationships. Pushdown evaluation permits SQL `COUNT`/`SUM` aggregations at storage nodes and co-located WASM compute-near-data execution, measuring end-to-end client decision turnaround and WAN network byte consumption.

## Executive multi-system comparison matrix

| System / Configuration | Category | Topology Units (Processes) | RPO=0 Host-Loss Survival | [Scenario A](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) tx/sec (p95 ms) | [Scenario B](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) decisions/sec (p99 ms) | [Scenario C](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision) 0ms Fresh dec/sec (Stale % / Backfill s) | WAN / Wire Bytes per Decision | Evidence Tier | Detail Page |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange 0.4.0 | distributed-native | 3 (3) | Yes | 2014.00 (23.26 ms) | 2172.30 (26.78 ms) | 2559.60 (0.00% / 0.0s) | 2950 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [tidb-comparison-progress.md](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html)) |
| Lagrange (5-Node RF=3) 0.4.0 | distributed-native-scaleout | 5 (5) | Yes | 2199.40 (30.91 ms) | 2345.20 (29.45 ms) | 2559.50 (0.00% / 0.0s) | 3216 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [scaleout-3to5-node-rf3-progress.md](scaleout-3to5-node-rf3-progress.md) ([HTML](scaleout-3to5-node-rf3-progress.html)) |
| TiDB + TiKV v8.5.8 | distributed-sql | 5 (5) | Yes | 1118.70 (48.81 ms) | 702.90 (37.66 ms) | 2460.00 (0.00% / 18.4s) | 39152 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [tidb-comparison-progress.md](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html)) |
| PostgreSQL 17 (Single Primary + App Service) 17.2 | relational-single-primary | 2 (2) | No | 1673.50 (28.38 ms) | 415.50 (57.61 ms) | 1581.40 (0.00% / 12.0s) | 25684 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) 17.2-patroni-4.0 | relational-sync-ha | 4 (4) | Yes | 559.30 (78.26 ms) | 256.40 (107.84 ms) | 2010.70 (0.00% / 14.5s) | 27520 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) 17.2-plpgsql | relational-server-function | 1 (1) | No | 2606.10 (22.74 ms) | 2724.30 (13.36 ms) | 2632.20 (0.00% / 0.0s) | 1218 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) 17.2-patroni-4.0-plpgsql | relational-sync-ha-function | 3 (3) | Yes | 1506.20 (22.14 ms) | 2181.60 (32.38 ms) | 2195.10 (0.00% / 0.0s) | 4824 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| Citus 13 (Sharded SQL RF=3 + App Service) 13.0-pg17 | sharded-postgresql-sql | 5 (5) | Yes | 1040.50 (24.13 ms) | 660.90 (35.14 ms) | 1817.80 (0.00% / 22.0s) | 35999 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [citus-comparison-progress.md](citus-comparison-progress.md) ([HTML](citus-comparison-progress.html)) |
| Citus 13 (Colocated Tables + Distributed Function RF=3) 13.0-pg17-udf | sharded-postgresql-colocated-udf | 4 (4) | Yes | 986.10 (36.54 ms) | 2141.10 (28.77 ms) | 2141.50 (0.00% / 14.0s) | 6374 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [citus-comparison-progress.md](citus-comparison-progress.md) ([HTML](citus-comparison-progress.html)) |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) 2024.2.1 | distributed-sql-ysql | 4 (4) | Yes | 1868.70 (17.09 ms) | 549.00 (47.72 ms) | 1754.70 (0.00% / 19.5s) | 35092 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [yugabyte-ignite-comparison-progress.md](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html)) |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) 2024.2.1-proc | distributed-sql-stored-proc | 3 (3) | Yes | 1585.60 (21.51 ms) | 1448.80 (38.85 ms) | 2336.70 (0.00% / 16.2s) | 11455 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [yugabyte-ignite-comparison-progress.md](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html)) |
| Apache Ignite 3 (JobTarget.colocated RF=3) 3.0.0 | distributed-colocated-compute-grid | 3 (3) | Yes | 680.30 (69.58 ms) | 1041.30 (91.73 ms) | 2177.70 (0.00% / 28.0s) | 5310 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [yugabyte-ignite-comparison-progress.md](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html)) |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) 17.2-valkey-8.0-sync | relational-cache-write-through | 4 (4) | Yes | 1763.40 (19.98 ms) | 759.60 (36.71 ms) | 2329.80 (0.42% / 185.0s) | 16620 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [scenario-c-feature-store-progress.md](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html)) |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) 17.2-valkey-8.0-async | relational-cache-async-stream | 5 (5) | Yes | 2343.10 (16.01 ms) | 712.80 (45.52 ms) | 0.00 (6.80% / 240.0s) | 19968 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [scenario-c-feature-store-progress.md](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html)) |

## 5-node RF=3 (60% replica coverage) scale-out summary

At 3 nodes with RF=3, every node holds 100.0% of partitions locally. At 5 nodes with RF=3, replica
coverage transitions to 60.0% (40.0% absent partitions per node), testing partial data locality,
v0.3.3 Scenario A transaction-coordination fast-path scaling, and 5-node cluster aggregate capacity.
Detailed analysis: [3-to-5-Node RF=3 Scale-Out](scaleout-3to5-node-rf3-progress.md) ([HTML](scaleout-3to5-node-rf3-progress.html)) and [5-Node Partition Granularity Sweep (P=6..60)](partition-granularity-sweep-progress.md) ([HTML](partition-granularity-sweep-progress.html)).

![3-to-5-Node RF=3 Scale-Out Progress](scaleout-3to5-node-rf3-progress.svg)

| System / Configuration | 3-Node (100%) A tx/s (p95 ms) | 5-Node (60%) Proportional A tx/s (p95 ms) | A Scale Gain % | 3-Node (100%) B dec/s | 5-Node (60%) Node B dec/s (p99 ms) | 5-Node Cluster Aggregate B dec/s (WAN B) |
| --- | --- | --- | --- | --- | --- | --- |
| Lagrange 0.4.0 | 2361.30 (12.1 ms) | 2231.60 (21.7 ms) | -5.5% | 2662.9 | 2172.3 (29.4 ms) | 2345.2 (3216 B) |
| TiDB + TiKV v8.5.8 | 1359.40 (23.1 ms) | 2297.60 (20.1 ms) | +69.0% | 2309.0 | 521.2 (37.7 ms) | 702.9 (39152 B) |
| Citus 13 (Sharded SQL + App) | 1524.20 (14.8 ms) | 2247.90 (24.4 ms) | +47.5% | 2644.6 | 1247.0 (28.8 ms) | 2141.1 (6374 B) |
| YugabyteDB 2024.2 (YSQL + App) | 2489.30 (11.8 ms) | 2334.90 (20.8 ms) | -6.2% | 1777.6 | 1014.7 (38.9 ms) | 1448.8 (11455 B) |
| Apache Ignite 3 (Colocated) | 2458.40 (11.0 ms) | 2320.20 (20.3 ms) | -5.6% | 2575.1 | 753.2 (91.7 ms) | 1041.3 (5310 B) |

| Scale-Out Mode | Target | 3-Node tx/s (p95 ms) | 5-Node tx/s (p95 ms) | Scale Gain % | Evidence Tier |
| --- | --- | --- | --- | --- | --- |
| Fixed-Workload Scale-Out | Lagrange 0.4.0 | 1735.00 (14.5 ms) | 2410.40 (18.0 ms) | +38.9% | `observed-docker-cluster` |
| Fixed-Workload Scale-Out | TiDB + TiKV v8.5.8 | 1169.60 (18.5 ms) | 1962.60 (21.8 ms) | +67.8% | `observed-docker-cluster` |
| Fixed-Workload Scale-Out | Citus 13 (Sharded SQL + App) | 1180.40 (20.5 ms) | 1983.40 (20.9 ms) | +68.0% | `observed-docker-cluster` |
| Fixed-Workload Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 2159.40 (12.6 ms) | 2441.50 (20.6 ms) | +13.1% | `observed-docker-cluster` |
| Fixed-Workload Scale-Out | Apache Ignite 3 (Colocated) | 2387.40 (11.6 ms) | 2458.90 (19.0 ms) | +3.0% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | Lagrange 0.4.0 | 2361.30 (12.1 ms) | 2231.60 (21.7 ms) | -5.5% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | TiDB + TiKV v8.5.8 | 1359.40 (23.1 ms) | 2297.60 (20.1 ms) | +69.0% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | Citus 13 (Sharded SQL + App) | 1524.20 (14.8 ms) | 2247.90 (24.4 ms) | +47.5% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 2489.30 (11.8 ms) | 2334.90 (20.8 ms) | -6.2% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | Apache Ignite 3 (Colocated) | 2458.40 (11.0 ms) | 2320.20 (20.3 ms) | -5.6% | `observed-docker-cluster` |
| Hot-Contention Baseline | Lagrange 0.4.0 | 2272.70 (12.6 ms) | 2365.40 (14.2 ms) | +4.1% | `observed-docker-cluster` |
| Hot-Contention Baseline | TiDB + TiKV v8.5.8 | 1661.60 (18.1 ms) | 2097.40 (16.8 ms) | +26.2% | `observed-docker-cluster` |
| Hot-Contention Baseline | PG 17 (Patroni Sync HA + App) | 2402.90 (11.3 ms) | 2424.00 (13.8 ms) | +0.9% | `observed-docker-cluster` |
| Hot-Contention Baseline | Citus 13 (Sharded SQL + App) | 1745.00 (16.8 ms) | 2349.10 (14.7 ms) | +34.6% | `observed-docker-cluster` |
| Hot-Contention Baseline | YugabyteDB 2024.2 (YSQL + App) | 2495.50 (11.5 ms) | 2414.80 (14.5 ms) | -3.2% | `observed-docker-cluster` |
| Hot-Contention Baseline | Apache Ignite 3 (Colocated) | 2556.60 (13.5 ms) | 2283.30 (14.1 ms) | -10.7% | `observed-docker-cluster` |

## Scenario C streaming-feature-risk-decision summary (freshness SLA, staleness & 5x joint scale)

Scenario C evaluates streaming feature store staleness SLAs, operational rule backfill and
cache restart recovery overhead, and 5x joint scaling across ingestion, entity tracking, and
decision load. Detailed analysis: [Scenario C Feature-Store Comparison](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html)) and [Live Partition Movement & Scenario C 5x Joint Scaling](movement-and-scenario-c-scaling-progress.md) ([HTML](movement-and-scenario-c-scaling-progress.html)).

![Scenario C Feature-Store & Freshness Comparison](scenario-c-feature-store-progress.svg)

| System / Configuration | 0ms Fresh dec/s | 100ms SLA dec/s | 1000ms SLA dec/s | Stale Rate % | Rule Backfill (s) | Cache Restart (s) | Pipelines |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2559.60 | 2739.10 | 2735.90 | 0.00% | 0.0s | 3.2s | 1 |
| Lagrange (5-Node RF=3) | 2559.50 | 2562.50 | 2140.50 | 0.00% | 0.0s | 3.2s | 1 |
| TiDB + TiKV | 2460.00 | 1904.70 | 2615.20 | 0.00% | 18.4s | 9.6s | 2 |
| PostgreSQL 17 (Single Primary + App Service) | 1581.40 | 2331.20 | 2521.70 | 0.00% | 12.0s | 6.4s | 2 |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | 2010.70 | 2327.50 | 2312.80 | 0.00% | 14.5s | 8.5s | 2 |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | 2632.20 | 2766.10 | 2495.90 | 0.00% | 0.0s | 5.8s | 1 |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | 2195.10 | 2625.20 | 2554.30 | 0.00% | 0.0s | 8.5s | 1 |
| Citus 13 (Sharded SQL RF=3 + App Service) | 1817.80 | 2405.70 | 2621.40 | 0.00% | 22.0s | 11.2s | 2 |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | 2141.50 | 2577.10 | 2427.10 | 0.00% | 14.0s | 9.4s | 1 |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | 1754.70 | 2317.20 | 2343.20 | 0.00% | 19.5s | 10.8s | 2 |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | 2336.70 | 2616.00 | 2767.10 | 0.00% | 16.2s | 10.4s | 1 |
| Apache Ignite 3 (JobTarget.colocated RF=3) | 2177.70 | 2591.30 | 2653.40 | 0.00% | 28.0s | 14.5s | 2 |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | 2329.80 | 2279.00 | 2644.90 | 0.42% | 185.0s | 42.0s | 3 |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | 0.00 | 2261.20 | 2528.30 | 6.80% | 240.0s | 58.0s | 4 |

| System / Configuration | 1x Fresh (0ms) dec/s | 5x Fresh (0ms) dec/s | 5x Relaxed (1000ms) dec/s | Stale % | 5x Backfill (s) | 5x Recovery (s) | Pipelines |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2559.60 | 2018.60 | 2099.80 | 0.00% | 0.0s | 3.2s | 1 |
| Apache Ignite 3 (Colocated) | 2177.70 | 2089.40 | 2227.20 | 0.00% | 28.0s | 14.5s | 2 |
| PG 17 Patroni + PL/pgSQL | 2195.10 | 2187.20 | 2104.80 | 0.00% | 0.0s | 8.5s | 1 |
| PG 17 + Valkey 8 (Sync) | 2329.80 | 1663.10 | 2175.90 | 0.42% | 185.0s | 42.0s | 3 |
| PG 17 + Valkey 8 (Async) | 0.00 | 0.00 | 2131.60 | 6.80% | 240.0s | 58.0s | 4 |

## Scenario setup diagrams and where time is spent (Scenario A, B, and C latency breakdown)

![Scenario A, B, and C Setup Topology and Phase Latency Breakdown](scenario-setup-time-breakdown.svg)

### Scenario A Contended OLTP Latency Breakdown (p95 ms)

| Target | Wire (ms) | Parse/Plan (ms) | Lock Wait (ms) | 2PC Prepare (ms) | Quorum Fsync (ms) | Apply (ms) | Total p95 (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PG 17 Single Primary + App | 18.7 | 0.1 | 0.2 | 0.0 | 9.3 | 0.1 | 28.4 |
| Citus 13 Sharded RF=3 + App | 10.0 | 0.1 | 0.2 | 5.8 | 7.9 | 0.1 | 24.1 |
| PG 17 Patroni Sync HA RF=3 | 51.1 | 0.1 | 0.2 | 0.0 | 26.8 | 0.1 | 78.3 |
| TiDB + TiKV RF=3 (5-Host) | 29.3 | 0.1 | 0.2 | 10.2 | 8.9 | 0.1 | 48.8 |
| Lagrange 0.4.0 (5-Node RF=3) | 23.0 | 0.1 | 0.2 | 0.0 | 7.5 | 0.1 | 30.9 |
| Lagrange 0.4.0 (3-Node RF=3) | 16.9 | 0.1 | 0.2 | 0.0 | 6.0 | 0.1 | 23.3 |

### Scenario B Distributed Risk Decision Latency Breakdown (p99 ms)

| Target | Ingress (ms) | Reducer (ms) | WAN Wait (ms) | Wire Decode (ms) | Steady p99 (ms) | Move Delta (ms) | WAN Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange 0.4.0 (Colocated WASI ctx.call) | 0.1 | 0.1 | 29.1 | 0.1 | 29.4 | +0.1 | 3216 |
| Apache Ignite 3 (JobTarget.colocated) | 0.3 | 0.1 | 91.2 | 0.1 | 91.7 | +0.1 | 5310 |
| PG 17 Patroni + PL/pgSQL Function | 0.1 | 0.1 | 32.1 | 0.1 | 32.4 | +0.1 | 4824 |
| Citus 13 (Colocated Dist Function) | 0.1 | 0.1 | 28.5 | 0.1 | 28.8 | +0.1 | 6374 |
| YugabyteDB 2024.2 (YSQL Stored Proc) | 0.1 | 0.1 | 38.6 | 0.1 | 38.9 | +0.1 | 11455 |
| TiDB + TiKV (App-Orchestrated SQL) | 0.1 | 0.1 | 37.4 | 0.1 | 37.7 | +5.3 | 39152 |

### Scenario C Streaming Feature Evaluation & Freshness Breakdown

| Target | Ingest Quorum (ms) | Prop Lag (ms) | Compute (ms) | 0ms Fresh (dec/s) | 5x Scale (dec/s) | Backfill (s) | Downtime (s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange 0.4.0 (5-Node RF=3 Rollup) | 13.1 | 0.0 | 0.1 | 2559.5 | 2018.6 | 0.0 | 0.0 |
| Lagrange 0.4.0 (3-Node RF=3 Rollup) | 11.1 | 0.0 | 0.1 | 2559.6 | 2691.8 | 0.0 | 0.0 |
| PG 17 Patroni + PL/pgSQL (On-Read Scan) | 14.5 | 0.0 | 3.5 | 2195.1 | 2187.2 | 0.0 | 0.0 |
| PG 17 + Valkey 8 (Sync Write-Through) | 13.9 | 4.2 | 0.1 | 2329.8 | 1663.1 | 185.0 | 185.0 |
| PG 17 + Valkey 8 (Async CDC Stream) | 8.8 | 65.0 | 0.1 | 0.0 | 2131.6 | 240.0 | 240.0 |

### Latency and Architecture Breakdown Analysis

- **Why rule-change backfill cost separates colocated rollups from external cache pipelines**: In `v0.4.0`, Lagrange and `PG 17 + PL/pgSQL` achieve `0.0 s` rule-change backfill by evaluating features directly on committed partition state (`2559.6 dec/s` on 3-node RF=3), while `PG + Valkey` incurs `185-240 s` network backfill downtime when recomputing cached feature keys.
- **How Lagrange scales Scenario C (`2559.5 dec/s` at `1x`, `2018.6 dec/s` at `5x`, `0.0 s` decision downtime)**: (a) In-partition Raft-apply delta rollups (`0.1 ms` local accumulator read at `0 ms` SLA), (b) decomposable micro-bucket sketches (`0.0 s` backfill for window/weight changes), and (c) `feature_epoch`-watermarked lazy on-read cutover with `0.0 s` decision downtime and `0 B` network backfill.


## Scenario B workload-shape progression ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

![Scenario B Per-Shape Locality Crossover](scenario-b-shape-crossover.svg)

| System / Configuration | Graph Shape | Decisions/sec | Latency p99 (ms) | Round Trips | Wire Bytes |
| --- | --- | --- | --- | --- | --- |
| Lagrange | local-only | 2662.90 | 26.76 | 0 | 0 B |
| Lagrange | one-remote-stage | 2172.30 | 26.78 | 1 | 2950 B |
| Lagrange | sequential | 1715.10 | 33.84 | 2 | 4532 B |
| Lagrange | fan-out | 1778.40 | 24.02 | 1 | 4537 B |
| Lagrange (5-Node RF=3) | local-only | 2742.30 | 24.53 | 0 | 0 B |
| Lagrange (5-Node RF=3) | one-remote-stage | 2345.20 | 29.45 | 1 | 3216 B |
| Lagrange (5-Node RF=3) | sequential | 2004.30 | 26.79 | 2 | 4895 B |
| Lagrange (5-Node RF=3) | fan-out | 1816.10 | 25.50 | 1 | 6649 B |
| TiDB + TiKV | local-only | 2309.00 | 23.71 | 1 | 7181 B |
| TiDB + TiKV | one-remote-stage | 702.90 | 37.66 | 2 | 39152 B |
| TiDB + TiKV | sequential | 521.20 | 44.41 | 4 | 74804 B |
| TiDB + TiKV | fan-out | 514.80 | 44.77 | 4 | 75097 B |
| PostgreSQL 17 (Single Primary + App Service) | local-only | 1779.80 | 27.79 | 1 | 4531 B |
| PostgreSQL 17 (Single Primary + App Service) | one-remote-stage | 415.50 | 57.61 | 2 | 25684 B |
| PostgreSQL 17 (Single Primary + App Service) | sequential | 288.90 | 73.75 | 4 | 45643 B |
| PostgreSQL 17 (Single Primary + App Service) | fan-out | 390.70 | 57.35 | 4 | 41343 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | local-only | 1028.60 | 76.37 | 1 | 6939 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | one-remote-stage | 256.40 | 107.84 | 2 | 27520 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | sequential | 370.20 | 64.27 | 4 | 42459 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | fan-out | 536.00 | 47.17 | 4 | 40102 B |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | local-only | 2497.70 | 19.34 | 1 | 1218 B |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | one-remote-stage | 2724.30 | 13.36 | 1 | 1218 B |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | sequential | 2549.70 | 21.41 | 1 | 1218 B |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | fan-out | 2744.20 | 20.68 | 1 | 1245 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | local-only | 2631.80 | 19.82 | 1 | 1761 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | one-remote-stage | 2181.60 | 32.38 | 1 | 4824 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | sequential | 1463.20 | 34.05 | 1 | 7274 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | fan-out | 1556.80 | 31.39 | 1 | 7407 B |
| Citus 13 (Sharded SQL RF=3 + App Service) | local-only | 2219.10 | 26.83 | 1 | 7744 B |
| Citus 13 (Sharded SQL RF=3 + App Service) | one-remote-stage | 660.90 | 35.14 | 2 | 35999 B |
| Citus 13 (Sharded SQL RF=3 + App Service) | sequential | 502.90 | 46.19 | 4 | 69629 B |
| Citus 13 (Sharded SQL RF=3 + App Service) | fan-out | 510.90 | 52.03 | 4 | 70110 B |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | local-only | 2644.60 | 26.75 | 1 | 1873 B |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | one-remote-stage | 2141.10 | 28.77 | 1 | 6374 B |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | sequential | 1247.00 | 45.36 | 1 | 17370 B |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | fan-out | 1273.60 | 35.59 | 1 | 17126 B |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | local-only | 1814.70 | 44.06 | 1 | 7018 B |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | one-remote-stage | 549.00 | 47.72 | 2 | 35092 B |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | sequential | 383.70 | 66.66 | 4 | 63225 B |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | fan-out | 481.10 | 47.42 | 4 | 63392 B |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | local-only | 1777.60 | 46.27 | 1 | 5715 B |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | one-remote-stage | 1448.80 | 38.85 | 1 | 11455 B |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | sequential | 1014.70 | 58.68 | 1 | 18665 B |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | fan-out | 1164.00 | 41.51 | 1 | 17497 B |
| Apache Ignite 3 (JobTarget.colocated RF=3) | local-only | 2575.10 | 21.75 | 1 | 1756 B |
| Apache Ignite 3 (JobTarget.colocated RF=3) | one-remote-stage | 1041.30 | 91.73 | 1 | 5310 B |
| Apache Ignite 3 (JobTarget.colocated RF=3) | sequential | 753.20 | 66.45 | 1 | 8967 B |
| Apache Ignite 3 (JobTarget.colocated RF=3) | fan-out | 1658.80 | 37.40 | 1 | 8786 B |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | local-only | 2509.30 | 24.19 | 1 | 1859 B |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | one-remote-stage | 759.60 | 36.71 | 1 | 16620 B |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | sequential | 618.90 | 41.13 | 1 | 35860 B |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | fan-out | 710.70 | 35.38 | 1 | 33338 B |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | local-only | 2626.90 | 26.47 | 1 | 1974 B |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | one-remote-stage | 712.80 | 45.52 | 1 | 19968 B |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | sequential | 665.40 | 38.05 | 1 | 40202 B |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | fan-out | 705.30 | 34.45 | 1 | 38596 B |

## How Lagrange metrics develop over time

![Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.svg)

| Milestone / Commit | Scenario A tx/s (p95 ms) | Semantic Proofs | Scenario B dec/s (p99 ms / WAN B) | Scenario C 0ms Fresh dec/s | Provenance |
| --- | --- | --- | --- | --- | --- |
| v0.4.0-3node-rf3-multi-host (`86e795c441`) | 2014.00 (23.26 ms) | 33/33 | 2172.30 (26.78 ms / 2950 B) | 2559.60 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-4node-rf3-multi-host (`86e795c441`) | 2018.20 (25.59 ms) | 33/33 | 2067.30 (29.52 ms / 3218 B) | 2703.70 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-5node-rf3-60pct-coverage (`86e795c441`) | 2199.40 (30.91 ms) | 33/33 | 2345.20 (29.45 ms / 3216 B) | 2559.50 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-5node-rf3-p30-sweet-spot (`86e795c441`) | 2199.40 (30.91 ms) | 33/33 | 2044.70 (24.85 ms / 3216 B) | 2559.50 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-5node-rf3-live-movement (`86e795c441`) | 2199.40 (30.91 ms) | 33/33 | 2184.50 (21.88 ms / 3216 B) | 2559.50 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-5node-rf3-scenario-c-5x (`86e795c441`) | 2199.40 (30.91 ms) | 33/33 | 2345.20 (29.45 ms / 3216 B) | 2018.60 | `observed-docker-cluster` / `live-cluster-wire` |

## Measurement provenance and evidence-tier separation

All published measurements require `observed-docker-cluster` (`live-cluster-wire`) provenance from multi-machine setups where every service or replica runs on a separate physical host and all inter-component traffic goes over the wire. Legacy single-host and modeled (`local-oracle-plus-network-model` / `modeled-topology-oracle`) datasets have been removed.

| System / Configuration | Scenario A Provenance | Scenario B Execution & Latency Source | Wire & Movement Source | Comparable Cluster Evidence |
| --- | --- | --- | --- | --- |
| Lagrange | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| Lagrange (5-Node RF=3) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| TiDB + TiKV | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| PostgreSQL 17 (Single Primary + App Service) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| Citus 13 (Sharded SQL RF=3 + App Service) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| Apache Ignite 3 (JobTarget.colocated RF=3) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | `live-cluster-wire` (measured-client-wall-clock) | `live-cluster-wire` (measured-client-wall-clock) | measured-transport-counters / live-partition-move | Yes |

## Reproducing on GCP, AWS, and Azure

Anyone with access to Google Cloud (GCP), Amazon Web Services (AWS), Microsoft Azure, or 5 Linux hosts with Docker and SSH can reproduce these measurements using the turnkey provisioning and runner scripts:
- Step-by-step instructions: [Reproducing Comparative Benchmarks on GCP, AWS, and Azure](cloud-reproduction-guide.md) ([HTML](cloud-reproduction-guide.html))
- Cloud cluster provisioners: [`cloud/provision-gcp.sh`](cloud/provision-gcp.sh) | [`cloud/provision-aws.sh`](cloud/provision-aws.sh) | [`cloud/provision-azure.sh`](cloud/provision-azure.sh)
- 5-node comparative suite runner: [`cloud/run-comparative-benchmarks.mjs`](cloud/run-comparative-benchmarks.mjs)
