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
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 1302.30 | 13.18 | 25.09 | 35.65 | 33/33 |
| tidb-tikv | v8.5.8 | 6 | 6 | Yes (RPO=0) | observed-docker-cluster | 1378.80 | 4.04 | 11.50 | 12.81 | 33/33 |
| pg-single-primary | 17.2 | 2 | 2 | No (data-loss window) | observed-docker-cluster | 1746.90 | 2.52 | 8.21 | 17.27 | 33/33 |
| pg-patroni-sync-ha-rf3 | 17.2-patroni-4.0 | 6 | 9 | Yes (RPO=0) | modeled-topology-oracle | 8.40 | 390.20 | 920.50 | 1290.80 | 33/33 |
| pg-plpgsql-single-primary | 17.2-plpgsql | 1 | 1 | No (data-loss window) | modeled-topology-oracle | 14.80 | 185.40 | 412.60 | 580.20 | 33/33 |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 5 | 8 | Yes (RPO=0) | modeled-topology-oracle | 8.40 | 390.20 | 920.50 | 1290.80 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | observed-docker-cluster | 1538.00 | 7.34 | 26.15 | 37.56 | 272 | 0.00 | Passed |
| tidb-tikv | observed-docker-cluster | 881.00 | 8.39 | 11.53 | 14.58 | 4729 | 6.00 | Passed |
| pg-single-primary | observed-docker-cluster | 770.50 | 9.77 | 16.51 | 21.39 | 4215 | 4.00 | Not supported |
| pg-patroni-sync-ha-rf3 | modeled-topology-oracle | 218.20 | 21.80 | 31.40 | 35.20 | 2680 | 2.75 | Passed |
| pg-plpgsql-single-primary | modeled-topology-oracle | 418.40 | 9.80 | 14.90 | 17.60 | 320 | 1.00 | Not supported |
| pg-plpgsql-sync-ha-rf3 | modeled-topology-oracle | 316.80 | 13.90 | 20.80 | 24.10 | 960 | 1.00 | Passed |

## Scenario B four-shape latency and throughput ladder

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
| lagrange | 1538.0 dec/s, p99 37.6ms, 0B, 0RT | 1353.0 dec/s, p99 42.1ms, 272B, 1RT | 1138.0 dec/s, p99 48.1ms, 544B, 2RT | 1246.0 dec/s, p99 44.3ms, 544B, 1RT |
| tidb-tikv | 881.0 dec/s, p99 14.6ms, 2048B, 2RT | 740.0 dec/s, p99 18.1ms, 4729B, 4RT | 591.6 dec/s, p99 17.9ms, 155726B, 6RT | 670.0 dec/s, p99 19.7ms, 4729B, 5RT |
| pg-single-primary | 770.5 dec/s, p99 21.4ms, 640B, 1RT | 580.0 dec/s, p99 28.4ms, 2100B, 2RT | 270.0 dec/s, p99 72.2ms, 4215B, 4RT | 410.0 dec/s, p99 38.5ms, 3800B, 4RT |
| pg-patroni-sync-ha-rf3 | 385.0 dec/s, p99 11.2ms, 1280B, 1RT | 248.0 dec/s, p99 19.8ms, 2240B, 2RT | 146.0 dec/s, p99 34.6ms, 3640B, 4RT | 174.0 dec/s, p99 29.8ms, 3560B, 4RT |
| pg-plpgsql-single-primary | 590.0 dec/s, p99 5.1ms, 256B, 1RT | 442.0 dec/s, p99 10.6ms, 320B, 1RT | 312.0 dec/s, p99 17.8ms, 352B, 1RT | 358.0 dec/s, p99 15.4ms, 352B, 1RT |
| pg-plpgsql-sync-ha-rf3 | 455.0 dec/s, p99 7.8ms, 768B, 1RT | 338.0 dec/s, p99 14.9ms, 960B, 1RT | 234.0 dec/s, p99 25.2ms, 1056B, 1RT | 272.0 dec/s, p99 21.8ms, 1056B, 1RT |
