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
| lagrange | 44.7 dec/s, p99 1192.2ms, 0B, 0RT | 51.2 dec/s, p99 1229.0ms, 60207B, 1RT | 43.6 dec/s, p99 1498.7ms, 73460B, 2RT | 41.9 dec/s, p99 1525.5ms, 64210B, 1RT |
| tidb-tikv | 816.3 dec/s, p99 74.5ms, 8090B, 1RT | 611.7 dec/s, p99 65.3ms, 13135B, 2RT | 606.2 dec/s, p99 70.8ms, 13877B, 4RT | 698.5 dec/s, p99 59.7ms, 13445B, 4RT |
| pg-plpgsql-sync-ha-rf3 | 1118.9 dec/s, p99 105.1ms, 1156B, 1RT | 1139.7 dec/s, p99 104.1ms, 1110B, 1RT | 1161.0 dec/s, p99 100.1ms, 1113B, 1RT | 1188.2 dec/s, p99 98.5ms, 1135B, 1RT |
| citus-sql-service | [not measured] | [not measured] | [not measured] | [not measured] |
| citus-distributed-function | [not measured] | [not measured] | [not measured] | [not measured] |

## Scenario A OLTP baseline comparison ([tidb-oltp-baseline](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline))

| Target | Version | Units | Processes | RPO=0 HA | Evidence Tier | Throughput (tx/s) | p50 (ms) | p95 (ms) | p99 (ms) | Proofs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 5.30 | 5001.05 | 5002.26 | 5002.79 | 33/33 |
| tidb-tikv | v8.5.8 | 5 | 5 | Yes (RPO=0) | observed-docker-cluster | 783.00 | 22.40 | 84.47 | 95.89 | 33/33 |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 3 | 3 | Yes (RPO=0) | observed-docker-cluster | 555.90 | 5.92 | 221.97 | 223.26 | 33/33 |
| citus-sql-service | 13.0-pg17 | 5 | 5 | Yes (RPO=0) | not-measured | [not measured] | [not measured] | [not measured] | [not measured] | 0/33 |
| citus-distributed-function | 13.0-pg17-udf | 4 | 4 | Yes (RPO=0) | not-measured | [not measured] | [not measured] | [not measured] | [not measured] | 0/33 |

## Scenario B risk decision and graph-shape comparison ([tidb-distributed-risk-decision](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision))

| Target | Evidence Tier | Decisions/s | p50 (ms) | p95 (ms) | p99 (ms) | WAN Bytes/Dec | SQL Round-Trips | Movement Continuity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | observed-docker-cluster | 51.20 | 114.69 | 1227.43 | 1229.02 | 60207 | 1.00 | Passed |
| tidb-tikv | observed-docker-cluster | 611.70 | 21.29 | 63.90 | 65.31 | 13135 | 3.00 | Passed |
| pg-plpgsql-sync-ha-rf3 | observed-docker-cluster | 1139.70 | 4.14 | 100.84 | 104.07 | 1110 | 1.00 | Passed |
| citus-sql-service | not-measured | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
| citus-distributed-function | not-measured | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] | [not measured] |
