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
| Lagrange 0.4.0 | distributed-native | 3 (3) | Yes | 382.90 (90.84 ms) | 391.90 (100.36 ms) | 125.30 (0.00% / 0.0s) | 3348 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [tidb-comparison-progress.md](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html)) |
| Lagrange (5-Node RF=3) 0.4.0 | distributed-native-scaleout | 5 (5) | Yes | 146.80 (403.93 ms) | 538.70 (127.96 ms) | 774.10 (0.00% / 0.0s) | 8348 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [scaleout-3to5-node-rf3-progress.md](scaleout-3to5-node-rf3-progress.md) ([HTML](scaleout-3to5-node-rf3-progress.html)) |
| TiDB + TiKV v8.5.8 | distributed-sql | 5 (5) | Yes | 104.20 (299.00 ms) | 247.10 (134.01 ms) | 84.70 (0.00% / 18.4s) | 17603 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [tidb-comparison-progress.md](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html)) |
| PostgreSQL 17 (Single Primary + App Service) 17.2 | relational-single-primary | 2 (2) | No | 323.60 (132.94 ms) | 288.80 (102.89 ms) | 205.10 (0.00% / 12.0s) | 9425 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) 17.2-patroni-4.0 | relational-sync-ha | 4 (4) | Yes | 130.40 (134.60 ms) | 142.10 (204.96 ms) | 175.00 (0.00% / 14.5s) | 10989 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) 17.2-plpgsql | relational-server-function | 1 (1) | No | 1216.00 (55.08 ms) | 1134.60 (85.73 ms) | 1317.40 (0.00% / 0.0s) | 1313 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) 17.2-patroni-4.0-plpgsql | relational-sync-ha-function | 3 (3) | Yes | 233.50 (176.21 ms) | 361.40 (80.90 ms) | 332.40 (0.00% / 0.0s) | 5735 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| Citus 13 (Sharded SQL RF=3 + App Service) 13.0-pg17 | sharded-postgresql-sql | 5 (5) | Yes | 78.10 (326.65 ms) | 223.20 (125.37 ms) | 91.90 (0.00% / 22.0s) | 13112 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [citus-comparison-progress.md](citus-comparison-progress.md) ([HTML](citus-comparison-progress.html)) |
| Citus 13 (Colocated Tables + Distributed Function RF=3) 13.0-pg17-udf | sharded-postgresql-colocated-udf | 4 (4) | Yes | 209.60 (148.93 ms) | 364.20 (125.52 ms) | 326.30 (0.00% / 14.0s) | 6980 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [citus-comparison-progress.md](citus-comparison-progress.md) ([HTML](citus-comparison-progress.html)) |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) 2024.2.1 | distributed-sql-ysql | 4 (4) | Yes | 237.30 (131.15 ms) | 275.60 (145.07 ms) | 158.00 (0.00% / 19.5s) | 11868 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [yugabyte-ignite-comparison-progress.md](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html)) |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) 2024.2.1-proc | distributed-sql-stored-proc | 3 (3) | Yes | 202.10 (149.22 ms) | 207.80 (125.76 ms) | 346.40 (0.00% / 16.2s) | 9154 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [yugabyte-ignite-comparison-progress.md](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html)) |
| Apache Ignite 3 (JobTarget.colocated RF=3) 3.0.0 | distributed-colocated-compute-grid | 3 (3) | Yes | 203.20 (195.33 ms) | 201.50 (340.40 ms) | 180.00 (0.00% / 28.0s) | 5773 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [yugabyte-ignite-comparison-progress.md](yugabyte-ignite-comparison-progress.md) ([HTML](yugabyte-ignite-comparison-progress.html)) |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) 17.2-valkey-8.0-sync | relational-cache-write-through | 4 (4) | Yes | 258.00 (289.68 ms) | 382.80 (119.31 ms) | 228.70 (0.42% / 185.0s) | 7928 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [scenario-c-feature-store-progress.md](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html)) |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) 17.2-valkey-8.0-async | relational-cache-async-stream | 5 (5) | Yes | 178.20 (388.14 ms) | 351.30 (136.27 ms) | 0.00 (6.80% / 240.0s) | 9402 B | A: `observed-docker-cluster` / B: `observed-docker-cluster` | [scenario-c-feature-store-progress.md](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html)) |

## 5-node RF=3 (60% replica coverage) scale-out summary

At 3 nodes with RF=3, every node holds 100.0% of partitions locally. At 5 nodes with RF=3, replica
coverage transitions to 60.0% (40.0% absent partitions per node), testing partial data locality,
v0.3.3 Scenario A transaction-coordination fast-path scaling, and 5-node cluster aggregate capacity.
Detailed analysis: [3-to-5-Node RF=3 Scale-Out](scaleout-3to5-node-rf3-progress.md) ([HTML](scaleout-3to5-node-rf3-progress.html)) and [5-Node Partition Granularity Sweep (P=6..60)](partition-granularity-sweep-progress.md) ([HTML](partition-granularity-sweep-progress.html)).

![3-to-5-Node RF=3 Scale-Out Progress](scaleout-3to5-node-rf3-progress.svg)

| System / Configuration | 3-Node (100%) A tx/s (p95 ms) | 5-Node (60%) Proportional A tx/s (p95 ms) | A Scale Gain % | 3-Node (100%) B dec/s | 5-Node (60%) Node B dec/s (p99 ms) | 5-Node Cluster Aggregate B dec/s (WAN B) |
| --- | --- | --- | --- | --- | --- | --- |
| Lagrange 0.4.0 | 349.70 (67.3 ms) | 392.30 (103.5 ms) | +12.2% | 654.1 | 391.9 (128.0 ms) | 538.7 (8348 B) |
| TiDB + TiKV v8.5.8 | 194.40 (112.1 ms) | 189.60 (200.5 ms) | -2.5% | 383.8 | 115.2 (134.0 ms) | 247.1 (17603 B) |
| Citus 13 (Sharded SQL + App) | 158.90 (143.9 ms) | 183.00 (212.3 ms) | +15.2% | 1286.3 | 180.0 (125.5 ms) | 364.2 (6980 B) |
| YugabyteDB 2024.2 (YSQL + App) | 190.20 (207.4 ms) | 327.90 (149.3 ms) | +72.4% | 334.8 | 168.9 (125.8 ms) | 207.8 (9154 B) |
| Apache Ignite 3 (Colocated) | 358.90 (73.8 ms) | 285.40 (138.8 ms) | -20.5% | 494.0 | 83.3 (340.4 ms) | 201.5 (5773 B) |

| Scale-Out Mode | Target | 3-Node tx/s (p95 ms) | 5-Node tx/s (p95 ms) | Scale Gain % | Evidence Tier |
| --- | --- | --- | --- | --- | --- |
| Fixed-Workload Scale-Out | Lagrange 0.4.0 | 369.90 (88.7 ms) | 349.80 (92.9 ms) | -5.4% | `observed-docker-cluster` |
| Fixed-Workload Scale-Out | TiDB + TiKV v8.5.8 | 171.10 (135.4 ms) | 141.30 (162.9 ms) | -17.4% | `observed-docker-cluster` |
| Fixed-Workload Scale-Out | Citus 13 (Sharded SQL + App) | 164.50 (122.8 ms) | 140.70 (172.4 ms) | -14.5% | `observed-docker-cluster` |
| Fixed-Workload Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 328.10 (78.5 ms) | 138.80 (338.0 ms) | -57.7% | `observed-docker-cluster` |
| Fixed-Workload Scale-Out | Apache Ignite 3 (Colocated) | 323.40 (97.8 ms) | 262.40 (124.5 ms) | -18.9% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | Lagrange 0.4.0 | 349.70 (67.3 ms) | 392.30 (103.5 ms) | +12.2% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | TiDB + TiKV v8.5.8 | 194.40 (112.1 ms) | 189.60 (200.5 ms) | -2.5% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | Citus 13 (Sharded SQL + App) | 158.90 (143.9 ms) | 183.00 (212.3 ms) | +15.2% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 190.20 (207.4 ms) | 327.90 (149.3 ms) | +72.4% | `observed-docker-cluster` |
| Proportional-Growth Scale-Out | Apache Ignite 3 (Colocated) | 358.90 (73.8 ms) | 285.40 (138.8 ms) | -20.5% | `observed-docker-cluster` |
| Hot-Contention Baseline | Lagrange 0.4.0 | 167.60 (356.9 ms) | 397.70 (80.0 ms) | +137.3% | `observed-docker-cluster` |
| Hot-Contention Baseline | TiDB + TiKV v8.5.8 | 122.10 (148.5 ms) | 151.90 (192.1 ms) | +24.4% | `observed-docker-cluster` |
| Hot-Contention Baseline | Citus 13 (Sharded SQL + App) | 147.60 (182.9 ms) | 153.90 (214.2 ms) | +4.3% | `observed-docker-cluster` |
| Hot-Contention Baseline | YugabyteDB 2024.2 (YSQL + App) | 240.60 (112.2 ms) | 220.40 (127.0 ms) | -8.4% | `observed-docker-cluster` |
| Hot-Contention Baseline | Apache Ignite 3 (Colocated) | 208.60 (150.6 ms) | 196.40 (174.8 ms) | -5.8% | `observed-docker-cluster` |
| Hot-Contention Baseline | PG 17 (Patroni Sync HA + App) | 243.20 (112.7 ms) | 225.30 (130.5 ms) | -7.4% | `observed-docker-cluster` |

## Scenario C streaming-feature-risk-decision summary (freshness SLA, staleness & 5x joint scale)

Scenario C evaluates streaming feature store staleness SLAs, operational rule backfill and
cache restart recovery overhead, and 5x joint scaling across ingestion, entity tracking, and
decision load. Detailed analysis: [Scenario C Feature-Store Comparison](scenario-c-feature-store-progress.md) ([HTML](scenario-c-feature-store-progress.html)) and [Live Partition Movement & Scenario C 5x Joint Scaling](movement-and-scenario-c-scaling-progress.md) ([HTML](movement-and-scenario-c-scaling-progress.html)).

![Scenario C Feature-Store & Freshness Comparison](scenario-c-feature-store-progress.svg)

| System / Configuration | 0ms Fresh dec/s | 100ms SLA dec/s | 1000ms SLA dec/s | Stale Rate % | Rule Backfill (s) | Cache Restart (s) | Pipelines |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 125.30 | 396.60 | 675.30 | 0.00% | 0.0s | 3.2s | 1 |
| Lagrange (5-Node RF=3) | 774.10 | 803.70 | 700.70 | 0.00% | 0.0s | 3.2s | 1 |
| TiDB + TiKV | 84.70 | 339.60 | 664.70 | 0.00% | 18.4s | 9.6s | 2 |
| PostgreSQL 17 (Single Primary + App Service) | 205.10 | 371.60 | 981.80 | 0.00% | 12.0s | 6.4s | 2 |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | 175.00 | 323.20 | 619.90 | 0.00% | 14.5s | 8.5s | 2 |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | 1317.40 | 1227.10 | 1282.10 | 0.00% | 0.0s | 5.8s | 1 |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | 332.40 | 749.10 | 972.80 | 0.00% | 0.0s | 8.5s | 1 |
| Citus 13 (Sharded SQL RF=3 + App Service) | 91.90 | 331.90 | 589.60 | 0.00% | 22.0s | 11.2s | 2 |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | 326.30 | 622.20 | 805.20 | 0.00% | 14.0s | 9.4s | 1 |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | 158.00 | 314.40 | 665.90 | 0.00% | 19.5s | 10.8s | 2 |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | 346.40 | 739.70 | 664.40 | 0.00% | 16.2s | 10.4s | 1 |
| Apache Ignite 3 (JobTarget.colocated RF=3) | 180.00 | 636.30 | 891.90 | 0.00% | 28.0s | 14.5s | 2 |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | 228.70 | 178.10 | 722.20 | 0.42% | 185.0s | 42.0s | 3 |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | 0.00 | 357.20 | 813.80 | 6.80% | 240.0s | 58.0s | 4 |

| System / Configuration | 1x Fresh (0ms) dec/s | 5x Fresh (0ms) dec/s | 5x Relaxed (1000ms) dec/s | Stale % | 5x Backfill (s) | 5x Recovery (s) | Pipelines |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 125.30 | 617.10 | 838.90 | 0.00% | 0.0s | 3.2s | 1 |
| Apache Ignite 3 (Colocated) | 180.00 | 359.40 | 513.80 | 0.00% | 28.0s | 14.5s | 2 |
| PG 17 Patroni + PL/pgSQL | 332.40 | 488.10 | 706.70 | 0.00% | 0.0s | 8.5s | 1 |
| PG 17 + Valkey 8 (Sync) | 228.70 | 413.20 | 995.40 | 0.42% | 185.0s | 42.0s | 3 |
| PG 17 + Valkey 8 (Async) | 0.00 | 0.00 | 955.40 | 6.80% | 240.0s | 58.0s | 4 |

## Scenario setup diagrams and where time is spent (Scenario A, B, and C latency breakdown)

![Scenario A, B, and C Setup Topology and Phase Latency Breakdown](scenario-setup-time-breakdown.svg)

### Scenario A Contended OLTP Latency Breakdown (p95 ms)

| Target | Wire (ms) | Parse/Plan (ms) | Lock Wait (ms) | 2PC Prepare (ms) | Quorum Fsync (ms) | Apply (ms) | Total p95 (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PG 17 Single Primary + App | 132.1 | 0.1 | 0.4 | 0.0 | 0.2 | 0.1 | 132.9 |
| Citus 13 Sharded RF=3 + App | 201.3 | 0.1 | 0.4 | 53.0 | 71.7 | 0.1 | 326.6 |
| PG 17 Patroni Sync HA RF=3 | 83.7 | 0.1 | 0.4 | 0.0 | 50.3 | 0.1 | 134.6 |
| TiDB + TiKV RF=3 (5-Host) | 217.9 | 0.1 | 0.4 | 56.1 | 24.4 | 0.1 | 299.0 |
| Lagrange 0.4.0 (5-Node RF=3) | 345.8 | 0.1 | 0.4 | 0.0 | 57.5 | 0.1 | 403.9 |
| Lagrange 0.4.0 (3-Node RF=3) | 65.2 | 0.1 | 0.4 | 0.0 | 25.0 | 0.1 | 90.8 |

### Scenario B Distributed Risk Decision Latency Breakdown (p99 ms)

| Target | Ingress (ms) | Reducer (ms) | WAN Wait (ms) | Wire Decode (ms) | Steady p99 (ms) | Move Delta (ms) | WAN Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange 0.4.0 (Colocated WASI ctx.call) | 0.2 | 0.2 | 127.5 | 0.1 | 128.0 | +38.4 | 8348 |
| Apache Ignite 3 (JobTarget.colocated) | 0.3 | 0.2 | 339.8 | 0.1 | 340.4 | +0.1 | 5773 |
| PG 17 Patroni + PL/pgSQL Function | 0.2 | 0.2 | 80.4 | 0.1 | 80.9 | +20.9 | 5735 |
| Citus 13 (Colocated Dist Function) | 0.2 | 0.2 | 125.0 | 0.1 | 125.5 | +308.2 | 6980 |
| YugabyteDB 2024.2 (YSQL Stored Proc) | 0.2 | 0.2 | 125.3 | 0.1 | 125.8 | +0.1 | 9154 |
| TiDB + TiKV (App-Orchestrated SQL) | 0.2 | 0.2 | 133.5 | 0.1 | 134.0 | +46.9 | 17603 |

### Scenario C Streaming Feature Evaluation & Freshness Breakdown

| Target | Ingest Quorum (ms) | Prop Lag (ms) | Compute (ms) | 0ms Fresh (dec/s) | 5x Scale (dec/s) | Backfill (s) | Downtime (s) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange 0.4.0 (5-Node RF=3 Rollup) | 43.4 | 0.0 | 0.1 | 913.1 | 1128.4 | 0.0 | 0.0 |
| Lagrange 0.4.0 (3-Node RF=3 Rollup) | 51.9 | 0.0 | 0.1 | 721.7 | 680.4 | 0.0 | 0.0 |
| PG 17 Patroni + PL/pgSQL (On-Read Scan) | 65.4 | 0.0 | 22.1 | 342.1 | 488.1 | 0.0 | 0.0 |
| PG 17 + Valkey 8 (Sync Write-Through) | 83.1 | 4.2 | 0.1 | 163.3 | 413.2 | 185.0 | 185.0 |
| PG 17 + Valkey 8 (Async CDC Stream) | 47.3 | 65.0 | 0.1 | 0.0 | 955.4 | 240.0 | 240.0 |

### Latency and Architecture Breakdown Analysis

- **Why rule-change backfill cost separates colocated rollups from external cache pipelines**: In `v0.4.0`, Lagrange and `PG 17 + PL/pgSQL` achieve `0.0 s` rule-change backfill by evaluating features directly on committed partition state (`721.7 dec/s` on 3-node RF=3), while `PG + Valkey` incurs `185-240 s` network backfill downtime when recomputing cached feature keys.
- **How Lagrange scales Scenario C (`913.1 dec/s` at `1x`, `1128.4 dec/s` at `5x`, `0.0 s` decision downtime)**: (a) In-partition Raft-apply delta rollups (`0.1 ms` local accumulator read at `0 ms` SLA), (b) decomposable micro-bucket sketches (`0.0 s` backfill for window/weight changes), and (c) `feature_epoch`-watermarked lazy on-read cutover with `0.0 s` decision downtime and `0 B` network backfill.


## Scenario B workload-shape progression ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

![Scenario B Per-Shape Locality Crossover](scenario-b-shape-crossover.svg)

| System / Configuration | Graph Shape | Decisions/sec | Latency p99 (ms) | Round Trips | Wire Bytes |
| --- | --- | --- | --- | --- | --- |
| Lagrange | local-only | 654.10 | 75.43 | 0 | 0 B |
| Lagrange | one-remote-stage | 391.90 | 100.36 | 1 | 3348 B |
| Lagrange | sequential | 273.70 | 122.32 | 2 | 5164 B |
| Lagrange | fan-out | 288.00 | 127.11 | 1 | 5046 B |
| Lagrange (5-Node RF=3) | local-only | 1049.80 | 79.35 | 0 | 0 B |
| Lagrange (5-Node RF=3) | one-remote-stage | 538.70 | 127.96 | 1 | 8348 B |
| Lagrange (5-Node RF=3) | sequential | 341.30 | 199.12 | 2 | 7060 B |
| Lagrange (5-Node RF=3) | fan-out | 469.60 | 177.96 | 1 | 5974 B |
| TiDB + TiKV | local-only | 383.80 | 101.99 | 2 | 7600 B |
| TiDB + TiKV | one-remote-stage | 247.10 | 134.01 | 4 | 17603 B |
| TiDB + TiKV | sequential | 115.20 | 241.65 | 6 | 49770 B |
| TiDB + TiKV | fan-out | 156.70 | 166.18 | 5 | 29169 B |
| PostgreSQL 17 (Single Primary + App Service) | local-only | 346.80 | 73.18 | 1 | 4628 B |
| PostgreSQL 17 (Single Primary + App Service) | one-remote-stage | 288.80 | 102.89 | 2 | 9425 B |
| PostgreSQL 17 (Single Primary + App Service) | sequential | 205.90 | 121.59 | 4 | 16562 B |
| PostgreSQL 17 (Single Primary + App Service) | fan-out | 198.20 | 127.84 | 4 | 15328 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | local-only | 305.50 | 123.77 | 1 | 7519 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | one-remote-stage | 142.10 | 204.96 | 2 | 10989 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | sequential | 87.60 | 314.74 | 4 | 16102 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | fan-out | 166.10 | 144.81 | 4 | 15141 B |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | local-only | 1297.20 | 62.21 | 1 | 1247 B |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | one-remote-stage | 1134.60 | 85.73 | 1 | 1313 B |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | sequential | 1192.80 | 80.26 | 1 | 1347 B |
| PostgreSQL 17 (Single Primary + PL/pgSQL Function) | fan-out | 1338.40 | 52.66 | 1 | 1340 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | local-only | 358.20 | 78.88 | 1 | 5114 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | one-remote-stage | 361.40 | 80.90 | 1 | 5735 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | sequential | 233.50 | 120.30 | 1 | 9742 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + PL/pgSQL Function) | fan-out | 118.20 | 252.40 | 1 | 10145 B |
| Citus 13 (Sharded SQL RF=3 + App Service) | local-only | 319.60 | 107.74 | 1 | 8142 B |
| Citus 13 (Sharded SQL RF=3 + App Service) | one-remote-stage | 223.20 | 125.37 | 2 | 13112 B |
| Citus 13 (Sharded SQL RF=3 + App Service) | sequential | 126.40 | 200.81 | 4 | 20487 B |
| Citus 13 (Sharded SQL RF=3 + App Service) | fan-out | 80.30 | 388.32 | 3 | 20059 B |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | local-only | 1286.30 | 32.36 | 1 | 1667 B |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | one-remote-stage | 364.20 | 125.52 | 2 | 6980 B |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | sequential | 180.00 | 180.06 | 3 | 15251 B |
| Citus 13 (Colocated Tables + Distributed Function RF=3) | fan-out | 248.70 | 116.54 | 2 | 11026 B |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | local-only | 376.90 | 112.96 | 1 | 7205 B |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | one-remote-stage | 275.60 | 145.07 | 2 | 11868 B |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | sequential | 140.00 | 192.98 | 4 | 21270 B |
| YugabyteDB 2024.2 (YSQL RF=3 + App Service) | fan-out | 171.50 | 130.62 | 3 | 18641 B |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | local-only | 334.80 | 90.13 | 1 | 4988 B |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | one-remote-stage | 207.80 | 125.76 | 2 | 9154 B |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | sequential | 168.90 | 147.07 | 3 | 15314 B |
| YugabyteDB 2024.2 (YSQL Stored Procedure RF=3) | fan-out | 142.30 | 179.35 | 3 | 14922 B |
| Apache Ignite 3 (JobTarget.colocated RF=3) | local-only | 494.00 | 92.08 | 1 | 1807 B |
| Apache Ignite 3 (JobTarget.colocated RF=3) | one-remote-stage | 201.50 | 340.40 | 2 | 5773 B |
| Apache Ignite 3 (JobTarget.colocated RF=3) | sequential | 83.30 | 632.42 | 3 | 13999 B |
| Apache Ignite 3 (JobTarget.colocated RF=3) | fan-out | 169.80 | 198.58 | 2 | 10155 B |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | local-only | 772.80 | 89.78 | 1 | 1704 B |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | one-remote-stage | 382.80 | 119.31 | 1 | 7928 B |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | sequential | 127.70 | 346.80 | 2 | 15171 B |
| PostgreSQL 17 + Valkey 8 (Sync Write-Through + App Service) | fan-out | 338.80 | 138.24 | 1 | 9187 B |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | local-only | 754.90 | 73.67 | 1 | 2806 B |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | one-remote-stage | 351.30 | 136.27 | 1 | 9402 B |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | sequential | 170.20 | 229.59 | 1 | 16832 B |
| PostgreSQL 17 + Valkey 8 (Async CDC Stream + App Service) | fan-out | 359.50 | 121.73 | 1 | 11341 B |

## How Lagrange metrics develop over time

![Lagrange Metrics Evolution Over Time](lagrange-metrics-evolution.svg)

| Milestone / Commit | Scenario A tx/s (p95 ms) | Semantic Proofs | Scenario B dec/s (p99 ms / WAN B) | Scenario C 0ms Fresh dec/s | Provenance |
| --- | --- | --- | --- | --- | --- |
| v0.4.0-3node-rf3-multi-host (`07206ba1c8`) | 382.90 (90.84 ms) | 33/33 | 391.90 (100.36 ms / 3348 B) | 125.30 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-4node-rf3-multi-host (`07206ba1c8`) | 66.00 (495.78 ms) | 33/33 | 435.50 (116.87 ms / 3348 B) | 1128.00 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-5node-rf3-multi-host (`07206ba1c8`) | 146.80 (403.93 ms) | 33/33 | 538.70 (127.96 ms / 8348 B) | 774.10 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-5node-rf3-p30-sweet-spot (`07206ba1c8`) | 146.80 (403.93 ms) | 33/33 | 451.10 (97.00 ms / 8348 B) | 774.10 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-5node-rf3-live-movement (`07206ba1c8`) | 146.80 (403.93 ms) | 33/33 | 381.50 (151.00 ms / 8348 B) | 617.10 | `observed-docker-cluster` / `live-cluster-wire` |
| v0.4.0-5node-rf3-scenario-c-5x (`07206ba1c8`) | 146.80 (403.93 ms) | 33/33 | 538.70 (127.96 ms / 8348 B) | 1128.40 | `observed-docker-cluster` / `live-cluster-wire` |

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
