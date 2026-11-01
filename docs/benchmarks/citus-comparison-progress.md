# Citus 13 and Lagrange Comparative Progress

Comparative evaluation of Lagrange against Citus 13 sharded PostgreSQL configurations across Scenario A contended OLTP baseline and Scenario B distributed risk decision and partition movement.

- Comparative navigation: [Comparative Statistics Landing Page](README.md) | [Interactive Landing Dashboard](index.html) | [TiDB/TiKV Comparison](tidb-comparison-progress.md) | [PostgreSQL & PL/pgSQL Comparison](postgresql-comparison-progress.md)
- Scenario specifications: [Scenario A: tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B: tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision), [Paired Benchmark Owner](tidb-reference-paired-owner.md), and [Scenario A Semantic Evidence Gate](tidb-reference-semantic-gate.md#scenario-a-semantic-evidence-gate)

![Citus 13 and Lagrange comparative progress chart](citus-comparison-progress.svg)

## Colocated shard topology and distribution-key faithfulness

Citus distributed tables require explicit distribution keys and colocation groups to execute distributed queries without cross-worker network hops:

- **Account entity colocation**: `accounts` and `account_history` share distribution key `account_id` with `colocate_with => 'accounts'`, ensuring account mutations and history appends execute within identical worker shards.
- **Merchant entity colocation**: `merchants` and `merchant_history` use distribution key `merchant_id` with `colocate_with => 'merchants'`, isolating merchant aggregation and balance checks to colocated merchant shards.
- **Device entity colocation**: `devices` and `device_history` use distribution key `device_id` with `colocate_with => 'devices'`, ensuring device fingerprinting and velocity checks run locally within device shards.
- **Topology & durability boundary**: Citus coordinator routes queries across 4 worker nodes (RF=3 HA), evaluating sharded SQL via coordinator (`citus-sql-service`) against colocated distributed functions (`citus-distributed-function`).

## Entity-locality progression (create_distributed_function vs Lagrange)

Evaluating server-side distributed function pushdown (`create_distributed_function`) against Lagrange native WASI actor execution across Scenario B graph shapes:

- **Single-locality control**: On `local-only` decisions where account, merchant, and device states are colocated or access is single-entity, `citus-distributed-function` routes directly to the shard worker, collapsing multi-statement SQL hops.
- **Cross-entity routing overhead**: As workflow stages span multiple entities (`one-remote-stage`, `sequential`, `fan-out`), Citus distributed functions evaluate cross-shard query routing across worker nodes.
- **Lagrange native actor state**: Lagrange colocates execution directly with partition consensus state. Comparative performance claims across systems await admitted GCP/lab measurements.

| Target | Local-Only | One Remote Stage | Sequential | Fan-Out |
| --- | --- | --- | --- | --- |
| lagrange | 654.1 dec/s, p99 75.4ms, 0B, 0RT | 391.9 dec/s, p99 100.4ms, 3348B, 1RT | 273.7 dec/s, p99 122.3ms, 5164B, 2RT | 288.0 dec/s, p99 127.1ms, 5046B, 1RT |
| tidb-tikv | 383.8 dec/s, p99 102.0ms, 7600B, 2RT | 247.1 dec/s, p99 134.0ms, 17603B, 4RT | 115.2 dec/s, p99 241.7ms, 49770B, 6RT | 156.7 dec/s, p99 166.2ms, 29169B, 5RT |
| pg-plpgsql-sync-ha-rf3 | 358.2 dec/s, p99 78.9ms, 5114B, 1RT | 361.4 dec/s, p99 80.9ms, 5735B, 1RT | 233.5 dec/s, p99 120.3ms, 9742B, 1RT | 118.2 dec/s, p99 252.4ms, 10145B, 1RT |
| citus-sql-service | 319.6 dec/s, p99 107.7ms, 8142B, 1RT | 223.2 dec/s, p99 125.4ms, 13112B, 2RT | 126.4 dec/s, p99 200.8ms, 20487B, 4RT | 80.3 dec/s, p99 388.3ms, 20059B, 3RT |
| citus-distributed-function | 1286.3 dec/s, p99 32.4ms, 1667B, 1RT | 364.2 dec/s, p99 125.5ms, 6980B, 2RT | 180.0 dec/s, p99 180.1ms, 15251B, 3RT | 248.7 dec/s, p99 116.5ms, 11026B, 2RT |

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 382.90 | 51.94 | 90.84 | 120.29 | 33/33 |
| tidb-tikv | v8.5.8 | 5 | 5 | Yes (RPO=0) | observed-docker-cluster | 104.20 | 75.37 | 299.00 | 327.16 | 33/33 |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 233.50 | 65.43 | 176.21 | 222.66 | 33/33 |
| citus-sql-service | 13.0-pg17 | 5 | 5 | Yes (RPO=0) | observed-docker-cluster | 78.10 | 161.16 | 326.65 | 346.30 | 33/33 |
| citus-distributed-function | 13.0-pg17-udf | 4 | 4 | Yes (RPO=0) | observed-docker-cluster | 209.60 | 69.30 | 148.93 | 238.42 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | observed-docker-cluster | 391.90 | 54.31 | 80.56 | 100.36 | 3348 | 0.00 | Passed |
| tidb-tikv | observed-docker-cluster | 247.10 | 67.59 | 111.85 | 134.01 | 17603 | 6.00 | Passed |
| pg-plpgsql-sync-ha-rf3 | observed-docker-cluster | 361.40 | 47.50 | 80.09 | 80.90 | 5735 | 1.00 | Passed |
| citus-sql-service | observed-docker-cluster | 223.20 | 65.43 | 101.37 | 125.37 | 13112 | 6.00 | Passed |
| citus-distributed-function | observed-docker-cluster | 364.20 | 43.17 | 112.08 | 125.52 | 6980 | 2.00 | Passed |
