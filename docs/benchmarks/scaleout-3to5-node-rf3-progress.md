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
| Fixed-Workload Scale-Out | Lagrange 0.4.0 | 369.90 | 88.7 | 349.80 | 92.9 | -5.4% | observed-docker-cluster |
| Fixed-Workload Scale-Out | TiDB + TiKV v8.5.8 | 171.10 | 135.4 | 141.30 | 162.9 | -17.4% | observed-docker-cluster |
| Fixed-Workload Scale-Out | Citus 13 (Sharded SQL + App) | 164.50 | 122.8 | 140.70 | 172.4 | -14.5% | observed-docker-cluster |
| Fixed-Workload Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 328.10 | 78.5 | 138.80 | 338.0 | -57.7% | observed-docker-cluster |
| Fixed-Workload Scale-Out | Apache Ignite 3 (Colocated) | 323.40 | 97.8 | 262.40 | 124.5 | -18.9% | observed-docker-cluster |
| Proportional-Growth Scale-Out | Lagrange 0.4.0 | 349.70 | 67.3 | 392.30 | 103.5 | +12.2% | observed-docker-cluster |
| Proportional-Growth Scale-Out | TiDB + TiKV v8.5.8 | 194.40 | 112.1 | 189.60 | 200.5 | -2.5% | observed-docker-cluster |
| Proportional-Growth Scale-Out | Citus 13 (Sharded SQL + App) | 158.90 | 143.9 | 183.00 | 212.3 | +15.2% | observed-docker-cluster |
| Proportional-Growth Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 190.20 | 207.4 | 327.90 | 149.3 | +72.4% | observed-docker-cluster |
| Proportional-Growth Scale-Out | Apache Ignite 3 (Colocated) | 358.90 | 73.8 | 285.40 | 138.8 | -20.5% | observed-docker-cluster |
| Hot-Contention Baseline | Lagrange 0.4.0 | 167.60 | 356.9 | 397.70 | 80.0 | +137.3% | observed-docker-cluster |
| Hot-Contention Baseline | TiDB + TiKV v8.5.8 | 122.10 | 148.5 | 151.90 | 192.1 | +24.4% | observed-docker-cluster |
| Hot-Contention Baseline | Citus 13 (Sharded SQL + App) | 147.60 | 182.9 | 153.90 | 214.2 | +4.3% | observed-docker-cluster |
| Hot-Contention Baseline | YugabyteDB 2024.2 (YSQL + App) | 240.60 | 112.2 | 220.40 | 127.0 | -8.4% | observed-docker-cluster |
| Hot-Contention Baseline | Apache Ignite 3 (Colocated) | 208.60 | 150.6 | 196.40 | 174.8 | -5.8% | observed-docker-cluster |
| Hot-Contention Baseline | PG 17 (Patroni Sync HA + App) | 243.20 | 112.7 | 225.30 | 130.5 | -7.4% | observed-docker-cluster |

## Scenario B partial replica-coverage comparison at 5 nodes (RF=3)

Under 60% replica coverage at 5 nodes, individual node throughput reflects the 40% remote stage hop,
while total cluster aggregate capacity evaluates distributed state scaling. Comparative performance claims await admitted GCP/lab measurements.

| Target | 3-Node (100%) dec/s | 3-Node p99 (ms) | 5-Node (60%) dec/s | 5-Node p99 (ms) | 5-Node WAN (B) | Aggregate dec/s | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 654.1 | 75.4 | 391.9 | 128.0 | 8348 | 538.7 | observed-docker-cluster |
| TiDB + TiKV | 383.8 | 102.0 | 115.2 | 134.0 | 17603 | 247.1 | observed-docker-cluster |
| Citus 13 (Dist Function) | 1286.3 | 32.4 | 180.0 | 125.5 | 6980 | 364.2 | observed-docker-cluster |
| YugabyteDB 2024.2 (Stored Proc) | 334.8 | 90.1 | 168.9 | 125.8 | 9154 | 207.8 | observed-docker-cluster |
| Apache Ignite 3 (Colocated) | 494.0 | 92.1 | 83.3 | 340.4 | 5773 | 201.5 | observed-docker-cluster |
