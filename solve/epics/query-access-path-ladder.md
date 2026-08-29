---
epicContractVersion: 2
id: query-access-path-ladder
roadmapRow: null
graduatesTo: global-secondary-indexes
---

# Query access path ladder

Spans five Phase 0.3 roadmap rows: `RM-0.3-qs-typed-key-ordering`,
`RM-0.3-qs-pk-partition-narrowing`, `RM-0.3-qs-local-index-ddl`,
`RM-0.3-qs-compound-index-semantics`, and `RM-0.3-qs-global-secondary-indexes`.
`roadmapRow` is null: no single row owns the ladder; Quests link their own rung.

The retired Phase 1.0 row IDs (`RM-1.0-qs-*`) must not be reused; they remain
valid only as references to older planning history (superseded by Phase 0.3).

## Intent (why now)

The query-layer limitations documented in
`docs/current-capabilities-and-limitations.md` and
`architecture/process-partitioning.md` (partition narrowing tied to an `id`
column, string-based range comparisons, no global secondary indexes) were the
only material limitations with no owned roadmap coverage. Code verification
(2026-07-27, adversarially re-verified same day) showed they are a dependency
ladder, not independent features, and that the first rung hides a correctness
exposure: split boundaries are chosen under SQLite collation
(`calculateMedianKey` via the `selectMedian` `ORDER BY` query) but consumed
under different orders — three duplicated `localeCompare`-based helpers
(`partition-resolver.js:717`, `key-range-manager.js:60`,
`live-query-group.js:378`) plus a raw JS `<` compare in
`partition-split-routing.js:248` during the split-replication window. Three
disagreeing total orders (SQLite BINARY/numeric, ICU `localeCompare`, JS
relational) touch the same persisted TEXT boundaries, and auto-split is live,
so misrouting is reachable.

The ladder precedes external-usability work because ordinary indexed SQL access
is part of a credible database, not a late production-only feature. Phase 0.3
stays narrower than 1.0: indexes are access paths here; global uniqueness and
other constraints needing synchronous index participation remain 1.0 work.

## The ladder

1. **Typed key ordering** — one shared type-aware comparator or
   order-preserving key encoding; all four compare sites converge on it;
   persisted `partition_key_start/end` boundaries (stored as TEXT) need a
   migration or revalidation story. Everything below assumes a single total
   order for keys and indexed tuples.
2. **Primary-key narrowing** — the declared primary key is already persisted
   twice (comma-joined in `tables.partition_key`, and as `primaryKey` flags
   inside `schema_definition`), and split/merge workflows already read
   `partition_key` as the true key column. But `resolvePrimaryKeyColumns()`
   never reads it — it falls back to a hardcoded `'id'`
   (`query-constants.js:403`), as do `distributed-write-coordinator.js`,
   `live-query-group.js`, and `live-query-service.js`. So splits compute
   medians over the true key while routing narrows on `id`, the composite-key
   path is test-only dead code, and non-`id`-PK tables scatter-gather every
   statement. Fix: read the persisted key in the four fallback modules — no
   schema migration required. Related documented defect to absorb here:
   conflicting `AND` key conditions resolve last-writer-wins
   (`process-partitioning.md:100-101`).
3. **Local index DDL** — `src/index-management/` (IndexService,
   QueryOptimizer) is complete but orphaned: nothing in `src/` imports it,
   it is absent from the runtime composition and public API, and
   `CREATE INDEX` parses but hits the statement dispatcher's
   unsupported-statement default. The `indices` system table is bootstrapped
   (in `src/bootstrap/`), and IndexService creates indexes on newly added
   partitions via a CDC handler. This rung is wiring, not construction.
   (The two capability docs cited under Intent previously claimed local
   `CREATE INDEX` works; corrected 2026-07-27.)
4. **Ordered and compound index semantics** — seal one B-tree-like contract
   shared by local and global indexes: tuple ordering, NULL/type/collation
   behavior, left-prefix matching, equality-prefix plus next-column range
   behavior, and explicit rejection of unsupported index types or access
   paths. The current `QueryOptimizer`'s any-matching-column fallback is not a
   sufficient distributed planner contract and must not become externally
   claimable semantics.
5. **Global secondary indexes** — the only rung needing new cross-layer
   storage and maintenance machinery. Global indexes are system-managed,
   partitioned, replicated datasets keyed by indexed tuple plus base primary
   key. Contract: `solve/specs/global-secondary-indexes/`.

## Options under discussion

- **Rung 1: shared comparator vs order-preserving encoding.** A comparator is
  the smaller change (converge four sites) but leaves keys stored as
  ambiguously typed strings forever; an order-preserving encoding fixes the
  storage representation but forces a full boundary/key migration. Lean:
  comparator first with typed boundary metadata, encoding only if GSI storage
  needs it.
- **Rung 4: exact ordered-index contract.** Lean toward one ordinary B-tree
  family for 0.3 rather than carrying metadata for hash or other index kinds
  that are not actually implemented. Compound semantics should be explicit
  enough that `(a,b,c)` is routable for `a`, `(a,b)`, or an equality prefix
  followed by a range, but not for an arbitrary predicate on `b` alone.
- **Rung 5: synchronous (2PC-enlisted) vs asynchronous (CDC-maintained)
  index writes.** Sync gives read-your-index consistency but puts index
  partitions inside every write's commit path; async reuses the wired partition
  CDC delivery path and the CDC-fed system-table-cache precedent but needs a
  typed staleness surface — and the promise-based `CDCConfirmationTracker`
  exists only under test today and would itself need production wiring. Lean:
  async first with a sealed staleness contract; synchronous maintenance is the
  prerequisite for unique global indexes, hence a Phase 1.0 production-invariant
  concern rather than a 0.3 exit requirement. The consistency decision must
  still be sealed in the spec before any implementation Quest.

## Open questions

- Does the rung-1 boundary migration need a live-cluster path, or is
  recompute-on-upgrade acceptable for existing deployments?
- What NULL and collation semantics form the smallest honest 0.3 ordered-index
  contract, and which richer PostgreSQL semantics should be deferred to 1.x?
- Does rung 3 expose `QueryOptimizer` hints to the distributed planner
  immediately, or only create/maintain indexes before rung 4 replaces the
  current heuristic matching with sealed compound-index semantics?
- Is the last-writer-wins `AND`-condition defect part of rung 2's key-condition
  extraction scope, or a separate small fix landed alongside rung 1?

## Deferred homes

The milestone boundary is explicit so excluded work is not an unowned backlog:

- **Phase 1.0:** unique global secondary indexes, synchronous maintenance when
  required for constraint correctness, and production rebuild/failover/write-
  amplification guarantees.
- **Phase 1.x:** partial and expression indexes, `INCLUDE`/covering syntax and
  index-only scans, richer collations/operator semantics, and broader
  PostgreSQL index DDL/catalog compatibility.
- **Phase 2.0:** statistics/cardinality estimation, cost-based index choice,
  index intersection/union and bitmap-style plans, richer hints, and index
  recommendation/advisor tooling.
- **Specialized later access paths/services:** vector, full-text, spatial, and
  other search families whose storage and semantics differ materially from the
  ordinary ordered-index contract.

## Decision log

- 2026-07-27 — Epic created from code verification of the documented
  query-layer limitations; ladder ordering and roadmap rows `RM-1.0-qs-*`
  added to `docs/steering/agpl-feature-map.md`.
- 2026-07-27 — Adversarial re-verification corrected the draft: the declared PK
  is already persisted (`tables.partition_key`), so rung 2 needs no schema
  migration; the fourth compare site is a raw `<`, not `localeCompare` (three
  disagreeing orders, not two); IndexService creates indexes on new partitions,
  it does not backfill rows; `CDCConfirmationTracker` is test-only;
  `bounded_index` and `unique_index` are unbacked; the capability docs overstate
  local `CREATE INDEX` support.
- 2026-08-28 — Reframed the ladder as Phase 0.3 Queryable Core, inserted an
  explicit compound-index semantics rung, retired the old `RM-1.0-qs-*` IDs, and
  assigned excluded index work to 1.0, 1.x, 2.0, or specialized services.
