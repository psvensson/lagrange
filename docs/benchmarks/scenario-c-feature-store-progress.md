# PostgreSQL 17 + Valkey 8 Feature Store and Lagrange Comparative Progress

Comparative evaluation of Lagrange against PostgreSQL 17 + Valkey 8 in-memory feature caching
across sync write-through and async CDC streaming under explicit freshness SLAs.

- Comparative navigation: [Landing](README.md) | [Dashboard](index.html) | [TiDB](tidb-comparison-progress.md) |
  [PostgreSQL](postgresql-comparison-progress.md) | [Citus](citus-comparison-progress.md) | [Yugabyte](yugabyte-ignite-comparison-progress.md)
- Scenario specs: [Scenario A](tidb-reference-scenarios.md#scenario-a-tidb-oltp-baseline), [Scenario B](tidb-reference-scenarios.md#scenario-b-tidb-distributed-risk-decision),
  and [Scenario C](tidb-reference-scenarios.md#scenario-c-streaming-feature-risk-decision)

![PostgreSQL 17 + Valkey 8 feature store and Lagrange comparative progress chart](scenario-c-feature-store-progress.svg)

## Feature-freshness SLA tradeoff (0 ms read-your-writes vs 1000 ms relaxed staleness)
- **0 ms strict read-your-writes**: Lagrange delivers 441.2 dec/s (0.0% stale) via transactional
  state; PG Patroni HA reaches 316.8 dec/s (0.0% stale). Sync write-through reaches 310.0 dec/s
  (0.42% stale); async CDC yields 0.0 dec/s (6.8% stale) due to replication lag.
- **1000 ms relaxed staleness**: Precomputed Valkey caching bypasses relational bottlenecks:
  async CDC reaches 538.0 dec/s (12.4ms p99) and sync reaches 485.0 dec/s (16.2ms p99),
  exceeding Lagrange (441.2 dec/s, 18.1ms p99).

## Rule-change agility, backfill downtime, and operational footprint
- **Rule-change backfill cost**: 185.0s (sync) to 240.0s (async) backfill downtime. Lagrange and
  PostgreSQL functions require 0.0s because features evaluate on demand over raw event state.
- **Cache-node restart recovery**: Valkey restart and warm-up takes 42.0s (sync) to 58.0s (async);
  Lagrange recovers in 3.2s via Raft log replay.
- **Operational pipeline count**: Lagrange operates 1 unified pipeline. Relational + Valkey
  requires 3 (sync) or 4 (async CDC) pipelines.

## Scenario C feature store and freshness-bounded risk decision comparison

| Target | Version | Units | Pipelines | 0 ms SLA | 100 ms SLA | 1000 ms SLA | Stale | Backfill | Recovery |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 0.4.0 | 3 | 1 | 441.1 | 441.1 | 441.1 | 0.00% | 0.0s | 3.2s |
| pg-plpgsql-sync-ha-rf3 | 17.2-patroni-4.0-plpgsql | 5 | 1 | 316.8 | 316.8 | 316.8 | 0.00% | 0.0s | 8.5s |
| pg-valkey-sync-write-through | 17.2-valkey-8.0-sync | 8 | 3 | 310.0 | 462.4 | 485.0 | 0.42% | 185.0s | 42.0s |
| pg-valkey-async-stream | 17.2-valkey-8.0-async | 9 | 4 | 0.0 | 492.0 | 538.0 | 6.80% | 240.0s | 58.0s |

## Topology and baseline context

| Target | Units | Procs | RPO=0 HA | Scenario A (tx/s) | Scenario B (dec/s) | p99 (ms) | WAN Bytes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lagrange | 3 | 3 | Yes (RPO=0) | 0.8 | 441.1 | 18.1 | 144 |
| pg-plpgsql-sync-ha-rf3 | 5 | 8 | Yes (RPO=0) | 8.4 | 316.8 | 24.1 | 960 |
| pg-valkey-sync-write-through | 8 | 11 | Yes (RPO=0) | 8.4 | 462.4 | 16.2 | 620 |
| pg-valkey-async-stream | 9 | 12 | Yes (RPO=0) | 8.4 | 538.0 | 12.4 | 480 |
