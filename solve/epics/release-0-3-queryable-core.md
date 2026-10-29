---
id: release-0-3-queryable-core
status: open
proof: certification
roadmapRow: null
doneWhen:
  probe: oracle
  args:
    file: solve/oracle/release-0-3-queryable-core.json
quests:
  - partition-key-ordering-owner-completion-v12
authorizes:
  - architecture
  - docs/development/agpl-feature-map.md
  - scripts/checks
  - scripts/quest-evidence
  - solve/epics/release-0-3-queryable-core.md
  - solve/oracle/release-0-3-queryable-core.json
  - solve/specs/release-0-3-queryable-core
  - src/bootstrap
  - src/index-management
  - src/live-query
  - src/partition
  - src/query
  - src/runtime
  - src/entrypoint-runtime-admin-composition.js
  - test/index-management
  - test/integration
  - test/live-query
  - test/partition
  - test/query
  - test/shards
---

# Release 0.3 — Queryable Core

## Intent

- Reach partitioned data via ordinary SQL: typed key ordering, declared/compound PK narrowing, locking reads, local indexes, compound planner semantics, non-unique GSIs, and live queries (`RM-0.3-qs-live-query-data-plane` in `docs/development/agpl-feature-map.md`).
- Single open 0.3 epic; locking reads, GSIs, and live queries remain staged sections.

## Post-0.2.8 handoff census - 2026-10-29

- **D0:** `RM-0.3-qs-live-query-data-plane` in `docs/development/agpl-feature-map.md`.
- **Q01-Q03 on `main` (`c32680a12`):** UTF-8 comparator, composite PK/UNIQUE/CHECK schema preservation, cross-partition checks.
- **Residual Stage A (`add04d91a`):** A1 comparator delegation; A2 boundary schema & safe integers; A3/A4 PK resolution; A5/A6 index DDL & optimizer.

## Verified implementation preparation - 2026-10-29

- See [Verified preparation for 0.3 implementation](../specs/release-0-3-queryable-core/preimplementation-research.md), pinned to `71179adf82be304b3ad1530f62c108adb35fbd1b`. C1/R2 unsealed.

## Index-maintenance research - 2026-10-28

- See [Global index maintenance research](../specs/release-0-3-queryable-core/global-index-maintenance-research.md) (linked from [C1 task](../specs/release-0-3-queryable-core/tasks.md#c1--planned-global-index-maintenance-mode-seal--design-may-start-early)). Status: **R2 unsealed**. Provisional lean: sync TX1-maintained GSI.

## Verified starting point — 2026-10-02

- Baseline: main `edf20e39b0014d5d2a63a2ecea990712f0349153`.

### Consensus integration fence

- PR #73 (`finalize/zero-liferaft-2026-10-02`): safe 0.3 work develops on branches until rs-raft cutover merges.

### The old access-path epic is provenance, not authority

- `solve/epics/query-access-path-ladder.md` superseded; retains solved `numeric-key-routing` baseline.

### Current typed-ordering gaps

- `RM-0.3-qs-typed-key-ordering`: SQLite BINARY vs localeCompare, merge adjacency, large integers.

### Current PK narrowing gaps

- Resolver ignores `tables.partition_key` and defaults to `id`.

### Current local-index and planner gaps

- Unwired `IndexService`; `QueryOptimizer.checkIndexMatch()` permits non-leading column fallback.

### Generic live-query planning alignment

- `RM-0.3-qs-live-query-data-plane` in `docs/development/agpl-feature-map.md`.

## Release axes

1. Typed partition-key/tuple ordering.
2. Declared and compound PK narrowing.
3. Distributed locking reads.
4. Local ordered index DDL and lifecycle.
5. Ordered/compound index planner semantics.
6. Non-unique global secondary indexes.
7. Generic push-backed live queries.
8. Exact-head 0.3 candidate/release exit.

## Integration rules

1. **Consensus boundary:** Avoid Raft runtime/transport.
2. **Single ordering owner:** Narrowing and indexes consume one ordering owner.
3. **Representation vs comparison:** A1 resolves comparison; A2 resolves persisted representation.
4. **Indexes as access paths:** Missing index affects latency, not correctness; no uniqueness in 0.3.
5. **Transaction lock ownership:** Coordinator owns locks; PG wire transports `FOR UPDATE`.
6. **Reuse SQL & CDC:** Live queries reuse standard SQL and CDC; no polling.
7. **Versioning last:** Version bumps occur only on final release candidate under `RELEASE.md`.
8. **Adversarial verification:** Source Quests require red-on-revert or controlled negatives.

## Ordered work program

- Tasks in `solve/specs/release-0-3-queryable-core/tasks.md`. Active: `partition-key-ordering-owner-completion-v12`.
- Stages: Stage A (Access: A1-A6) -> Stage B (Locking: B1-B5) -> Stage C (GSIs: C1-C5) -> Stage D (Live queries: D0-D6) -> Stage E (Release: E1-E2).

## Final release exit

- Eight axes proven; docs match capabilities; `[Unreleased]` cut to 0.3.0 in `CHANGELOG.md`; publish gate green.
