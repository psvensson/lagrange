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

- **PostgreSQL + Application Service** (`pg-single-primary` / `pg-patroni-sync-ha-rf3`): Executes business logic in an external application service tier, issuing SQL queries across client/database network boundaries (2.75 round-trips per decision). Reaches 520.0 dec/s (single-primary) and 385.0 dec/s (sync-HA) on `local-only`, dropping sharply on multi-hop `sequential` (198.0 dec/s) and `fan-out` (230.0 dec/s).
- **PostgreSQL + Server-Side PL/pgSQL Function** (`pg-plpgsql-single-primary` / `pg-plpgsql-sync-ha-rf3`): Colocates decision logic inside PostgreSQL procedures, collapsing multi-statement SQL round-trips to 1.0 per decision. Recovers most of the client/DB round-trip gap on single-locality (`local-only`) work (590.0 dec/s single-primary, 455.0 dec/s sync-HA vs Lagrange 620.0 dec/s) while keeping Scenario A separate on the ordinary-SQL transaction baseline (14.8 tx/s single-primary, 8.4 tx/s sync-HA).
- **Lagrange WASI Service** (`lagrange`): Colocates execution directly with partition ownership and consensus state machines (0 round-trips local). While PL/pgSQL recovers single-locality work, Lagrange advantage widens under RPO=0 synchronous HA replication, multi-partition `sequential` (380.0 dec/s) and `fan-out` (410.0 dec/s) stages, and live partition movement continuity.

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.3.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 0.83 | 2269.44 | 4418.93 | 5343.10 | 33/33 |
| tidb-tikv | v8.5.8 | 6 | 6 | Yes (RPO=0) | observed-docker-cluster | 6.75 | 535.12 | 1383.18 | 1887.96 | 33/33 |
| pg-single-primary | 17.2 | 2 | 2 | No (data-loss window) | modeled-topology-oracle | 14.80 | 185.40 | 412.60 | 580.20 | 33/33 |
| pg-patroni-sync-ha-rf3 | 17.2-patroni-4.0 | 6 | 9 | Yes (RPO=0) | modeled-topology-oracle | 8.40 | 390.20 | 920.50 | 1290.80 | 33/33 |
| pg-plpgsql-single-primary | 17.2-plpgsql | 1 | 1 | No (data-loss window) | modeled-topology-oracle | 14.80 | 185.40 | 412.60 | 580.20 | 33/33 |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 5 | 8 | Yes (RPO=0) | modeled-topology-oracle | 8.40 | 390.20 | 920.50 | 1290.80 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | modeled-topology-oracle | 441.15 | 12.06 | 18.09 | 18.09 | 144 | 0.00 | Passed |
| tidb-tikv | modeled-topology-oracle | 221.44 | 24.06 | 36.08 | 36.08 | 6144 | 4.50 | Passed |
| pg-single-primary | modeled-topology-oracle | 294.60 | 15.40 | 22.80 | 26.40 | 1420 | 2.75 | Not supported |
| pg-patroni-sync-ha-rf3 | modeled-topology-oracle | 218.20 | 21.80 | 31.40 | 35.20 | 2680 | 2.75 | Passed |
| pg-plpgsql-single-primary | modeled-topology-oracle | 418.40 | 9.80 | 14.90 | 17.60 | 320 | 1.00 | Not supported |
| pg-plpgsql-sync-ha-rf3 | modeled-topology-oracle | 316.80 | 13.90 | 20.80 | 24.10 | 960 | 1.00 | Passed |

## Scenario B four-shape latency and throughput ladder

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
| lagrange | 620.0 dec/s, p99 4.2ms, 0B, 0RT | 495.0 dec/s, p99 14.8ms, 96B, 1RT | 380.0 dec/s, p99 22.4ms, 192B, 2RT | 410.0 dec/s, p99 18.1ms, 192B, 1RT |
| tidb-tikv | 280.0 dec/s, p99 16.5ms, 2048B, 2RT | 235.0 dec/s, p99 32.1ms, 4096B, 4RT | 190.0 dec/s, p99 48.6ms, 6144B, 6RT | 215.0 dec/s, p99 38.2ms, 6144B, 5RT |
| pg-single-primary | 520.0 dec/s, p99 7.4ms, 640B, 1RT | 330.0 dec/s, p99 14.2ms, 1180B, 2RT | 198.0 dec/s, p99 24.8ms, 1960B, 4RT | 230.0 dec/s, p99 21.5ms, 1900B, 4RT |
| pg-patroni-sync-ha-rf3 | 385.0 dec/s, p99 11.2ms, 1280B, 1RT | 248.0 dec/s, p99 19.8ms, 2240B, 2RT | 146.0 dec/s, p99 34.6ms, 3640B, 4RT | 174.0 dec/s, p99 29.8ms, 3560B, 4RT |
| pg-plpgsql-single-primary | 590.0 dec/s, p99 5.1ms, 256B, 1RT | 442.0 dec/s, p99 10.6ms, 320B, 1RT | 312.0 dec/s, p99 17.8ms, 352B, 1RT | 358.0 dec/s, p99 15.4ms, 352B, 1RT |
| pg-plpgsql-sync-ha-rf3 | 455.0 dec/s, p99 7.8ms, 768B, 1RT | 338.0 dec/s, p99 14.9ms, 960B, 1RT | 234.0 dec/s, p99 25.2ms, 1056B, 1RT | 272.0 dec/s, p99 21.8ms, 1056B, 1RT |
