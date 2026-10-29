---
audience: development
documentClass: planning
---

# Verified preparation for 0.3 implementation

Verification date: 2026-10-29. Status: **source-verified preparation; design decisions and runtime witnesses remain open**.

Preserves 0.3 preparation areas for [release epic](../../epics/release-0-3-queryable-core.md) and [tasks.md](tasks.md). Complements [global-index maintenance research](global-index-maintenance-research.md). C1/R2 remains unsealed.

## Evidence baseline and limits

| Material | Pinned revision | Meaning |
| --- | --- | --- |
| Main | `71179adf82be304b3ad1530f62c108adb35fbd1b` | Implementation/architecture census |
| 0.3 planning | `eb48a2088d539c22c08844d01f2725acd76c4c5c` | Task owners and index research |
| 0.2.7 proposal | `25c390cb52606b3e6afbee95c1f088d7b2be8302` | Proposed stabilization handoff |

- Static source analysis; no runtime fault injection performed.
- Consumes raft-rs, TX1, FreshMG, and SN1 foundations as fixed inputs.

## Preparation priorities

| Priority | Owner | Output to review |
| --- | --- | --- |
| 1. Keys and row identity | A2-A4; Q02/Q03 | Admitted key-domain matrix and lifecycle trace |
| 2. Read visibility and locking | B1-B5; C1 | Visibility matrix and wait/recovery table |
| 3. Live-query continuity | D0-D6 | Identity/dependency matrix and frontier table |
| 4. Local-index DDL | A5 | Intent, materialization and capability lifecycle |
| 5. Predicate/access-path semantics | A4/A6 | Supported constraint matrix and fallback oracle |
| 6. Release integration | E1; 0.2.7 | Handoff map and four public-path journeys |

## 1. Keys and row identity

### Verified source findings

- **Durable representation:** Split medians selected via SQLite ordering; stored in JSON transition metadata and TEXT child boundary columns.
- **Falsey boundary gap:** `resolvePersistedSplitPlan()` uses `if (!splitKey)`, conflating `0` and `''` with absence.
- **Integer precision:** `safeIntegers(true)` used in system image reads, but median queries use default JS numbers. AST and parameterized split preserve numbers; literal reconstruction forces JS Number.
- **Schema typing:** SQLite affinity maps DECIMAL to REAL, and temporal types to TEXT.
- **PK resolution disconnect:** Planner omits `keyColumns`; resolver checks `primaryKey` then defaults to `id`. CREATE persists `partition_key`. Managed split explicitly refuses comma-separated composite keys.

### Decision preparation

- Formulate admitted key-domain matrix covering types, storage classes, safe integers, NULL, collation, and D1-D9 cases from [A2 reconnaissance](../../epics/release-0-3-queryable-core/a2-boundary-representation-reconnaissance-2026-10-07.md).
- Trace lifecycle of `PRIMARY KEY (account_no)` and compound keys across admission, DDL, routing, split, and restart.
- Minimum witness: verify exact large-integer boundary round-trip without precision loss, followed by non-`id` and compound key tables.

<a id="2-transaction-read-visibility-and-locking-reads"></a>
## 2. Read visibility and locking

### Verified source findings

- **Staging model:** Transactions stage operations in memory and evaluate them in short-lived SQLite transactions; no persistent SQLite transaction is held across requests (`architecture/postgres-locking-reads.md`).
- **Outcome vs visibility:** TX1 records durable decisions before participant fanout and recovers COMMIT forward; does not provide cross-partition snapshot visibility.
- **Cancellation gap:** PG protocol lacks CancelRequest support; disconnect triggers best-effort rollback.

### Decision preparation

- Specify four distinct contracts: statement freshness, distributed visibility, session staged reads, and locking read reservations.
- Evaluate wait policies: fail-fast (NOWAIT) vs bounded waiting vs distributed deadlock detection.
- Model complete lifecycle: acquire, conflict, candidate change, timeout, cancel, disconnect, and recovery.
- Smallest witness: multi-partition row contention, deadlock cycle resolution, cancellation on PG wire, and commit/rollback release.

## 3. Live-query identity and continuity

### Verified source findings and corrections

- **Policy:** Generic user-table CDC is disabled by default; current live queries use `SystemTableCache` adapter (`architecture/live-query-data-plane.md`).
- **Query grouping:** Grouping relies on table plus WHERE string; does not establish generic SQL result identity.
- **Scaffold helpers:** `buildSelectSQL()` and `resumeLiveQuery()` lack production callers.
- **CDC substrate:** Durable obligation ledger exists; seed hydration registers prior to leader-local image read. Volatile buffer drops are inactive on committed paths.

### Decision preparation

- Canonical SQL planner defines query identity, projection multiplicity, dependencies, and execution context.
- Planner supplies safe continuing dependencies, distinct from initial partition hits.
- Define lifecycle transitions (INITIALIZING, LIVE, RESYNCING, CLOSED) covering registration, overlap dedup, resume/reset, and topology changes.
- Smallest witness: anti-polling verification (zero idle reads followed by unsolicited update), reconnect with resume/reset, and concurrent write interleaving.

## 4. Local-index DDL and activation

### Verified source findings

- Parser admits CREATE/DROP INDEX, but SqlCore statement execution lacks dispatch handlers.
- `IndexService` method inputs mismatch control-plane gateway row shapes.
- SQLite automatically maintains local indexes with table mutations; global distributed maintenance is not required for local indexes.

### Decision preparation

- Model states: intent persisted, building, readable, retryable failure, and dropping.
- Define completion semantics: synchronous blocking vs observable durable job.
- Smallest witness: create index over existing rows, interrupt fanout, restart, apply index to new partition, and drop.

## 5. Predicate and access-path semantics

### Verified source findings

- `QueryOptimizer` scaffold extracts unstructured column names; not wired into production SELECT planner.
- `PartitionResolver` visits AND constraints using mutable accumulators; overwrites duplicate range bounds and ignores IN negation.

### Decision preparation

- Define shared A4/A6 contract: qualified column names, operators, values, Boolean structure, and order.
- Compound index `(a,b,c)` rules: exact prefix matching usable; trailing range usable; non-leading predicates (e.g. `b` alone) rejected.
- Smallest witness: compare routed execution against scatter oracle; verify `EXPLAIN DISTRIBUTED` output.

## 6. The 0.2.7 handoff and release journeys

Handoff status from 0.2.7 proposal:

| Package | Handoff | 0.3 boundary |
| --- | --- | --- |
| Q01 expressions | AST preservation | Access-path semantics in A4/A6 |
| Q02 constraints | Schema constraints | Declared PK routing; local vs global uniqueness |
| Q03 storage order | UTF-8 comparator | Boundary representation in A2 |
| Q10 retention | Reclamation/compaction | Live-query client retention |
| Q11 observation | Debt reporting | Metrics in index/live queries |
| Q14 contract | Replica reads | Visibility guarantees & retry identity |

Four E1 integration journeys:
1. **Declared-key lifecycle:** Admitted non-`id` and compound schemas across writes, routing, splits, and restart.
2. **Indexed query execution:** Index creation, key mutations, query planning, and fallback.
3. **Public locking transaction:** Multi-partition concurrency, timeouts, and cancellation over PG wire.
4. **Live query continuity:** Remote mutations, reconnect, snapshot-stream frontier, and anti-polling proof.

## Recommended next bounded preparation

1. Seal admitted key-domain/lifecycle matrix and read-visibility matrix first.
2. Formulate live identity/frontier state tables.
3. Verify A5 execution wiring and A6 compound constraint cases.
4. Re-census 0.2.7 post-merge state before opening implementation Quests.

## Pinned source and primary references

- Inspected revision: `71179adf82be304b3ad1530f62c108adb35fbd1b`.
- Authorities: `docs/steering/rules.md`, `architecture/postgres-locking-reads.md`, and `architecture/live-query-data-plane.md`.
