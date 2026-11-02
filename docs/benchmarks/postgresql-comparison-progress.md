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
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 5.30 | 5001.05 | 5002.26 | 5002.79 | 33/33 |
| tidb-tikv | v8.5.8 | 5 | 5 | Yes (RPO=0) | observed-docker-cluster | 783.00 | 22.40 | 84.47 | 95.89 | 33/33 |
| pg-single-primary | 17.2 | 2 | 2 | No (data-loss window) | observed-docker-cluster | 956.40 | 16.17 | 140.23 | 155.64 | 33/33 |
| pg-patroni-sync-ha-rf3 | 17.2-patroni-4.0 | 4 | 4 | Yes (RPO=0) | observed-docker-cluster | 976.10 | 11.57 | 87.83 | 96.95 | 33/33 |
| pg-plpgsql-single-primary | 17.2-plpgsql | 1 | 1 | No (data-loss window) | observed-docker-cluster | 1020.80 | 10.69 | 157.65 | 170.34 | 33/33 |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 555.90 | 5.92 | 221.97 | 223.26 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | observed-docker-cluster | 51.20 | 114.69 | 1227.43 | 1229.02 | 60207 | 1.00 | Passed |
| tidb-tikv | observed-docker-cluster | 611.70 | 21.29 | 63.90 | 65.31 | 13135 | 3.00 | Passed |
| pg-single-primary | observed-docker-cluster | 1017.90 | 10.13 | 67.31 | 76.66 | 4963 | 3.00 | Not supported |
| pg-patroni-sync-ha-rf3 | observed-docker-cluster | 1003.80 | 10.27 | 76.76 | 80.10 | 5959 | 3.00 | Passed |
| pg-plpgsql-single-primary | observed-docker-cluster | 1135.80 | 4.12 | 97.17 | 103.55 | 929 | 1.00 | Not supported |
| pg-plpgsql-sync-ha-rf3 | observed-docker-cluster | 1139.70 | 4.14 | 100.84 | 104.07 | 1110 | 1.00 | Passed |

## Scenario B four-shape latency and throughput ladder

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
| lagrange | 44.7 dec/s, p99 1192.2ms, 0B, 0RT | 51.2 dec/s, p99 1229.0ms, 60207B, 1RT | 43.6 dec/s, p99 1498.7ms, 73460B, 2RT | 41.9 dec/s, p99 1525.5ms, 64210B, 1RT |
| tidb-tikv | 816.3 dec/s, p99 74.5ms, 8090B, 1RT | 611.7 dec/s, p99 65.3ms, 13135B, 2RT | 606.2 dec/s, p99 70.8ms, 13877B, 4RT | 698.5 dec/s, p99 59.7ms, 13445B, 4RT |
| pg-single-primary | 1058.7 dec/s, p99 111.1ms, 3829B, 1RT | 1017.9 dec/s, p99 76.7ms, 4963B, 2RT | 938.2 dec/s, p99 81.1ms, 6233B, 4RT | 928.1 dec/s, p99 80.4ms, 5599B, 4RT |
| pg-patroni-sync-ha-rf3 | 1107.9 dec/s, p99 106.6ms, 4014B, 1RT | 1003.8 dec/s, p99 80.1ms, 5959B, 2RT | 829.3 dec/s, p99 79.6ms, 7223B, 4RT | 911.0 dec/s, p99 79.7ms, 6492B, 4RT |
| pg-plpgsql-single-primary | 1121.5 dec/s, p99 104.5ms, 950B, 1RT | 1135.8 dec/s, p99 103.5ms, 929B, 1RT | 1167.1 dec/s, p99 101.4ms, 928B, 1RT | 1123.9 dec/s, p99 102.5ms, 925B, 1RT |
| pg-plpgsql-sync-ha-rf3 | 1118.9 dec/s, p99 105.1ms, 1156B, 1RT | 1139.7 dec/s, p99 104.1ms, 1110B, 1RT | 1161.0 dec/s, p99 100.1ms, 1113B, 1RT | 1188.2 dec/s, p99 98.5ms, 1135B, 1RT |
