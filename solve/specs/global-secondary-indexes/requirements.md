# Requirements: Global Secondary Indexes

status: active — R2 sealed (2026-10-30)

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

Rows in this spec constrain implementation scope following the C1 seal
of R2 on 2026-10-30.

Phase 0.3 treats global secondary indexes as access paths. Unique global
secondary indexes are a Phase 1.0 production-invariant concern because they
require a synchronous maintenance mode capable of participating in transaction
correctness. Partial/expression indexes and richer PostgreSQL index semantics
belong to Phase 1.1; cost-based combination of multiple indexes remains Phase 2.0.
Specialized vector, full-text and spatial search families belong to Phase 2.1
and retain their distinct storage and semantic contracts. These are queued
release homes in the [AGPL feature map](../../../docs/development/agpl-feature-map.md),
not permission to start parallel implementation during current 0.2.9
stabilization. The R2 maintenance decision is sealed below under C1 (2026-10-30).

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

## R2 — Maintenance and Consistency Mode (SEALED 2026-10-30)

- **Adopted Decision**: **Mode A — Synchronous transactional maintenance in 0.3.2 for non-unique global secondary indexes (`CREATE GLOBAL INDEX`), with global uniqueness (`CREATE UNIQUE GLOBAL INDEX`) explicitly deferred to 1.0**.

### Sealed Contracts

1. **TX1 Participant Enlistment**: Base-table `INSERT`, `UPDATE`, and `DELETE` statements synchronously derive index-entry mutations for all global indexes in `[WRITE_ONLY, BACKFILLING, READ_WRITE]` states and enlist affected index partitions as TX1 participants before the transaction's participant set is frozen. Write maintenance fails closed with a typed error if any index participant is unavailable.
2. **Read Visibility & Completeness**: Planner and read router select a global index only when `index_state === 'READ_WRITE'` and the query satisfies a leading equality/range prefix. Indexes in `CREATING`, `WRITE_ONLY`, `BACKFILLING`, `FAILED`, or `DROPPING` states are non-readable and fall back deterministically to base-table scatter-gather without returning partial results. Stage-2 base-row lookups resolve current base-row partition ownership rather than trusting stale stored partition IDs across splits/merges.
3. **Measured Write Cost**: Write-path maintenance reports participant fanout and latency overhead for 0, 1, and 2 active global indexes.
4. **Explicit 1.0 Deferral**: `CREATE UNIQUE GLOBAL INDEX` is rejected at admission with `UNSUPPORTED_SQL_FEATURE` (`SQLSTATE 0A000`).
5. **Resumable Backfill**: Backfill of pre-existing rows SHALL be a resumable, restart-recoverable workflow with durable progress state, consistent with the schema-migration backfill precedent; an index SHALL NOT become readable (`READ_WRITE`) before backfill reaches a terminal complete state. Concurrent mutations during backfill are maintained synchronously in `BACKFILLING` state and protected against obsolete-entry resurrection.

## R3 — Read path

- Index selection SHALL live in the existing planner surface
  (`PartitionResolver` / `DistributedQueryPlanner` / strategy selection);
  the declared-but-unbacked `unique_index` and `bounded_index` access paths
  SHALL NOT be claimable until an index actually backs them.
- Planner matching SHALL follow the sealed ordered/compound-index semantics;
  matching an arbitrary non-leading index column is not sufficient to claim a
  routed compound-index access path.
- A query SHALL use an index only when the index is in a readable terminal
  state (`READ_WRITE`); otherwise the planner SHALL fall back to
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
  confirmation, per `test/distributed/operational-ground-truth.md`.
- The distributed proof SHALL include: node failure during backfill, and
  index partition leader loss during maintenance — each with the base table
  remaining correct and the index converging or failing closed.
- Comparative evidence SHALL demonstrate the point of the feature: a
  non-PK predicate query and a compound-prefix/range query showing
  index-routed narrowing versus the prior scatter-gather baseline on the same
  workload.
