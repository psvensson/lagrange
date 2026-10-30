# Comparative Benchmark Statistics

Deterministic multi-system comparative benchmark statistics across PostgreSQL, TiDB/TiKV, and Lagrange.

- [Interactive Comparative Statistics Dashboard (HTML)](index.html)
- Scenario specifications:
  - [Scenario A: Contended OLTP Baseline (tidb-oltp-baseline)](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline)
  - [Scenario B: Distributed Risk Decision & Partition Movement (tidb-distributed-risk-decision)](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision)
  - [Paired Benchmark Owner](tidb-reference-paired-owner.md)
  - [Scenario A Semantic Evidence Gate (scenario-a-semantic-closure)](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)
- Detail pages:
  - [TiDB / TiKV & Lagrange Comparison Progress](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html))
  - [PostgreSQL Single-Primary & Patroni Sync-HA Comparison](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html))

![Multi-system comparative benchmark overview](comparative-overview.svg)

Standalone charts: [Scenario B standalone chart](tidb-scenario-b-comparison.svg) | [TiDB comparison progress chart](tidb-comparison-progress.svg)

## Evidence-tier and measurement boundary qualification

This comparative benchmark suite qualifies results across two rigorous evidence tiers:
- `observed-docker-cluster`: live containerized cluster execution with recorded container lifecycles, real operating system processes, and measured network and storage calls.
- `modeled-topology-oracle`: deterministic request-oracle execution paired with topology round-trip, quorum, and wire-transfer accounting over identical logical workloads.

Two distinct measurement boundaries are evaluated:
- **Scenario A database transaction path**: isolates single-transaction latency and throughput under high row contention, measuring lock acquisition, commit durability, and transaction retry frequency on the primary storage engine.
- **Scenario B complete end-to-end business decision**: evaluates the full multi-stage risk decision pipeline (account, merchant, device, and related-account risk evaluation) traversing cross-partition graph relationships. Pushdown evaluation permits SQL `COUNT`/`SUM` aggregations at storage nodes and co-located WASM compute-near-data execution, measuring end-to-end client decision turnaround and WAN network byte consumption.

## Executive multi-system comparison matrix

| System / Configuration | Category | Topology Units (Processes) | RPO=0 Host-Loss Survival | [Scenario A](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) tx/sec (p95 ms) | [Scenario B](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision) decisions/sec (p99 ms) | WAN / Wire Bytes per Decision | Evidence Tier | Detail Page |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange 0.1.0-alpha.4 | distributed-native | 3 (3) | Yes | 185.75 (18.60 ms) | 412.80 (14.20 ms) | 384 B | `observed-docker-cluster` | [tidb-comparison-progress.md](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html)) |
| TiDB + TiKV v8.5.8 | distributed-sql | 6 (6) | Yes | 53.78 (56.40 ms) | 138.40 (42.70 ms) | 4860 B | `observed-docker-cluster` | [tidb-comparison-progress.md](tidb-comparison-progress.md) ([HTML](tidb-comparison-progress.html)) |
| PostgreSQL 17 (Single Primary + App Service) 17.2 | relational-single-primary | 2 (2) | No | 312.40 (7.80 ms) | 294.60 (19.60 ms) | 1420 B | `modeled-topology-oracle` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) 17.2-patroni-4.0 | relational-sync-ha | 6 (9) | Yes | 142.60 (23.40 ms) | 218.20 (27.40 ms) | 2680 B | `modeled-topology-oracle` | [postgresql-comparison-progress.md](postgresql-comparison-progress.md) ([HTML](postgresql-comparison-progress.html)) |

## Scenario B workload-shape progression ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| System / Configuration | Graph Shape | Decisions/sec | Latency p99 (ms) | Round Trips | Wire Bytes |
| --- | --- | --- | --- | --- | --- |
| Lagrange | local-only | 640.00 | 6.20 | 1 | 0 B |
| Lagrange | one-remote-stage | 465.00 | 11.80 | 2 | 256 B |
| Lagrange | sequential | 342.00 | 16.40 | 3 | 512 B |
| Lagrange | fan-out | 398.00 | 14.90 | 2 | 640 B |
| TiDB + TiKV | local-only | 245.00 | 19.40 | 2 | 1840 B |
| TiDB + TiKV | one-remote-stage | 162.00 | 32.60 | 4 | 3920 B |
| TiDB + TiKV | sequential | 98.00 | 54.80 | 6 | 6480 B |
| TiDB + TiKV | fan-out | 118.00 | 46.20 | 5 | 5940 B |
| PostgreSQL 17 (Single Primary + App Service) | local-only | 520.00 | 7.40 | 1 | 640 B |
| PostgreSQL 17 (Single Primary + App Service) | one-remote-stage | 330.00 | 14.20 | 2 | 1180 B |
| PostgreSQL 17 (Single Primary + App Service) | sequential | 198.00 | 24.80 | 4 | 1960 B |
| PostgreSQL 17 (Single Primary + App Service) | fan-out | 230.00 | 21.50 | 4 | 1900 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | local-only | 385.00 | 11.20 | 1 | 1280 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | one-remote-stage | 248.00 | 19.80 | 2 | 2240 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | sequential | 146.00 | 34.60 | 4 | 3640 B |
| PostgreSQL 17 (Patroni Sync HA RF=3 + App Service) | fan-out | 174.00 | 29.80 | 4 | 3560 B |
