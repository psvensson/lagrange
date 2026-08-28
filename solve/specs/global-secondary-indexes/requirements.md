# Requirements: Global Secondary Indexes

## Scope and ownership

This contract covers globally routable secondary indexes over user tables:
index storage, write-path maintenance, read-path selection, and lifecycle.
It builds on, and does not re-own, the sealed contracts of the earlier
query-access-path rungs (`solve/epics/query-access-path-ladder.md`): typed
key ordering (`RM-0.3-qs-typed-key-ordering`), persisted primary-key
narrowing (`RM-0.3-qs-pk-partition-narrowing`), local index DDL wiring
(`RM-0.3-qs-local-index-ddl`), and ordered/compound index semantics
(`RM-0.3-qs-compound-index-semantics`).

It does not own partition placement, Raft replication, CDC transport, the
2PC coordinator, or SQL parsing — those owners are consumed, not modified,
except where a requirement below names an explicit extension point.

Rows in this spec constrain implementation scope only once the R2
consistency decision is sealed; until then the spec is design-preparation
surface.

Phase 0.3 treats global secondary indexes as access paths. Unique global
secondary indexes are a Phase 1.0 production-invariant concern because they
require a synchronous maintenance mode capable of participating in transaction
correctness. Partial/expression indexes and richer PostgreSQL index semantics
remain Phase 1.x; cost-based combination of multiple indexes remains Phase 2.0.

## R1 — Index as a system-managed partitioned dataset

- A global secondary index SHALL be stored as a system-managed partitioned
  dataset replicated by the same Raft partition-group machinery as user
  tables; no special index nodes or side storage.
- Index partitions SHALL be range-partitioned over the indexed tuple under
  the rung-1 typed total order, so index-side range narrowing reuses the
  existing `KeyRange` / partition-resolution machinery.
- An index definition MAY contain one or more indexed columns. Compound
  indexes SHALL obey the rung-4 ordered-index contract: lexicographic tuple
  ordering, sealed NULL/type/collation behavior, left-prefix matching, and
  equality-prefix plus next-column range semantics.
- Index entries SHALL map indexed value tuple plus base-table primary-key
  tuple to the base row's identity; the primary-key suffix makes every entry
  key unique regardless of duplicate indexed values.
- Unsupported index families or access semantics SHALL fail closed at DDL or
  planning time rather than being represented by metadata that the storage or
  planner cannot honor. Phase 0.3's required family is the ordinary ordered
  B-tree-like contract shared with local indexes.
- Index identity, definition, and state SHALL live in the existing
  `indices` system table (extended, not duplicated), CDC-propagated like
  other system tables.

## R2 — Maintenance consistency decision (sealed before implementation)

- Exactly one default maintenance mode SHALL be sealed before any
  implementation Quest links this spec: synchronous (index partitions
  enlisted as 2PC participants in the base write) or asynchronous
  (CDC-subscription-maintained, reusing the existing delivery and
  confirmation substrate).
- If asynchronous is selected:
  - Index staleness SHALL be bounded and observable: a per-index applied
    position surface queryable via diagnostics, and a typed answer when a
    query would read an index behind its base table.
  - Index maintenance SHALL be idempotent under CDC redelivery and restart.
    It builds on the wired partition CDC delivery path; the promise-based
    `CDCConfirmationTracker` is currently test-only and SHALL be
    production-wired (or replaced by an equivalent confirmation surface)
    before index maintenance depends on it.
  - Unique secondary indexes SHALL be out of Phase 0.3 scope; declaring one
    SHALL fail closed at DDL time. The capability graduates to Phase 1.0 only
    with a synchronous mode that can enforce uniqueness transactionally.
- If synchronous is selected: index unavailability SHALL fail the base
  write with a typed error, never silently skip maintenance; the write-path
  latency and availability cost SHALL be measured before the mode ships as
  default.
- Backfill of pre-existing rows SHALL be a resumable, restart-recoverable
  workflow with durable progress state, consistent with the schema-migration
  backfill precedent; an index SHALL NOT become readable before backfill
  reaches a terminal complete state.

## R3 — Read path

- Index selection SHALL live in the existing planner surface
  (`PartitionResolver` / `DistributedQueryPlanner` / strategy selection);
  the declared-but-unbacked `unique_index` and `bounded_index` access paths
  SHALL NOT be claimable until an index actually backs them.
- Planner matching SHALL follow the sealed ordered/compound-index semantics;
  matching an arbitrary non-leading index column is not sufficient to claim a
  routed compound-index access path.
- A query SHALL use an index only when the index is in a readable terminal
  state and (for async mode) within its sealed staleness bound for the
  query's consistency requirement; otherwise the planner SHALL fall back to
  the existing scatter-gather path. Index unavailability degrades
  performance, never correctness.
- Index reads SHALL narrow to index partitions via the same typed-order
  range resolution as base tables, then resolve base rows by primary key
  through the existing per-partition read path.
- `EXPLAIN DISTRIBUTED` SHALL show whether an index was selected, which
  one, the matched prefix/range shape for a compound index, and why an
  available index was rejected.

## R4 — Lifecycle and failure recording

- `CREATE INDEX` / `DROP INDEX` SHALL flow through the rung-3 statement
  dispatch into the index owner; lifecycle state transitions SHALL be
  durable owner commits, not cache observations.
- Drop SHALL be safe under concurrent reads: readers observing a dropping
  index fall back to scatter-gather; index partitions are released only
  after no route can select the index.
- Backfill or maintenance failure SHALL be recorded as structured durable
  state on the index row, queryable via SQL diagnostics, with the index
  held in a non-readable state — never a half-readable index.

## R5 — Proof obligations

- Deterministic-first: index maintenance, backfill resume, staleness
  bounds, compound-prefix/range selection, and drop-under-read SHALL each
  have deterministic in-process repros before distributed-harness
  confirmation, per `docs/steering/operational-ground-truth.md`.
- The distributed proof SHALL include: node failure during backfill, index
  partition leader loss during maintenance, and (async mode) CDC redelivery
  after restart — each with the base table remaining correct and the index
  converging or failing closed.
- Comparative evidence SHALL demonstrate the point of the feature: a
  non-PK predicate query and a compound-prefix/range query showing
  index-routed narrowing versus the prior scatter-gather baseline on the same
  workload.
