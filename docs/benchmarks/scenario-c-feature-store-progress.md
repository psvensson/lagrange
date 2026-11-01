# PostgreSQL 17 + Valkey 8 Feature Store and Lagrange Comparative Progress

Comparative evaluation of Lagrange against PostgreSQL 17 + Valkey 8 in-memory feature caching
across sync write-through and async CDC streaming under explicit freshness SLAs.

- Comparative navigation: [Landing](README.md) | [Dashboard](index.html) | [TiDB](tidb-comparison-progress.md) |
  [PostgreSQL](postgresql-comparison-progress.md) | [Citus](citus-comparison-progress.md) | [Yugabyte](yugabyte-ignite-comparison-progress.md)
- Scenario specs: [Scenario A](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision),
  and [Scenario C](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)

![PostgreSQL 17 + Valkey 8 feature store and Lagrange comparative progress chart](scenario-c-feature-store-progress.svg)

## Feature-freshness SLA tradeoff (0 ms read-your-writes vs 1000 ms relaxed staleness)
- **0 ms strict read-your-writes**: Evaluates strict transactional visibility across continuous streaming ingestion.
- **1000 ms relaxed staleness**: Precomputed Valkey caching decouples decision evaluation from relational storage transactions.

## Rule-change agility, backfill downtime, and operational footprint
- **Rule-change backfill cost**: Evaluates offline/online index and feature backfill requirements across relational and in-memory caches.
- **Cache-node restart recovery**: Evaluates cache warm-up vs log-replay recovery duration.
- **Operational pipeline count**: Evaluates unified streaming actor execution against multi-tier caching architectures (evaluating `pg-valkey-sync-write-through` and `pg-valkey-async-stream`). Comparative performance claims await admitted GCP/lab measurements.

## Scenario C feature store and freshness-bounded risk decision comparison

| Target | Version | Units | Pipelines | 0 ms SLA | 100 ms SLA | 1000 ms SLA | Stale | Backfill | Recovery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 1 | 2559.6 | 2739.1 | 2735.9 | 0.00% | 0.0s | 3.2s |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 3 | 1 | 2195.1 | 2625.2 | 2554.3 | 0.00% | 0.0s | 8.5s |
| pg-valkey-sync-write-through | 17.2-valkey-8.0-sync | 4 | 3 | 2329.8 | 2279.0 | 2644.9 | 0.42% | 185.0s | 42.0s |
| pg-valkey-async-stream | 17.2-valkey-8.0-async | 5 | 4 | 0.0 | 2261.2 | 2528.3 | 6.80% | 240.0s | 58.0s |

## Topology and baseline context

| Target | Units | Procs | RPO=0 HA | Scenario A (tx/s) | Scenario B (dec/s) | p99 (ms) | WAN Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 3 | 3 | Yes (RPO=0) | 2014.0 | 2172.3 | 26.8 | 2950 |
| pg-plpgsql-sync-ha-rf3 | 3 | 3 | Yes (RPO=0) | 1506.2 | 2181.6 | 32.4 | 4824 |
| pg-valkey-sync-write-through | 4 | 4 | Yes (RPO=0) | 1763.4 | 759.6 | 36.7 | 16620 |
| pg-valkey-async-stream | 5 | 5 | Yes (RPO=0) | 2343.1 | 712.8 | 45.5 | 19968 |
