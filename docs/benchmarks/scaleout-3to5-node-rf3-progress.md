# 3-to-5-Node RF=3 Scale-Out Matrix and Comparative Detail

Comparative evaluation of Lagrange and reference systems across 3-node and 5-node scale-out
topologies under RF=3 replication, examining partial replica-coverage dynamics and Scenario A
three-mode separation.

- Navigation: [Overview](README.md) | [Dashboard](index.html) | [Evolution](lagrange-metrics-evolution.md) | [TiDB Comparison](tidb-comparison-progress.md)
- Reference Scenarios: [Scenario A Baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline) | [Scenario B Distributed Risk](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision)

![3-to-5-Node RF=3 Scale-Out Progress](scaleout-3to5-node-rf3-progress.svg)

## Replica-coverage transition (RF=3 at 3 nodes 100% vs 5 nodes 60%)

In an RF=3 cluster with 3 nodes, every node holds a complete replica set of all partitions (100.0%
replica coverage, 0.0% absent partition rate). Scaling out to 5 nodes with RF=3 causes each node to
host only 3 of 5 partition replicas (60.0% replica coverage), leaving a 40.0% absent partition rate
where locally routed requests require network forwarding or distributed stage execution.

| Nodes | RF | Replica Coverage % | Absent Partition % |
| --- | --- | --- | --- |
| 3 | 3 | 100.0% | 0.0% |
| 5 | 3 | 60.0% | 40.0% |

## Scenario A three-mode scale-out separation (fixed, proportional, hot-contention)

Evaluating scale-out across three distinct operational workload models reveals critical scaling differences:
- Fixed-Workload Scale-Out: Total offered load is kept constant while node count expands from 3 to 5 nodes. Evaluates distributed coordination overhead.
- Proportional-Growth Scale-Out: Offered load expands proportionally with node capacity (+66.7%). Evaluates distributed engine throughput scaling.
- Hot-Contention Baseline: Single-partition or single-key serialization bottlenecks under scale-out.

Comparative performance claims await admitted GCP/lab measurements.

| Mode | Target | 3-Node (tx/s) | 3-Node p95 (ms) | 5-Node (tx/s) | 5-Node p95 (ms) | Scale Gain % | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fixed-Workload Scale-Out | Lagrange 0.4.0 | 1735.00 | 14.5 | 2410.40 | 18.0 | +38.9% | observed-docker-cluster |
| Fixed-Workload Scale-Out | TiDB + TiKV v8.5.8 | 1169.60 | 18.5 | 1962.60 | 21.8 | +67.8% | observed-docker-cluster |
| Fixed-Workload Scale-Out | Citus 13 (Sharded SQL + App) | 1180.40 | 20.5 | 1983.40 | 20.9 | +68.0% | observed-docker-cluster |
| Fixed-Workload Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 2159.40 | 12.6 | 2441.50 | 20.6 | +13.1% | observed-docker-cluster |
| Fixed-Workload Scale-Out | Apache Ignite 3 (Colocated) | 2387.40 | 11.6 | 2458.90 | 19.0 | +3.0% | observed-docker-cluster |
| Proportional-Growth Scale-Out | Lagrange 0.4.0 | 2361.30 | 12.1 | 2231.60 | 21.7 | -5.5% | observed-docker-cluster |
| Proportional-Growth Scale-Out | TiDB + TiKV v8.5.8 | 1359.40 | 23.1 | 2297.60 | 20.1 | +69.0% | observed-docker-cluster |
| Proportional-Growth Scale-Out | Citus 13 (Sharded SQL + App) | 1524.20 | 14.8 | 2247.90 | 24.4 | +47.5% | observed-docker-cluster |
| Proportional-Growth Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 2489.30 | 11.8 | 2334.90 | 20.8 | -6.2% | observed-docker-cluster |
| Proportional-Growth Scale-Out | Apache Ignite 3 (Colocated) | 2458.40 | 11.0 | 2320.20 | 20.3 | -5.6% | observed-docker-cluster |
| Hot-Contention Baseline | Lagrange 0.4.0 | 2272.70 | 12.6 | 2365.40 | 14.2 | +4.1% | observed-docker-cluster |
| Hot-Contention Baseline | TiDB + TiKV v8.5.8 | 1661.60 | 18.1 | 2097.40 | 16.8 | +26.2% | observed-docker-cluster |
| Hot-Contention Baseline | PG 17 (Patroni Sync HA + App) | 2402.90 | 11.3 | 2424.00 | 13.8 | +0.9% | observed-docker-cluster |
| Hot-Contention Baseline | Citus 13 (Sharded SQL + App) | 1745.00 | 16.8 | 2349.10 | 14.7 | +34.6% | observed-docker-cluster |
| Hot-Contention Baseline | YugabyteDB 2024.2 (YSQL + App) | 2495.50 | 11.5 | 2414.80 | 14.5 | -3.2% | observed-docker-cluster |
| Hot-Contention Baseline | Apache Ignite 3 (Colocated) | 2556.60 | 13.5 | 2283.30 | 14.1 | -10.7% | observed-docker-cluster |

## Scenario B partial replica-coverage comparison at 5 nodes (RF=3)

Under 60% replica coverage at 5 nodes, individual node throughput reflects the 40% remote stage hop,
while total cluster aggregate capacity evaluates distributed state scaling. Comparative performance claims await admitted GCP/lab measurements.

| Target | 3-Node (100%) dec/s | 3-Node p99 (ms) | 5-Node (60%) dec/s | 5-Node p99 (ms) | 5-Node WAN (B) | Aggregate dec/s | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 2662.9 | 26.8 | 2172.3 | 29.4 | 3216 | 2345.2 | observed-docker-cluster |
| TiDB + TiKV | 2309.0 | 23.7 | 521.2 | 37.7 | 39152 | 702.9 | observed-docker-cluster |
| Citus 13 (Dist Function) | 2644.6 | 26.8 | 1247.0 | 28.8 | 6374 | 2141.1 | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 1777.6 | 46.3 | 1014.7 | 38.9 | 11455 | 1448.8 | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 2575.1 | 21.8 | 753.2 | 91.7 | 5310 | 1041.3 | observed-docker-cluster |
