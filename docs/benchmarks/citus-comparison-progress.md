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
| lagrange | 1538.0 dec/s, p99 37.6ms, 0B, 0RT | 1353.0 dec/s, p99 42.1ms, 272B, 1RT | 1138.0 dec/s, p99 48.1ms, 544B, 2RT | 1246.0 dec/s, p99 44.3ms, 544B, 1RT |
| tidb-tikv | 881.0 dec/s, p99 14.6ms, 2048B, 2RT | 740.0 dec/s, p99 18.1ms, 4729B, 4RT | 591.6 dec/s, p99 17.9ms, 155726B, 6RT | 670.0 dec/s, p99 19.7ms, 4729B, 5RT |
| pg-plpgsql-sync-ha-rf3 | 455.0 dec/s, p99 7.8ms, 768B, 1RT | 338.0 dec/s, p99 14.9ms, 960B, 1RT | 234.0 dec/s, p99 25.2ms, 1056B, 1RT | 272.0 dec/s, p99 21.8ms, 1056B, 1RT |
| citus-sql-service | 468.0 dec/s, p99 18.9ms, 1120B, 1RT | 321.6 dec/s, p99 30.5ms, 2480B, 2RT | 141.8 dec/s, p99 67.4ms, 4480B, 4RT | 196.0 dec/s, p99 48.4ms, 4400B, 3RT |
| citus-distributed-function | 605.0 dec/s, p99 4.8ms, 280B, 1RT | 382.0 dec/s, p99 14.6ms, 1240B, 2RT | 228.0 dec/s, p99 26.8ms, 2360B, 3RT | 268.0 dec/s, p99 23.4ms, 2280B, 2RT |

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 1302.30 | 13.18 | 25.09 | 35.65 | 33/33 |
| tidb-tikv | v8.5.8 | 6 | 6 | Yes (RPO=0) | observed-docker-cluster | 1378.80 | 4.04 | 11.50 | 12.81 | 33/33 |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 5 | 8 | Yes (RPO=0) | modeled-topology-oracle | 8.40 | 390.20 | 920.50 | 1290.80 | 33/33 |
| citus-sql-service | 13.0-pg17 | 5 | 5 | Yes (RPO=0) | observed-docker-cluster | 139.80 | 41.20 | 142.50 | 205.82 | 33/33 |
| citus-distributed-function | 13.0-pg17-udf | 4 | 4 | Yes (RPO=0) | modeled-topology-oracle | 11.20 | 280.40 | 685.00 | 960.40 | 33/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | observed-docker-cluster | 1538.00 | 7.34 | 26.15 | 37.56 | 272 | 0.00 | Passed |
| tidb-tikv | observed-docker-cluster | 881.00 | 8.39 | 11.53 | 14.58 | 4729 | 6.00 | Passed |
| pg-plpgsql-sync-ha-rf3 | modeled-topology-oracle | 316.80 | 13.90 | 20.80 | 24.10 | 960 | 1.00 | Passed |
| citus-sql-service | observed-docker-cluster | 321.60 | 21.40 | 27.60 | 30.48 | 4480 | 6.00 | Passed |
| citus-distributed-function | modeled-topology-oracle | 364.20 | 13.40 | 20.10 | 22.90 | 1540 | 1.75 | Passed |
