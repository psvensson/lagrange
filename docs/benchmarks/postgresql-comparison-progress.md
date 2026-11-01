# PostgreSQL and Lagrange Comparative Progress

Comparative evaluation of Lagrange against PostgreSQL 17 configurations across Scenario A contended OLTP baseline and Scenario B distributed risk decision and partition movement.

- Comparative navigation: [Comparative Statistics Landing Page](README.md) | [Interactive Landing Dashboard](index.html) | [TiDB/TiKV Comparison Detail Page](tidb-comparison-progress.md)
- Scenario specifications: [Scenario A: tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B: tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![PostgreSQL and Lagrange comparative progress chart](postgresql-comparison-progress.svg)

## Deployment topology and durability boundary

- `pg-single-primary` (2-unit): Standard relational deployment with 1 PostgreSQL 17.2 instance and 1 dedicated application service process. High throughput for localized OLTP without consensus replication overhead, but carries a non-zero recovery point objective (data loss window) upon host failure.
- `pg-patroni-sync-ha-rf3` (6-unit / 9 processes): Strict zero data loss high availability cluster configured with Patroni 4.0, etcd 3.5 distributed consensus, synchronous physical replication (`synchronous_mode_strict: true`), PgBouncer connection pooling, and HAProxy load balancing. Guarantees RPO=0 across primary node failures at the cost of synchronous commit round-trips.
- `pg-plpgsql-single-primary` (1-unit): Embedded server-side stored procedure execution within a single PostgreSQL instance without an external application service tier.
- `pg-plpgsql-sync-ha-rf3` (5-unit / 8 processes): Server-side stored procedure execution directly on the Patroni synchronous HA primary, eliminating application container hops.
- Query engine capability: PostgreSQL demonstrates full relational competence with pushdown aggregations (`COUNT`, `SUM`), index scan optimizations, and ACID serializability.

## Three-way locality control (Application Service vs PL/pgSQL Function vs Lagrange)

Comparative evaluation of three distinct control-flow models across Scenario B graph shapes:

- **PostgreSQL + Application Service** (`pg-single-primary` / `pg-patroni-sync-ha-rf3`): Executes business logic in an external application service tier, issuing SQL queries across client/database network boundaries.
- **PostgreSQL + Server-Side PL/pgSQL Function** (`pg-plpgsql-single-primary` / `pg-plpgsql-sync-ha-rf3`): Colocates decision logic inside PostgreSQL procedures, collapsing multi-statement SQL round-trips while keeping Scenario A separate on the ordinary-SQL transaction baseline.
- **Lagrange WASI Service** (`lagrange`): Colocates execution directly with partition ownership and consensus state machines. Comparative performance claims across systems await admitted GCP/lab measurements.

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 382.90 | 51.94 | 90.84 | 120.29 | 33/33 |
| tidb-tikv | v8.5.8 | 5 | 5 | Yes (RPO=0) | observed-docker-cluster | 104.20 | 75.37 | 299.00 | 327.16 | 33/33 |
| pg-single-primary | 17.2 | 2 | 2 | No (data-loss window) | observed-docker-cluster | 323.60 | 29.50 | 132.94 | 133.48 | 33/33 |
| pg-patroni-sync-ha-rf3 | 17.2-patroni-4.0 | 4 | 4 | Yes (RPO=0) | observed-docker-cluster | 130.40 | 63.43 | 134.60 | 160.01 | 33/33 |
| pg-plpgsql-single-primary | 17.2-plpgsql | 1 | 1 | No (data-loss window) | observed-docker-cluster | 1216.00 | 15.95 | 55.08 | 60.46 | 33/33 |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 233.50 | 65.43 | 176.21 | 222.66 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | observed-docker-cluster | 391.90 | 54.31 | 80.56 | 100.36 | 3348 | 0.00 | Passed |
| tidb-tikv | observed-docker-cluster | 247.10 | 67.59 | 111.85 | 134.01 | 17603 | 6.00 | Passed |
| pg-single-primary | observed-docker-cluster | 288.80 | 50.75 | 99.16 | 102.89 | 9425 | 4.00 | Not supported |
| pg-patroni-sync-ha-rf3 | observed-docker-cluster | 142.10 | 88.97 | 174.49 | 204.96 | 10989 | 3.00 | Passed |
| pg-plpgsql-single-primary | observed-docker-cluster | 1134.60 | 14.14 | 46.42 | 85.73 | 1313 | 1.00 | Not supported |
| pg-plpgsql-sync-ha-rf3 | observed-docker-cluster | 361.40 | 47.50 | 80.09 | 80.90 | 5735 | 1.00 | Passed |

## Scenario B four-shape latency and throughput ladder

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
| lagrange | 654.1 dec/s, p99 75.4ms, 0B, 0RT | 391.9 dec/s, p99 100.4ms, 3348B, 1RT | 273.7 dec/s, p99 122.3ms, 5164B, 2RT | 288.0 dec/s, p99 127.1ms, 5046B, 1RT |
| tidb-tikv | 383.8 dec/s, p99 102.0ms, 7600B, 2RT | 247.1 dec/s, p99 134.0ms, 17603B, 4RT | 115.2 dec/s, p99 241.7ms, 49770B, 6RT | 156.7 dec/s, p99 166.2ms, 29169B, 5RT |
| pg-single-primary | 346.8 dec/s, p99 73.2ms, 4628B, 1RT | 288.8 dec/s, p99 102.9ms, 9425B, 2RT | 205.9 dec/s, p99 121.6ms, 16562B, 4RT | 198.2 dec/s, p99 127.8ms, 15328B, 4RT |
| pg-patroni-sync-ha-rf3 | 305.5 dec/s, p99 123.8ms, 7519B, 1RT | 142.1 dec/s, p99 205.0ms, 10989B, 2RT | 87.6 dec/s, p99 314.7ms, 16102B, 4RT | 166.1 dec/s, p99 144.8ms, 15141B, 4RT |
| pg-plpgsql-single-primary | 1297.2 dec/s, p99 62.2ms, 1247B, 1RT | 1134.6 dec/s, p99 85.7ms, 1313B, 1RT | 1192.8 dec/s, p99 80.3ms, 1347B, 1RT | 1338.4 dec/s, p99 52.7ms, 1340B, 1RT |
| pg-plpgsql-sync-ha-rf3 | 358.2 dec/s, p99 78.9ms, 5114B, 1RT | 361.4 dec/s, p99 80.9ms, 5735B, 1RT | 233.5 dec/s, p99 120.3ms, 9742B, 1RT | 118.2 dec/s, p99 252.4ms, 10145B, 1RT |
