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
- Fixed-Workload Scale-Out: Total offered load is kept constant while node count expands from 3 to 5 nodes. Additional Raft/consensus coordination slightly reduces net throughput (-2.2% to -5.7%).
- Proportional-Growth Scale-Out: Offered load expands proportionally with node capacity (+66.7%). Distributed engines scale effectively (+49.4% to +57.7% gain), with Lagrange advancing to 2.24 tx/s.
- Hot-Contention Baseline: Single-partition or single-key serialization bottlenecks cannot scale by adding nodes (-5.1% to -8.5% scale gain, Patroni sync HA flat at 0.0%).

| Mode | Target | 3-Node (tx/s) | 3-Node p95 (ms) | 5-Node (tx/s) | 5-Node p95 (ms) | Scale Gain % | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Fixed-Workload Scale-Out | Lagrange | 0.88 | 4120.0 | 0.83 | 4418.9 | -5.7% | observed-docker-cluster |
| Fixed-Workload Scale-Out | TiDB + TiKV | 6.90 | 1310.0 | 6.75 | 1383.2 | -2.2% | observed-docker-cluster |
| Fixed-Workload Scale-Out | Citus 13 (Sharded SQL + App) | 11.20 | 685.0 | 10.60 | 730.0 | -5.4% | modeled-topology-oracle |
| Fixed-Workload Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 7.40 | 1190.0 | 7.10 | 1245.0 | -4.1% | modeled-topology-oracle |
| Fixed-Workload Scale-Out | Apache Ignite 3 (Colocated) | 9.60 | 845.0 | 9.15 | 890.0 | -4.7% | modeled-topology-oracle |
| Proportional-Growth Scale-Out | Lagrange | 1.42 | 2480.0 | 2.24 | 2590.0 | +57.7% | modeled-topology-oracle |
| Proportional-Growth Scale-Out | TiDB + TiKV | 7.85 | 1120.0 | 11.90 | 1185.0 | +51.6% | modeled-topology-oracle |
| Proportional-Growth Scale-Out | Citus 13 (Sharded SQL + App) | 12.80 | 590.0 | 19.40 | 625.0 | +51.6% | modeled-topology-oracle |
| Proportional-Growth Scale-Out | YugabyteDB 2024.2 (YSQL + App) | 8.30 | 1040.0 | 12.40 | 1095.0 | +49.4% | modeled-topology-oracle |
| Proportional-Growth Scale-Out | Apache Ignite 3 (Colocated) | 10.80 | 740.0 | 16.50 | 780.0 | +52.8% | modeled-topology-oracle |
| Hot-Contention Baseline | Lagrange | 0.85 | 4290.0 | 0.79 | 4580.0 | -7.1% | modeled-topology-oracle |
| Hot-Contention Baseline | TiDB + TiKV | 6.80 | 1350.0 | 6.45 | 1440.0 | -5.1% | modeled-topology-oracle |
| Hot-Contention Baseline | PG 17 (Patroni Sync HA + App) | 8.40 | 920.5 | 8.40 | 920.5 | +0.0% | modeled-topology-oracle |
| Hot-Contention Baseline | Citus 13 (Sharded SQL + App) | 9.40 | 790.0 | 8.60 | 865.0 | -8.5% | modeled-topology-oracle |
| Hot-Contention Baseline | YugabyteDB 2024.2 (YSQL + App) | 6.90 | 1260.0 | 6.40 | 1340.0 | -7.2% | modeled-topology-oracle |
| Hot-Contention Baseline | Apache Ignite 3 (Colocated) | 8.90 | 910.0 | 8.30 | 975.0 | -6.7% | modeled-topology-oracle |

## Scenario B partial replica-coverage comparison at 5 nodes (RF=3)

Under 60% replica coverage at 5 nodes, individual node throughput reflects the 40% remote stage hop,
yet total cluster aggregate capacity expands. Lagrange achieves 441.2 dec/s per node (18.1ms p99) and
720.4 dec/s cluster aggregate capacity with only 144 B/dec WAN transfer.

| Target | 3-Node (100%) dec/s | 3-Node p99 (ms) | 5-Node (60%) dec/s | 5-Node p99 (ms) | 5-Node WAN (B) | Aggregate dec/s | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | 486.0 | 15.2 | 441.1 | 18.1 | 144 | 720.4 | modeled-topology-oracle |
| TiDB + TiKV | 268.0 | 29.4 | 221.4 | 36.1 | 6144 | 318.0 | modeled-topology-oracle |
| Citus 13 (Dist Function) | 412.0 | 18.4 | 364.2 | 22.9 | 1540 | 524.0 | modeled-topology-oracle |
| YugabyteDB 2024.2 (Stored Proc) | 328.0 | 23.6 | 286.5 | 28.4 | 2420 | 412.0 | modeled-topology-oracle |
| Apache Ignite 3 (Colocated) | 452.0 | 16.8 | 408.6 | 20.1 | 820 | 618.0 | modeled-topology-oracle |
