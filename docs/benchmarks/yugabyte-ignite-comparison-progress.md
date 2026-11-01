# YugabyteDB 2024.2, Apache Ignite 3, and Lagrange Comparative Progress

Comparative evaluation of Lagrange against YugabyteDB 2024.2 and Apache Ignite 3 across Scenario A contended OLTP baseline and Scenario B distributed risk decision and partition movement.

- Comparative navigation: [Comparative Statistics Landing Page](README.md) | [Interactive Landing Dashboard](index.html) | [TiDB/TiKV Comparison](tidb-comparison-progress.md) | [PostgreSQL & PL/pgSQL Comparison](postgresql-comparison-progress.md) | [Citus 13 Comparison](citus-comparison-progress.md)
- Scenario specifications: [Scenario A: tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B: tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![YugabyteDB, Apache Ignite 3, and Lagrange comparative progress chart](yugabyte-ignite-comparison-progress.svg)
![Scenario B shape crossover chart](scenario-b-shape-crossover.svg)

## Distributed SQL replication and tablet RPC comparison
YugabyteDB 2024.2 distributes SQL execution over DocDB tablet storage using per-tablet Raft consensus (RF=3):
- **App service vs stored procedure boundary**: Running SQL from an external service (`yugabytedb-ysql-rf3`, 4 units) incurs repeated app-to-TServer SQL round-trips. Pushing decision logic into a YSQL stored procedure (`yugabytedb-stored-proc`, 3 units) eliminates external SQL round-trips.
- **Cross-tablet RPC overhead**: Even with stored procedures, transactions spanning account, merchant, and device tables must coordinate across tablet leaders.
- **Contended OLTP baseline**: In Scenario A, tablet Raft replication and distributed transaction status records evaluate cross-tablet 2PC commit latency.

## Colocated compute comparison (Apache Ignite 3 vs Citus vs Lagrange)
Evaluating colocated compute grid execution (`JobTarget.colocated`) in Apache Ignite 3 against Citus distributed functions and Lagrange native WASI actor state:
- **Single-locality control**: On `local-only` decisions where compute executes directly on the partition primary, evaluating Apache Ignite 3 (`ignite3-colocated-compute`), Citus distributed functions, and Lagrange.
- **Cross-partition compute dispatch**: In cross-partition shapes (`one-remote-stage`, `sequential`, `fan-out`), Ignite 3 dispatches compute jobs via binary protocol across cluster nodes.
- **Per-shape crossover dynamics**: Multi-hop shapes evaluate the trade-off between serial RPC hops, coprocessor pushdown, and in-process execution.
- **Lagrange native actor state**: Lagrange colocates compute directly with partition consensus state; comparative performance claims await admitted GCP/lab measurements.

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
| lagrange | 2662.9 dec/s, p99 26.8ms, 0B, 0RT | 2172.3 dec/s, p99 26.8ms, 2950B, 1RT | 1715.1 dec/s, p99 33.8ms, 4532B, 2RT | 1778.4 dec/s, p99 24.0ms, 4537B, 1RT |
| tidb-tikv | 2309.0 dec/s, p99 23.7ms, 7181B, 1RT | 702.9 dec/s, p99 37.7ms, 39152B, 2RT | 521.2 dec/s, p99 44.4ms, 74804B, 4RT | 514.8 dec/s, p99 44.8ms, 75097B, 4RT |
| citus-distributed-function | 2644.6 dec/s, p99 26.8ms, 1873B, 1RT | 2141.1 dec/s, p99 28.8ms, 6374B, 1RT | 1247.0 dec/s, p99 45.4ms, 17370B, 1RT | 1273.6 dec/s, p99 35.6ms, 17126B, 1RT |
| yugabytedb-ysql-rf3 | 1814.7 dec/s, p99 44.1ms, 7018B, 1RT | 549.0 dec/s, p99 47.7ms, 35092B, 2RT | 383.7 dec/s, p99 66.7ms, 63225B, 4RT | 481.1 dec/s, p99 47.4ms, 63392B, 4RT |
| yugabytedb-stored-proc | 1777.6 dec/s, p99 46.3ms, 5715B, 1RT | 1448.8 dec/s, p99 38.9ms, 11455B, 1RT | 1014.7 dec/s, p99 58.7ms, 18665B, 1RT | 1164.0 dec/s, p99 41.5ms, 17497B, 1RT |
| ignite3-colocated-compute | 2575.1 dec/s, p99 21.8ms, 1756B, 1RT | 1041.3 dec/s, p99 91.7ms, 5310B, 1RT | 753.2 dec/s, p99 66.5ms, 8967B, 1RT | 1658.8 dec/s, p99 37.4ms, 8786B, 1RT |

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 2014.00 | 11.06 | 23.26 | 25.30 | 33/33 |
| tidb-tikv | v8.5.8 | 5 | 5 | Yes (RPO=0) | observed-docker-cluster | 1118.70 | 19.40 | 48.81 | 52.76 | 33/33 |
| citus-distributed-function | 13.0-pg17-udf | 4 | 4 | Yes (RPO=0) | observed-docker-cluster | 986.10 | 18.21 | 36.54 | 47.20 | 33/33 |
| yugabytedb-ysql-rf3 | 2024.2.1 | 4 | 4 | Yes (RPO=0) | observed-docker-cluster | 1868.70 | 10.65 | 17.09 | 19.34 | 33/33 |
| yugabytedb-stored-proc | 2024.2.1-proc | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 1585.60 | 12.41 | 21.51 | 23.37 | 33/33 |
| ignite3-colocated-compute | 3.0.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 680.30 | 33.33 | 69.58 | 79.53 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | observed-docker-cluster | 2172.30 | 9.88 | 23.42 | 26.78 | 2950 | 1.00 | Passed |
| tidb-tikv | observed-docker-cluster | 702.90 | 23.85 | 33.45 | 37.66 | 39152 | 3.00 | Passed |
| citus-distributed-function | observed-docker-cluster | 2141.10 | 10.62 | 23.60 | 28.77 | 6374 | 1.00 | Passed |
| yugabytedb-ysql-rf3 | observed-docker-cluster | 549.00 | 31.22 | 43.09 | 47.72 | 35092 | 3.00 | Passed |
| yugabytedb-stored-proc | observed-docker-cluster | 1448.80 | 15.42 | 28.01 | 38.85 | 11455 | 1.00 | Passed |
| ignite3-colocated-compute | observed-docker-cluster | 1041.30 | 14.53 | 86.27 | 91.73 | 5310 | 1.00 | Passed |
