---
audience: agent
documentClass: specification
status: proposed
---

# Practical SQL Access Paths — Phase 0.3 Requirements

## Purpose

Phase 0.3 makes ordinary application schemas efficient without requiring every
useful predicate to be the table partition key. It introduces a durable,
partition-local secondary-index contract that composes with the transaction,
schema-migration, topology, recovery, and query-planning machinery already in
Lagrange.

The milestone is intentionally narrower than global indexing. A query may still
fan out to multiple table partitions; the guarantee is that each contacted
partition can use an appropriate local access path instead of scanning all local
rows.

## Required invariants

1. **Base-row/index atomicity.** Once an index is active, a committed base-row
   mutation and every affected index entry become visible atomically at the same
   transactional visibility point. Rollback, retry, and recovery must not leave
   an active index describing a different committed state from its base table.
2. **Snapshot correctness.** An index scan may return only base rows visible to
   the query snapshot and may not omit a visible matching row that is within the
   supported index predicate/order contract.
3. **Deterministic key semantics.** Index key encoding, comparison, NULL
   handling, direction, and compound-key ordering are explicit and stable across
   replicas and topology transitions.
4. **Lifecycle fencing.** Building, catching-up, active, failed, rebuilding, and
   dropping states are explicit. The planner must not use an index until the
   durable lifecycle says that index is safe for reads.
5. **Restartability.** Index construction, backfill, catch-up, cutover, drop, and
   recovery resume from durable state after interruption rather than relying on
   process memory.
6. **Topology preservation.** Partition creation, split, merge, replica rebuild,
   snapshot install, and movement preserve or reconstruct all active local index
   state without silently downgrading query correctness.
7. **One logical definition.** Index metadata has one canonical cluster-visible
   definition. Physical per-partition realization may differ internally, but it
   must not become a second user-facing source of truth.
8. **Planner transparency.** A user can determine whether a table scan or local
   index access path was selected and why an otherwise plausible index was not
   usable.

## Required capability

### DDL and durable metadata

- Accept durable `CREATE INDEX` and `DROP INDEX` operations for supported local
  secondary indexes.
- Record logical index identity, base table, ordered key columns, ordering,
  lifecycle state, and any compatibility/version information required for
  recovery and upgrade.
- Reject unsupported index forms explicitly rather than accepting syntax that
  degrades to an unindexed table scan while pretending the index exists.

### Single-column and compound indexes

- Support one or more ordered base-table columns in one index definition.
- Define compound-key comparison and left-prefix usability canonically.
- A compound index such as `(account_id, created_at)` must support predicates
  that constrain the leading key and may additionally constrain later keys
  where the planner can form a sound bound.
- Equality plus range predicates on a compound prefix must have an explicit
  bound-generation contract.

### Mutation maintenance

- Maintain active indexes for `INSERT`, `UPDATE`, and `DELETE`.
- Updating an indexed key removes the old logical entry and installs the new
  entry atomically with the base-row mutation.
- Multi-statement and distributed transaction handling must preserve the
  transaction visibility and retry/idempotency semantics of the base table.
- Failure after prepare/decision/recovery must not create an independently
  committed index state.

### Online index construction

- Index creation over existing data must not require an unbounded cluster-wide
  write stop.
- Construction is a durable workflow with explicit backfill and cutover.
- If concurrent writes can race the backfill, use a defined catch-up or
  dual-write mechanism before activation.
- Restart resumes from durable progress.
- Failed construction is diagnosable and cannot become planner-visible as an
  active index.

### Query planning and execution

- The planner can enumerate applicable local indexes for supported predicates.
- It can form equality and range bounds for single and compound keys.
- It can choose between a table scan and an index access path using a simple,
  deterministic rule sufficient for 0.3 correctness and representative
  usefulness; a full cost-based optimizer is not required.
- Natural index ordering may satisfy `ORDER BY` when the requested ordering is
  compatible with the selected index and query bounds.
- Index execution still obeys partition selection and snapshot semantics; a
  local index does not by itself make the query globally routed.

### Topology, recovery, and storage lifecycle

- New table partitions realize every active logical local index before they can
  serve indexed reads.
- Split and merge workflows preserve index correctness across the cutover.
- Replica snapshot/install and rebuild paths include sufficient index state or
  deterministically reconstruct it before the replica serves indexed reads.
- Dropping an index remains restartable and cannot leave planner-visible orphan
  metadata.

### Diagnostics and evidence

- `EXPLAIN DISTRIBUTED` identifies the chosen local access path and index name
  when applicable.
- Diagnostics expose index lifecycle/build state and actionable failures.
- Acceptance includes correctness tests covering mutations, rollback/retry,
  snapshots, restart during build, split/merge, and replica recovery.
- Acceptance includes a representative selective non-partition-key workload in
  which an active index demonstrably avoids a full local table scan and improves
  the expected resource/latency shape.

## Explicitly outside Phase 0.3

The following are valuable but are not part of the 0.3 exit gate:

- global secondary indexes or a global index routing structure;
- global unique indexes or cluster-wide `UNIQUE` constraint enforcement;
- partial indexes;
- expression indexes;
- covering / `INCLUDE` indexes;
- index-only scans;
- sophisticated per-index histograms or a general cost-based optimizer;
- broad PostgreSQL index-method compatibility;
- arbitrary operator classes or extension-defined index semantics; and
- other global constraints merely because global uniqueness is planned later.

These exclusions are roadmap boundaries, not architectural prohibitions. The
0.3 representation and lifecycle should avoid choices that unnecessarily block
those follow-on milestones.

## Follow-on: Advanced Local Indexing

A later non-blocking milestone may add partial and expression indexes,
covering/`INCLUDE` indexes and index-only scans, richer index statistics and
selectivity estimation, cost-aware selection among multiple indexes, online
`REINDEX`/repair, index-usage diagnostics, and additional PostgreSQL-compatible
index metadata/DDL.

This work reuses the partition-local ownership and lifecycle introduced here and
should not require a new globally distributed data structure.

## Follow-on: Global Indexes and Global Constraints

Global indexing requires a separate distributed contract. A global secondary
index has independently partitioned and replicated state and can route a query
to relevant base-table locations without first contacting every table partition.
The future milestone must therefore define, at minimum:

- global-index partitioning, ownership, placement, and routing;
- atomic base-row/global-index maintenance through distributed transactions;
- snapshot and failure semantics for index reads;
- topology changes, repair, rebuild, and online creation;
- routing/planner integration and bounded fan-out behavior; and
- globally unique indexes / `UNIQUE` constraints with deterministic
  cross-partition conflict detection and validation of existing data.

Global uniqueness is treated as a constraint built on distributed index/authority
machinery, not as a syntactic extension of the 0.3 local index implementation.

## Exit statement

Phase 0.3 is complete when Lagrange can create, maintain, recover, plan, and
execute useful single-column and compound partition-local secondary indexes
through representative failures and topology transitions, and the evidence
shows that a selective non-partition-key query uses the index rather than a full
local scan.
