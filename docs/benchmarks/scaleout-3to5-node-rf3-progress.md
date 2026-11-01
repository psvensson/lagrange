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
| Fixed-Workload Scale-Out | Lagrange 0.4.0 | 37.50 | 985.9 | 59.70 | 1555.8 | +59.2% | observed-docker-cluster |
| Fixed-Workload Scale-Out | TiDB + TiKV v8.5.8 | 2018.20 | 33.3 | 2153.70 | 51.1 | +6.7% | observed-docker-cluster |
| Fixed-Workload Scale-Out | Citus 13 (Sharded SQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Fixed-Workload Scale-Out | YugabyteDB 2024.2 (YSQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Fixed-Workload Scale-Out | Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Proportional-Growth Scale-Out | Lagrange 0.4.0 | 36.80 | 1201.5 | 84.00 | 1269.7 | +128.3% | observed-docker-cluster |
| Proportional-Growth Scale-Out | TiDB + TiKV v8.5.8 | 1998.40 | 32.4 | 2162.50 | 60.3 | +8.2% | observed-docker-cluster |
| Proportional-Growth Scale-Out | Citus 13 (Sharded SQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Proportional-Growth Scale-Out | YugabyteDB 2024.2 (YSQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Proportional-Growth Scale-Out | Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Hot-Contention Baseline | Lagrange 0.4.0 | 50.80 | 829.2 | 56.80 | 1124.4 | +11.8% | observed-docker-cluster |
| Hot-Contention Baseline | TiDB + TiKV v8.5.8 | 1755.70 | 38.8 | 2025.90 | 43.2 | +15.4% | observed-docker-cluster |
| Hot-Contention Baseline | PG 17 (Patroni Sync HA + App) | 2076.80 | 54.3 | 2018.20 | 70.9 | -2.8% | observed-docker-cluster |
| Hot-Contention Baseline | Citus 13 (Sharded SQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Hot-Contention Baseline | YugabyteDB 2024.2 (YSQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Hot-Contention Baseline | Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |

## Scenario B partial replica-coverage comparison at 5 nodes (RF=3)

Under 60% replica coverage at 5 nodes, individual node throughput reflects the 40% remote stage hop,
while total cluster aggregate capacity evaluates distributed state scaling. Comparative performance claims await admitted GCP/lab measurements.

| Target | 3-Node (100%) dec/s | 3-Node p99 (ms) | 5-Node (60%) dec/s | 5-Node p99 (ms) | 5-Node WAN (B) | Aggregate dec/s | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 44.7 | 1192.2 | 51.2 | 971.6 | 69878 | 74.1 | observed-docker-cluster |
| TiDB + TiKV | 816.3 | 74.5 | 606.2 | 65.3 | 13135 | 611.7 | observed-docker-cluster |
| Citus 13 (Dist Function) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| YugabyteDB 2024.2 (Stored Proc) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
| Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | not-measured |
