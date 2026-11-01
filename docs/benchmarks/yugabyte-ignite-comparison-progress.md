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
| lagrange | 654.1 dec/s, p99 75.4ms, 0B, 0RT | 391.9 dec/s, p99 100.4ms, 3348B, 1RT | 273.7 dec/s, p99 122.3ms, 5164B, 2RT | 288.0 dec/s, p99 127.1ms, 5046B, 1RT |
| tidb-tikv | 383.8 dec/s, p99 102.0ms, 7600B, 2RT | 247.1 dec/s, p99 134.0ms, 17603B, 4RT | 115.2 dec/s, p99 241.7ms, 49770B, 6RT | 156.7 dec/s, p99 166.2ms, 29169B, 5RT |
| citus-distributed-function | 1286.3 dec/s, p99 32.4ms, 1667B, 1RT | 364.2 dec/s, p99 125.5ms, 6980B, 2RT | 180.0 dec/s, p99 180.1ms, 15251B, 3RT | 248.7 dec/s, p99 116.5ms, 11026B, 2RT |
| yugabytedb-ysql-rf3 | 376.9 dec/s, p99 113.0ms, 7205B, 1RT | 275.6 dec/s, p99 145.1ms, 11868B, 2RT | 140.0 dec/s, p99 193.0ms, 21270B, 4RT | 171.5 dec/s, p99 130.6ms, 18641B, 3RT |
| yugabytedb-stored-proc | 334.8 dec/s, p99 90.1ms, 4988B, 1RT | 207.8 dec/s, p99 125.8ms, 9154B, 2RT | 168.9 dec/s, p99 147.1ms, 15314B, 3RT | 142.3 dec/s, p99 179.3ms, 14922B, 3RT |
| ignite3-colocated-compute | 494.0 dec/s, p99 92.1ms, 1807B, 1RT | 201.5 dec/s, p99 340.4ms, 5773B, 2RT | 83.3 dec/s, p99 632.4ms, 13999B, 3RT | 169.8 dec/s, p99 198.6ms, 10155B, 2RT |

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 382.90 | 51.94 | 90.84 | 120.29 | 33/33 |
| tidb-tikv | v8.5.8 | 5 | 5 | Yes (RPO=0) | observed-docker-cluster | 104.20 | 75.37 | 299.00 | 327.16 | 33/33 |
| citus-distributed-function | 13.0-pg17-udf | 4 | 4 | Yes (RPO=0) | observed-docker-cluster | 209.60 | 69.30 | 148.93 | 238.42 | 33/33 |
| yugabytedb-ysql-rf3 | 2024.2.1 | 4 | 4 | Yes (RPO=0) | observed-docker-cluster | 237.30 | 76.47 | 131.15 | 149.94 | 33/33 |
| yugabytedb-stored-proc | 2024.2.1-proc | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 202.10 | 87.15 | 149.22 | 209.97 | 33/33 |
| ignite3-colocated-compute | 3.0.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 203.20 | 88.41 | 195.33 | 227.78 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | observed-docker-cluster | 391.90 | 54.31 | 80.56 | 100.36 | 3348 | 0.00 | Passed |
| tidb-tikv | observed-docker-cluster | 247.10 | 67.59 | 111.85 | 134.01 | 17603 | 6.00 | Passed |
| citus-distributed-function | observed-docker-cluster | 364.20 | 43.17 | 112.08 | 125.52 | 6980 | 2.00 | Passed |
| yugabytedb-ysql-rf3 | observed-docker-cluster | 275.60 | 54.11 | 109.90 | 145.07 | 11868 | 5.00 | Passed |
| yugabytedb-stored-proc | observed-docker-cluster | 207.80 | 77.88 | 110.19 | 125.76 | 9154 | 2.00 | Passed |
| ignite3-colocated-compute | observed-docker-cluster | 201.50 | 71.86 | 270.23 | 340.40 | 5773 | 2.00 | Passed |
