# Tasks — Release 0.3 Queryable Core

Executable planning for `solve/epics/release-0-3-queryable-core.md`.

## Dependency graph

```text
A1 ordering -> A2 boundary -> A3 declared PK -> A4 compound PK
            \-> A5 local DDL -> A6 compound planner -> C1 global GSI -> C2..C5
B1 locking policy -> B2 AST -> [rs-raft close] -> B3/B4/B5
A4 + roadmap authority -> D1 live dependencies -> [rs-raft close] -> D2..D6 live query plane
all axes -> E1 acceptance matrix -> E2 exact-head candidate
```

A1-A6 isolate query/index semantics from Raft consensus and develop on branches until zero-Liferaft closeout merges.

---

## Stage A — query access foundation

### A1 — `partition-key-ordering-owner-completion-v12` — ACTIVE

- `RM-0.3-qs-typed-key-ordering`. Sole routing comparator via `compareRoutingKeys` using SQLite BINARY order; merge-adjacency delegates to it; preserves numeric-vs-text comparison and typed refusal.

### A2 — planned `partition-key-boundary-representation`

- `RM-0.3-qs-typed-key-ordering`. Prep: [preimplementation-research.md#1-keys-and-row-identity](preimplementation-research.md#1-keys-and-row-identity) and [a2 reconnaissance](../../epics/release-0-3-queryable-core/a2-boundary-representation-reconnaissance-2026-10-07.md). Canonical representation for boundaries/tuples: declared types, safe integers, fail-closed legacy migration.

### A3 — planned `declared-primary-key-resolution`

- `RM-0.3-qs-pk-partition-narrowing`. Prep: [preimplementation-research.md#1-keys-and-row-identity](preimplementation-research.md#1-keys-and-row-identity). Metadata owner answers PK columns via `tables.partition_key`; `PartitionResolver` and coordinator consume it instead of defaulting to `id`.

### A4 — planned `compound-primary-key-narrowing`

- `RM-0.3-qs-pk-partition-narrowing`. Prep: [preimplementation-research.md#1-keys-and-row-identity](preimplementation-research.md#1-keys-and-row-identity) and [preimplementation-research.md#5-predicate-and-access-path-semantics](preimplementation-research.md#5-predicate-and-access-path-semantics). Full compound equality narrows to target partitions; partial predicates scatter safely; contradictory AND predicates reject invalid hints.

### A5 — planned `local-index-ddl-owner-wiring`

- `RM-0.3-qs-local-index-ddl`. Prep: [preimplementation-research.md#4-local-index-ddl-and-activation](preimplementation-research.md#4-local-index-ddl-and-activation). Wire CREATE/DROP INDEX dispatch to `IndexService`; apply indexes to existing and split partitions; durable restart reconstruction.

### A6 — planned `compound-index-planner-contract`

- `RM-0.3-qs-compound-index-semantics`. Prep: [preimplementation-research.md#5-predicate-and-access-path-semantics](preimplementation-research.md#5-predicate-and-access-path-semantics). Strict prefix matching for compound indexes; reject non-leading column heuristics; `EXPLAIN DISTRIBUTED` reports selection or refusal.

---

## Stage B — PostgreSQL locking reads

Governed by `architecture/postgres-locking-reads.md`.

### B1 — planned `locking-read-wait-policy-seal` — DESIGN MAY START EARLY

- Prep: [preimplementation-research.md#2-read-visibility-and-locking](preimplementation-research.md#2-read-visibility-and-locking). Seal wait/conflict/deadlock policy, cancellation, and wakeup within `DistributedTransactionCoordinator` and participants; no session lock maps.

### B2 — planned `locking-read-canonical-ast` — SAFE SOURCE EDGE

- Preserve `SELECT ... FOR UPDATE` in SQL AST and SqlCore plan through PG wire without mutating participant state.

### B3 — planned `locking-read-participant-reservation` — AFTER RAFT CUTOVER

- Extend transaction participants with durable write-intent reservations; prevent conflicting reservations across partitions; survive restarts.

### B4 — planned `locking-read-release-timeout-recovery`

- Bounded lock release on commit, rollback, timeout, cancellation, and recovery; non-polling wakeup.

### B5 — planned `locking-read-public-pg-proof`

- End-to-end PG client proof with multi-partition conflict verification and controlled revert.

---

## Stage C — non-unique global secondary indexes

Prerequisites: A2, A5, A6, and completed rs-raft cutover.

### C1 — planned `global-index-maintenance-mode-seal` — DESIGN MAY START EARLY

- Prep: [global-index-maintenance-research.md](global-index-maintenance-research.md). Status: **R2 unsealed**. Decide synchronous 2PC vs asynchronous CDC maintenance under identical read-visibility contracts via bounded experiment.

### C2 — planned `global-index-dataset-lifecycle`

- Represent global indexes as system-managed partitioned datasets using existing Raft machinery; manage states durably.

### C3 — planned `global-index-resumable-backfill`

- Resumable backfill with durable progress markers; index remains unreadable until certified complete.

### C4 — planned `global-index-maintenance`

- Implement sealed C1 mode with idempotent retries, crash recovery, and observable progress.

### C5 — planned `global-index-routing-and-explain`

- Planner routes to index partitions, resolves base rows via PK narrowing, and falls back to base scatter on stale/unreadable index state.

---

## Stage D — generic push-backed live queries

### D0 — completed `generic-live-query-roadmap-authority` — FIRST

- `RM-0.3-qs-generic-live-queries` registered in `docs/development/agpl-feature-map.md`.

### D1 — planned `live-query-canonical-plan-dependencies`

- Prep: [preimplementation-research.md#3-live-query-identity-and-continuity](preimplementation-research.md#3-live-query-identity-and-continuity). Derive dependencies from canonical SqlCore plan; eliminate duplicated routing in `QueryGroup`/`LiveQueryService`.

### D2 — planned `live-query-selective-partition-cdc` — AFTER RAFT CUTOVER

- Prep: [preimplementation-research.md#3-live-query-identity-and-continuity](preimplementation-research.md#3-live-query-identity-and-continuity). Selective PartitionService CDC subscriptions through `MessageRouter`; replace cache-backed user-table change detection.

### D3 — planned `live-query-gap-free-snapshot-frontier`

- Prep: [preimplementation-research.md#3-live-query-identity-and-continuity](preimplementation-research.md#3-live-query-identity-and-continuity). Prove gap-free snapshot-to-CDC frontier handoff; prevent write loss during reconnect; deduplicate overlapping events.

### D4 — planned `live-query-result-maintenance`

- Apply row deltas for simple plans; trigger SQL re-execution/reset on complex plan changes; eliminate polling.

### D5 — planned `live-query-lifecycle-topology-recovery`

- Dynamic topology reconfiguration (split/merge/move/leader) via canonical topology owners without client resubscription.

### D6 — planned `live-query-core-api-antipolling`

- Public API proof: zero background polling reads followed by prompt unsolicited delivery of committed mutations.

---

## Stage E — release closure

### E1 — planned `release-0-3-acceptance-matrix`

- Prep: [preimplementation-research.md#6-the-027-handoff-and-release-journeys](preimplementation-research.md#6-the-027-handoff-and-release-journeys). Verification matrix binding 0.3 capabilities to roadmap rows, terminal Quests, public API tests, negatives, and exclusion proofs.

### E2 — planned `release-0-3-exact-head-candidate`

- Finalize `CHANGELOG.md` with dated 0.3.0 section; update version literals; verify publish gate, `release-publishability/0.3.0`, and `npm run release:preflight`.

---

## Future epic boundaries — defined, deliberately not opened yet

- `query-access-foundation-0-3`: Stages A1-A6.
- `locking-reads-0-3`: Stages B1-B5.
- `global-secondary-indexes-0-3`: Stages C1-C5.
- `generic-live-query-data-plane-0-3`: Stages D0-D6.

Open only if the single umbrella epic creates an operational ownership bottleneck.
