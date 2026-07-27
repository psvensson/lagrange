---
epicContractVersion: 2
id: query-access-path-ladder
roadmapRow: null
graduatesTo: global-secondary-indexes
---

# Query access path ladder

Spans four roadmap rows: `RM-1.0-qs-typed-key-ordering`,
`RM-1.0-qs-pk-partition-narrowing`, `RM-1.0-qs-local-index-ddl`,
`RM-1.0-qs-global-secondary-indexes`. `roadmapRow` is null because no single
row owns the ladder; Quests link the row for their own rung.

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
so misrouting is reachable. That makes the ordering rung a candidate for a
Quest ahead of its 1.0 phase position.

## The ladder

1. **Typed key ordering** — one shared type-aware comparator or
   order-preserving key encoding; all four compare sites converge on it;
   persisted `partition_key_start/end` boundaries (stored as TEXT) need a
   migration or revalidation story. Everything below assumes a single total
   order for keys.
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
   (`docs/current-capabilities-and-limitations.md` and
   `architecture/process-partitioning.md` previously claimed local
   `CREATE INDEX` works; corrected 2026-07-27.)
4. **Global secondary indexes** — the only rung needing new cross-layer
   machinery. Contract: `solve/specs/global-secondary-indexes/`.

## Options under discussion

- **Rung 1: shared comparator vs order-preserving encoding.** A comparator is
  the smaller change (converge four sites) but leaves keys stored as
  ambiguously typed strings forever; an order-preserving encoding fixes the
  storage representation but forces a full boundary/key migration. Lean:
  comparator first with typed boundary metadata, encoding only if GSI storage
  needs it.
- **Rung 4: synchronous (2PC-enlisted) vs asynchronous (CDC-maintained)
  index writes.** Sync gives read-your-index consistency but puts index
  partitions inside every write's commit path; async reuses the wired
  partition CDC delivery path and the CDC-fed system-table-cache precedent,
  but requires a typed staleness surface — and the promise-based
  `CDCConfirmationTracker` exists only under test today and would itself
  need production wiring. Lean: async first with a sealed staleness
  contract; sync as a later opt-in per index. Decision must be sealed in the
  spec before any implementation Quest.

## Open questions

- Does the rung-1 boundary migration need a live-cluster path, or is
  recompute-on-upgrade acceptable for existing deployments?
- Are unique secondary indexes in rung-4 scope at all, or deferred until a
  sync maintenance mode exists (async cannot enforce uniqueness)?
- Does rung 3 expose `QueryOptimizer` hints to the distributed planner
  immediately, or only create/maintain indexes first and integrate reads in
  rung 4?
- Is the last-writer-wins `AND`-condition defect part of rung 2's key
  condition extraction scope, or a separate small fix landed alongside
  rung 1?

## Decision log

- 2026-07-27 — Epic created from code verification of the documented
  query-layer limitations; ladder ordering and roadmap rows `RM-1.0-qs-*`
  added to `docs/steering/agpl-feature-map.md`.
- 2026-07-27 — Adversarial re-verification corrected the draft: the declared
  PK is already persisted (`tables.partition_key`), so rung 2 needs no
  schema migration; the fourth compare site is a raw `<`, not
  `localeCompare` (three disagreeing orders, not two); IndexService has
  new-partition index creation, not row backfill; `CDCConfirmationTracker`
  is test-only; `bounded_index` is unbacked alongside `unique_index`; the
  capability docs overstate local `CREATE INDEX` support.
