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
| lagrange | [not measured] | [not measured] | [not measured] | [not measured] |
| tidb-tikv | [not measured] | [not measured] | [not measured] | [not measured] |
| citus-distributed-function | [not measured] | [not measured] | [not measured] | [not measured] |
| yugabytedb-ysql-rf3 | [not measured] | [not measured] | [not measured] | [not measured] |
| yugabytedb-stored-proc | [not measured] | [not measured] | [not measured] | [not measured] |
| ignite3-colocated-compute | [not measured] | [not measured] | [not measured] | [not measured] |

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | none | [not measured] | [not measured] | [not measured] | [not measured] | 0/33 |
| tidb-tikv | v8.5.8 | 6 | 6 | Yes (RPO=0) | none | [not measured] | [not measured] | [not measured] | [not measured] | 0/33 |
| citus-distributed-function | 13.0-pg17-udf | 4 | 4 | Yes (RPO=0) | none | [not measured] | [not measured] | [not measured] | [not measured] | 0/33 |
| yugabytedb-ysql-rf3 | 2024.2.1 | 4 | 7 | Yes (RPO=0) | none | [not measured] | [not measured] | [not measured] | [not measured] | 0/33 |
| yugabytedb-stored-proc | 2024.2.1-proc | 3 | 6 | Yes (RPO=0) | none | [not measured] | [not measured] | [not measured] | [not measured] | 0/33 |
| ignite3-colocated-compute | 3.0.0 | 3 | 3 | Yes (RPO=0) | none | [not measured] | [not measured] | [not measured] | [not measured] | 0/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| tidb-tikv | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| citus-distributed-function | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| yugabytedb-ysql-rf3 | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| yugabytedb-stored-proc | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| ignite3-colocated-compute | none | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
