---
audience: development
documentClass: planning
---

# Global index maintenance research

Research date: 2026-10-28. Decision status: **R2 sealed (2026-10-30) — Mode A (synchronous non-unique TX1 maintenance in 0.3.2; global uniqueness deferred to 1.0)**.

Preserves the secondary index investigation for [0.3 epic](../../epics/release-0-3-queryable-core.md) and [C1 task](tasks.md#c1--planned-global-index-maintenance-mode-seal--design-may-start-early). The [requirements](../global-secondary-indexes/requirements.md#r2--maintenance-and-consistency-mode-sealed-2026-10-30) remain decision authority.

## Provisional recommendation and decision boundary

- **Recommendation:** Synchronous TX1-maintained, non-unique global secondary indexes as ordinary-SQL default for 0.3, conditional on proved read visibility and acceptable write cost.
- **Asynchronous alternative:** Candidate under identical read contracts; fits lag-tolerant projections or bulk ingest.
- **Boundary:** C1 decides one default; two production modes will not be implemented in 0.3. Local indexes and PK narrowing remain preferred where viable.

## Evidence baseline and impact on release effort

- Pinned to main `0489a519fe683e2f278ff3f6294bb0787b94cba1`. Consumes v0.2.6 foundations (raft-rs, TX1, FreshMG, SN1).
- Recognizes 0.2.7 stabilization proposal (`25c390cb52606b3e6afbee95c1f088d7b2be8302`).
- 0.3 risk concentrates in interactions (ordering with PKs, index maintenance with read visibility, locking with candidate discovery).

## Compare the same semantics

| Concern | Synchronous TX1 | Asynchronous CDC |
| --- | --- | --- |
| Base mutation | Enlists index partitions in transaction | Records durable maintenance obligation |
| Write cost | Extra participant rounds, 2PC latency | Low capture cost; deferred batched writes |
| Read cost | Preserves view across index scan and base fetch | Requires freshness proof or base fallback |
| Outage | Couples base write availability to index | Buffers debt until backlog policy triggers |
| Recovery | Uses TX1 participant recovery | Requires idempotent replay and offsets |
| Backfill | Write-only maintenance during backfill | Scan + stream handoff must cover mutations |
| Uniqueness | Foundation for future uniqueness | Cannot enforce synchronous uniqueness |

### Candidate completeness is the central read obligation

- Base row rechecks eliminate obsolete false positives, but cannot find matching rows omitted from index scans. Protocols must guarantee completeness or fall back to base-table scan.
- Locking reads rely on candidate completeness; lock ownership stays in transaction/participant owners (`architecture/postgres-locking-reads.md`).
- Read execution follows `docs/execution-semantics.md`.

## Synchronous maintenance: where it fits and where it can hurt

- Derived index writes execute within base transaction before participant set freezes, ensuring read-your-writes and transaction consistency.
- **Tradeoffs:** Autocommit writes become distributed; multirow mutations touch up to `1 + 2m` partitions (`m` indexes); hot index partitions create cross-transaction contention; index outage reduces base write availability.

### TX1 source findings and remaining index-integration questions

- **Decision & participants:** Enlist derived index destinations before set freezes; handle in-doubt replies.
- **Write execution:** Expand index mutations before autocommit bypass selection.
- **Session & requests:** Single nonterminal transaction per partition; returns `ALREADY_ACTIVE` on conflict. Mitigate hot-index contention.
- **Apply & reads:** Local SQLite atomic commit; does not create multi-participant snapshot. Reads execute locally; writes require leader. Define visibility across index scans and base fetches during apply.

## Asynchronous maintenance: useful decoupling, explicit obligations

- Decouples base writes by committing durable index obligations, applied asynchronously via CDC with batching and coalescing.
- **Obligations:** Guaranteed before/after capture; aggregated completeness frontiers across base partitions; bounded scan waits/fallback; admission backpressure when maintenance lags.

### CDC source census: reusable substrate, incomplete index proof

- **Policy & obligations:** System-table CDC enabled; user-table capture disabled. Needs internal user-table capture without full broadcasts and full old/new key delta extraction for multirow updates/deletes.
- **Ledger, admission & image:** Durable occurrences and delivery tracking; needs resumable progress and gap detection. Bounded debt admission exists; leader-local image with applied index P supports restartable backfill.

## Build, visibility and lifecycle work shared by both modes

- Both modes require durable index identity, versioning, non-readable building states, concurrent write handling during backfill, and safe drop.
- Partition movement, splits, and leader changes remain governed by existing lifecycle machinery.
- Live queries require compatible initial reads and gap-free event boundaries (`architecture/live-query-data-plane.md`).

## Workload and future fit

| Scenario | Fit | Notes |
| --- | --- | --- |
| Transactional OLTP | Favors sync | Clean read visibility and acceptable write cost |
| Locking reads & uniqueness | Favors sync | Complete candidate discovery; lock authority in base participants |
| Bulk ingest | Favors async | Bounded queue lag and backpressure |
| Live queries | Either mode | Shared initial snapshot and change stream boundary |
| Search / vector projections | Favors async | Explicit lag tolerance avoids altering core SQL semantics |
| Data-local WASM / OCI | Neutral | Candidate PKs route to data nodes; index nodes do not host compute |

- Global uniqueness deferred to 1.0; cost-based planning to 2.0 (`docs/development/agpl-feature-map.md`).

## Other research that sharpens the choice

- **YDB:** Distinct sync and async modes with explicit read contracts.
- **PNUTS / SLIK:** Per-record timelines and multi-version index registration before base row commits.
- **ScaleDB / CockroachDB / TiDB:** Range indexes, asynchronous intent cleanup, and transaction optimizations.

## Proposed bounded C1 decision experiment

1. State identical write-acknowledgment, freshness, isolation, locking, and fallback contracts for both modes.
2. Build vertical slice: non-unique compound index across distinct partitions.
3. Test mutation lifecycle: inserts, deletes, cross-partition key updates, multirow operations, staged transaction reads.
4. Inject failures: slow participants, leader loss, dropped responses, replica reads during prepare/apply.
5. For async: paused workers, replay, crash during acknowledgment, split during catch-up.
6. Evaluate concurrent backfill: ensure obsolete entries never resurrect or overwrite newer writes.
7. Benchmark latency (p50/p95/p99), participant fanout, lock contention, queue age, and fallback rates.
8. Record findings in C1 task to seal R2.

## 7. Recommended Seal Shape

C1 (`global-index-maintenance-mode-seal`) is now sealed (2026-10-30) and reconciled with `solve/specs/global-secondary-indexes/requirements.md`:

- **Adopted Mode**: **Mode A — Synchronous transactional maintenance in Release 0.3.2 for non-unique global secondary indexes (`CREATE GLOBAL INDEX`), with global uniqueness (`CREATE UNIQUE GLOBAL INDEX`) explicitly deferred to 1.0**.
- **TX1 Participant Enlistment**: Base-table `INSERT`, `UPDATE`, and `DELETE` synchronously derive index-entry mutations for all global indexes in `[WRITE_ONLY, BACKFILLING, READ_WRITE]` states and enlist affected index partitions as TX1 participants before the participant set freezes. Unavailability of an index partition fails the base transaction with a typed error.
- **Read Visibility & Completeness**: Planner and read router select an index only when `index_state === 'READ_WRITE'` and the query satisfies a leading equality/range prefix. Indexes in non-readable states (`CREATING`, `WRITE_ONLY`, `BACKFILLING`, `FAILED`, `DROPPING`) fall back deterministically to base-table scatter-gather without returning partial results. Stage-2 base-row lookups resolve current base-row partition ownership dynamically across splits/merges.
- **Measured Write Cost**: Write-path maintenance records participant fanout and latency overhead for 0, 1, and 2 active global indexes.
- **Explicit 1.0 Deferral**: `CREATE UNIQUE GLOBAL INDEX` is rejected at admission with `UNSUPPORTED_SQL_FEATURE` (`SQLSTATE 0A000`).

## Source references

- Pinned commit: `0489a519fe683e2f278ff3f6294bb0787b94cba1`.
- Authorities: `docs/steering/rules.md`, `architecture/postgres-locking-reads.md`, `architecture/live-query-data-plane.md`, and `docs/execution-semantics.md`.
