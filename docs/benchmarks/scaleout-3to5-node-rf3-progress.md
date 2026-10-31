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
| Fixed-Workload Scale-Out | Lagrange (0.3.0 Lab Baseline) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Fixed-Workload Scale-Out | Lagrange 0.3.3 (Tx Fast-Path) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Fixed-Workload Scale-Out | TiDB + TiKV | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Fixed-Workload Scale-Out | Citus 13 (Sharded SQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Fixed-Workload Scale-Out | YugabyteDB 2024.2 (YSQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Fixed-Workload Scale-Out | Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Proportional-Growth Scale-Out | Lagrange 0.3.3 | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Proportional-Growth Scale-Out | TiDB + TiKV | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Proportional-Growth Scale-Out | Citus 13 (Sharded SQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Proportional-Growth Scale-Out | YugabyteDB 2024.2 (YSQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Proportional-Growth Scale-Out | Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Hot-Contention Baseline | Lagrange 0.3.3 | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Hot-Contention Baseline | TiDB + TiKV | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Hot-Contention Baseline | PG 17 (Patroni Sync HA + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Hot-Contention Baseline | Citus 13 (Sharded SQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Hot-Contention Baseline | YugabyteDB 2024.2 (YSQL + App) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Hot-Contention Baseline | Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Hot-Contention Baseline | PG 17 (Single Primary + App Svc) | [unsupported] | [unsupported] | [unsupported] | [unsupported] | [unsupported] | none |
| Hot-Contention Baseline | PG 17 (Single Primary + PL/pgSQL) | [unsupported] | [unsupported] | [unsupported] | [unsupported] | [unsupported] | none |

## Scenario B partial replica-coverage comparison at 5 nodes (RF=3)

Under 60% replica coverage at 5 nodes, individual node throughput reflects the 40% remote stage hop,
while total cluster aggregate capacity evaluates distributed state scaling. Comparative performance claims await admitted GCP/lab measurements.

| Target | 3-Node (100%) dec/s | 3-Node p99 (ms) | 5-Node (60%) dec/s | 5-Node p99 (ms) | 5-Node WAN (B) | Aggregate dec/s | Evidence Tier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lagrange | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| TiDB + TiKV | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Citus 13 (Dist Function) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| YugabyteDB 2024.2 (Stored Proc) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
| Apache Ignite 3 (Colocated) | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | none |
