# PostgreSQL and Lagrange Comparative Progress

Comparative evaluation of Lagrange against PostgreSQL 17 configurations across Scenario A contended OLTP baseline and Scenario B distributed risk decision and partition movement.

- Comparative navigation: [Comparative Statistics Landing Page](README.md) | [Interactive Landing Dashboard](index.html) | [TiDB/TiKV Comparison Detail Page](tidb-comparison-progress.md)
- Scenario specifications: [Scenario A: tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B: tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![PostgreSQL and Lagrange comparative progress chart](postgresql-comparison-progress.svg)

## Deployment topology and durability boundary

- `pg-single-primary` (2-unit): Standard relational deployment with 1 PostgreSQL 17.2 instance and 1 dedicated application service process. High throughput for localized OLTP without consensus replication overhead, but carries a non-zero recovery point objective (data loss window) upon host failure.
- `pg-patroni-sync-ha-rf3` (6-unit / 9 processes): Strict zero data loss high availability cluster configured with Patroni 4.0, etcd 3.5 distributed consensus, synchronous physical replication (`synchronous_mode_strict: true`), PgBouncer connection pooling, and HAProxy load balancing. Guarantees RPO=0 across primary node failures at the cost of synchronous commit round-trips.
- Query engine capability: PostgreSQL demonstrates full relational competence with pushdown aggregations (`COUNT`, `SUM`), index scan optimizations, and ACID serializability.

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.1.0-alpha.4 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 185.75 | 7.42 | 18.60 | 26.40 | 33/33 |
| tidb-tikv | v8.5.8 | 6 | 6 | Yes (RPO=0) | observed-docker-cluster | 53.78 | 24.15 | 56.40 | 78.90 | 33/33 |
| pg-single-primary | 17.2 | 2 | 2 | No (data-loss window) | modeled-topology-oracle | 312.40 | 3.10 | 7.80 | 12.40 | 33/33 |
| pg-patroni-sync-ha-rf3 | 17.2-patroni-4.0 | 6 | 9 | Yes (RPO=0) | modeled-topology-oracle | 142.60 | 9.80 | 23.40 | 34.20 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | modeled-topology-oracle | 412.80 | 3.80 | 9.40 | 14.20 | 384 | 0.00 | Passed |
| tidb-tikv | modeled-topology-oracle | 138.40 | 14.60 | 31.20 | 42.70 | 4860 | 4.50 | Passed |
| pg-single-primary | modeled-topology-oracle | 294.60 | 5.40 | 13.80 | 19.60 | 1420 | 2.75 | Not supported |
| pg-patroni-sync-ha-rf3 | modeled-topology-oracle | 218.20 | 7.90 | 18.60 | 27.40 | 2680 | 2.75 | Passed |

## Scenario B four-shape latency and throughput ladder

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
| lagrange | 640.0 dec/s, p99 6.2ms, 0B, 1RT | 465.0 dec/s, p99 11.8ms, 256B, 2RT | 342.0 dec/s, p99 16.4ms, 512B, 3RT | 398.0 dec/s, p99 14.9ms, 640B, 2RT |
| tidb-tikv | 245.0 dec/s, p99 19.4ms, 1840B, 2RT | 162.0 dec/s, p99 32.6ms, 3920B, 4RT | 98.0 dec/s, p99 54.8ms, 6480B, 6RT | 118.0 dec/s, p99 46.2ms, 5940B, 5RT |
| pg-single-primary | 520.0 dec/s, p99 7.4ms, 640B, 1RT | 330.0 dec/s, p99 14.2ms, 1180B, 2RT | 198.0 dec/s, p99 24.8ms, 1960B, 4RT | 230.0 dec/s, p99 21.5ms, 1900B, 4RT |
| pg-patroni-sync-ha-rf3 | 385.0 dec/s, p99 11.2ms, 1280B, 1RT | 248.0 dec/s, p99 19.8ms, 2240B, 2RT | 146.0 dec/s, p99 34.6ms, 3640B, 4RT | 174.0 dec/s, p99 29.8ms, 3560B, 4RT |
