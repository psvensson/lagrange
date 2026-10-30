---
id: multi-system-comparative-benchmark-matrix
status: done
proof: deterministic
roadmapRow: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/comparative-benchmark-matrix-guard.js --metric
quests:
  - comparative-landing-page-and-postgresql-app-service
  - postgresql-plpgsql-server-side-locality-control
  - citus-colocated-tables-and-distributed-functions
  - yugabytedb-and-apache-ignite3-distributed-comparators
  - scenario-c-postgresql-valkey-freshness-bounded-risk
authorizes:
  - data/tidb-comparison
  - docs/benchmarks
  - docs/README.md
  - README.md
  - scripts/checks
  - solve/epics
  - test/distributed/harness
  - test/shards
---

# Multi-system comparative benchmark matrix

## Intent (why now)

Evaluate Lagrange against conventional relational and distributed alternatives across
Scenario A (`tidb-oltp-baseline`), Scenario B (`tidb-distributed-risk-decision`), and
Scenario C (`streaming-feature-risk-decision`) in a five-slice comparative benchmark
program. Each slice publishes a reproducible GitHub merge that enriches the comparative
statistics landing page (`docs/benchmarks/README.md`, `docs/benchmarks/index.html`,
`docs/benchmarks/comparative-overview.svg`) and per-target detail pages. The program
identifies where shared-nothing actor locality avoids distributed coordination and
WAN round-trips, measuring both losses and parity alongside advantages.

## Selected boundary

- Target 1: PostgreSQL 17 + Application Service (`pg-single-primary` 2-unit reference
  and `pg-patroni-sync-ha-rf3` 6-unit strict synchronous HA with Patroni, etcd, PgBouncer,
  and HAProxy).
- Target 2: PostgreSQL 17 + Server-Side PL/pgSQL Functions (`pg-plpgsql-single-primary`
  and `pg-plpgsql-sync-ha-rf3`) across Scenario B's 4 graph shapes (`local-only`,
  `one-remote-stage`, `sequential`, `fan-out`) to isolate server-side round-trip elimination
  from cross-partition locality.
- Target 3: Citus 13 colocated tables and `create_distributed_function(..., colocate_with => 'accounts')`
  across Scenario B's 4-step entity-locality ladder and shard movement.
- Targets 4 & 5: YugabyteDB 2024.2 (`yugabytedb-ysql-rf3` 3-node to 5-node and stored-procedure
  control) and Apache Ignite 3 (`ignite3-colocated-compute` `JobTarget.colocated`).
- Scenario C: PostgreSQL 17 + Valkey 8 + Application Service (`pg-valkey-sync-write-through`
  and `pg-valkey-async-stream`) continuous event ingestion and freshness-bounded risk decision
  (0 ms, 100 ms, 1000 ms staleness SLA).
- Explicit evidence-tier qualification (`observed-docker-cluster` vs `modeled-topology-oracle`)
  on every table and chart.

## Decision log

- 2026-10-30: Defined the five-slice comparative program order (Slice 1: landing page and
  PostgreSQL application service comparator; Slice 2: PostgreSQL PL/pgSQL server-side
  locality control; Slice 3: Citus 13 colocated tables; Slice 4: YugabyteDB and Apache Ignite 3;
  Slice 5: Scenario C PostgreSQL + Valkey freshness-bounded risk). Established the comparative
  statistics landing page and per-target detail pages as the persistent publication structure.
- 2026-10-30: Completed all five comparative benchmark slices across PostgreSQL 17, PL/pgSQL server functions, Citus 13 distributed functions, YugabyteDB 2024.2, Apache Ignite 3 colocated compute, and Scenario C PostgreSQL 17 + Valkey 8 freshness-bounded risk decisions (remainingSlicesCount = 0).
