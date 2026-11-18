---
audience: evidence
recorded: 2026-11-18
---

# Coordinator SQLite merge: census, design and Quest proposal

Date: 2026-11-17. Status: **proposal, unsealed**. This is planning, not acceptance. No source was changed.

**Owner decision implemented here (2026-11-17, recommended option):** SQLite evaluates the merge. The coordinator runs the final projection, HAVING, ORDER BY and LIMIT through an in-memory SQLite over typed partial rows. This is the same engine the partitions use, the way Citus uses PostgreSQL. All JavaScript evaluators and comparators are deleted, and the transport preserves storage classes. This decision overrides the detached session's earlier "no coordinator SQLite connection" exclusion.

**Source read.** Read-only worktree `/mnt/data/peter/projects/lagrange-gcp-takeover-20261117`.
- The brief named HEAD `219c27bfe`. The worktree has since moved to `c7d8a10bf`, which is `219c27bfe` plus the merges of fix-c-query, fix-d-footprint and fix-e-locale.
- `git diff 219c27bfe c7d8a10bf -- src/query src/transport src/partition` touches only `src/query/query-executor-unknown-outcome.js`. Every file:line below is therefore valid at both heads.
- The budget owner was read at `claude/fix-g-budget-20261117` commit `9905a06e2` (worktree `/mnt/data/peter/projects/lagrange-fix-g-budget-20261117`).

**Evidence scripts.** All probes I added are in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/design/`:
- `probe-aggs.mjs`, `probe-render.mjs`, `probe-render2.mjs`, `probe-having.mjs`, `parse-probe.mjs`: these reuse the review's `../e2e.mjs` harness;
- `bsq-caps.cjs`: better-sqlite3 capabilities;
- `bsq-perf.cjs`: merge cost measurements.

All of them were run niced on the shared desktop.

**Labels.** CONFIRMED means executed or read directly. PLAUSIBLE means inferred and not executed.

---

## Revision 6: 2026-11-18 (gate check on revisions 4-5: WP3 and WP-D cleared; one numeric gap in 3f)

Probe: `design-vet/p10-rev5.cjs` (re-run; reproduces). My verification is `design/rev5/carry-normalized.cjs`, under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/`. Inline changes are marked "(rev 6)". **The 3f writer must not start before this revision.**

**1. 3f combine overflow: CONFIRMED and fixed by carry-normalizing at the partition.** Revision 5's combine `sum(hi)*4294967296 + sum(lo)` was safe only while the total row count stays well below 2^30.

`p10` §2b:
- **Case A:** one row of −(2^62−2^40), plus 1.5·2^30 rows of −1. The guard holds, but `sum(hi)*2^32` overflows into the REAL `-4611684920526373000`, where SQLite gives the INTEGER `-4611684920526372864`.
- **Case B:** two partitions of (2^31−1) rows of −1. The coordinator `sum(lo)` raises "integer overflow", where SQLite gives `-4294967294`.

**Fix.** Each partition splits its own low sum into a carry and a 32-bit remainder, both computed by SQLite. The shipped columns become `hi = sum(e >> 32)`, `lo_carry = sum(e & 4294967295) >> 32`, `lo_low = sum(e & 4294967295) & 4294967295`. The coordinator computes `SUM = (sum(hi) + sum(lo_carry)) * 4294967296 + sum(lo_low)`.

CONFIRMED (`carry-normalized.cjs`, partial-row fixtures):
- Case A gives `-4611684920526372864`, INTEGER, exact.
- Case B gives `-4294967294`, INTEGER, exact.
- The partition-side carry split of `(2^31−1)·(2^32−1)` re-composes exactly.

**Safety argument (corrected).** The revision-5 claim that "rounding gives only false negatives" was wrong: a REAL total can round down as well as up. Safety comes from the **factor-2 margin below 2^63**. Let T be the exact sum and S = Σ|e|. The REAL guard `total(absTotal) < 2^62` implies S < 2^62·(1+ε), far below 2^63, so every prefix of the sum is below 2^63 in any order, whichever way the REAL total rounded. On the coordinator:
- L = Σ lo_low lies in [0, P·(2^32−1)], which is < 2^62 for **P < 2^30 partitions**;
- so |(Σhi + Σlo_carry)·2^32| = |T − L| < 2^62(1+ε) + 2^62 < 2^63;
- so no coordinator expression overflows.

On the partition: |Σhi| ≤ n_p·2^31 and the lo sum ≤ n_p·(2^32−1), so nothing overflows for **n_p < 2^31 rows per group per partition**. Beyond either bound, the result is the typed `QUERY_MERGE_PARTIAL_OVERFLOW` (partition side) or a plan-time refusal of the guarded kind (≥ 2^30 partitions, a fan-out no deployment approaches). Never a wrong value.

Both cases are added to F14 as partial-row fixtures. The rounding observation: in `p10` §2c, a true S of exactly 2^62 computed as not < 2^62, so that guard failed. The margin covers the opposite rounding.

**2. The two-phase plan is a defined plan kind.** `GUARDED_PARTIAL` is a row in the §2.2 decision table:
- It is chosen only when one table reference, ≥2 partitions, every conjunct pushable, and no per-statement time hold, every SUM/AVG/TOTAL is non-DISTINCT over a deterministic argument, and **everything else in the statement is on the order-independence allowlist**.
- Its outcome is the **named plan outcome** `GUARD_HELD` / `GUARD_FAILED`, computed by the coordinator SQLite.
- `GUARD_FAILED` selects the defined transition to COORDINATOR_EVALUATED. Three conditions hold:
  - (i) phase 2 is **never** triggered by a phase-1 error or unavailability. A partition failure, a budget refusal or `QUERY_MERGE_PARTIAL_OVERFLOW` is the statement's typed outcome, as for any plan.
  - (ii) Phase-1 results are **fully discarded**; the answer is phase 2's read alone.
  - (iii) Only the guard's named outcome selects phase 2.

**3. The `'localtime'` and `'utc'` modifiers.** They depend on each node's timezone even with literal arguments. **No deployment guarantees UTC**: no `TZ` is set in the Dockerfile, the charts or `src` (CONFIRMED by search), and embedded deployments use the host's timezone. Any date/time call with a `'localtime'` or `'utc'` modifier, or with a non-literal modifier argument, is therefore per-statement time: coordinator-only, so the statement sees one timezone, the coordinator's (§2.2).

**4. The optional residual, adopted.** For order-dependent plans, the coordinator tables are declared with the **full column set** of the base table: the same column-only DDL as the oracle's canonical reference. Only referenced columns are shipped; the others are NULL. SQLite's cost model then sees the same declared row width on both sides. `p10` §1 found no plan change for widths +0 to +64, so this is PLAUSIBLE-only hardening at negligible cost.

---

## Revision 5: 2026-11-18 (owner decisions)

The owner made four decisions; each is folded in below. Inline changes are marked "(rev 5)". The probe is `design/rev5/guarded-partial.cjs` under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/`.

**1. The guarded exact integer partial is built into this Quest, as WP3 sub-package 3f.** This was follow-up F-SUM; it is no longer a follow-up.

*Partition partial*, computed by SQLite per group, for each non-DISTINCT `SUM(e)`, `AVG(e)` or `TOTAL(e)` whose argument `e` is deterministic:

```sql
COUNT(e)                                              AS c        -- non-NULL inputs
coalesce(max(typeof(e) NOT IN ('integer','null')), 0) AS nonint   -- class check, by SQLite
total(abs(CAST(e AS REAL)))                           AS absTotal -- Σ|e| as REAL
sum(e >> 32)                                          AS hi       -- high 32 bits (arithmetic shift)
sum(e & 4294967295)                                   AS lo       -- low 32 bits, in [0, 2^32)
-- (rev 6: superseded) ship sum(e & 4294967295) >> 32 AS lo_carry and sum(e & 4294967295) & 4294967295 AS lo_low instead of lo
```

Why not ship `SUM(e)` and `TOTAL(abs(e))` directly:
- **No partition statement can raise.** `SUM(e)` raises "integer overflow" *inside the partition* when that partition's own values overflow; so does `abs()` of int64 MIN. Either error would kill the plan before the guard is known. CONFIRMED: `abs(-9223372036854775808)` → "integer overflow"; `abs(CAST(… AS REAL))` is fine.
- **The hi/lo split is exact.** `(e >> 32) * 2^32 + (e & 4294967295) = e` for every int64, including MIN, MAX, −1 and −2^32−1 (CONFIRMED in SQLite). `sum(hi)` and `sum(lo)` cannot overflow for fewer than 2^31 rows in one group of one partition. Beyond that the partial may raise; the result is then the typed `QUERY_MERGE_PARTIAL_OVERFLOW`, never a wrong value.

*Guard and combine*, both computed by the coordinator SQLite over the partials:
- **Guard:** `sum(nonint) = 0 AND total(absTotal) < 4611686018427387904.0`, i.e. every input is INTEGER class and Σ|e| < 2^62. Then every prefix of the sum stays below 2^62 in *any* scan order. So the integer sum is exact, never overflows and is order-independent, which is contract (a).
- **Values when the guard holds:**
  - `SUM` = `sum(hi) * 4294967296 + sum(lo)`. **Rev 6:** this overflowed for ~2^30 total rows; it is now `(sum(hi) + sum(lo_carry)) * 4294967296 + sum(lo_low)`;
  - `TOTAL` = `CAST(<that> AS REAL)`;
  - `AVG` = `CAST(<that> AS REAL) / sum(c)`, which is SQLite's own `(double)iSum / cnt`;
  - with `sum(c) = 0`: `SUM` and `AVG` are NULL and `TOTAL` is 0.0.

  The intermediate `sum(hi) * 2^32` stays below 2^63, because |Σlo| ≤ n·2^32 is negligible next to the 2^62 margin. **Rev 6: false for n near 2^30 (`p10` §2b); see the Revision 6 safety argument.**
- **When the guard fails** for any group (any non-INTEGER input, or a large Σ|e|): the **whole statement is re-executed as COORDINATOR_EVALUATED** over raw key-ordered fragments. That path is exact under contract (c). The phase-1 partials are discarded, so the answer is phase 2's read alone. JS only reads the guard's named outcome (`GUARD_HELD` / `GUARD_FAILED`); SQLite decides it.
- **The REAL bound is conservative.** At the boundary, 2^61 + (2^61−1) rounds to 2^62, so the guard fails and the statement goes to phase 2 (CONFIRMED). Rounding gives only false negatives, which cost performance, never false positives. The 2^62 bound leaves a factor-2 margin below 2^63. **Rev 6 correction:** rounding can go either way; safety rests on the factor-2 margin, not on rounding direction.

Probe results (`guarded-partial.cjs`):
- small integers: guard holds; SUM 2 and AVG 0.5 equal single-database SQLite;
- `[MAX | MAX]`, `[MIN | MAX, MAX]`, `[MAX | 1, −1]`, the 2^62 edge, `1 | 1.5` and TEXT `'7'`: the guard fails (raw-row phase), and **no partial raises**;
- all-NULL and empty inputs: the guard holds, with NULL results.

*Scope:*
- The DISTINCT forms stay COORDINATOR_EVALUATED.
- A per-row non-deterministic argument (`random()`) stays COORDINATOR_EVALUATED, because the five partial expressions must see one value per row.
- REAL or mixed-class SUM/AVG/TOTAL always fail the guard. Over budget, they remain the **recorded residual regression**, now narrowed to those inputs and to the other order-dependent plans.

*Proof:* oracle family **F14** and receipt `guarded-exact-integer-partial` (§4).

**2. D15 is decided.** The facade adopts the one input typing, D3:
- booleans → INTEGER 1/0, as SQLite's TRUE/FALSE are;
- BigInt and fractional numbers are admitted;
- `-0` is no longer normalized.

WP3 updates `architecture/application-database-sessions.md:160-170` and the CHANGELOG.

**3. The merge does not depend on formation state.** The formation latch refuses writes and DDL before formation (57P03) but allows reads, and no coordinator-merge step reads or waits on the latch:
- the merge session is a private per-query in-memory database: no cluster write, no DDL on any partition;
- the catalog schema it renders is read through the ordinary read path, which the latch allows;
- the merge child pool spawns lazily, not at formation;
- engine identity is local.

WP-D's format-epoch fence *is* a control-plane write. Before formation it is refused like any write, and it is a deferred typed state until formation completes; reads are unaffected. Witness: in F10, a multi-partition read under a held formation latch succeeds through every plan kind.

**4. Boundary with the row-level participant concurrency Quest** (designed separately):
- This Quest does not change participant transaction semantics, locking reads (`SELECT … FOR UPDATE` reservations), participant staging rules or commit protocol.
- Transaction reads enlist partitions exactly as today and then merge like any read.
- The one shared artifact is WP-D's v2 `operations_text` (TypedParams embedded per operation). It is owned by WP-D, and the concurrency Quest must consume that format, not define its own.
- Both may touch `src/partition/partition-participant-transaction-*.js`, so those files are serialized under one writer at a time (`solver-quests.md`: one writer per changing interaction). The integration owner records the order.

---

## Revision 4: 2026-11-17 (gate check on revision 3, and the WP1 hop census)

Gate status set by the lead:
- WP2 may start once gate fixes G1 and G6 below are in. They are now.
- WP3 and WP-D stay blocked until gaps A-C and G5 are folded in. They are now folded in, for the lead to re-check.

Inputs:
- Probe `design-vet/p9-join-order.cjs`, which I re-ran and which reproduced.
- The WP1 census `sqlmerge-wp1-hop-census.md` (codec commit `8b563ff5b` on `claude/sqlmerge-wp1-20261117`).

Inline changes are marked "(rev 4)". Where revision 3 text conflicted, it is superseded in place.

**Gate fixes**

| # | Item | Verdict and evidence | Change (where) |
| --- | --- | --- | --- |
| G1 | Time functions read the clock more widely than revision 3 said | **Accepted.** `date()`, `time()`, `datetime()`, `julianday()`, `unixepoch()`, `strftime(fmt)` and `timediff()` with no time-value argument, or with a time value that is a parameter or a non-literal expression, can read the clock (`'now'` may arrive as a parameter) | §2.2: **any** date/time function call is per-statement time unless *every* time-value argument is a string or numeric literal other than `'now'` (case-insensitive). `CURRENT_DATE/TIME/TIMESTAMP` are always per-statement time |
| G2 | Gap A: join order changes when pushed conjuncts are removed | **Accepted, CONFIRMED.** `p9`: the reference plans `SCAN t … AUTOMATIC COVERING INDEX on u(v)` and gives `1:1,1:3,3:2,4:1,4:3`. The coordinator *without* the pushed conjunct plans `SCAN u …` and gives `1:1,4:1,3:2,1:3,4:3`. The coordinator *keeping* the conjunct reproduces the reference plan and order | §2.2: for **order-dependent** plans, the coordinator statement is the **original text apart from table renaming**. Deterministic pushed conjuncts are re-applied, which is harmless; per-row `random()`/`randomblob()` conjuncts are **not pushed** in those plans. Contract (c) for joins: *SQLite's evaluation of the original statement text over index-free tables in canonical order*. Order-independent plans keep "pushed conjuncts removed", which only avoids a double `random()` |
| G3 | Gap B: state the order-*independent* allowlist positively | **Accepted** | §2.2 "Order-independence allowlist". Everything not on it is order-dependent by default. Explicitly order-dependent: window functions; `group_concat`, `string_agg`, `json_group_array`, `json_group_object`; SUM/AVG/TOTAL; scalar subqueries without an aggregate; subqueries, derived tables, CTE bodies or compound arms that use LIMIT/OFFSET or first-row semantics without a total ORDER BY; unknown functions and aggregates |
| G4 | Gap C: GROUP BY keys, DISTINCT and compound representatives | **Accepted.** A BINARY key on a BLOB or untyped column ties 1 with 1.0 (equal under comparison, different storage class), so the representative's class depends on scan order | §2.2/§2.3: GROUP BY keys, DISTINCT output columns and UNION/INTERSECT/EXCEPT output columns use the **same allowlist** as MIN/MAX: a bare column declared INTEGER, REAL or TEXT with BINARY collation. On the allowlist, tied values are byte-identical, so the result is contract (a). Otherwise representatives are order-dependent, contract (c). UNION ALL is a multiset and order-independent unless an arm uses LIMIT without a total ORDER BY |
| G5 | Item 3 (WP-D) refinements | **Accepted** | §2.6 WP-D rewritten (the stale revision-2 bullets are removed):<ul><li>a **live** capability check at the replication/vote handshake, because a voter restarted on an old binary still carries its committed "v2-capable" record;</li><li>the next-release deletion gate also requires a witness that no `format_version = 1` record remains in any position-free store;</li><li>old-format requests are recognised by an **explicit request format field**, never by params shape, and refused with a typed retryable error;</li><li>v2 rides on **new command types**, following the `PARTICIPANT_GENERATION_ORIGIN` precedent;</li><li>the real v1 retirement is specified (C6).</li></ul> |
| G6 | Item 6, I1a coverage (gate for WP2) | **Accepted** | §5.1: I1a now also refuses COLLATE in **GROUP BY terms** of multi-partition statements, which reach the JS combiner's `JSON.stringify` grouping, and in **aggregate arguments** (`MIN(x COLLATE NOCASE)`, `COUNT(DISTINCT x COLLATE NOCASE)`). The refusal site `distributed-select-fanout-plan.js` (the plan builder) joins WP2's write set. The WP2 pruning rule covers `=`, ranges, **IN** and **BETWEEN**, and COLLATE on **either** side, including `k COLLATE NOCASE = ?` |
| G7 | Partition LIMIT rendered as SQL (not blocking) | **Accepted, adopted** | §2.2: the partition LIMIT is the SQL expression `CASE WHEN (?n) < 0 THEN -1 ELSE min((?n) + max((?off), 0), 9223372036854775807) END`, bound with the original LIMIT and OFFSET values, so the partition applies MustBeInt and JS-number REAL and PG-wire TEXT limits push down. The `min(…)` cap keeps `n + off` from overflowing into a REAL that MustBeInt would reject. The coordinator always applies the original clause, so an invalid original fails there. This replaces revision 3's "INTEGER-class params only" (PLAUSIBLE; oracle family F12) |

**WP1 census conflicts**

| # | Conflict | Resolution (where) |
| --- | --- | --- |
| C1 | UTF-16 well-formedness | **Accepted into D3.** A string with an unpaired surrogate is refused with `SQL_VALUE_UNREPRESENTABLE` (`text_not_well_formed`). Today it silently reads back as U+FFFD (§2.6) |
| C2 | The facade's input typing contradicts D3 | **Partly resolved, needs an owner decision (new D15).** A public contract documents the facade's domain: `architecture/application-database-sessions.md:160-170` ("Strict public input contract": booleans accepted, BigInt rejected, `-0` normalized to 0; implementation `application-database-input.js:136-155`). Adopting D3 changes that public contract. Recommendation: one input typing; **D3 absorbs booleans as INTEGER 1/0**, as SQLite's own `TRUE`/`FALSE` are; the facade adopts D3's domain (admits BigInt and fractional numbers, keeps `-0`); WP3 updates the architecture section. Today a facade `true` becomes JS `1`, which binds **REAL 1.0** (N14), so even today's boolean mapping is not what the contract implies |
| C3 | Presentation has several exits | **Accepted** (§2.6). WP3 presents at **every** exit or reroutes the caller onto the engine API: `executeOnPartition(s)` consumers (migration, call-cell batch, CDC owner-RPC read, split routing, index DDL), the join-backfill raw QUERY (it must also *decode*), and the 11 partition-direct `executeQuery` readers. The migration backfill risk is explicit: a BigInt `row_id` makes `normalizeInteger` (`migration/migration-coordinator.js:148-152`) fall back to the old cursor, so the backfill never advances. WP3's receipt must cover it |
| C4 | 19 consumers plus the hub, not 13 | **Accepted** (§2.6, D3). The GSI post-processing has no production caller, so **WP3 deletes it** (§1.3 G updated) |
| C5 | Durable-hop list | **Accepted** (§2.6). The statement-outcome table holds no params or rows. The split mirror persists only a cursor and replays from the raft log. The transaction session is volatile; the durable form is `_participant_transactions.operations_text`. Added: position-free stores (pilot cutover `row_json`, GSI backfill cursor, split key) and message-group CDC commands |
| C6 | Snapshot plus compaction cannot retire v1 | **Accepted** (§2.6 "v1 retirement"). Derived rows survive in snapshot images, and compaction is leader-only and refuses control-plane partitions. Retirement is gated on a per-group witness: every replica's first retained index > F, no unsettled pre-F PREPARED or CDC rows, and no `format_version = 1` position-free rows. WP-D supplies follower and control-plane/message-group compaction or keeps those groups' witness incomplete |
| C7 | Two codec files | **Accepted** (`sql-value-codec.js` + `sql-value-codec-constants.js`, the literal-audit precedent) |
| C8 | Second error code | **Accepted**: `SQL_VALUE_UNREPRESENTABLE` (encoder-side D3 refusal, the caller's error) and `SQL_VALUE_CODEC_INVALID` (frame defect, the producer's error) |
| C9 | Per-row byte accounting | **Accepted for WP3.** The producer keeps refusing at the crossing row, so WP3 adds a per-row encode-and-measure entry point |
| (v2 types) | - | **Accepted.** v2 uses **new command types**, which fail apply closed on old binaries (`partition-service-entry-apply-base.js:93-110`, message groups `message-group-service-raft-timing.js:200-205`), with the fence modelled on `PARTICIPANT_GENERATION_ORIGIN` |
| (findings) | - | **Routed (R17), §6:** ±Infinity/NaN params write NULL on every replica; a Buffer param becomes `{type,data}` in the raft log; split-mirror live and replay forms differ; the GSI backfill cursor resumes an INTEGER as TEXT; the admin WebSocket drops results that cannot be stringified; the engine never returns `lastInsertRowid` |

Disagreements: none. One open owner question is new (D15, the facade's public input contract).

---

## Revision 3: 2026-11-17 (re-review of revision 2, APPROVE-WITH-CHANGES)

Revision 2's disagreements (a), the merge child-process pool, and (b), SUM/AVG/TOTAL routed to COORDINATOR_EVALUATED, were **accepted** by the re-review.

Gating set by the lead:
- WP0 and WP1 start now;
- WP2 waits for items 5 and 6;
- WP3 waits for items 1 and 2;
- WP-D waits for item 3.

All four gates are closed below.

Probes are in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/design-vet/`: `p6-child-pool.cjs`, `p7-rev2-rules.cjs`, `p8-max-tie-index.cjs`. I re-ran `p6`, `p8`, and `p7` without its C3 section (as `design/vetcheck/p7-light.cjs`); every cited result reproduced. Inline changes are marked "(rev 3)".

| # | Item | Verdict and evidence | Change (where) |
| --- | --- | --- | --- |
| 1 | Coordinator-kept conjuncts | **Accepted, CONFIRMED.** `p7` C4: single database [1,3], distributed [1,7] when a conjunct kept off the partitions runs after the partition LIMIT. FRAGMENT_MERGE runs no WHERE on the coordinator, and PARTIAL_AGGREGATE partials are computed without the kept conjunct | §2.2: FRAGMENT_MERGE and PARTIAL_AGGREGATE require **every** WHERE conjunct to be pushed; otherwise the statement is COORDINATOR_EVALUATED. A partition LIMIT requires the **whole** WHERE pushed. Two classes (this supersedes revision 2's "never push non-deterministic"): per-row non-determinism (`random()`, `randomblob()`) is pushable once on a single table; per-statement time (`'now'`, `CURRENT_TIME/DATE/TIMESTAMP`) stays on the coordinator, so the statement is COORDINATOR_EVALUATED with one statement and one `now` |
| 2 | The canonical layout is a new reference | **Accepted, CONFIRMED.** `p7` C1: with an index on `c`, `SUM(x) WHERE c>0` over (MAX, 1, −1) returns MAX in one database; the canonical layout overflows; one database without the index also overflows. `p8`: MAX over 1 \| 1.0 is `real` via a covering index and `integer` without it or in canonical layout | Contract reworded (below). Order-dependent plans pin fragment order with `ORDER BY <partition key>`, evaluated by SQLite, and ingest at canonical positions. PARTIAL_AGGREGATE excludes order-dependent aggregates. The oracle schema gains secondary indexes and non-IPK-keyed tables. The order-dependent reference is built without indexes, with rowid = canonical position computed by the oracle from logical key order (§2.2, §2.3, §4.1). The partition ordinal is well-defined: only range partitioning exists, and a table without a PK never splits |
| 3 | WP-D is a versioned dual decoder | **Accepted** | §2.6 rewritten. Propose-time capability gate. Old builds are barred from membership and leadership after the fence F, so the apply-time refusal becomes an unreachable invariant check. Forced snapshot and compaction at F. The v1 branch is deleted in the next release, gated on a durable witness that every replica's first retained index is above F. Per-record versions or a one-time migration for stores without a log position. Pre-F entries replay with v1 rules by position. Post-F old-format requests and split-mirror resends are re-encoded through the D3 input-typing function, or refused with a typed retryable error |
| 4 | Child-pool details | **Accepted, CONFIRMED.** `p6`: spawn-to-ready 21.7 ms; idle child RSS 52.1 MiB; `send()` of 100k parsed rows blocks 12.7 ms, 500k blocks 62.6 ms. A pre-serialized string blocks just as long (10.4 / 61.6 ms), so pass-through does not help. SIGKILL during a running statement exits in 9.6 ms | §2.8: chunked forwarding (≤10k rows per `send`); parent-side RSS sampling (Linux `/proc`; a soft, documented limit elsewhere, including the Windows lab host); `oom_score_adj` on Linux children; spill directory pinned via `SQLITE_TMPDIR`; SEA child entry through the service command router; sizing formula; the stale "parent does not decode" text fixed |
| 5 | D13 breaks `normalizePartitionBoundaryKeyType` | **Accepted, CONFIRMED.** `p7` C5: the map returns `null` for `DECIMAL(10,2)`, DATE, TIMESTAMP, BOOLEAN, `VARCHAR(20)` and `UNSIGNED BIG INT`, and maps NUMERIC to REAL although a NUMERIC key column stores integer, real and text values | **D13 is deferred out of this Quest; WP2 is unblocked.** `normalizeDataType`'s mapping is recorded as the Lagrange DDL contract and asserted by F11. Follow-up quest for the partitioning owner: declared-type fidelity, with key types derived from SQLite affinity (refuse NONE/NUMERIC-affinity keys or define a mixed-class key order) |
| 6 | Interim refusals incomplete | **Accepted** | §5.1. I1 extended: JS hash-join ON (bound WP3); write-key expressions (bound WP4); live-query predicates and the renderer fallback (bound WP7). Key pruning: WP2 itself implements "an explicit COLLATE in a key predicate disables pruning", a planner rule that needs no refusal. I4 now covers any statement that enters a durable hop, including every transaction-session statement |
| 7 | Capability regression | **Accepted, recorded** | §6 risks and D5: multi-partition SUM/AVG/TOTAL whose fragments exceed `MERGE_INPUT_MAX_ROWS` or `MEMORY_LIMIT_BYTES` becomes a typed refusal, where the candidate returned a value (sometimes a wrong one). Follow-up **F-SUM**: a guarded exact integer partial. The lead is asking the owner to accept the regression |
| 8 | Connection-state functions | **Accepted** | §2.2 and D11: coordinator paths (FROM-less SELECT, COORDINATOR_EVALUATED statements, merge SQL) refuse `changes()`, `last_insert_rowid()` and `total_changes()` through a coordinator-path rule at the statement-admission owner. Today they are refused only on writes |
| 9 | `LIMIT ?` reimplements MustBeInt in JS | **Accepted** | §2.2: a partition LIMIT is pushed only when LIMIT and OFFSET are integer literals or INTEGER-class typed params. Otherwise there is no partition LIMIT, and the coordinator SQLite applies the original clause with its own MustBeInt |
| 10 | Stale text | **Fixed** | §0 item 7, risks table, §2.8 (about 3 × the budget per session) |

**Result contract (rev 3; replaces the revision 2 "canonical layout contract").** A distributed result is a *valid SQLite result* for the statement over the union of the rows:
- **(a) Order-independent results** equal SQLite's exactly, including result column names.
- **(b) SQLite's own choices among tied rows** are all valid: ORDER BY ties, a LIMIT cut among ties, unordered output. The oracle checks the ORDER BY key tuples exactly and that every row is drawn from the input.
- **(c) Values that depend on scan order** must equal SQLite's under the **canonical scan order**. These are integer overflow, compensated REAL sums, MIN/MAX representatives across storage classes or collation ties, GROUP_CONCAT order, and bare columns. The canonical scan order is the base table's logical key order: the partition key under BINARY, which is (partition key-range ordinal, key order within the partition).

  **Rev 4 (G2), for joins and generally:** (c) means *SQLite's evaluation of the original statement text over index-free tables whose rows sit at their canonical positions*. The reference and the coordinator run the same text (table renaming aside) over the same index-free schema, so SQLite chooses the same plan, and hence the same order. That is why the coordinator must not edit the statement for order-dependent plans (`p9`).

  Rev 4 (G3, G4): "order-dependent" is now defined by the negative of a positive allowlist (§2.2). The representatives of GROUP BY keys, DISTINCT and compound output columns outside that allowlist fall under (c); on the allowlist they are byte-identical, so (a).

**Mechanism for (c):**
- Such plans are COORDINATOR_EVALUATED.
- Each fragment is `… ORDER BY <partition key>`, ordered by SQLite.
- Rows are ingested with rowid = canonical position.
- Coordinator tables have no indexes, so the coordinator scans in rowid order.
- (rev 6) For order-dependent plans the coordinator tables declare the base table's **full column set**, the same column-only DDL as the canonical reference. Unshipped columns are NULL, so SQLite's cost model sees the same declared row width as the reference (`p10` §1: no plan change observed up to +64 columns; PLAUSIBLE hardening).
- The oracle's (c) reference uses the same column-only tables without indexes, with rowid = canonical position computed by the oracle from the generated data's logical keys. It never reads layout from the system under test.
- For (a) and (b) the reference keeps the schema's secondary indexes.

The order-dependence classification is a structural planner rule over catalog facts (2.3), with a conservative default.

---

## Revision 2: 2026-11-17 (independent design review, APPROVE-WITH-CHANGES)

The direction is unchanged. The reviewer's probes are in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/design-vet/` (`p1`-`p5`).
- I re-ran `p1` without its 36 s section 2 (copied as `design/vetcheck/p1-light.cjs`), plus `p2`, `p3` and `p4`.
- I added two probes: `design/vetcheck/worker-terminate.cjs` and `design/vetcheck/heap-limit.cjs`.
- Each item below was folded into the section named. Superseded first-revision text is marked "(rev 2)" where it changed.

| # | Review item | Verdict and evidence | Change (where) |
| --- | --- | --- | --- |
| 1 | LIMIT pushdown under DISTINCT is unsound | **Accepted, CONFIRMED.** `p1` §5: `DISTINCT a+0 … ORDER BY a LIMIT 2` gives {1,3} instead of {1,2}, and `DISTINCT a … ORDER BY b` deduplicates (a,b). `p3`: the candidate is correct today, so revision 1 would have regressed it | New rule (§2.2): no partition LIMIT under DISTINCT unless the partition applies DISTINCT over exactly the select list and every ORDER BY term is a function of the select list |
| 2 | Finalized REAL partials lose SQLite's compensated summation | **Accepted, CONFIRMED.** `p1` §4: one database gives 1 in all four scan orders; the combine gives 0 | SUM/AVG/TOTAL leave the partial table in v1 and run COORDINATOR_EVALUATED over raw rows in the **canonical layout** (below), which reproduces SQLite's own accumulator. The 1e-12 tolerance is **dropped**; REAL aggregates are compared exactly (§2.3, D5) |
| 3 | Integer-overflow combine wrong both ways | **Accepted, CONFIRMED.** The candidate is also wrong today (`design/vetcheck/f13-candidate.mjs`: SUM [MAX\|MAX] returns 1.8e19 instead of an overflow error; SUM [MIN\|MAX,MAX] fails a participant; SUM [MAX\|1,−1] succeeds where SQLite errors). `p1` §3 (AVG [MAX\|MAX] raises on the coordinator; SUM [MIN\|MAX,MAX] partial overflows; SUM [MAX\|1,−1] errors in SQLite while the partials succeed) and §13 (a later REAL clears the flag). This matches SQLite's `sumStep`/`sumFinalize`: overflow happens "at any point during the computation", a REAL step resets `ovrfl`, and AVG never raises | Same resolution as #2 (§2.3) |
| 4 | Bounds (TEMP pages, sorter memory, uninterruptible work) | **Accepted, with one correction.** CONFIRMED `p1` §1: `temp.max_page_count` defaults to 4294967294 independently of `main`. CONFIRMED (new): the build is compiled `DEFAULT_MEMSTATUS=0`, so `PRAGMA hard_heap_limit` is **not enforced** (a 1 MB limit was ignored, `heap-limit.cjs`); it is also `OMIT_PROGRESS_CALLBACK`, and better-sqlite3 has no `interrupt()`. **Disagreement:** `worker.terminate()` does *not* interrupt a running statement. Terminate was called at +200 ms; the worker ran the statement to completion (1672 ms) and only then exited, while the main loop stayed responsive (167 ticks of 10 ms) (`worker-terminate.cjs`). A worker protects the event loop but bounds neither CPU nor occupancy | §2.8, D7: FRAGMENT_MERGE and PARTIAL_AGGREGATE run on the main thread with chunked ingestion. COORDINATOR_EVALUATED runs in a bounded pool of **merge child processes**, killed (SIGKILL) at the deadline or `CPU_TIME_LIMIT_MS`; this is the only hard bound this binding allows. Main tables, both page bounds, and the build-default `temp_store` FILE so sorter and ephemeral memory spill instead of growing |
| 5 | Transport strictness breaks existing traffic | **Accepted, CONFIRMED.** `p2`: `remoteQueryAnswer`'s undefined fields, `Date`, `toJSON` instances and `Error` are refused by `serializeJsonData`. Answers go through `sendRaw` → `JSON.stringify` (`message-router-inbound-dispatch.js:524`), not `encodeDeliveryMessage`; there is Buffer rehydration at `debug-metadata-service-value-helpers.js:62-71` | Transport-wide strictness is **removed from this Quest** and becomes a separate unit with its own payload census. The codec alone makes rows and params JSON-safe. The oracle's frame-fidelity claim is corrected (§2.6, §4.1) |
| 6 | Typed params do not survive durable hops | **Accepted, CONFIRMED.** `raft-rs-proposal-codec.js:33-45` uses plain `JSON.stringify` | New WP-D (§2.6, §5): command format v2 embeds TypedParams under a committed upgrade fence. A single positional decoder decodes v1 only below the fence index and refuses unversioned entries above it. Hop census: raft proposal, split mirror, transaction-session replay, statement-outcome table, CDC row images |
| 7 | Interim stages are not green | **Accepted** | §5 restructured. The new WP3 merges the old WP3 and WP4 and carries the read-contract switch atomically with the evaluator deletions. WP1 ships the codec with no production switch. WP2 adds a *typed refusal* of COLLATE in coordinator-evaluated positions, bounded by WP3, and a literal-class field that does not change the JS-visible `value` |
| 8 | In-flight memory of N × budget | **Accepted** | §2.8, D6: adaptive caps. Each partition's first request gets `floor(remaining/N)`. A partition that answers cap-reached is re-fetched alone with the remaining budget, and its first answer is discarded, so in-flight memory ≤ `MEMORY_LIMIT_BYTES`. Paged cursors are rejected for v1 because cross-page consistency would hold a read transaction |
| 9 | Negative LIMIT/OFFSET overfetch | **Accepted, CONFIRMED.** `p3`: `LIMIT -1` and `LIMIT -1 OFFSET 2` return `[]`; `p1` §6: a negative OFFSET under-fetches. Also `LIMIT ?` is a parse error (`p3`) | §2.2 soundness table and golden set |
| 10 | Arrival-order nondeterminism | **Accepted, CONFIRMED.** `p1` §7: `MIN` over 1.0 and 1 gives `real` or `integer` depending on arrival | Canonical layout and explicit rowids (§2.2, §2.8) |
| 11 | Column-naming contract | **Accepted, CONFIRMED.** `p3`: `"Sum( amount )"` vs `"SUM(amount)"`; `p1` §11: the rewrite gives `"SUM(a0_s)"` | Names come from SQLite itself: `columns()` of the admitted statement prepared against an empty mirror schema; layer A compares names (§2.2, §4.1) |
| 12 | Re-applied non-deterministic conjuncts, per-partition `now`, self-joins, admission bypass | **Accepted, CONFIRMED.** `p1` §12: 49,997 rows vs 24,875 | §2.2: each conjunct is applied exactly once; the existing determinism classifier gates pushdown; one temp table per table reference; the coordinator statement passes partition statement admission |
| 13 | Plan table not exclusive; rowid; temp DDL | **Accepted, CONFIRMED.** `p1` §10: temp rowids differ | §2.2, §2.7: PARTIAL_AGGREGATE excludes subqueries and windows; `rowid`/`_rowid_`/`oid` refused in multi-partition plans; coordinator DDL is a column-only projection (type and collation) |
| 14 | Census misses | **Accepted, CONFIRMED** at `live-query-group-helpers.js:199-204`, `live-query-manager.js:105-110`, `sql-query-loop-runtime-module.js:232-246`, `global-index-lifecycle-coordinator.js:186-212` (applied at `:779`) | §1.3 G |
| 15 | Reference schema built through the system under test | **Accepted** | §4.1: family F11 builds the reference from the user's declared DDL; grammar-parity meta-test; D13 |
| 16 | Invalid UTF-8, `-0`, input typing | **Accepted, CONFIRMED.** `p1` §8: invalid UTF-8 becomes U+FFFD at the partition read, before any codec. `p1` §9: `-0.0` survives in an untyped column but not in a REAL one | §2.6, D3 |
| 17 | "Co-resident" is vacuous | **Accepted:** each partition service holds one table, so every JOIN is COORDINATOR_EVALUATED; today it always takes the JS join path | §2.2, §6 Scenario A |
| 18 | Codec cost | **Accepted.** My re-run of `p4` on 100k rows × 4 columns: read 63 ms, encode+stringify 53 ms (4.3 MB frame), JSON.parse 32 ms, strict decode 28 ms, ingest 61 ms | §2.8 |
| 19 | COLLATE disables pruning and semi-join; envelope fields | **Accepted** | §2.2, §2.9 |

**Canonical layout contract** (new; resolves #2, #3 and #10 together). **(Rev 3: superseded by the "Result contract" in the Revision 3 section.** "Partition scan order" depends on the planner and the partition's history; `p7` C1 and `p8` show index-driven scans differ.) A distributed result equals SQLite's result over the union of the partitions' rows laid out in (partition key-range ordinal, partition scan order).
- The coordinator ingests with explicit rowids in that order.
- The oracle builds its reference database in the same order.
- For range-partitioned `INTEGER PRIMARY KEY` tables this is the global rowid order (PLAUSIBLE: key-range order coincides with rowid order).
- With this contract, scan-order-dependent results become exact by construction: SUM overflow, compensated REAL sums, MIN/MAX ties across storage classes, GROUP_CONCAT order, bare columns.

**Remaining disagreements, with evidence:**
- (a) "Terminable worker": `terminate()` cannot stop a running SQLite step (#4 above). Process kill is the hard bound.
- (b) The residual partial in `p5` fixes the example, but Kahan-Babuska-Neumaier summation is not associative, so a two-number partial is not provably equal to a single scan. I route these aggregates to COORDINATOR_EVALUATED instead. A residual partial can come later as a measured optimization with its own oracle family.
- (c) On #3, "decide the final overflow as SQLite would" requires a defined scan order, because SQLite's decision is order-dependent. I adopt the canonical layout. Exactness then comes from SQLite evaluating the raw rows in that order, not from a JS copy of `sumStep`.

**Decision changes:**
- D2: the amendment adds `src/raft`, `test/transport`, `src/cdc` (if WP7 stays) and `src/wasm-service`; transport strictness leaves.
- D3: input typing is decided, and presentation moves to the QueryExecutor result boundary after a consumer census.
- D5, D6, D7 and D11 are changed as described above.
- New: D12 (interrupt mechanism), D13 (declared types verbatim), D14 (durable-format unit).

---

## 0. Decisions in one page

1. **One evaluator.** Every SQL value decision is made by SQLite 3.49.2, the same better-sqlite3 11.10.0 binary the partitions run (CONFIRMED: `sqlite_version()` = 3.49.2 at runtime, and the source id equals `TRANSACTION_CLASSIFIER_VETTED_ENGINE`, `src/partition/partition-transaction-determinism-constants.js:78-82`). This covers scalar functions, comparison, ordering, grouping, DISTINCT, aggregate combination, HAVING, CASE, CAST, LIKE, joins, residual WHERE, LIMIT/OFFSET and write-key expressions. JavaScript keeps only structural planning, routing over canonical typed keys, the value codec and budget accounting.
2. **Four plan kinds in one decision table.** A planner-owned table chooses among:
   - `SINGLE_PARTITION`: no coordinator merge;
   - `FRAGMENT_MERGE`;
   - `PARTIAL_AGGREGATE`;
   - `COORDINATOR_EVALUATED`: fragments of every base table, with the original statement run on the coordinator SQLite.

   The coordinator-evaluated kind is a defined plan, not a fallback. It replaces today's `ORIGINAL_RAW_ROWS` path, which sends the original query to every partition and then concatenates the answers. That path is a silent-wrong fallback.

   Rev 2 changes to the plan kinds:
   - Each partition service holds one table, so every JOIN is COORDINATOR_EVALUATED.
   - SUM, AVG and TOTAL are COORDINATOR_EVALUATED in v1.
   - The kinds are mutually exclusive by explicit predicates (§2.2).
3. **Real tables, not virtual tables.** Partials go into tables declared with the exact column types and collations rendered by the **same DDL renderer owner the partitions use**. Affinity and collation therefore come from SQLite itself. (Rev 2: these are *main* tables in the per-query database, not `TEMP` ones, because `TEMP` is not covered by `max_page_count`. The DDL is a column-only projection with type and collation and no constraints. Rows are ingested in the canonical layout.) better-sqlite3 `table()` virtual-table columns are untyped and carry no collation (CONFIRMED, `bsq-caps.cjs`), so they cannot carry these semantics.
4. **One typed wire encoding.** A single codec module, `src/query/sql-value-codec.js`, defines a `TypedRowSet` and typed params:
   - each row carries a per-row storage-class tag string (`n i r t b`);
   - INTEGER is canonical decimal text (full int64);
   - REAL is canonical shortest-round-trip text;
   - TEXT is a JSON string;
   - BLOB is canonical base64.

   The partition producer encodes and the coordinator decodes, for both local and remote delivery. Partition reads use `safeIntegers(true)`. There is no second encoding and no lenient decoder. JSON frames stay; CBOR was rejected (decision D1). (Rev 2: transport-wide strictness is out of this Quest. Durable hops, such as raft proposals, get a versioned v2 command format under an upgrade fence, WP-D.)
5. **One schema authority.** The catalog schema JSON (`tables.schema`) gains `collation`, and partition and coordinator DDL come from the one renderer. The coordinator's second CREATE TABLE parser (`residual-predicate-evaluator.js:510-727`) and its per-query `sqlite_master` round trip are deleted. Partition-key columns are BINARY by contract.
6. **SQL front-end fidelity is a prerequisite.** Today the parser and renderer silently rewrite statements: decimal literals become TEXT literals and `COLLATE` is dropped (CONFIRMED). The partitions already run those rewritten statements. The coordinator SQLite must not inherit the defect, so stage 1 makes the round trip lossless or refuses with a typed error. A round-trip oracle proves it.
7. **Bounded, owned merge sessions.**
   - One `:memory:` database per query (measured open+close ≈ 9 µs), closed in `finally`.
   - `max_page_count` derived from the canonical `MEMORY_LIMIT_BYTES`; an over-limit merge raises a SQLite `SQLITE_FULL` refusal (CONFIRMED).
   - A new `MERGE_INPUT_MAX_ROWS` field in the one budget owner.
   - Each complete partition answer is ingested at its canonical positions, independent of arrival order (rev 3: the revision-1 text "as it arrives" is stale).
   - A node-level concurrency bound with backpressure.
   - A typed refusal, never truncation.

   Rev 2 changes to these bounds:
   - `max_page_count` *and* `temp.max_page_count` are both set.
   - `temp_store` stays at the build default FILE, because `hard_heap_limit` is not enforced in this build.
   - Ingestion follows the canonical layout, not arrival order.
   - Adaptive per-partition caps keep in-flight memory ≤ budget.
   - COORDINATOR_EVALUATED runs in a killable merge child-process pool, because no in-process interrupt exists.
8. **Engine identity.** Each partition answer carries the existing execution envelope (`partition-transaction-execution-envelope.js:42-58`). The coordinator refuses to merge across engines that differ from its own. It compares version, source id and compile-options digest only; `classifierListVersion` is the transaction classifier's list and is not compared (rev 2).
9. **Acceptance.** A differential oracle against single-database SQLite over a seeded fuzzed corpus, run through the real planner, partition read path, codec and transport frame functions. It is RED on the candidate (CONFIRMED divergences below) and must be green at the end.

---

## 1. Census: every place non-partition code evaluates SQL semantics in JavaScript

Classes:
- **(i)** replaced by the coordinator SQLite merge, then deleted;
- **(ii)** a legitimate non-SQL concern, kept with a stated soundness condition;
- **(iii)** must move to the partitions.

### 1.1 Why this is systemic, not local

**History pass** (`git log` on the evaluator files):
- In the last 48 hours: `5e20059d3`, `11bdbc115`, `41a7311b4`, `2d56f7887`, `29e611157`, `e65dcd3b6` and `0dd58de16`. These are affinity enforcement, DDL type-token parsing, HAVING affinity ordering, parameter literal rewriting and the scalar-function module. Each repaired one evaluator.
- `architecture/query-runtime.md:166-179` already concedes that "Coordinator JavaScript numbers do not preserve SQLite INTEGER/REAL storage-class metadata".
- The 2026-09-26 finding F-ORDER-BY-LOCALE-COLLATION was repaired in `compareOrderByClauseValues` (now `Buffer.compare`, `query-executor-select-aggregation.js:262`), but the `localeCompare` copy survives in `streaming-aggregator.js:48`.

This is the Vitess pattern described in section 3: a second evaluator drifts unless an unbounded compatibility programme holds it in place.

### 1.2 Additional divergences found during this census (all CONFIRMED by probe, beyond the review's 9)

Each item is a single-database SQLite result versus the distributed result, using the review harness (`e2e.mjs`: real `QueryExecutor` and real SQLite partitions, in process).

| # | Query | SQLite | Coordinator | Cause |
| --- | --- | --- | --- | --- |
| N1 | `SELECT GROUP_CONCAT(dept) FROM t` | `"a,b,a,a"` | `null` | No combine mode, so `ORIGINAL_RAW_ROWS` (`distributed-select-fanout-plan.js:715-731`); then `reduceNumericAggregate` returns null (`query-executor-select-aggregation.js:215-233`) |
| N2 | `SELECT TOTAL(amount) FROM t`, `SELECT typeof(SUM(id)) FROM t` | 1 row | **one row per partition** | TOTAL parses as `function_call`, so no aggregate is detected. An aggregate nested in a non-evaluable function goes to `ORIGINAL_RAW_ROWS`, and `aggregateSelectResults` only re-aggregates top-level aggregates (`:381-387`) |
| N3 | `ORDER BY 1 DESC LIMIT 2` | ids 5,4 | 5,2 | `applyOrderBy` keys on `clause.expression?.column` (`:713`), so positional terms are ignored |
| N4 | `ORDER BY amount * 2 DESC LIMIT 2` | 4,3 | 2,1 | The same key lookup ignores expression terms |
| N5 | `SELECT id, dept FROM t ORDER BY dept, id` on **one** partition | NULL first | NULL last | Even single-partition results are re-sorted (`query-executor-base.js:524-530` always merges). This affects the default one-partition deployment |
| N6 | `SELECT name FROM (SELECT dept AS name FROM t) ORDER BY name` | NULL first | NULL last | Derived table goes to `ORIGINAL_RAW_ROWS`, then a JS re-sort |
| N7 | `WHERE amount / 2.0 > 1.2` | 3 rows | **0 rows** | The parser keeps a decimal literal's text and the renderer quotes it, giving `((amount / '2.0') > '1.2')` (`sql-parser-expression-methods.js:114-115`, `query-executor-sql-command-rendering.js:206-214`). **Every partition, including the single-partition path, receives this SQL** |
| N8 | `WHERE dept = 'a' COLLATE NOCASE`; `ORDER BY dept COLLATE NOCASE` | 2 / NOCASE order | 1 / BINARY order | The parser wrapper drops `COLLATE` from expressions (`parse-probe.mjs`: no collate node in the AST), so partitions never see it |
| N9 | `CREATE TABLE t (name TEXT COLLATE NOCASE)` | NOCASE column | BINARY column | `formatDerivedColumn` stores no collation (`table-creation-service-schema-derivation.js:116-128`) and the partition DDL renderer emits none (`partition-service-table-bootstrap.js:226-243`) |
| N10 | `HAVING dept LIKE 'a%'` over `'a'`,`'A'` | 2 groups | 1 | JS `RegExp` without the `i` flag (`query-executor-select-aggregation.js:702-708`, `residual-predicate-evaluator.js:404-413`); SQLite LIKE is ASCII case-insensitive |
| N11 | `HAVING hex(dept) = '41'` | 1 row | 0 | Unknown function returns null (`query-executor-select-aggregation.js:617-618`, `partial-aggregate-combiner.js:450-451`) |
| N12 | `HAVING abs(-1) = 1 AND c > 0` | 4 rows | participant failure | HAVING over an output alias is not supported by the split |
| N13 | `SUM(DISTINCT x)`, `1e3`, `9007199254740993`, `x'41'` | values | parse error / "Unknown expression type" | Front-end refusals. They are typed (acceptable) but incomplete |
| N14 | better-sqlite3 binds a JS number as **REAL** even when integral: `typeof(?)` with `2` gives `real` | | | CONFIRMED (`bsq-caps.cjs`). Any path that rebinds decoded integers as JS numbers silently converts INTEGER to REAL |
| N15 | Partition reads run `safeIntegers(false)` (`partition-service-write-metrics-base.js:132`) | | | Integers above 2^53 lose precision before they leave the partition. REAL 2.0 and INTEGER 2 are already indistinguishable in process |

**External-review witnesses (lead, 2026-11-17, reported against integrated candidate `4b0c8ec1d`).**
- I reproduced all three on `c7d8a10bf` through the real parser, planner and executor against native SQLite, with **one and with two partitions**. Both layouts give the identical divergence.
- Script: `probe-lead-abc.mjs`. Rows: `dept='xxabcxx'`, `amount` 0.9 and 1.0, so `SUM(amount)=1.9`.
- Each witness is run with the same expression in the projection and in the predicate.

| # | Statement | SQLite | Coordinator (1 and 2 partitions) | Cause |
| --- | --- | --- | --- | --- |
| W-A | `SELECT TRIM(MAX(dept),'x') AS v FROM t` | `'abc'` | `'xxabcxx'` | Two-argument TRIM ignores its character set: JS `.trim()` in the SELECT combiner (`partial-aggregate-combiner.js:439-442`) and in the HAVING evaluator (`query-executor-select-aggregation.js:608-609`) |
| W-A′ | `… HAVING TRIM(MAX(dept),'x') = 'abc'` (with `COUNT(*)` or the TRIM projection) | 1 row | 0 rows | Same cause, predicate side |
| W-B | `SELECT CAST(SUM(amount) AS INTEGER) AS v FROM t HAVING CAST(SUM(amount) AS INTEGER) = 1` | 1 row (`v=1`) | 0 rows | SELECT casts (`partial-aggregate-combiner.js:383-386`, `parseInt`) and the projection alone agrees (`v=1`). HAVING applies comparison affinity instead of the explicit cast: `evaluateCast` → `applySqlComparisonAffinity(…, NUMERIC)` keeps 1.9 (`query-executor-select-aggregation.js:576-582`). The residual JOIN cast consumer does the same (`residual-predicate-evaluator.js:439-451`); CONFIRMED by reading, not executed (the harness has one table) |
| W-C | `SELECT CASE WHEN '0' THEN SUM(amount) ELSE 0 END AS v FROM t`, and the same expression in HAVING `= 0` | `0` / 1 row | `1.9` / 0 rows | JS truthiness `Boolean(whenVal)` (`partial-aggregate-combiner.js:362`, `query-executor-select-aggregation.js:567`); text `'0'` is false in SQLite |

All three confirm the class: projection, HAVING and residual JOIN each carry their own copy of SQL semantics, and the copies disagree with SQLite and with each other. In the design, one evaluator (SQLite) serves all three consumers (section 2.1).

Also CONFIRMED by reading the code (not executed):
- **DISTINCT and GROUP BY keys:** `[null].join('|')` is `''`, so NULL and `''` collide (`query-executor-select-aggregation.js:404-406`). `JSON.stringify` throws on BigInt (`:366`, `partial-aggregate-combiner.js:168`).
- **Empty SUM:** SUM over no rows returns `0` on the JOIN aggregate path (`:216-218`).
- **Unknown HAVING nodes and operators** evaluate to `true` (`:554-555`, `:145-146`).
- **Hash join** uses JS `Map` keys: `'1'` vs `1` never matches, a BLOB never matches, and collation is ignored (`query-executor-join-execution.js:442-458`).
- **Silent row drop:** `StreamingAggregator.addRows` returns `false` when over memory, and `DistributedMergeEngine` ignores the return (`streaming-aggregator.js:166-173`, `distributed-merge-engine.js:41-45`). Rows are dropped silently above the 1 GiB default (`query-constants.js:494`). This is an R12 violation.

### 1.3 Census table

#### A. Coordinator merge evaluators

**`src/query/query-executor-select-aggregation.js`.** All of it is installed on `QueryExecutor.prototype` (`:736-746`). Class **(i)**, delete:

| Lines | What it does |
| --- | --- |
| `:94-123` | arithmetic and `\|\|` |
| `:125-148` | comparison dispatch |
| `:150-187` | group and hidden-key projection |
| `:199-213` | aggregate value collection (DISTINCT via JS `Set`) |
| `:215-233` | SUM, AVG, MIN, MAX in JS (`<`/`>` in UTF-16) |
| `:247-271` | ORDER BY comparator (NULL last, `Buffer.compare`, JS `<`) |
| `:283-322` | `aggregateSelectResults`: DISTINCT, GROUP BY, aggregates, HAVING, ORDER BY, LIMIT |
| `:333-355` | `aggregateCrossPartitionResults`: **dead**, no callers (CONFIRMED grep) |
| `:363-373` | `applyDistinct` via `JSON.stringify` |
| `:396-450` | `applyGroupBy` / `computeGroupAggregates` |
| `:500-510` | `computeAggregate` |
| `:516-708` | HAVING evaluator: `evaluateExpression`, CASE (JS truthiness `:567`, W-C), CAST as comparison affinity (`:576-582`, W-B), function calls (COALESCE, IFNULL, NULLIF, IIF, ABS, LOWER, UPPER, one-argument-only TRIM `:608-609` W-A, LENGTH, SUBSTR, ROUND), binary, unary, IN, BETWEEN, LIKE |
| `:710-733` | `applyOrderBy`, `applyLimit` |

Exception: the parameter-binding assertion (`:53-92`, `assertQueryParametersBound`) is **(ii)**. It is admission (unbound or NaN parameter refused) and moves to the request owner, `sql-request.js`.

**`src/query/distributed/partial-aggregate-combiner.js` (`:72-535`).** The whole module is **(i)**:
- `combineAggregate` and its modes (`:72-117`);
- `combineDistinct` (`:131-159`);
- `groupKeyOf` via `JSON.stringify` (`:167-171`);
- `combinePartialAggregateRows` (`:223-268`);
- a scalar evaluator (`:327-507`) covering IN, CASE (JS truthiness `:362`, W-C), CAST (`:372-405`, which disagrees with the HAVING cast, W-B), functions (TRIM ignores its second argument at `:439-442`, W-A) and binary operators.

This is the review's evaluator #1. Delete it.

**`src/query/distributed/distributed-select-fanout-plan.js`.**

| Lines | What it does | Class |
| --- | --- | --- |
| `:85-94` | `EVALUABLE_SCALAR_FUNCTIONS` / `EVALUABLE_EXPRESSION_TYPES` | (i) delete: evaluability was a property of the JS evaluator |
| `:104-137` | `SCALAR_BINARY_OPS` / `SCALAR_UNARY_OPS`, including JS `+` (`'1'+2` = `'12'`) and `===` comparisons | (i) delete |
| `:317-366` | `expressionEvaluable`, `hasUnsupportedAggregateExpression` | (i) delete |
| `:707-768` | `ORIGINAL_RAW_ROWS` branch (`:725-731`) | (i) delete |
| `:480-501` | `substituteParameterLiterals` (bound values turned into literal nodes, then rendered as text) | (i) delete; params stay bound and typed |
| `:40-71`, `:200-240`, `:523-693` | alias scheme, aggregate spec collection, partition AST construction | (ii) planner structure; rewritten in WP3 to emit merge SQL instead of a combine spec |
| `:508-514` | `buildOverfetchLimit` (LIMIT n+offset) | (ii) pushdown, kept under its soundness condition (section 2.2) |

**`src/query/sql-scalar-functions.js` (`:85-150`).** `sqlLength`, `sqlSubstr`, `sqlRound`; ROUND uses `toFixed` (`:149`), which is the review's item 4. Class **(i)**, delete. Its only consumers are the two evaluators above.

**`src/query/streaming-aggregator.js`.**
- `:33-57` comparators (`localeCompare` `:48`): **(i)**.
- `:63-106`, `:334-501` streaming aggregates: **(i)**, dead.
- `:239-326` sorted merge / k-way merge: **(i)**, dead.
- `:160-220` chunk buffer with the silent drop: **(i)**, replaced by temp-table ingestion.

Delete the module. The only production use is the buffer in `distributed-merge-engine.js:40-46`. Also delete the write-only `streamingEnabled` and `streamingChunkSize` (`parallel-query-coordinator.js:110-112`, never read; CONFIRMED grep).

**`src/query/distributed/distributed-merge-engine.js` (`:33-83`).** `mergePartitionResults` dispatch is **(i)**, rewritten to drive the merge session. `mergeSetOperationResults` (`:75-83`) is **dead** (no callers).

#### B. Affinity classifiers, comparators and the second CREATE TABLE parser

**`src/query/distributed/residual-predicate-evaluator.js`:**

| Lines | What it does | Class |
| --- | --- | --- |
| `:78-102` | storage rank and byte compare | (i) |
| `:104-216` | **affinity classifier** `classifyAffinityFromTypeString` (`:122-140`) and coercions (`:161-216`) | (i) |
| `:218-275` | the review's "second comparator" (`compareSqlScalarsWithAffinity`, UTF-16 at `:274`) | (i) |
| `:277-508` | three-valued residual evaluator, including the residual JOIN CAST consumer (`:439-451`), which applies comparison affinity instead of an explicit cast (W-B) | (i) |
| `:510-609` | **CREATE TABLE parser** (`parseCreateTableColumnAffinities` `:600-609`, `parseSingleColumnTokens` `:587-598`) | (i), replaced by the one schema authority |
| `:611-625` | `buildColumnAffinityMapFromColumns`: re-lexes catalog type strings | (i), replaced by the one schema authority |
| `:680-689` | `queryPartitionCreateTableDdl`: a `sqlite_master` RPC to partition 0 per query | (i), replaced by the one schema authority |
| `:691-765` | resolvers and annotators | (i), replaced by the one schema authority |

The whole module is deleted.

**`src/query/query-executor-base.js:419-453`.** The HAVING affinity pre-fetch costs one extra network round trip per distributed HAVING query. Class **(i)**, delete.

**`src/partition/partition-boundary-representation.js:28-50`.** `TYPE_NAME_MAP` maps declared type to key type (NUMERIC/DECIMAL become REAL; unknown names give `TYPE_AUTHORITY_MISSING`). Class **(ii)**: a routing representation. Soundness condition: it must equal SQLite storage affinity for a key column. Kept, and witnessed by the oracle's write-key family. Finding: it is a third type classifier, routed to the partitioning owner.

**`src/query/pg/pg-type-affinity.js` (PG type to SQLite type map).** Class **(ii)**: dialect DDL translation before SQLite parses the DDL. Kept.

#### C. JOIN pushdown residuals and the cross-partition join path

**`src/query/query-executor-join-execution.js`:**

| Lines | What it does | Class |
| --- | --- | --- |
| `:84-226` | `executeCrossPartitionJoin` | (i), becomes the `COORDINATOR_EVALUATED` plan |
| `:421-516` | `performJoin` (JS hash join) | (i) delete |
| `:526-572` | `extractJoinColumns` | (i) delete |
| `:583-649` | `nestedLoopJoin` (uses the HAVING evaluator, `:603`) | (i) delete |
| `:660-677` | `combineJoinRows`: key-collision row shape | (i) delete |
| `:373-391` | `applyResidualJoinWhere` | (i) delete |
| `:393-409` | `ensureQueryColumnAffinities` | (i) delete |
| `:688-709` | `buildSelectSQLWithoutJoins` | (ii) fragment SQL, regenerated by the planner |
| `:242-298` | `fetchJoinFanoutRows` | (ii) fan-out, kept |
| `:311-339` | `buildJoinTableFetch`: semi-join key IN filter | (ii), kept **only** when both join columns have identical declared type and collation in the catalog. Otherwise a NOCASE-left / BINARY-right join drops matches (PLAUSIBLE by SQLite comparison rules; added as an oracle family) |

**`src/query/distributed/join-pushdown-plan.js`:**

| Lines | What it does | Class |
| --- | --- | --- |
| `:54-74` | operator allowlists "supported by … the coordinator evaluator" | (i) delete; push-down eligibility becomes renderer fidelity plus null-extension soundness |
| `:25`, `:722-737` | `LEGACY_WHERE` plan kind | (i) delete; with the full WHERE re-applied on the coordinator, "push nothing" is the correct degenerate plan |
| `:296-389` | conjunct classification and OUTER-join null-extension rule | (ii) kept; it is the soundness condition for pre-filtering |
| `:551-570` | `collectDistinctJoinKeyValues` | (ii): deduplication uses SameValueZero, which is finer than SQLite equality, so it never loses a key |
| `:614-697` | residual preparation (`canonicalizeQualifiers` for residuals, `substituteResidualParameterLiterals`, `resolveResidualConjunctForRow`) | (i) delete |

#### D. Write-key evaluation and coordinator uniqueness

**`src/query/distributed/distributed-write-constraint-helpers.js`:**

| Lines | What it does | Class |
| --- | --- | --- |
| `:40-139` | `extractCoordinatorKeyValue`: literal, parameter, unary, binary (`:67-86`: JS `/` is float, `\|\|` maps null to `''`), functions UPPER, LOWER, TRIM, COALESCE (`:88-108`) | (i): the coordinator SQLite evaluates the key expression, then applies the key column's affinity through a probe temp table declared by the one DDL renderer |
| `:206-243` | INSERT batch uniqueness deduplicated by `JSON.stringify` (`:230`) | (i): a coordinator SQLite temp table with the same UNIQUE columns |
| `:184-204` | `assertUniqueAcrossPartitions` (the `SELECT 1 … LIMIT 1` probe is evaluated by SQLite) | (ii). Finding: check-then-act is racy across partitions; out of scope, routed to the write-coordinator owner |
| `:141-156` | `resolveCoordinatorTableSchema` with a `JSON.parse` fallback chain | (ii); consumes the schema authority |

Consumers: `distributed-write-coordinator.js:505-591`, `:624-626`.

#### E. Partition routing (legitimate non-SQL concerns)

| Location | What it does | Class |
| --- | --- | --- |
| `src/partition/split-key-comparator.js` (`compareRoutingKeys`) | typed key order, refuses mixed types | (ii) |
| `src/query/partition-resolver.js:621-705` | value-in-range, overlap, `resolvePartitionForKey` | (ii) |
| `src/query/partition-resolver-key-conditions.js:202-240` | contradiction pruning (a contradiction routes to zero partitions) | (ii) |

These stay. Range partitioning is a partitioning function over the stored key, and binary/codepoint order is the decided contract (memory note F-ORDER-BY-LOCALE-COLLATION). Soundness conditions:
- (a) key values are canonical typed values (codec, BigInt int64);
- (b) partition-key columns are BINARY-collated; CREATE TABLE refuses another collation on a key column. Otherwise `k='a' AND k='A'` prunes to nothing while SQLite NOCASE would match;
- (c) the key-type decode equals SQLite storage affinity. All three are witnessed by the oracle.

#### F. SQL front-end fidelity (the parser and renderer that produce both partition SQL and merge SQL)

| Location | Defect | Class |
| --- | --- | --- |
| `sql-parser-expression-methods.js:114-115` | NUMBER literal keeps its text and the literal node has no numeric marker (N7) | must become lossless (typed literal node) |
| SQLParser expression, ORDER BY and DDL conversion | `COLLATE` dropped (N8, N9) | must become lossless |
| `query-executor-sql-command-rendering.js:206-214` | `String(value)` / quote, the renderer side of N7 | must become lossless |
| `query-executor-sql-command-rendering.js:99-190` | renderer | must become lossless |
| `table-creation-service-schema-derivation.js:116-128` | no `collation` in the catalog schema | must become lossless |
| `partition-service-table-bootstrap.js:226-290` | DDL renderer without COLLATE | must become lossless |
| `distributed-query-planner-expression-renderer.js` (used at `distributed-query-planner.js:700-726` for fragment diagnostics) | a **second renderer** | (ii) diagnostics, but it must consume the one renderer (R01 finding) |

These are not evaluators, but every partition statement passes through them. The **coordinator SQLite inherits any loss**.

#### G. Other non-partition sites found

| Location | What it does | Class and decision |
| --- | --- | --- |
| `src/live-query/live-query-service.js:34-260` | **a fourth WHERE evaluator**: `compilePredicate`, `evaluateExpression`, JS comparators, case-*insensitive* LIKE via regex `i`. Consumers: `live-query-group-helpers.js:67`, `live-query-group.js:637-665`, `live-query-service.js:424,516` | (i): evaluate the predicate with SQLite over a one-row temp table declared like the base table. `architecture/live-query-data-plane.md:229` already forbids "a second SQL predicate/compiler/routing semantics inside the live-query subsystem". Decision D8 |
| `src/cdc/cdc-integration-service-authoritative-read-flow.js:213-237` | system-table replica row-set union keyed by PK (JS `Map`); ORDER BY and LIMIT are not re-applied across row sets | (ii): replica reconciliation, not SQL evaluation; system tables are single-partition today (PLAUSIBLE). Finding for the control-plane owner |
| `src/index-management/global-index-read-router.js:298-310` | `isRowMatchingPk`: `row[k] === v` (a BLOB never matches; a BigInt never equals a number; NOCASE PK mismatch) | (ii): storage identity must use the codec's typed-value identity. Finding for the GSI owner |
| `src/runtime/sql-query-loop-parallel-reduce.js:203-224` | top-N over service-defined `aggValue`/`groupKey` partials (`localeCompare` with numeric order) | (ii): an application reduce contract, not a SQL merge. Finding: if it is ever documented as SQL ORDER BY, it must consume the merge |
| `src/runtime/pgwire-message-builders.js:186-205` | `String(v)` DataRow: BLOB rendered as UTF-8, REAL 2.0 as "2" | presentation; finding for the pgwire owner |
| `src/query/sql-query-engine-select-execution.js:723-761` | FROM-less SELECT sent to partition 0, rendering columns only (ORDER BY and LIMIT dropped) | **Rev 2, in scope (D11):** evaluated in the merge session over the full rendered statement, after partition statement admission. Until WP3, ORDER BY, LIMIT, OFFSET, GROUP BY, HAVING and DISTINCT on a FROM-less SELECT are a typed refusal (WP2) |
| `src/live-query/live-query-sql-renderer.js` (**rev 2, census miss**) | **a second SQL renderer**, used as a fallback when the engine renderer is absent: `live-query-group-helpers.js:199-204` (`resolveExecutionSQL`) and `live-query-manager.js:105-110` (`resolveSnapshotExecutionSql`); also `extractReferencedTables` | (i): delete the renderer and the fallback branches; callers consume the one renderer (WP7). `extractReferencedTables` is structural (ii) and moves to the one AST owner |
| `src/runtime/sql-query-loop-runtime-module.js:232-246` (**rev 2, census miss**) | `compareReducedRows` (`localeCompare` with numeric order) and `sqlLiteral` (`String(value)`, so REAL 2.0 is written back as `2`, an INTEGER) | (i) for `sqlLiteral`: write-back uses typed params. (ii) for the ordering, which is the same reduce contract as `sql-query-loop-parallel-reduce.js`. Finding: the declared order must be stated as an application contract or consume the merge |
| `src/index-management/global-index-lifecycle-coordinator.js:186-212` (applied at `:779`; **rev 2, census miss**) | JS ORDER BY (`<`/`>` and NULL handling by JS coercion) and LIMIT over GSI read rows | (i): route GSI-read post-processing through a merge session (FRAGMENT_MERGE semantics over the fetched rows), or delete it if no production caller remains. The reviewer reports tests only; the wiring at `index-service-global-methods.js:88` must be checked in WP3. **Rev 4 (C4): settled, WP3 deletes it.** The WP1 census found no production caller: the coordinator is built with only `{logger}` (`index-service-global-methods.js:86-90`), its scans default to `async () => []`, and `planAndExecuteRead` has no caller. `global-index-read-router.js:298-310` goes with it |

#### H. Transport (storage class is lost)

| Location | What it does |
| --- | --- |
| `src/transport/message-router-delivery-encoding.js:73-82` | plain `JSON.stringify` on the non-duration path |
| `message-router-delivery-behaviors.js:266` | raft-direct `JSON.stringify` |
| `message-router-delivery-behaviors.js:576` | `sendRaw` `JSON.stringify` |
| `message-router-inbound-dispatch.js:72` | `JSON.parse`, no reviver |
| `message-router-delivery-behaviors.js:57-104` | **local delivery passes objects by reference** |

So today a value has two semantics: a local Buffer or BigInt survives, while a remote one becomes `{type:'Buffer',data}` or throws. Class **(i)**: rows and params become codec-encoded at the query-result contract.

**Rev 2:** making the transport reject non-JSON data is **out of this Quest**. `remoteQueryAnswer` emits `undefined` fields; payloads carry `Date`, `toJSON` instances and `Error` (`p2`); and there is Buffer rehydration at `debug-metadata-service-value-helpers.js:62-71`. Strictness is a separate unit with its own payload census.

Answers do not use `encodeDeliveryMessage`. They travel as `SERVICE_RESPONSE` through `sendRaw` → `JSON.stringify` (`message-router-inbound-dispatch.js:515-527`).

**Durable hops (rev 2, census):**
- raft proposals (`src/raft/raft-rs-proposal-codec.js:33-45`, plain `JSON.stringify`);
- split-mirror replay;
- transaction-session statement replay;
- the partition statement-outcome table;
- CDC row images.

All of these are WP-D. Producers and consumers of the query contract:
- `partition-service-remote-query-methods.js:119-141` (params in);
- `partition-service-remote-query-methods.js:143-164` (`remoteQueryAnswer`, rows out);
- `query-result-budget.js:62-80` (object rows collapse duplicate column names; `.raw()` keeps them, CONFIRMED);
- `partition-service-write-metrics-base.js:130-157`.

#### I. Consumers and tests that pin the JS evaluators

**Import or call the evaluators directly** (delete or migrate in the WP that deletes the code):

| Test | Pinned surface | Disposition |
| --- | --- | --- |
| `test/query/sql-scalar-functions.test.js` (4 cases) | `sqlLength/sqlSubstr/sqlRound` | delete; superseded by oracle families F1/F5 |
| `test/query/streaming-aggregation.property.test.js` (11 cases) | dead `StreamingAggregator` | delete |
| `test/query/distributed-merge-engine.test.js` (2 cases) | old engine API | rewrite against the merge session |
| `test/query/distributed-select-global-merge-correctness.test.js` (20 cases; `:28` imports `buildSelectFanoutPlan`, `FANOUT_PLAN_KIND`, `substituteParameterLiterals`; `:755` asserts `applyOrderBy`) | combine-spec shape, UTF-8 comparator | migrate to plan-kind and merge-SQL assertions; behaviour moves to the oracle |
| `test/query/cross-partition-join-pushdown.test.js` (14 cases; `:33` imports the residual evaluator; `:1467` `applyHaving`) | residual JS evaluation | migrate to P3 fragment assertions and the oracle F6 family |
| `test/query/sql-mutation-and-constraint-stabilization.test.js:178-210` (Q01 `extractKeyValue`) | JS key evaluation | migrate to the SQLite key-evaluation witness |
| `test/live-query/live-query-service.test.js` (`compilePredicate`) and `test/live-query/queryable-core-j6-live-query-journey.test.js:21,225-257` (`evaluateWhereExpression`) | live-query JS predicate | migrate (WP7) |
| `test/integration/public-consumer-contract-ratchet.integration.test.js:232-254` | asserts **locale order "observed today"** | flip to binary order (its own comment says "flip … when the owner fixes it") |
| `test/scripts/test-placement.test.js:32` | uses `distributed-merge-engine.test.js` as a fixture path | update if renamed |
| `test/index-management/queryable-core-j5-global-index-journey.test.js` (rev 2) | GSI read post-processing (`applyPostProcessing`) | migrate with the GSI routing change |
| live-query tests that exercise the renderer fallback (rev 2; census in WP7) | `live-query-sql-renderer.js` | migrate to the one renderer |

**Proof selection and ratchets:**
- `test/shards/impact-contracts.json:2214-2227` coupled pair `coordinator-scalar-semantics` (owners are the four deleted modules): replace with `coordinator-sqlite-merge`.
- `test/shards/{primary,resource,subsystem}-classes.json`: regenerate.
- Navigability, silent-catch and fallback-classification baselines that list the deleted files: tighten, never raise. They are in `scripts/check-guideline-navigability-baseline-{two_source_fallback_reads,legacy_term_identifiers,catch_returns_default,row_field_alias_reads,owner_port_feature_detection}.json`, `scripts/check-guideline-silent-catch-baseline.json` and `scripts/checks/code-navigability-fallback-classification.json`.

**Behavioural consumers** (reach the merge through `executeSelect`; must stay green or be corrected where they pin wrong behaviour):
- `test/query/aggregate-function-correctness.property.test.js`
- `cache-based-routing{,.property}.test.js`
- `cross-partition-join.property.test.js`
- `distributed-query-parallelism.property.test.js`
- `distributed-query-straggler-hedging.test.js`
- `distributed-sql-baseline-gaps.test.js`
- `parallel-query-coordinator.test.js`
- `query-executor{,-distributed-metrics,-session-binding-and-build-sql}.test.js`
- `query-executor-recovery-routing-test-cases.js`
- `scenario-a-deep-stack-throughput-and-latency.test.js`
- `sql-query-engine-execution{,-test-cases}.js`
- `sql-query-engine-system-table-local-read.test.js`
- `sql-query-pbt.test.js`
- `test/integration/minimal-deployment-runtime-access-policy-live-validation.integration.test.js`
- `test/service/minimal-deployment-request-cell-routing-fixture.js`

**Documentation owner:** `architecture/query-runtime.md:166-179` ("Coordinator Scalar Semantics") is rewritten as "Coordinator merge is SQLite". The existing quest `distributed-select-global-merge-correctness` (legacy epic) is superseded by the new quest. That needs an R09 record, because its probe scenario pins combine-spec behaviour.

---

## 2. Design

### 2.1 Boundary: what JavaScript may still do

JavaScript may:
- parse;
- choose a plan kind and perform structural rewrites (split aggregates, rename tables, choose pushdowns);
- route by canonical typed keys;
- encode and decode values;
- count budgets;
- present final values to clients through one owner.

JavaScript may not:
- compare, order, group, deduplicate or combine SQL values;
- evaluate any SQL expression or predicate;
- infer affinity or collation.

The static census guard enforces this (receipt `js-sql-evaluator-census-zero`, section 4).

**One implementation serves all three consumers.** Projection, HAVING and residual JOIN predicates are all evaluated by the same SQLite statement over the same temp tables:
- An explicit `CAST` is SQLite's cast. It is never conflated with comparison affinity, which SQLite applies only where its own rules say so (W-B).
- `CASE WHEN` uses SQLite's truth rules (W-C).
- `TRIM(x, chars)` is SQLite's TRIM (W-A).

Today the three consumers carry three implementations. W-B shows that even the SELECT and HAVING copies inside one query disagree.

### 2.2 Merge plan shape: one decision table

The fan-out planner owns one table, decided once per statement. It is the replacement for `FANOUT_PLAN_KIND`/`FANOUT_BUILD_STATE`, and every row is witnessed by the oracle.

The kinds are **mutually exclusive by explicit predicates**, evaluated in this order. The first kind whose predicate holds wins. Rev 2 and rev 3 changed the predicates.

**Order-dependent (rev 3).** A plan is order-dependent if it contains any of:
- SUM, AVG or TOTAL;
- GROUP_CONCAT;
- MIN or MAX whose argument column is not declared, in the catalog, as one of the normalized names INTEGER, REAL or TEXT with BINARY collation;
- a GROUP BY key column that is not BINARY-collated;
- a bare non-key column in an aggregate query.

The classification is structural, over catalog facts, and conservative: anything not on the allowlist counts as order-dependent. An order-dependent plan is COORDINATOR_EVALUATED with key-ordered fragments (Revision 3 "Result contract").

**Order-independence allowlist (rev 4; replaces the revision-3 list above, gaps B and C).** A statement is order-**independent** only if *every* construct in it is on this list. Anything else, including any construct not listed, is order-dependent by default.

**Columns on the allowlist.** A bare column reference whose catalog declared type normalizes to INTEGER, REAL or TEXT and whose collation (declared, or explicit at the use site) is BINARY. For such a column, values equal under comparison are byte-identical in storage class and value: affinity stores one class per numeric value, and BINARY ties are byte-equal.

| Construct | Order-independent when |
| --- | --- |
| projection, WHERE, ON, ORDER BY terms | always: any deterministic expression, including scalar functions and `CASE`/`CAST`; per-row `random()` is allowed but its values are not oracle-comparable and the generator excludes it. Per-statement time is not an order question; it is governed by the pushdown rule |
| top-level ORDER BY / LIMIT / OFFSET | always. A cut among ties, or LIMIT without ORDER BY, is SQLite's own choice: contract (b) |
| `COUNT(*)`, `COUNT(x)`, `COUNT(DISTINCT x)` | always (counts do not depend on representatives) |
| `MIN(x)` / `MAX(x)` | x is an allowlisted column, and the statement projects no bare non-key column |
| GROUP BY | every key is an allowlisted column (gap C: a BINARY key on a BLOB or untyped column ties 1 with 1.0) |
| HAVING | composed of allowlisted aggregates, keys and deterministic expressions |
| `SELECT DISTINCT` | every output column is an allowlisted column (gap C: NOCASE ties and 1 vs 1.0 make representatives order-dependent) |
| `UNION ALL` | each arm is order-independent and has no LIMIT/OFFSET without a total ORDER BY |
| `UNION` / `INTERSECT` / `EXCEPT` | as UNION ALL, and every output column of every arm is an allowlisted column (gap C) |
| JOIN (inner, left, cross) | always, as a multiset |
| `IN (subquery)`, `EXISTS (subquery)`, derived table, CTE body | the subquery is itself order-independent and has no LIMIT/OFFSET without a **total ORDER BY**, meaning ORDER BY terms that include every PK column of every table in that subquery's FROM |
| scalar subquery | it is an aggregate subquery whose aggregates are on this list, or it has a total ORDER BY with `LIMIT 1` |

**Order-dependent, explicitly:**
- window functions;
- `group_concat`, `string_agg`, `json_group_array`, `json_group_object`;
- SUM, AVG, TOTAL (including the DISTINCT forms). Rev 5: the non-DISTINCT forms with a deterministic argument are instead planned as the **guarded exact integer partial** (§2.3, WP3 sub-package 3f). When SQLite's guard holds, the result is exact and order-independent (a). When it fails, the statement is re-executed COORDINATOR_EVALUATED (c);
- MIN/MAX outside the allowlist;
- bare non-key columns in aggregate queries;
- a non-allowlisted GROUP BY key, DISTINCT column or compound output column;
- a scalar subquery with first-row semantics;
- any subquery or compound arm with LIMIT/OFFSET and no total ORDER BY;
- any unknown function or aggregate.

The oracle recomputes this classification independently (§4.1).

| Kind | Chosen when | Partition SQL | Coordinator |
| --- | --- | --- | --- |
| `SINGLE_PARTITION` | the statement references exactly **one** table reference and the resolver routes it to exactly one partition. Each partition service holds one table, so any JOIN, including a self-join, is never single-partition (rev 2) | the original statement, losslessly rendered | none: rows are returned as produced (fixes N5) |
| `FRAGMENT_MERGE` | one table reference; no aggregates, GROUP BY, HAVING, window functions, subqueries, CTEs or set operations; ≥2 partitions; no `rowid`/`_rowid_`/`oid`; **every WHERE conjunct pushable** (rev 3, `p7` C4); no per-statement time function (`'now'`, `CURRENT_*`) anywhere (rev 3) | `SELECT <base columns referenced anywhere> FROM t WHERE <where> [ORDER BY … LIMIT …]` under the soundness table | a main table named like the base table, column-only DDL (2.7), ingested in canonical layout; runs the original select list, DISTINCT, ORDER BY and LIMIT/OFFSET over it |
| `PARTIAL_AGGREGATE` | one table reference; ≥2 partitions; no window functions, subqueries, CTEs, set operations or `rowid` aliases; every aggregate has a partial row in 2.3; every GROUP BY term is a bare column, optionally with an explicit `COLLATE`; every DISTINCT, MIN or MAX argument is a bare column; **every WHERE conjunct pushable, no per-statement time function, and the plan is not order-dependent** (rev 3) | `SELECT <group key columns>, <partial expressions> FROM t WHERE <where> GROUP BY <keys>[, <distinct args>]` | main table `p` (key columns declared like the base columns, partial columns per 2.3), canonical layout; runs the original select list, HAVING, ORDER BY and LIMIT with each aggregate call replaced by its combine expression, `GROUP BY` the key columns |
| `GUARDED_PARTIAL` (**rev 6**, the owner's guarded exact integer partial) | one table reference; ≥2 partitions; every WHERE conjunct pushable; no per-statement time; ≥1 non-DISTINCT `SUM`/`AVG`/`TOTAL` over a deterministic argument; and **every other construct in the statement on the order-independence allowlist** | per group: allowlisted keys and partials, plus for each SUM/AVG/TOTAL argument `COUNT(e)`, `coalesce(max(typeof(e) NOT IN ('integer','null')),0)`, `total(abs(CAST(e AS REAL)))`, `sum(e >> 32)`, `sum(e & 4294967295) >> 32`, `sum(e & 4294967295) & 4294967295` | main table `p`; the coordinator SQLite computes the **named plan outcome** `GUARD_HELD`/`GUARD_FAILED` (`sum(nonint)=0 AND total(absTotal) < 2^62` for every group). On `GUARD_HELD` it runs the merge SQL with the exact combine (§2.3). On `GUARD_FAILED` the defined transition re-executes the statement as `COORDINATOR_EVALUATED`, with three conditions: (i) never triggered by a phase-1 error or unavailability, which stay the statement's typed outcome (`QUERY_MERGE_PARTIAL_OVERFLOW` included); (ii) phase-1 results fully discarded; (iii) only the named guard outcome selects phase 2 |
| `COORDINATOR_EVALUATED` | everything else: joins, set operations, CTEs, derived tables, subqueries, window functions, `GROUP_CONCAT … ORDER BY`, expression GROUP BY keys, SUM/AVG/TOTAL (rev 2, 2.3; rev 5: only the DISTINCT forms, non-deterministic arguments, or phase 2 after `GUARD_FAILED` of the guarded exact integer partial), aggregates without a partial row, any order-dependent plan, any statement with a coordinator-kept conjunct or a per-statement time function (rev 3) | per **table reference** (rev 2: a self-join `t a JOIN t b` gets two fragments and two tables, `t__a` and `t__b`): `SELECT <referenced columns> FROM t [WHERE <pushable conjuncts>] [AND k IN (?…)] [ORDER BY <partition key>]`. Rev 3: the key-order clause is present when the plan is order-dependent, so SQLite fixes the canonical scan order | one main table per reference, no indexes, rows at canonical positions. For **order-independent** plans, it runs the original statement with the table references renamed and the **pushed conjuncts removed**, so each conjunct is applied exactly once (rev 2). For **order-dependent** plans (rev 4, G2), it runs the **original statement text apart from table renaming**: deterministic pushed conjuncts are re-applied, and per-row `random()` is not pushed, so SQLite chooses the same plan, and therefore the same order, as over the canonical reference (`p9`). The statement must first pass the partition statement-admission owner (refuses `pragma_*` table-valued functions, `ATTACH` and the like). Rev 3: the coordinator path also refuses `changes()`, `last_insert_rowid()` and `total_changes()`, which today are refused only on writes. Runs in the merge child-process pool (2.8) |

`rowid`, `_rowid_` and `oid` in any multi-partition plan are a typed refusal (rev 2). Temp-table rowids are the canonical-layout sequence, not the partition's rowids (`p1` §10).

**Column names (rev 2).** Result column names are the names SQLite assigns to the admitted statement text: the client's text in SQLite dialect, or the translated text for PG dialect. The session prepares that statement once against an empty mirror schema (same column-only DDL) and reads `columns()`. Merge outputs are aliased with exactly those names, so `Sum( amount )` keeps its name (`p3`, `p1` §11). Oracle layer A compares names.

Why `FRAGMENT_MERGE` ships base columns and recomputes the original expressions on the coordinator: SQLite then derives every expression's affinity and collation itself (ORDER BY rule: [datatype3 §7.1](https://www.sqlite.org/datatype3.html)). The planner never needs a JS copy of `sqlite3ExprCollSeq`. Positional and alias ORDER BY terms (N3, N4) resolve identically because the coordinator runs the original text.

Pushdown soundness conditions (each one is a planner rule with an oracle family; rev 2 rows marked):

| Pushdown | Sound when | Otherwise |
| --- | --- | --- |
| `ORDER BY … LIMIT` at the partition | all of: (a) **no DISTINCT in the statement**, unless the partition applies DISTINCT over exactly the select list *and* every ORDER BY term is a function of the select list (rev 2; `p1` §5 shows `DISTINCT a+0 … ORDER BY a LIMIT 2` → {1,3} and `DISTINCT a … ORDER BY b` deduplicating (a,b)); (b) every ORDER BY term is an expression over base columns that names neither a select alias nor a position; (c) no ORDER BY term contains a function the existing determinism classifier marks non-deterministic; (d) rev 4: the partition LIMIT is **rendered as SQL** and evaluated by the partition's own MustBeInt. This replaces revision 3's "INTEGER-class params only", under which JS-number (REAL) and PG-wire (TEXT) limits never pushed down:

`LIMIT CASE WHEN (?n) < 0 THEN -1 ELSE min((?n) + max((?off), 0), 9223372036854775807) END`

- `?n` and `?off` are the original LIMIT and OFFSET values or expressions, bound as typed params.
- A negative LIMIT stays unlimited (`p3`: `LIMIT -1` → `[]` today).
- A negative OFFSET counts as 0 (`p1` §6).
- `min(…)` keeps `n + off` from overflowing into a REAL that MustBeInt would reject.
- Text operands follow SQLite arithmetic (`'2'` → 2).
- An original value SQLite would reject still fails, because the coordinator always applies the original LIMIT/OFFSET.

Sound as an over-fetch bound whenever the original is valid (PLAUSIBLE; F12 witnesses REAL, TEXT, negative, huge and invalid values). (e) rev 3: the **whole WHERE is pushed** (`p7` C4: a conjunct applied after the partition LIMIT gives [1,7] instead of [1,3]). The coordinator always applies the original LIMIT/OFFSET with SQLite's own semantics | ship without LIMIT (budget-bounded) |
| `DISTINCT` at the partition | the select list is exactly bare columns (`SELECT DISTINCT hex(name)` over a NOCASE `name` would otherwise collapse `'a'`/`'A'` early), and the partition DISTINCT is over exactly that list, not over extra shipped columns (rev 2) | no partition DISTINCT |
| WHERE conjunct into a fragment | the conjunct references only that table reference; the table is not null-extended by any join (existing rule, `join-pushdown-plan.js:296-389`); Rev 3 replaces revision 2's blanket non-determinism rule with two classes, taken from the existing determinism classifier's FUNCTION layer (extended at that owner if it lacks the distinction). **Per-row** non-determinism (`random()`, `randomblob()`) is pushable on a single table reference, because it is evaluated once per row wherever it runs. **Per-statement time** is never pushed, so one statement sees one `now`. Rev 4 (G1) widens the class: **any** call to `date`, `time`, `datetime`, `julianday`, `unixepoch`, `strftime` or `timediff` is per-statement time unless *every* time-value argument is a string or numeric literal other than `'now'` (case-insensitive). A parameter or non-literal argument may carry `'now'`, and a call with no time-value argument reads the clock. `CURRENT_DATE/TIME/TIMESTAMP` are always per-statement time. Rev 6: so is any date/time call with a `'localtime'` or `'utc'` modifier, or with any non-literal modifier argument, because no deployment pins the timezone (no `TZ` in the Dockerfile, charts or `src`; embedded deployments use the host's). Coordinator-only, the statement sees one timezone, the coordinator's.

A pushed conjunct is **removed** from the coordinator statement and runs exactly once (`p1` §12). Rev 4 (G2): that applies **only to order-independent plans**. In an **order-dependent** plan the coordinator statement is the **original text apart from table renaming**: deterministic pushed conjuncts are re-applied (harmless), and per-row `random()`/`randomblob()` conjuncts are **not pushed** at all, so they still run once. Removing a conjunct changes SQLite's join plan and hence the order (`p9`: the reference and the conjunct-keeping coordinator both plan `SCAN t …` and give `1:1,1:3,3:2,4:1,4:3`; the conjunct-removing coordinator plans `SCAN u …` and gives `1:1,4:1,3:2,1:3,4:3`). A conjunct kept on the coordinator forces COORDINATOR_EVALUATED (rev 3) | keep on the coordinator only; the statement becomes COORDINATOR_EVALUATED |
| semi-join `k IN (…)` | INNER join or the right side of a LEFT join; equi-join; both columns with identical catalog type and collation; **no explicit `COLLATE` in the ON condition** (rev 2); distinct keys ≤ `JOIN_KEY_PUSHDOWN_MAX_VALUES` | no semi-filter |
| key-range pruning | the key predicate compares the BINARY key column without an explicit non-BINARY `COLLATE` (rev 2). Rev 3: this rule lands in **WP2**, so no interim exists in which a COLLATE predicate prunes. Rev 4 (G6): it covers `=`, `<`, `<=`, `>`, `>=`, **IN** and **BETWEEN**, with COLLATE on **either** operand (`k COLLATE NOCASE = ?` as well as `k = ? COLLATE NOCASE`) or anywhere inside a BETWEEN bound or IN list | no pruning: all partitions |
| partial aggregation | the row in 2.3 exists and its argument rule holds | `COORDINATOR_EVALUATED` |

Example (rev 2: SUM moved to COORDINATOR_EVALUATED, so this uses COUNT and MAX): `SELECT dept, MAX(amount) AS m FROM t GROUP BY dept HAVING COUNT(*) > 1 ORDER BY m DESC LIMIT 10`.

```sql
-- partition (each)
SELECT dept, MAX(amount) AS a0_m, COUNT(*) AS a1_c FROM t GROUP BY dept
-- coordinator: main table in the per-query DB; dept and a0_m declared like t.dept / t.amount (type + collation),
-- a1_c untyped; rows inserted with explicit rowids in canonical layout
-- (rev 3: dept must be BINARY-collated for this plan; with "dept TEXT COLLATE NOCASE" the group-key
--  representative is order-dependent and the statement is COORDINATOR_EVALUATED)
CREATE TABLE p (dept TEXT, a0_m REAL, a1_c);
SELECT dept, MAX(a0_m) AS m FROM p GROUP BY dept
  HAVING COALESCE(SUM(a1_c), 0) > 1 ORDER BY m DESC LIMIT 10;
```

Parameters stay bound on both sides (typed); they are never substituted as literals. The merge SQL text is produced by the one renderer from the rewritten AST and prepared once per statement shape (per-session cache).

### 2.3 Aggregate combine table

The table follows Citus's split (README quotes in section 3) and CockroachDB's `DistAggregationInfo`.

| Aggregate | Partition partial (column declaration) | Coordinator combine | Notes |
| --- | --- | --- | --- |
| `COUNT(*)`, `COUNT(x)` | `COUNT(..)` (untyped) | `COALESCE(SUM(c), 0)` | INTEGER result as in SQLite. A count ≤ the row count cannot overflow int64 |
| `SUM(x)`, `TOTAL(x)`, `AVG(x)` | **(rev 2) none in v1** | n/a | **`COORDINATOR_EVALUATED`** over raw rows in canonical layout. Finalized partials lose SQLite's compensated REAL sum (`p1` §4: one database gives 1, the combine 0) and mis-decide integer overflow in both directions (`p1` §3, §13). See below |
| `SUM(e)`, `TOTAL(e)`, `AVG(e)`, non-DISTINCT, deterministic `e` (**rev 5, owner decision**) | `COUNT(e)`, `coalesce(max(typeof(e) NOT IN ('integer','null')),0)`, `total(abs(CAST(e AS REAL)))`, `sum(e >> 32)`, and (rev 6) `sum(e & 4294967295) >> 32` plus `sum(e & 4294967295) & 4294967295` (all untyped). No partition statement can raise below 2^31 rows per group per partition (Revision 5 §1, Revision 6 §1) | guard `sum(nonint)=0 AND total(absTotal) < 2^62`. Then: SUM = (rev 6) `(sum(hi) + sum(lo_carry))*4294967296 + sum(lo_low)`, safe for < 2^30 partitions; TOTAL = its CAST AS REAL; AVG = CAST(SUM AS REAL)/`sum(c)`; NULL/NULL/0.0 when `sum(c)=0` | guard decided by SQLite; on `GUARD_FAILED` the whole statement re-executes COORDINATOR_EVALUATED (raw key-ordered rows), so the result is exact either way. This supersedes the row above for these forms. Oracle F14 |
| `MIN(x)`/`MAX(x)`, x a bare column | `MIN(x)` declared **like x** (collation) | `MIN(m)`/`MAX(m)` | Rev 3: partial only when x is declared INTEGER, REAL or TEXT with BINARY collation and no bare non-key column is projected. Then no tie between distinct representatives is possible: affinity stores one class per numeric value, and BINARY ties are byte-identical. Otherwise the plan is order-dependent and COORDINATOR_EVALUATED. A partition-local partial can come from an index scan, so revision 2's "canonical layout of partials" was not enough (`p8`: `real` via covering index, `integer` without) |
| `COUNT(DISTINCT x)` | x added to the partition GROUP BY; x declared like x | `COUNT(DISTINCT dv)` | distinctness under x's collation; the count is order-independent. Rev 3: `GROUP_CONCAT(DISTINCT x)` and `SUM/AVG/TOTAL(DISTINCT x)` are order-dependent and COORDINATOR_EVALUATED |
| `GROUP_CONCAT(x[, sep])` | **(rev 3) none** | n/a | order-dependent (element order), so COORDINATOR_EVALUATED with key-ordered fragments. The result equals SQLite's under the canonical scan order and is compared exactly, not as a multiset |
| `GROUP_CONCAT(x ORDER BY …)`, window functions, FILTER, user functions | n/a | n/a | `COORDINATOR_EVALUATED` |

Affinity re-application on stored values is idempotent (PLAUSIBLE; it is an oracle property). That is why key, MIN, MAX and DISTINCT columns may be declared exactly like the source column without changing values, while comparisons in HAVING regain the column's affinity. An example: `HAVING dept = 5` on a TEXT column compares `'5'`.

**REAL accumulation and integer overflow (rev 2; replaces the revision-1 tolerance paragraph).** SQLite's accumulator is a state machine (`sumStep`/`sumFinalize` in SQLite's `func.c`):
- integer addition until an overflow;
- then compensated (Kahan-Babuska-Neumaier) REAL summation, with an overflow flag;
- a later non-integer input clears the flag;
- SUM raises "integer overflow" only if the flag is still set at the end;
- AVG never raises.

Finalizing per partition destroys that state.
- A revision-1 combine of `[1e16, 1.0 | -1e16]` gave 0 where SQLite gives 1 in every scan order (`p1` §4).
- AVG `[MAX | MAX]` raised on the coordinator where SQLite returns 9.22e18.
- SUM `[MIN | MAX, MAX]` overflowed in a partial where SQLite succeeds.
- SUM `[MAX | 1, −1]` errors in SQLite but succeeded from partials (`p1` §3, §13).

SQLite's own outcome is defined by scan order ("at any point during the computation"). Under the **canonical layout contract** (Revision 2 section), the coordinator feeds SQLite the raw rows in (partition key-range ordinal, partition scan order). That is the same order the oracle's reference database scans, so SUM, AVG and TOTAL results, including overflow errors and compensated REAL sums, are **exact by construction, with no tolerance** (D5 changed).

The residual-carrying partial (`p5`) fixes that one example. Compensated summation is not associative, though, so a two-number partial is not provably equal to a single scan. A guarded partial is a later optimization with its own oracle family:
- an exact integer partial when a coordinator-side bound proves no prefix can overflow;
- a residual partial for REAL.

Scenario A uses no SUM or AVG (§6), so the v1 cost is confined to analytical queries.

### 2.4 ORDER BY, collations and NULLs

All of these are delivered by SQLite once three conditions hold:
- (a) coordinator table columns are declared from the catalog (column-only projection, rev 2);
- (b) the AST carries `COLLATE` (WP2);
- (c) the coordinator runs the original terms.

That gives:
- NULLs first ascending and last descending;
- storage-class order NULL < numeric < TEXT < BLOB (CONFIRMED, `bsq-caps.cjs`, [datatype3 §4.1](https://www.sqlite.org/datatype3.html));
- `memcmp` for BLOBs;
- BINARY, NOCASE and RTRIM collations.

`NULLS FIRST|LAST` is a parse refusal today (CONFIRMED). Supporting it is a front-end item; it is not needed for correctness.

### 2.5 Front-end fidelity (prerequisite)

Two changes in WP2:
- **Literal nodes carry their lexical class:** INTEGER (BigInt when beyond 2^53), REAL, TEXT, BLOB, NULL.
- **A `collate` node is preserved** in expressions, ORDER BY and column definitions.

The one renderer (`query-executor-sql-command-rendering.js`) emits exactly those forms. Anything the AST cannot represent is refused at parse time with the existing typed `UNSUPPORTED_SQL_FEATURE`, never dropped.

**Round-trip oracle:** for each corpus statement Q, `render(parse(Q))` executed on one SQLite database must equal Q's result, **including result column names** (rev 2) (oracle layer A). The diagnostic renderer in `distributed-query-planner-expression-renderer.js` is deleted, and its caller consumes the one renderer.

**Interim rules so WP2 lands green before WP3 (rev 2, review #7):**
- **Literal class.** The literal class is an additional field. A literal's JS-visible `value` stays as it is today for numbers within ±2^53, so the JS evaluators that survive until WP3 see no change. Only the renderer reads the class. A BigInt-range literal stays a typed refusal until WP3.
- **COLLATE is a bounded typed refusal.** WP2 accepts `collate` nodes only where SQLite evaluates them today: in the partition SQL of a `SINGLE_PARTITION` statement, or a WHERE conjunct pushed to a fragment. COLLATE in a coordinator-evaluated position (HAVING, multi-partition ORDER BY, residual JOIN predicate, select-list expressions of a multi-partition statement) is the typed refusal `UNSUPPORTED_SQL_FEATURE`. This prevents today's HAVING evaluator from treating an unknown node as `true` (`query-executor-select-aggregation.js:554-555`). WP3 removes the refusal; that is its bound. Rev 3 extends the refusal to every surviving JS consumer of expressions, listed as I1a-I1e in §5.1:
- JOIN `ON` (bound WP3);
- write-key expressions (bound WP4);
- live-query predicates and the live-query renderer fallback (bound WP7).

Key pruning needs no refusal, because WP2 itself lands "an explicit COLLATE in a key predicate disables pruning".
- **FROM-less SELECT (D11).** ORDER BY, LIMIT, OFFSET, GROUP BY, HAVING and DISTINCT are a typed refusal until WP3 evaluates the statement in the merge session.
- **`LIMIT ?` and `OFFSET ?`.** These are a parse error today (`p3`). WP2 admits them as typed parameters.

### 2.6 Typed partial rows and the one wire encoding

**Owner.** `src/query/sql-value-codec.js` (new, the only module that knows the shape):

```text
TypedRowSet = { "v": 1, "columns": ["id","amount",...],        // order + duplicates preserved (.raw() rows)
                "rows": [ ["ir", "42", "2.5"], ["in", "43", null], ... ] }
  row[0] = storage-class string, one char per column: n NULL | i INTEGER | r REAL | t TEXT | b BLOB
  cells:  n -> null
          i -> canonical decimal text, int64 range, no '+', no leading zeros
          r -> ECMAScript Number::toString (shortest round-trip); "-0", "Infinity", "-Infinity"; NaN refused
          t -> JSON string
          b -> canonical base64 (padded); empty BLOB = ""
TypedParams = { "v": 1, "classes": "it", "cells": ["5", "x"] }    // same cell rules
```

**Encode** happens at the producer: the partition read (`safeIntegers(true)`, `.raw(true)`, `.columns()`) fills `remoteQueryAnswer`. **Decode** happens on the coordinator. The same encoded object is used for local and remote delivery, so there is one semantics. Decoding yields BigInt, number, string, Buffer or null. These rebind into SQLite with their storage class intact:
- BigInt binds INTEGER;
- a JS number always binds REAL (CONFIRMED, N14), which is why INTEGER must never decode to a number;
- Buffer binds BLOB.

The decoder is strict: a non-canonical cell, an unknown class or an unknown `v` is a typed refusal (`SQL_VALUE_CODEC_INVALID`). No reviver and no lenient path exist.

**Budget bytes** are counted on encoded cells (deterministic), replacing the `JSON.stringify(rows).length * 2` estimate (`streaming-aggregator.js:205-211`).

**Transport (rev 2: replaces the revision-1 strictness paragraph).** This Quest does **not** change transport serialization. The codec makes rows and params JSON-safe by construction (strings and nulls only), so they survive today's paths unchanged:
- requests go through `encodeDeliveryMessage` (`message-router-delivery-encoding.js:73-105`);
- answers go through `SERVICE_RESPONSE` via `sendRaw` → `JSON.stringify` (`message-router-inbound-dispatch.js:515-527`, `message-router-delivery-behaviors.js:574-578`).

Making the router reject non-JSON data is a separate unit with its own payload census. `p2` shows `remoteQueryAnswer`'s `undefined` fields, `Date`, `toJSON` instances and `Error` would all be refused today.

**Durable hops and command format v2 (rev 4).** This section supersedes the revision-2 bullets ("applied on every voter", "refuses … above the fence", "retirement through snapshot and compaction") and the revision-3 decoder list; their history is in the Revision 2 and 3 sections. The authoritative design record is WP1's census §5 (`sqlmerge-wp1-hop-census.md`). This section states the decisions the design owns.

**Hop list (C5, corrected from the census).**

| Hop | Position | Value-bearing? | WP-D |
| --- | --- | --- | --- |
| Raft proposal (`raft-rs-proposal-codec.js:33-45`, its only encode at `raft-rs-operation-port.js:468-470`): partition `QUERY`/`INSERT`/`UPDATE`/`DELETE`/`UPSERT`, `MIGRATION_ALTER_TABLE`, `PARTICIPANT_PREPARE`, message-group `CDC`/`CDC_BATCH` | raft index | yes | new v2 command types |
| `_participant_transactions.operations_text` (PREPARE; the session itself is **volatile**) | `prepare_index` | yes | v2 `operationsText`, decoded by `prepare_index` |
| `_cdc_obligations.event_json` (CDC row images) | `log_index` | yes | typed images, decoded by `log_index` |
| Split mirror: the live queue is memory only; **only a replay cursor is durable**; replay re-reads the source raft log | source raft index | via the raft log | the live queue holds v2 cells; typed backfill |
| `_partition_statement_outcomes` | `log_index` | **no params or rows**, only `changes` and `last_insert_rowid` (already SQLite INTEGER) | none; read in safeIntegers mode |
| Position-free: pilot cutover `row_json`; GSI backfill cursor; split key in `partition_transition_metadata` | **none** | yes | per-record `format_version` |

**Rules:**
1. **New command types.** v2 is carried only by **new command types**, never by a version field inside an existing type. An old binary fails the apply closed on an unknown type (`committedCommandGate`, `partition-service-entry-apply-base.js:93-110`; message groups `message-group-service-raft-timing.js:200-205`), so it halts rather than misapplies. v2 params inside an existing `QUERY` would reach an old `statement.run(...params)` and fail as a silent per-replica `STATEMENT_FAILED`. The fence entry `COMMAND_FORMAT_FENCE` follows the `PARTICIPANT_GENERATION_ORIGIN` precedent: proposed once, applied insert-once, recorded with index and term in the group's durable state, and kept in snapshot images.
2. **Capability, checked live (G5).**
   - A leader proposes the fence, or any v2 entry, only if every voter **and learner** satisfies *both* conditions:
     - (a) its committed `nodes` row for its **current incarnation** advertises `sql-command-format-v2`;
     - (b) its **live** transport/replication handshake on the current connection advertises the same capability.
   - After F, every R+ replica enforces (b) at the **replication and vote handshake**. It drops append, vote and pre-vote traffic from a peer whose live handshake lacks v2, through the participation gate's inbound filter, which already treats a dropped envelope as a lost message.
   - A voter restarted on an old binary still carries its committed "v2-capable" record, but **cannot** pass (b), so it can neither lead nor vote nor be counted in a quorum.
   - Membership admission (conf change, ADD, REPLACE, promotion) also refuses a target lacking (a) or (b).
   - The apply-time check is therefore an **invariant assertion that cannot be reached**: a pre-v2 entry above F is impossible to commit. If it ever fires, it fails closed as a corrupted-log signal.
3. **One positional decoder.** `decodeCommittedCommand(command, index, groupFence)`:
   - below F, or with no fence yet, v1 rules apply;
   - at F, the fence entry;
   - above F, v2 types only.

   Derived rows are decoded by their recorded position: `operations_text` by `prepare_index`, `event_json` by `log_index`. A pre-F PREPARE decided after F executes with v1 rules on every replica.
4. **Position-free stores.**
   - They get `format_version INTEGER NOT NULL`. A migration sets existing rows to 1 explicitly, a named state, not "absent means v1".
   - After the cluster format epoch, writers write 2 and the write owner refuses version-1 writes.
   - Readers dispatch on the column; any other value is a typed refusal.
5. **Old-format requests (G5).**
   - Write requests (`FORWARD_WRITE`/`executeOnPartition`) carry an **explicit request format field**, `paramsFormat: 2` with TypedParams.
   - A request without the field is the named state `REQUEST_FORMAT_UNDECLARED`. It is never inferred from the params' shape.
   - After F, a leader **refuses** it with the typed *retryable* `COMMAND_FORMAT_FENCE_VIOLATION` `{formatEpoch, fenceIndex}`.
   - An R coordinator treats that refusal as its observation of the epoch, re-encodes **its own original values** through D3, and resends (level-triggered, no timer).
   - The leader keeps one request decoder. No leader-side re-encoding of v1 JSON is done.
6. **v1 retirement (C6; replaces "through snapshot and compaction").** Snapshot and compaction alone cannot retire v1: derived rows with pre-F positions survive inside snapshot images, and today's compaction is leader-only and refuses control-plane partitions (`partition-snapshot-cadence.js`).
   - **Witness.** A durable control-plane witness per raft group, `{groupId, formatEpoch, fenceIndex, per-replica retainedFirstIndex, unsettledPreFenceRows, preFencePositionFreeRows}`, is **complete** only when **all** of these hold:
     - every replica's retained first index is > F;
     - no PREPARED `_participant_transactions` row has `prepare_index < F`, and no undelivered `_cdc_obligations` row has `log_index < F`;
     - **no position-free store holds a `format_version = 1` record** (G5: the same next-release gate covers the per-record-versioned stores).
   - **Compaction.** WP-D supplies compaction for followers and for control-plane and message-group groups, triggered by applying F. A group without that path keeps an incomplete witness.
   - **R+1 start-up.** R+1 refuses to start (`COMMAND_FORMAT_V1_RETAINED`) on any store whose groups' witnesses are incomplete.
   - **R+1 deletions.** R+1 deletes the v1 decoder branch, the v1 command types, the version-1 readers and the capability check.

The fence is an owner-boundary change in `src/raft` and `src/partition`, outside the epic (D2, D14).

**Input typing (rev 2, D3).** Client parameter values map exactly as better-sqlite3 binds them, which is CONFIRMED (`bsq-caps.cjs`, `p4`):

| JS value | Storage class |
| --- | --- |
| BigInt | INTEGER (int64 range; outside it, a typed refusal) |
| number | REAL (an integral number is *also* REAL; NaN refused; ±Infinity allowed) |
| string | TEXT |
| Buffer / Uint8Array | BLOB |
| null | NULL |
| boolean | INTEGER 1/0, as SQLite's own `TRUE`/`FALSE` (rev 4 C2; **rev 5: D15 decided by the owner, 2026-11-18**) |
| undefined, objects, symbols, functions | typed refusal (`SQL_VALUE_UNREPRESENTABLE`) |

Declared column affinity then converts on storage, as in SQLite. PG wire parameters are text and stay TEXT.

**Rev 4 additions to D3:**
- **C1, TEXT must be well-formed UTF-16.** A string with an unpaired surrogate is refused with `SQL_VALUE_UNREPRESENTABLE` (`text_not_well_formed`). It would otherwise bind as invalid UTF-8 and read back as U+FFFD (witnessed by WP1).
- **C8, two refusal codes.** `SQL_VALUE_UNREPRESENTABLE` is an encoder-side refusal of a caller value (the caller's error). `SQL_VALUE_CODEC_INVALID` is a frame defect (the producer's error). The codec is two files, `sql-value-codec.js` and `sql-value-codec-constants.js` (C7).
- **C2, one input typing.** The application facade's `snapshotBindValue` (`application-database-input.js:136-155`) is a second classifier: it maps booleans to 1/0, refuses fractional numbers and BigInt, and maps -0 to 0. Its domain is a **documented public contract** (`architecture/application-database-sessions.md:160-170`). In WP3 the facade adopts D3, admitting BigInt and fractional numbers and keeping `-0`, and the architecture section is updated with it. This is a public contract change, so it is owner decision **D15**. Today a facade boolean `true` becomes JS `1`, which binds **REAL 1.0** (N14), so even the current mapping is not what its contract implies.

**TEXT validity and `-0` (rev 2).** TEXT that is not valid UTF-8 is already replaced by U+FFFD when better-sqlite3 reads it at the partition, before any codec (`p1` §8: `x'ff'` comes back as `EFBFBD`). The codec does not cause this and cannot fix it. It is documented as a binding limitation, and the oracle generator excludes invalid UTF-8. `-0.0` survives in an untyped column and becomes `0` in a REAL column (`p1` §9). The codec's `"-0"` cell keeps it, and the oracle has an explicit `-0` case.

**Client presentation (rev 2: moved to the QueryExecutor result boundary, after a census of the `src` consumers of engine results; the reviewer counts 13).** There is one presentation owner:
- INTEGER becomes a JS number when it is a safe integer; otherwise the result is the typed refusal `INTEGER_PRECISION_UNREPRESENTABLE`, unless the caller requested BigInt (D3);
- REAL, TEXT, BLOB and NULL map to number, string, Buffer and null;
- PG wire renders text from the typed cell.

Internal consumers receive the same presentation. Today precision is lost silently (N15).

**Rev 4 (C3, C4): presentation at every exit.**
- **Consumers.** The census counts **19 live consumers plus the control-plane system-table gateway hub**, not 13 (`sqlmerge-wp1-hop-census.md` §3).
- **Exits.** The boundary has several, so WP3 applies the one presentation function at **each** exit, or moves the caller onto the engine API:
  - `executeSelect`/`executeQuery` results;
  - `executeOnPartition(s)` results, consumed by migration (`migration-coordinator.js:602`), the call-cell batch (`call-cell-batch-executor.js:272-297`), the CDC owner-RPC read (`cdc-integration-service-owner-rpc-read-execution.js:455`), split routing and index DDL;
  - the join-backfill raw QUERY (`node-joining-backfill-merge-and-status.js`), which reads `response.rows` directly and must also **decode**;
  - the 11 partition-direct `partitionService.executeQuery` readers (census §1.6).
- **Migration risk.** A BigInt `row_id` reaching `normalizeInteger` (`migration/migration-coordinator.js:148-152`) falls back to the old cursor, so **the migration backfill never advances**. WP3's receipt includes a migration backfill witness over INTEGER ids.
- **GSI.** The GSI post-processing (`global-index-lifecycle-coordinator.js:186-212`) has no production caller (census §3.3), so WP3 deletes it rather than presenting it.
- **Byte accounting (C9).** WP3 adds a per-row encode-and-measure entry point, so the partition producer keeps refusing at the row that crosses `resultMaxBytes`.

**Rejected alternatives:**
- A transport-wide JSON reviver: tagged objects would be ambiguous with user JSON, and local delivery would still bypass it.
- CBOR or MessagePack: a new dependency plus binary framing for every message type; float-versus-integer typing depends on encoder options.

### 2.7 Column collation and declared affinity: one schema authority

- `formatDerivedColumn` (`table-creation-service-schema-derivation.js:116-128`) records `collation` (`BINARY` default) from the AST.
- The partition DDL renderer `partitionServiceTableSql` (`partition-service-table-bootstrap.js:268-290`) moves to a shared owner, for example `src/query/sql-table-definition.js`. It emits `COLLATE`, and both the partition service and the coordinator merge session use it.
- The coordinator's tables use the same column type and collation text as the partition table, including `normalizeDataType`'s mappings (NUMERIC to REAL and so on), which are what partitions actually have.
- **Column-only projection (rev 2).** The coordinator DDL comes from the same renderer owner but is a *column-only projection*: name, declared type, `COLLATE`. It has no PRIMARY KEY, UNIQUE, CHECK, NOT NULL or DEFAULT. This is because:
  - an `INTEGER PRIMARY KEY` would alias the rowid and conflict with canonical-layout explicit rowids;
  - constraints are already enforced where rows were written.

  Affinity is unaffected, because a declared `INTEGER` column has INTEGER affinity with or without PRIMARY KEY.
- **Declared types (rev 2, D13).** `normalizeDataType` (`table-creation-service-schema-derivation.js:33-63`) is a JS type classifier. It maps NUMERIC/DECIMAL to REAL, BOOLEAN to INTEGER, and DATE/DATETIME/TIMESTAMP to TEXT, which changes SQLite affinity (for example NUMERIC stores `'1.0'` as INTEGER 1; REAL stores 1.0). The recommendation is to record the user's declared type **verbatim** for new tables, so SQLite derives affinity, and to delete `normalizeDataType`. Existing tables keep their recorded types. Oracle family F11 exposes the difference.

**Rev 3: deferred out of this Quest.** Verbatim types would break `normalizePartitionBoundaryKeyType`, the partition-key type map (`partition-boundary-representation.js:28-50`). It returns `null` for `DECIMAL(10,2)`, DATE, TIMESTAMP, BOOLEAN, `VARCHAR(20)` and `UNSIGNED BIG INT`, and maps NUMERIC to REAL even though a NUMERIC key column stores integer, real and text values (`p7` C5, CONFIRMED). In this Quest, `normalizeDataType`'s mapping is the recorded Lagrange DDL contract, asserted by F11. The follow-up quest for the partitioning owner covers declared-type fidelity, with key types derived from SQLite's affinity rules (refuse NONE/NUMERIC-affinity keys, or define a mixed-class key order).
- Existing tables have no recorded collation and BINARY partition columns, which is consistent.
- CREATE TABLE refuses a non-BINARY collation on a partition-key column (2.1E).
- Deleted: the coordinator CREATE TABLE parser, the `sqlite_master` RPC and the affinity annotators (1.3B).

### 2.8 Resource bounds and lifecycle

**`CoordinatorMergeSession`** (new, `src/query/distributed/coordinator-merge-session.js`) is the named owner (R13).

**Lifecycle (rev 2 changes in bold):**
- One `new Database(':memory:')` per distributed statement that needs a merge. `SINGLE_PARTITION` needs none.
- `defaultSafeIntegers(true)`.
- **Tables are created in `main`, not `TEMP`.** The per-query database has no other tables, so nothing needs shadowing.
- **Page bounds on both databases:** `PRAGMA max_page_count` *and* `PRAGMA temp.max_page_count` are set to `floor(MEMORY_LIMIT_BYTES / page_size)` (4096). The `temp` default is 4294967294 and independent of `main` (`p1` §1, CONFIRMED). Exceeding either raises `SQLITE_FULL` (CONFIRMED), which maps to the typed `QUERY_MERGE_MEMORY_EXHAUSTED`.
- **`temp_store` stays at the build default FILE** (`TEMP_STORE=1` in `PRAGMA compile_options`, CONFIRMED). Revision 1 said MEMORY. Sorter and ephemeral structures (DISTINCT, GROUP BY, ORDER BY, automatic indexes) are not page-counted; with FILE they spill to temp files beyond `cache_size`, which the session sets explicitly (default `-16000`, 16 MB), instead of growing in memory. **No native heap cap is available in-process:** the build has `DEFAULT_MEMSTATUS=0`, so `PRAGMA hard_heap_limit` is accepted but not enforced (a 1 MB limit was ignored, `heap-limit.cjs`). Residual: spill files are bounded only by the admitted input size times a constant. This is documented, and WP3 measures it.
- **Explicit rowids in canonical layout.** Rows are inserted with rowid = (partition key-range ordinal, sequence within that partition's answer). This holds whatever order the answers arrive in (`p1` §7), and makes order-dependent SQLite results equal the reference.
- `close()` in `finally` on success, error, cancellation and deadline.
- No pool of databases: state cannot leak between queries, and opening costs ≈ 9 µs (CONFIRMED, measured).

**Where the merge runs (rev 2, D7 and D12).**
- **FRAGMENT_MERGE and PARTIAL_AGGREGATE run on the main thread.**
  - Their work is ingestion plus one sort or group over bounded input.
  - Ingestion is chunked in transactions of at most 1,000 rows with `setImmediate` between chunks. The reviewer measured a maximum synchronous block of 0.7 ms per 1,000-row chunk versus 50 ms for one 100k transaction (`p1` §14).
  - Final sort/group work is measured at 2.9 ms (ORDER BY LIMIT, 100k) and 24 ms (GROUP BY, 100k).
  - `MERGE_INPUT_MAX_ROWS` bounds it.
- **COORDINATOR_EVALUATED runs in a bounded pool of merge child processes** (`child_process.fork`, pool size K per node).
  - Its work is not bounded by input size: the reviewer measured a 400k × 3,000 join blocking for 36 s.
  - better-sqlite3 has no `interrupt()`, the build has `OMIT_PROGRESS_CALLBACK`, and `worker.terminate()` does not stop a running statement (CONFIRMED, `worker-terminate.cjs`: terminate at +200 ms, exit only at +1,673 ms when the statement finished).
  - (Rev 3: the revision-2 claim that the parent forwards frames without decoding them is **wrong**, and the claim is withdrawn.) The router parses whole frames at inbound dispatch (`message-router-inbound-dispatch.js:72`), so a partition answer reaches the parent as objects. `child.send()` re-serializes them: CONFIRMED by `p6`, 12.7 ms per 100k rows and 62.6 ms per 500k. Passing a pre-serialized string blocks just as long (10.4 / 61.6 ms), so pass-through does not help.
  - **Rev 3: the parent forwards in chunks** of ≤10,000 rows per `send()` (about 1.3 ms each), yielding between chunks. The child decodes and ingests each chunk at its canonical positions.
  - The parent **kills the child (SIGKILL)** when the query deadline or `CPU_TIME_LIMIT_MS` expires, answers the typed wall-time or CPU outcome, and respawns the slot. CONFIRMED by `p6`: SIGKILL during a running statement exits in 9.6 ms; spawn-to-ready is 21.7 ms; an idle child is 52.1 MiB RSS.
  - **Memory kill is soft (rev 3).** The parent samples the child's RSS on Linux from `/proc/<pid>/status` and kills it above the session budget plus slack, answering `QUERY_MERGE_MEMORY_EXHAUSTED`. On platforms without `/proc`, including the Windows lab host, there is no RSS kill; that is documented, and only the page bounds and the deadline kill apply. Linux children set a high `oom_score_adj`, so the kernel picks a merge child before the node process.
  - **Spill directory (rev 3).** The child's `SQLITE_TMPDIR` points to a disk-backed directory under the node's data directory, because `TMPDIR` may be tmpfs, which is memory.
  - **Packaging (rev 3).** In single-executable (SEA) builds, `fork(__filename)` is unavailable, so the child entry is a subcommand of the service command router.
  - **Sizing (rev 3).** Per node: K × (52 MiB idle child + main and temp page budget, 2 × `MEMORY_LIMIT_BYTES` + 16 MiB cache + one decoded chunk). The deployment chart sets the pod memory request from this formula.
  - This is the only hard CPU and native-memory bound this binding permits. The alternative in D12, a worker thread, protects the event loop but leaves occupancy bounded only by the query's own work.

**Bounds** come from the one budget owner (`query-budget-constants.js` at `9905a06e2`, UPPER_SNAKE, `normalizeQueryBudget` is the only producer):
- `MEMORY_LIMIT_BYTES` (64 MiB default) bounds merge input bytes and temp-database pages.
- **New field `MERGE_INPUT_MAX_ROWS`** (proposed default 1,000,000) bounds the synchronous SQLite work.
- `RESULT_MAX_ROWS` and `RESULT_MAX_BYTES` bound the client result.
- Breaching any bound is a typed refusal naming the bound. The result is never truncated.

**Per-partition fetch caps (rev 2: adaptive; replaces "full remaining budget per partition", which allowed N × budget in flight).**
1. Each partition's first request carries `floor(remaining / N_outstanding)` rows and bytes. This is today's `partitionBudgetShare` (`query-executor-base.js:15-18`) as a first page only.
2. A partition that answers cap-reached, with the existing typed `query_result_rows_exhausted` or `query_result_bytes_exhausted` (`query-result-budget.js:9-13`), has its partial answer **discarded**.
3. That partition is re-fetched **alone**, after the others are ingested, with the then-remaining budget. Skewed partitions are re-fetched one at a time.
4. Each partition therefore contributes exactly one complete row set, as today. In-flight memory is ≤ `MEMORY_LIMIT_BYTES`, and a skewed partition costs one extra round trip.
5. If the re-fetch hits the cap, the typed refusal names the bound.

Paged cursors were rejected for v1: page-to-page consistency would require holding a partition read transaction open across round trips.

**Streaming versus materialization.** Materialize: GROUP BY and ORDER BY need all partials. Ingest each complete partition answer when it arrives, at its canonical positions, in chunks with `setImmediate` between them. Arrival time does not affect placement (rev 3). Canonical position = (partition key-range ordinal, row index within that partition's key-ordered fragment). Fragments are key-ordered only when the plan is order-dependent; otherwise placement is still deterministic but no scan order is promised. Then drop the JS row set. Peak memory is about SQLite pages plus one answer, versus today's two full JS concatenations. The final `SELECT` streams out through `iterate()`.

**Codec cost (rev 2; reviewer `p4`, re-run by me on 100k rows × 4 columns).** Partition read with `safeIntegers` 63 ms, encode and stringify 53 ms (4.3 MB frame), `JSON.parse` 32 ms in one block, strict decode 28 ms, ingest 61 ms. Large answers therefore cost about 2.4 µs per row end to end. The `JSON.parse` of one large answer is a single unchunkable block on the receiving thread. This is a further reason for the adaptive first page and for the child process doing the decode in COORDINATOR_EVALUATED.

**Node-level concurrency.** A bounded semaphore on concurrent merge sessions bounds aggregate memory. Rev 3 correction: the per-session bound is about **3 × `MEMORY_LIMIT_BYTES` + 16 MiB**, not 1 ×. It is the sum of:
- main pages;
- temp pages;
- in-flight answers (adaptive caps);
- cache.

Total ≈ sessions × that. Rev 2: COORDINATOR_EVALUATED is additionally bounded by the K process slots. Waiters queue under the query deadline (R12: backpressure, not shortcuts). A deadline reached while queued is the existing typed wall-time outcome.

**Measured costs** (CONFIRMED, `bsq-perf.cjs`, niced on a loaded desktop; full merge = open, DDL, insert, ORDER BY LIMIT, GROUP BY, close):

| Rows | Full merge | Insert | ORDER BY+LIMIT | GROUP BY |
| --- | --- | --- | --- | --- |
| 10 | 0.42 ms | | | |
| 1,000 | 0.98 ms | | | |
| 10,000 | 8.8 ms | 6.0 ms | | |
| 100,000 | 79.6 ms | 51 ms | 2.9 ms | 25 ms |

For comparison, today's JS ORDER BY sort of 100k rows took 47 ms, and a virtual table over 100k rows took 36 ms (rejected for semantics, 2.6). Insertion at ≈0.5 µs/row dominates.

### 2.9 Determinism: same engine, provably

1. **Same binary in-process.** Partitions and the merge use the one better-sqlite3 native module in the node process (CONFIRMED: no `db.function`, `db.aggregate`, `db.collation` or extension loading anywhere in `src`, and no semantic PRAGMAs such as `case_sensitive_like` on partition connections).
2. **The build pin is the existing owner.** At startup the session asserts `executionEnvelopeOf(db)` against `TRANSACTION_CLASSIFIER_VETTED_ENGINE` (`partition-transaction-determinism-constants.js:78-82`). A mismatch fails closed, matching the transaction classifier's self-check. `package-lock.json` pins better-sqlite3 11.10.0.
3. **Cross-node (rolling upgrades).** Each `TypedRowSet` answer carries the partition's engine identity: `sqliteVersion`, `sqliteSourceId` and `compileOptionsDigest` only. `classifierListVersion` belongs to the transaction classifier and is not compared (rev 2). The coordinator refuses `QUERY_ENGINE_MISMATCH` when any of the three differs from its own, including a merge child process's own engine. There is no merge across engines and no fallback. Research shows why this matters: SQLite 3.52 changes default REAL-to-text rendering (`SQLITE_DBCONFIG_FP_DIGITS`, [floatingpoint.html](https://www.sqlite.org/floatingpoint.html)).

### 2.10 Write keys through SQLite

The routing key for INSERT, UPDATE and DELETE is the **stored** key value.

1. Evaluate the key expressions in the session: `SELECT <expr1>, <expr2>` with typed params.
2. Insert into a probe temp table declared by the one DDL renderer for the key columns, and read back `(value, typeof)`.
3. Route by the canonical typed key.

Batch uniqueness becomes `INSERT` into a session table declared with the table's UNIQUE column sets, using SQLite's own constraint and collation. This is the one place the coordinator uses the *constraint* projection of the DDL owner rather than the column-only one (rev 2). Write-request params stay in today's representation until WP-D (interim I4). The cross-partition probe keeps SQLite evaluation; its check-then-act race is a finding for the write-coordinator owner and out of scope.

### 2.11 Live-query predicate (decision D8)

Per live-query group, a session-scoped prepared statement:

```sql
SELECT 1 FROM temp."t" WHERE <original where>
```

The temp table holds one row: the CDC row image, decoded by the codec and declared like the base table. This deletes `live-query-service.js:34-260`. It needs CDC row images to be codec-typed. CDC currently uses canonical JSON (PLAUSIBLE that types are lost there too), so WP7 depends on a CDC row-image census. Rev 2:
- CDC row images are a durable hop, so WP7 depends on WP-D's fence.
- WP7 also deletes the second renderer `live-query-sql-renderer.js` and its fallback branches (`live-query-group-helpers.js:199-204`, `live-query-manager.js:105-110`).
- `src/cdc` joins the D2 amendment.

---

## 3. Comparable systems

Every name and quote below comes from a page I fetched; the URLs are given.

- **Citus (direct precedent: the coordinator merge is PostgreSQL).**
  - "The logical & physical planner path creates a combine query, which will run on the coordinator", and "we run the combine query through standard_planner" ([Citus technical README](https://raw.githubusercontent.com/citusdata/citus/main/src/backend/distributed/README.md); built in `CreatePhysicalDistributedPlan`).
  - Worked example: worker `SELECT count(*) AS count FROM public.users_table_102008 …`; combine `SELECT COALESCE((pg_catalog.sum(count))::bigint, '0'::bigint) AS count FROM pg_catalog.citus_extradata_container(…)`. Our `COALESCE(SUM(c),0)` is the same rule.
  - AVG: "injecting a `sum` and `count` … and doing a `sum(sum)/sum(count)` on the master" (`MasterAverageExpression`, [multi_logical_optimizer.c](https://raw.githubusercontent.com/citusdata/citus/main/src/backend/distributed/planner/multi_logical_optimizer.c)).
  - Non-combinable aggregates "pull all rows from the workers and perform the aggregation on the coordinator node" ([reference_sql](https://docs.citusdata.com/en/stable/develop/reference_sql.html)). That is our `COORDINATOR_EVALUATED`.
  - count(distinct) via "select distinct statements on each worker".
  - LIMIT pulls x+y rows (`WorkerLimitCount`); approximation only when enabled.
  - Lesson: the **rewrite rules** are hand-written and need tests; **evaluation** is never duplicated. HLL must exist "on all PostgreSQL instances", which is the same-engine principle applied to extensions.
- **Vitess (counter-example: a second evaluator and its compatibility debt).**
  - "Any piece of SQL that cannot be lowered to be executed in MySQL by the planner is evaluated locally in Go by the engine". The goal is "every single corner case of SQL evaluation to match exactly MySQL's behavior", and they "routinely find bugs in the original MySQL evaluation engine" ([PlanetScale, 2025-03-20](https://planetscale.com/blog/faster-interpreters-in-go-catching-up-with-cpp)).
  - Upkeep: a live-MySQL differential suite (`comparison_test.go` `TestMySQL`, with `normalizeValue` "to mask quirks"), a fuzzer with a `knownErrors` allowlist ([fuzz_test.go](https://raw.githubusercontent.com/vitessio/vitess/main/go/vt/vtgate/evalengine/integration/fuzz_test.go)), and a reimplemented collation library that uses a `remote` package running `mysqld` as the oracle ([pkg.go.dev](https://pkg.go.dev/vitess.io/vitess/go/mysql/collations/remote)). The docs warn that unsupported collations "can lead to unpredictable behavior" ([collations](https://vitess.io/docs/25.0/user-guides/configuration-basic/collations/)).
  - Before that existed, Vitess asked MySQL for `weight_string` sort keys ([PR #3522](https://github.com/vitessio/vitess/pull/3522)), letting the engine own ordering. Our current JS evaluators are this debt without the test programme.
- **CockroachDB DistSQL (one evaluator everywhere).**
  - "FINAL is a single-group aggregator, scheduled on the gateway" ([DistSQL RFC](https://raw.githubusercontent.com/cockroachdb/cockroach/master/docs/RFCS/20160421_distributed_sql.md)).
  - Local plus final stages: AVG's local stage "accumulates the SUM and the COUNT; … a final rendering then divides" ([aggregator_funcs.go](https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/sql/physicalplan/aggregator_funcs.go)), evaluated by the same processors on every node.
  - When CockroachDB added a second engine (vectorized), it immediately needed `TestAggregatorAgainstProcessor` and `TestSorterAgainstProcessor` differential tests ([columnar_operators_test.go](https://raw.githubusercontent.com/cockroachdb/cockroach/master/pkg/sql/distsql/columnar_operators_test.go)).
  - It rejected SQL-to-SQL between nodes as a potential "monster of unmanageable complexity". Our merge is a local rewrite, not node-to-node SQL, but the warning argues for a small, structured rewrite surface.
- **TiDB to TiKV coprocessor (two implementations kept equal by gating plus tests).**
  - Rust `tidb_query_expr` reimplements TiDB's Go functions ([TiKV](https://raw.githubusercontent.com/tikv/tikv/master/components/tidb_query_expr/src/lib.rs)).
  - TiDB pushes only allowlisted functions, with documented parity gaps: "We don't push round with frac due to mysql's round with frac has its special behavior", and Rust LLVM math "have different precision" ([infer_pushdown.go](https://raw.githubusercontent.com/pingcap/tidb/master/pkg/expression/infer_pushdown.go)).
  - A runtime blocklist (`mysql.expr_pushdown_blacklist`) exists for "when you get wrong results due to the expression pushdown" ([docs](https://docs.pingcap.com/tidb/stable/blocklist-control-plan/)).
  - copr-test compares TiDB with TiKV non-vectorized and vectorized over randgen cases in CI ([copr-test](https://raw.githubusercontent.com/tikv/copr-test/master/README.md)).
  - Our review's item 4 (ROUND) is the same parity hole TiDB fences off.

**Conclusion.** Choosing Citus/CockroachDB (one engine) removes the Vitess and TiDB upkeep (allowlists, blocklists, parity exceptions, collation reimplementation). What remains to test is the planner's rewrite table, which is exactly what the oracle targets.

---

## 4. Quest proposal

**Epic.** `release-0-3-queryable-core` (`solve/epics/release-0-3-queryable-core.md`). It authorizes `src/query`, `src/partition`, `src/live-query`, `src/runtime`, `src/index-management`, `architecture`, `test/query`, `test/partition`, `test/live-query`, `test/integration`, `test/shards`, `scripts/checks` and `scripts/quest-evidence`. It does **not** authorize:
- `src/raft` (WP-D durable format and fence);
- `src/cdc` (WP7 CDC row images);
- `src/wasm-service` (the budget field);
- `test/transport`;
- `scripts/check-guideline-*-baseline*.json` (ratchet tightening).

That gap is decision D2. Rev 2: transport strictness (`src/transport`, `src/utils`) is no longer in this Quest.

```json
{
  "schema": "solve-quest/2",
  "id": "coordinator-sqlite-merge",
  "epic": "release-0-3-queryable-core",
  "statement": "Every distributed SQL result is a valid SQLite result for the same statement over the union of the partitions' rows: order-independent results (including result column names) equal SQLite's exactly; where SQLite leaves a choice among tied rows any choice SQLite could make is valid; and values that depend on scan order (integer overflow, compensated REAL sums, MIN/MAX representatives, GROUP_CONCAT order, bare columns) equal SQLite's under the canonical scan order, the base table's logical partition-key order. The coordinator evaluates final projection, aggregate combination, GROUP BY, HAVING, DISTINCT, ORDER BY (collations, NULLs, storage-class order) and LIMIT/OFFSET, cross-partition joins, FROM-less SELECTs and write-key expressions with an in-memory SQLite of the partitions' exact build over typed rows; row values and parameters keep their NULL/INTEGER(int64)/REAL/TEXT/BLOB storage class across every request, answer and durable hop through one codec and one versioned durable command format; column types and collations reach the coordinator from the one catalog schema through the one DDL renderer owner; and no JavaScript SQL evaluator, comparator, renderer duplicate, affinity classifier or CREATE TABLE parser remains outside the classified routing/codec/presentation owners. Merge resources are owned, bounded (page bounds on main and temp, adaptive per-partition caps, a killable process for coordinator-evaluated work) and refused with typed outcomes, never truncated.",
  "doneWhen": {
    "probe": "test-receipt",
    "args": {
      "file": "solve/quests/coordinator-sqlite-merge/evidence/receipt.json",
      "requiredReceipts": [
        "sqlite-differential-oracle-green",
        "expression-domain-witnesses-trim-cast-case",
        "pushdown-soundness-golden-cases",
        "order-dependent-aggregates-exact",
        "guarded-exact-integer-partial",
        "sql-render-round-trip-fidelity",
        "declared-ddl-reference-family",
        "typed-wire-storage-class-round-trip",
        "presentation-at-every-exit",
        "durable-command-format-fence",
        "js-sql-evaluator-census-zero",
        "one-schema-authority-collation",
        "write-key-evaluation-by-sqlite",
        "merge-resource-bounds-typed-refusal",
        "formation-independent-merge",
        "coordinator-evaluated-kill-bound",
        "engine-identity-parity",
        "every-stage-green",
        "interim-refusal-coverage",
        "consumer-and-test-migration",
        "comparative-scenario-a-shapes-unregressed",
        "independent-verification"
      ]
    }
  },
  "constraints": [
    {"id": "owner-decision-2026-11-17", "statement": "Implements the owner decision of 2026-11-17 (SQLite evaluates the merge; delete all JS evaluators/comparators; transport preserves storage classes). It supersedes the detached session's 'no coordinator SQLite connection' exclusion; record that supersession (R09) and the supersession of distributed-select-global-merge-correctness, whose probe pins the deleted combine-spec path."},
    {"id": "one-sql-evaluator", "statement": "SQLite is the only SQL evaluator. JavaScript may parse, plan structural rewrites, route by canonical typed keys, encode/decode values, count budgets and present final values through one owner; it never compares, orders, groups, deduplicates, combines or evaluates SQL values or predicates, and never infers affinity or collation."},
    {"id": "delete-not-disable", "statement": "Every replaced evaluator, comparator, affinity classifier, CREATE TABLE parser, dead merge helper and its pinning tests are deleted in the work package that replaces them, with caller and export closure; no flag, alias, dormant module or unused export survives. Ratchet baselines are tightened, never raised."},
    {"id": "one-typed-wire-encoding", "statement": "Row values and parameters cross every hop, local or remote, in the one TypedRowSet/TypedParams encoding owned by src/query/sql-value-codec.js. No second encoding, no lenient or fallback decoder, no reviver; a non-canonical cell is a typed refusal. Transport-wide serialization strictness is NOT part of this Quest (separate unit with its own payload census); the codec makes rows and params JSON-safe by construction."},
    {"id": "durable-format-fence", "statement": "Every durable hop that carries SQL values (raft proposal codec for partition QUERY/INSERT/UPDATE/DELETE/UPSERT, MIGRATION_ALTER_TABLE, PARTICIPANT_PREPARE and message-group CDC commands; _participant_transactions.operations_text by prepare_index; _cdc_obligations.event_json by log_index; the split mirror via its raft-log replay; and the position-free pilot cutover row_json, GSI backfill cursor and split key) moves to command format v2 carried only by new command types (unknown types fail apply closed), with a COMMAND_FORMAT_FENCE modelled on PARTICIPANT_GENERATION_ORIGIN. The fence and v2 entries are proposed only when every voter and learner advertises the capability both in its committed nodes row for its current incarnation and in its live replication handshake; after F, R+ replicas drop append, vote and pre-vote traffic from peers whose live handshake lacks it, so an old binary restarted with a stale record cannot vote or lead, and the apply-time check for a pre-v2 entry above F is an unreachable invariant assertion. One positional decoder; position-free stores carry format_version (1 set explicitly by migration). Write requests carry an explicit format field; an undeclared format after F is refused with a typed retryable error, never inferred from params shape. v1 is deleted in the next release only when a per-group witness shows every replica's first retained index above F, no unsettled pre-F PREPARED or CDC rows, and no format_version = 1 position-free rows; WP-D supplies follower and control-plane/message-group compaction or those witnesses stay incomplete."},
    {"id": "canonical-layout", "statement": "Result contract (rev 3): (a) order-independent results equal SQLite's exactly; (b) SQLite's choices among tied rows are all valid and the oracle checks key tuples exactly and row provenance; (c) scan-order-dependent values equal SQLite's under the canonical scan order, the base table's logical partition-key order (partition key-range ordinal, key order within the partition). Order-dependent plans (SUM/AVG/TOTAL, GROUP_CONCAT, MIN/MAX outside the INTEGER/REAL/TEXT-with-BINARY allowlist, non-BINARY group keys, bare non-key columns in aggregate queries) are COORDINATOR_EVALUATED with fragments ORDER BY the partition key, evaluated by SQLite, ingested with rowid = canonical position into index-free tables. The oracle's order-dependent reference is built without indexes, rowid = canonical position computed by the oracle from logical key order; it never reads layout from the system under test. No numeric tolerance. Rev 4: (c) means SQLite's evaluation of the original statement text over index-free tables whose rows sit at canonical positions; for order-dependent plans the coordinator statement is the original text apart from table renaming (deterministic pushed conjuncts re-applied, per-row random() not pushed). Order-dependence is the complement of a positive order-independence allowlist (bare columns declared INTEGER/REAL/TEXT with BINARY collation for MIN/MAX, GROUP BY keys, DISTINCT and compound output columns; COUNT forms; joins; UNION ALL and subqueries without LIMIT lacking a total ORDER BY); everything else, including window functions, group_concat/string_agg/json_group_array/json_group_object, SUM/AVG/TOTAL and unknown functions, is order-dependent by default. Rev 6: order-dependent coordinator tables declare the base table's full column set (unshipped columns NULL), matching the reference's declared row width."},
    {"id": "pushdown-soundness", "statement": "Each pushdown (partition LIMIT, DISTINCT, WHERE conjunct, semi-join IN, key pruning, partial aggregation) is admitted only under its recorded soundness condition: FRAGMENT_MERGE and PARTIAL_AGGREGATE require every WHERE conjunct to be pushed, otherwise the statement is COORDINATOR_EVALUATED; a partition LIMIT requires the whole WHERE pushed, no DISTINCT unless DISTINCT is applied over exactly the select list and every ORDER BY term is a function of it, and LIMIT/OFFSET that are integer literals or INTEGER-class typed params only (negative LIMIT: no partition LIMIT; negative OFFSET: zero); per-row non-deterministic functions (random, randomblob) are pushable once on a single table reference, per-statement time ('now', CURRENT_*) is coordinator-only; a pushed conjunct is removed from the coordinator statement; an explicit non-BINARY COLLATE disables key pruning (from WP2) and the semi-join; SUM/AVG/TOTAL are not partial-aggregated in v1; rowid aliases are refused in multi-partition plans. Rev 4: any date/time function call is per-statement time unless every time-value argument is a literal other than 'now'; the partition LIMIT is rendered as SQL (CASE WHEN n < 0 THEN -1 ELSE min(n + max(off, 0), 9223372036854775807) END) so the partition applies MustBeInt; key pruning is disabled by an explicit non-BINARY COLLATE on either side of =, ranges, IN or BETWEEN. Rev 6: date/time calls with a 'localtime' or 'utc' modifier, or any non-literal modifier, are per-statement time (no deployment pins the timezone)."},
    {"id": "every-stage-green", "statement": "Each work package lands its candidate green: no interim dual semantic path. Where a later work package completes a capability, the interim is a typed refusal recorded with its bound (the work package that removes it), never a second implementation: COLLATE in coordinator-evaluated positions, JS hash-join ON, write-key expressions, live-query predicates and the live-query renderer fallback (bounds WP3, WP3, WP4, WP7, WP7); FROM-less clauses (WP3); and params of every statement that enters a durable hop, transaction-session statements included, on today's representation until WP-D. Rev 4: I1a also refuses COLLATE in GROUP BY terms of multi-partition statements and in aggregate arguments, decided in distributed-select-fanout-plan.js."},
    {"id": "no-fallback", "statement": "Plan selection is one decision table with explicit soundness conditions; COORDINATOR_EVALUATED is a defined plan, not a fallback. No path concatenates per-partition answers of a non-decomposable statement, truncates rows, or substitutes a JS result when SQLite is unavailable; unavailability is typed (R07, R11)."},
    {"id": "oracle-red-on-candidate", "statement": "Seal only against a receipt produced by the differential oracle on the actual base candidate showing failing receipts (at least N1-N11, review items 1-9, witnesses W-A, W-B, W-C, LIMIT -1 [OFFSET 2] returning no rows and the 'Sum( amount )' column name reproduce). The order-dependent aggregate cases (SUM/TOTAL/AVG over [1e16, 1.0 | -1e16]; SUM over [MAX | MAX], [MIN | MAX, MAX], [MAX | 1, -1]) are also red on the candidate and must turn green. Cases the candidate answers correctly today and an unsound pushdown would break (DISTINCT a+0 ... ORDER BY a LIMIT 2; DISTINCT a ... ORDER BY b LIMIT 3; AVG over [MAX | MAX]) are golden regression guards that must stay green. The oracle's corpus, seeds and normalization rules are fixed at seal; they may be extended, never relaxed, and no numeric tolerance exists."},
    {"id": "expression-domain-witnesses", "statement": "The Quest reproducer includes the external review's three admitted-expression witnesses as permanent golden cases, each through the real parser, planner and executor against native SQLite, with one and with several partitions, and with the same expression in projection and in predicate: W-A two-argument TRIM(MAX(dept),'x') over 'xxabcxx' = 'abc'; W-B CAST(SUM(amount) AS INTEGER) with SUM 1.9 projects 1 and HAVING CAST(SUM(amount) AS INTEGER) = 1 keeps the row (explicit cast truncates toward zero; never comparison affinity), plus the residual JOIN CAST consumer in a join predicate; W-C CASE WHEN '0' THEN SUM(amount) ELSE 0 END = 0 in projection and HAVING (text '0' is false). One evaluator serves projection, HAVING and residual JOIN; no consumer keeps its own copy."},
    {"id": "one-schema-authority", "statement": "Declared types and collations come only from the catalog schema rendered by the one DDL renderer used by partitions; no coordinator-side CREATE TABLE parsing or sqlite_master lookup. Partition-key columns are BINARY-collated by contract."},
    {"id": "bounded-merge-resources", "statement": "Each merge has one owner (CoordinatorMergeSession), one in-memory database with main tables, max_page_count and temp.max_page_count from MEMORY_LIMIT_BYTES, temp_store left at the build default FILE with an explicit cache_size and SQLITE_TMPDIR on a disk-backed directory, closed on every exit path; adaptive per-partition caps keep in-flight answer memory within MEMORY_LIMIT_BYTES (about 3x MEMORY_LIMIT_BYTES + 16 MiB per session in total); MERGE_INPUT_MAX_ROWS and RESULT_MAX_* from the one normalized query budget; a node concurrency bound with backpressure; typed refusals naming the bound. COORDINATOR_EVALUATED work runs in a bounded pool of merge child processes (child entry via the service command router for SEA builds) fed in chunks of at most 10,000 rows, killed with SIGKILL at the deadline or CPU_TIME_LIMIT_MS; RSS kill is parent-side and soft (Linux /proc only), with a high oom_score_adj on Linux children; FRAGMENT_MERGE and PARTIAL_AGGREGATE run on the main thread with chunked ingestion."},
    {"id": "engine-identity", "statement": "Coordinator, merge child processes and partitions merge only under identical sqliteVersion, sqliteSourceId and compileOptionsDigest from the existing envelope owner (classifierListVersion is not compared); a mismatch is a typed refusal."},
    {"id": "systemic-until-bounded", "statement": "Treat each problem as systematic until evidence proves it local. Read the real producer and all affected consumers, research prior project failures, trace the first causal divergence and record ruled-out causes before repair. Compare related systems through primary sources only where their contracts apply; do not copy an unavailable capability."},
    {"id": "contract-before-edit", "statement": "Before a behavior-changing attempt, record the producer/consumer symbols, owner-defined shape, identity/generation, ordering, absent versus unavailable, durable commit, retained obligations, canonical wake and cleanup. Obtain the existing independent design review before changing the codec, schema or budget owner boundaries."},
    {"id": "proof-and-review-custody", "statement": "Preserve valid existing repairs and establish evidence applicability before reuse. Use the smallest discriminating proof, then the actual affected interaction with safety, progress and resource evidence. Independent verification binds reviewed content, contracts, fixtures, proof machinery and relevant dependencies; implementation approval and execution evidence are separate."},
    {"id": "planning-is-not-acceptance", "statement": "This record is an unsealed proposal until start measures a real red probe. Required receipt IDs are proof obligations, not executed results. Retain original failures; do not fabricate receipts, relax sealed predicates, widen bounds or use the harness to repair product state."},
    {"id": "scope-and-authority", "statement": "Writable scope is the epic's authorizes plus an explicit recorded amendment for src/raft (durable format and fence), src/cdc (CDC row images, only if WP7 stays), src/wasm-service/query-budget-constants.js, test/transport and the navigability baselines; transport-wide serialization strictness is excluded. Without the amendment those items become separate bounded units and the receipts that need them stay open. Boundary: the row-level participant concurrency Quest owns participant transaction semantics, locking reads and staging rules; this Quest changes none of them. WP-D owns the v2 operations_text format, which that Quest consumes. Files under src/partition/partition-participant-transaction-* have one writer at a time, in the order the integration owner records."},
    {"id": "from-less-select", "statement": "A FROM-less SELECT never silently drops a clause: it is evaluated in the merge session over the full rendered statement after partition statement admission plus the coordinator-path refusal of changes(), last_insert_rowid() and total_changes(); until then ORDER BY, LIMIT, OFFSET, GROUP BY, HAVING and DISTINCT on it are a typed refusal."},
    {"id": "result-column-names", "statement": "Result column names are the names SQLite assigns to the admitted statement text (prepared against an empty mirror schema); rewrites alias their outputs with exactly those names."},
    {"id": "capability-regression-recorded", "statement": "The owner decided (2026-11-18) to build the guarded exact integer partial into this Quest. The remaining capability regression is recorded and must be stated in the receipt: REAL or mixed-class SUM/AVG/TOTAL, guard-failing inputs, DISTINCT aggregate forms and other order-dependent plans whose raw key-ordered fragments exceed MERGE_INPUT_MAX_ROWS or MEMORY_LIMIT_BYTES become a typed refusal where the candidate returned a value."},
    {"id": "declared-types-deferred", "statement": "Declared column types stay under normalizeDataType's recorded mapping in this Quest (F11 asserts it); verbatim declared types and SQLite-affinity-derived partition key types are a follow-up for the partitioning owner."},
    {"id": "one-input-typing", "statement": "There is one input typing (D3) for every ingress, including the application facade (owner decision D15, 2026-11-18): BigInt INTEGER, number REAL, string TEXT (well-formed UTF-16 only), Buffer/Uint8Array BLOB, null NULL, boolean INTEGER 1/0, everything else SQL_VALUE_UNREPRESENTABLE; -0 is not normalized. WP3 updates architecture/application-database-sessions.md (Strict public input contract) and the CHANGELOG."},
    {"id": "presentation-at-every-exit", "statement": "The one presentation function is applied at every exit of typed rows (executeSelect/executeQuery, executeOnPartition(s) consumers, the join-backfill raw QUERY, the partition-direct executeQuery readers) or the caller is moved onto the engine API; a migration backfill over INTEGER ids advances under the typed read."},
    {"id": "guarded-exact-integer-partial", "statement": "Plan kind GUARDED_PARTIAL (owner decision 2026-11-18). It applies when one table reference, at least 2 partitions, every conjunct pushable and no per-statement time hold, every SUM/AVG/TOTAL is non-DISTINCT over a deterministic argument, and everything else in the statement is on the order-independence allowlist. Each partition computes, per group, by SQLite: COUNT(e), coalesce(max(typeof(e) NOT IN ('integer','null')),0), total(abs(CAST(e AS REAL))), sum(e >> 32), sum(e & 4294967295) >> 32 and sum(e & 4294967295) & 4294967295. No partition statement raises below 2^31 rows per group per partition; beyond that the result is the typed QUERY_MERGE_PARTIAL_OVERFLOW. The coordinator SQLite computes the named plan outcome GUARD_HELD when sum(nonint)=0 and total(absTotal) < 2^62 for every group. It then combines exactly: SUM = (sum(hi)+sum(lo_carry))*2^32 + sum(lo_low), safe for fewer than 2^30 partitions by the factor-2 margin below 2^63; TOTAL = its REAL value; AVG = CAST(SUM AS REAL)/sum(c); NULL/NULL/0.0 with no inputs. GUARD_FAILED selects the defined transition to COORDINATOR_EVALUATED: never triggered by a phase-1 error or unavailability, phase-1 results fully discarded, and only the named guard outcome selects it."},
    {"id": "formation-independent-merge", "statement": "No coordinator-merge step reads or waits on the formation latch: the merge session is a private in-memory database, the catalog schema is read through the read path the latch allows, the merge child pool spawns lazily and engine identity is local. Multi-partition reads succeed under a held formation latch in every plan kind; WP-D's format-epoch fence is a control-plane write that remains a deferred typed state until formation completes."}
  ],
  "verificationTemplates": ["owner-interaction", "harness-fidelity"]
}
```

### 4.1 The differential oracle as a repository test

**Files:**
- `test/query/sql-semantics-differential-oracle.test.js`: the single oracle (unit class).
- `test/query/sql-semantics-oracle/`:
  - `schema.js`: tables declared **through the real catalog path**, `SQLParser` → `buildSchemaDefinition` → the one DDL renderer, so collation and type handling are under test;
  - `corpus-generator.js`: a seeded generator over a grammar, using a project-local PRNG and no `Math.random`;
  - `normalize.js`;
  - `golden-divergences.json`: frozen minimized regressions, starting with the review's items 1-9, N1-N13 and the external-review witnesses W-A, W-B, W-C (below).
- `scripts/quest-evidence/coordinator-sqlite-merge-receipt.js`: runs the test file and writes `test-receipt/1` with `testFileDigests`. This is the probe's producer; R27 holds because the probe only reads the receipt.

**Production composition** (R19). The oracle runs the real stack:
- `SQLParser`;
- the planner (plan kinds);
- `QueryExecutor`;
- the real partition read owner (`executeAdmittedReadQuery`, exported if needed) on real per-partition SQLite databases;
- the real codec;
- the real merge session, including the merge child process for COORDINATOR_EVALUATED.

Frame fidelity (rev 2, corrected):
- **requests** go through `encodeDeliveryMessage` and the inbound `JSON.parse` (`message-router-inbound-dispatch.js:72`);
- **answers** go through the actual `SERVICE_RESPONSE` path, `sendRaw` → `JSON.stringify` (`message-router-inbound-dispatch.js:515-527`) and its `JSON.parse`, *not* `encodeDeliveryMessage`, which answers never use.

A small companion witness, F10 below, crosses a real `MessageRouter` loopback (fixture precedent: `test/transport/loopback-connection.property.test.js`; PLAUSIBLE reuse).

**Oracle.** The same statement on one SQLite database holding the union of rows, **inserted in canonical layout** (rev 2). The database is created by the same DDL renderer and read with `safeIntegers(true)`. Comparison is at the typed layer (`class` + value) before client presentation, **plus result column names** (rev 2).

**Rev 3: two references, chosen by the planner's order-dependence classification** (the oracle recomputes the classification independently from the AST and catalog facts):
- **Order-independent statements**, contract parts (a) and (b), use the **full reference**: the schema's tables *with* their secondary indexes. Results are compared exactly. Where SQLite leaves a choice among tied rows, the oracle checks ORDER BY key tuples exactly and that every row is drawn from the input.
- **Order-dependent statements**, part (c), use the **canonical reference**: column-only tables *without* indexes. Rows are inserted with rowid = canonical position, which the oracle computes itself from the generated rows' logical partition keys (BINARY key order). The oracle never reads the system under test's layout or partition scan order. Results are compared exactly.

Order-dependent statements are also run against the full reference. When the two references differ (`p7` C1: index-driven MAX vs overflow; `p8`: `real` vs `integer`), that is recorded as proof that the statement really is order-dependent. It is not a failure.

**Layers and families:**
- **A. Round-trip.** `render(parse(Q))` ≡ Q on one database, for every corpus statement.
- **B. Codec properties.** Every storage class, int64 extremes, REAL -0, ±Infinity, ties, unicode TEXT and empty BLOB survive encode, transport frame and decode, both locally and remotely. Non-canonical cells are refused.
- **C. Distributed differential**, families:
  - F1 scalar projection (all applicable core functions);
  - F2 WHERE;
  - F3 ORDER BY: columns, expressions, positional, alias, COLLATE, DESC, mixed classes, with and without LIMIT/OFFSET;
  - F4 DISTINCT;
  - F5 aggregates: the full combine table plus DISTINCT forms, expressions over aggregates, HAVING, ORDER BY aggregate;
  - F6 joins: inner and left, equi and non-equi, residual WHERE, mixed-affinity and mixed-collation keys;
  - F7 coordinator-evaluated: derived tables, CTEs, UNION, window functions, subqueries, `GROUP_CONCAT ORDER BY`;
  - F8 typed parameters;
  - F9 write keys: the partition a row lands in equals the partition `WHERE pk = ?` routes to, and the stored `typeof` matches the oracle;
  - F10 bounds and engine: over-budget refusals typed, never truncated; a database closed on every path; an envelope mismatch refused. Rev 2 adds:
    - `temp.max_page_count` enforced;
    - adaptive caps keeping in-flight ≤ budget under a skewed layout;
    - a COORDINATOR_EVALUATED statement exceeding its deadline is killed, the slot respawned, and the typed outcome returned.
  - **F11 declared-DDL reference (rev 2).** The reference database is built from the user's **declared** `CREATE TABLE` (NUMERIC, DECIMAL(10,2), BOOLEAN, DATE, TIMESTAMP, `VARCHAR(20)`, `UNSIGNED BIG INT`, a bare untyped column), not through `normalizeDataType`. This makes DDL type rewriting visible (D13). Rev 3: D13 is deferred, so F11 asserts the **recorded mapping** as Lagrange's DDL contract. It lists each type whose stored storage classes differ from the declared-DDL reference as an expected, documented difference, and fails on any *unlisted* difference.
  - **F12 pushdown soundness (rev 2).** Fixed golden cases:
    - `DISTINCT a+0 … ORDER BY a LIMIT 2` and `DISTINCT a … ORDER BY b LIMIT 3` (`p1` §5);
    - `LIMIT -1`, `LIMIT -1 OFFSET 2`, `LIMIT 5 OFFSET -2`, `LIMIT ?`/`OFFSET ?` (`p3`, `p1` §6);
    - `random() > 0` and `datetime('now')` conjuncts, which must run once (`p1` §12);
    - a self-join `t a JOIN t b` with different per-alias filters;
    - `rowid` in a multi-partition statement (typed refusal);
    - an explicit `COLLATE NOCASE` in a key predicate and in ON;
    - `Sum( amount )` naming.
    - Rev 3 additions:
      - a coordinator-kept conjunct (`datetime('now')`) with ORDER BY … LIMIT, which must be COORDINATOR_EVALUATED (`p7` C4: [1,3], not [1,7]);
      - the same conjunct with GROUP BY and COUNT, so the partials must not be computed without it;
      - `random() > 0` on a single table, pushed once;
      - `LIMIT ?` bound to REAL `2.0`, to TEXT `'2'` and to BigInt `2n`; only the last pushes a partition LIMIT;
      - `SELECT changes()`, `last_insert_rowid()` and `total_changes()` on the FROM-less and coordinator paths, each a typed refusal.
  - **F13 order-dependent aggregates (rev 2).** `SUM`/`TOTAL`/`AVG` over `[1e16, 1.0 | −1e16]`, `[MAX | MAX]`, `[MIN | MAX, MAX]`, `[MAX | 1, −1]`, `[MAX, 1 | 0.5]`, and `MIN` over `1.0 | 1`, each compared exactly in canonical layout (`p1` §3, §4, §7, §13). Rev 3 additions:
    - `SUM(x) WHERE c > 0` over (MAX, 1, −1) **with an index on `c`** (`p7` C1);
    - `MAX(a)` over `1 | 1.0` **with an index on `a`** (`p8`);
    - `GROUP_CONCAT` with and without an index;
    - `MAX` with a bare non-key column;
    - a NOCASE group key;
    - the same statements on the non-IPK and composite-key tables.

    Each is compared exactly against the canonical reference.
  - **Rev 4 additions to F12 (pushdown and planner rules):**
    - **time-function forms:** `datetime()`, `date('now')`, `strftime('%s')` with no time argument, `julianday(?)` bound to `'now'`, `unixepoch(?)` bound to a literal date, and `datetime('2026-01-01')` (literal, pushable);
    - **partition LIMIT rendered as SQL**, with `LIMIT ?` bound to REAL `2.0`, TEXT `'2'`, `-1`, `9223372036854775807` with OFFSET 1, `'abc'` (an error from the coordinator's original clause) and `2.5`;
    - **key pruning** with `IN`, `BETWEEN`, `k COLLATE NOCASE = ?` and `k = ? COLLATE NOCASE`, none of which may prune;
    - **interim I1a witnesses** (until WP3): `GROUP BY x COLLATE NOCASE`, `MIN(x COLLATE NOCASE)` and `COUNT(DISTINCT x COLLATE NOCASE)` in multi-partition statements, each a typed refusal.
  - **Rev 4 additions to F13 (order-dependent, against the canonical reference):**
    - **join order (`p9`):** `SELECT group_concat(t.id || ':' || u.k) FROM u JOIN t ON t.x = u.v WHERE t.c > 0`, with and without an index;
    - window functions;
    - `json_group_array`, `json_group_object`, `string_agg`;
    - a scalar subquery with first-row semantics, and a derived table with LIMIT but no total ORDER BY;
    - **representatives (gap C):** `GROUP BY a` on an untyped column holding `1` and `1.0`; `SELECT DISTINCT c` on a NOCASE column; `UNION` over an untyped column.

    The oracle recomputes the order-independence classification from its own reading of the AST and catalog. A statement the planner calls order-independent but the oracle does not, or the reverse, fails the family.
  - **Rev 4 additions to the codec layer (B):**
    - a string with an unpaired surrogate is refused with `SQL_VALUE_UNREPRESENTABLE` (`text_not_well_formed`) (C1);
    - D3 input typing for every ingress, including the facade after D15: BigInt, fractional number, `-0`, boolean;
    - `SQL_VALUE_UNREPRESENTABLE` vs `SQL_VALUE_CODEC_INVALID` (C8).
  - **Rev 4 presentation-exit witnesses (C3):**
    - every exit listed in §2.6 returns presented values;
    - a migration backfill over INTEGER ids advances to completion under the typed read;
    - the join-backfill raw QUERY decodes TypedRowSet answers.
  - **F14, guarded exact integer partial (rev 5, owner decision; receipt `guarded-exact-integer-partial`).** Each case runs at one and several partitions, compared exactly against the canonical reference:
    - int64 extremes `[MAX | MAX]`, `[MIN | MAX, MAX]`, `[MAX | 1, −1]` (`p1` §3), where the guard fails and phase 2 must reproduce SQLite, including its overflow error or success;
    - the guard boundary 2^61 + (2^61−1) and 2^61 + 2^61, the first conservatively failing (REAL rounding);
    - mixed classes at the boundary (`1 | 1.5`, TEXT `'7'`, BLOB, `-0.0` REAL);
    - all-NULL and empty groups, where SUM/AVG are NULL and TOTAL is 0.0;
    - many small groups with GROUP BY;
    - `SUM(a*b)` and other expression arguments;
    - a `random()` argument, which is never partial-aggregated;
    - **(rev 6) partial-row fixtures**, inserted as partials because the row counts are ~2^30:
      - one row of −(2^62−2^40) plus 1.5·2^30 rows of −1 → `-4611684920526372864` INTEGER (revision 5's combine gave a REAL);
      - two partitions of (2^31−1) rows of −1 → `-4294967294` (revision 5's coordinator `sum(lo)` raised);
      - P = 2^30−1 partitions at the maximum `lo_low` bound;
      - n_p = 2^31 rows in one group, which must give `QUERY_MERGE_PARTIAL_OVERFLOW`, never a value;
      - the `p10` §2c rounding edge.

    The family asserts that **no partition statement raises** in phase 1. It asserts that the guard's named outcome matches the oracle's own guard computation. It asserts that phase-2 re-execution happens exactly when the guard fails.
- **Grammar parity (rev 2).** A meta-test asserts that every AST node type, operator and function the parser admits has a generator production, so the generator grammar equals the supported grammar. A newly admitted construct without a production fails the oracle file.
- **Required expression-domain witnesses** (receipt `expression-domain-witnesses-trim-cast-case`). These are fixed golden cases, not left to the generator's chance. Each runs in layout 1 and layout ≥2 through the real parser, planner and executor against native SQLite, with the same expression in projection and predicate. Fixture rows: `dept='xxabcxx'`, `amount` 0.9 and 1.0.
  - **W-A:** `SELECT TRIM(MAX(dept),'x') AS v FROM t`, plus `… HAVING TRIM(MAX(dept),'x') = 'abc'`. Expected `'abc'` and one row.
  - **W-B:** `SELECT CAST(SUM(amount) AS INTEGER) AS v FROM t HAVING CAST(SUM(amount) AS INTEGER) = 1`. Expected one row, `v=1`.
  - **W-B-join:** the same explicit cast in a cross-partition JOIN residual predicate. For example `SELECT t.id FROM t JOIN u ON t.id = u.k WHERE CAST(t.amount + u.v AS INTEGER) = 1`, with `u.v` chosen so the sum is 1.9. Expected: the row is kept. This exercises the residual JOIN cast consumer (`residual-predicate-evaluator.js:439-451`) today and `COORDINATOR_EVALUATED` after WP3 (rev 2: the old WP4 is merged into WP3).
  - **W-C:** `SELECT CASE WHEN '0' THEN SUM(amount) ELSE 0 END AS v FROM t`, plus the same expression `= 0` in HAVING. Expected `0` and one row.

  Families F1 and F5 also generate TRIM/LTRIM/RTRIM with character sets, `CAST(<aggregate> AS INTEGER|REAL|TEXT|NUMERIC|BLOB)` with fractional, negative and text inputs, and `CASE WHEN <text|blob|real|NULL>` truth conditions. Every generated expression is emitted in projection, HAVING and (F6) residual JOIN positions, so the three consumers are always compared against one oracle.
- **Schema.** `t(id INTEGER PRIMARY KEY, i INTEGER, r REAL, n NUMERIC, x TEXT, c TEXT COLLATE NOCASE, z TEXT COLLATE RTRIM, b BLOB, a)` plus a join table `u(k INTEGER PRIMARY KEY, tk TEXT COLLATE NOCASE, v)`. Rev 3 additions:
  - **secondary indexes** `t_c ON t(c)`, `t_a ON t(a)`, `t_i ON t(i)`, `u_v ON u(v)`, so index-driven scans occur in the partitions and in the full reference;
  - a **non-IPK keyed table** `w(k TEXT PRIMARY KEY, a, r REAL)`, whose partition rowids are reassigned on split copy;
  - a **composite-key table** `y(k1 INTEGER, k2 TEXT, a, PRIMARY KEY (k1, k2))`.

  Layouts include post-split histories, so non-IPK rowid order differs from key order.
- **Values.** Mixed storage classes in `a` and `v`; int64 min and max; 2^53±1; REAL -0.0 (explicit case in both a REAL and an untyped column, rev 2), 0.9365, 1e308 and halves; `é ß 😀 ｱ`; `''`; NULL; empty and non-empty BLOBs. Invalid UTF-8 TEXT is excluded: it is replaced by U+FFFD at the partition read, before any codec (`p1` §8), and is a documented binding limitation.
- **Layouts.** 1, 2, 3 and 5 partitions, uniform and skewed row distributions.

**Normalization.** These are fixed at seal and may only be tightened. Each one encodes ordering that SQLite leaves unspecified, never a tolerance for drift:
- order compared only where the statement imposes it; tie groups (equal under the term's collation) compared as multisets. Rev 3: this applies only to order-independent statements; order-dependent statements compare exactly against the canonical reference;
- LIMIT cases generated with a total ORDER BY (the PK appended);
- (rev 2) **no numeric tolerance:** REAL SUM, AVG and TOTAL are compared exactly under the canonical layout. The revision-1 1e-12 tolerance is withdrawn;
- GROUP_CONCAT as a multiset of elements. Rev 3: withdrawn. GROUP_CONCAT is order-dependent and compared exactly against the canonical reference;
- group-key representatives under NOCASE or RTRIM compared under that collation. Rev 3: withdrawn. Non-BINARY group keys are order-dependent and compared exactly against the canonical reference;
- arbitrary bare columns not generated except with MIN or MAX;
- errors compared by SQLite error class; a one-sided error is a divergence.

**Runtime.** Unit class: target 2 s per case, tolerated to 20 s (`test/guidelines/harness.md:57-61`). There is one case per layout per family group: about 150 statements × 4 seeds per layout. Measured costs (about 1 ms per small distributed statement in-process, ≈0.3-1 ms merge; PLAUSIBLE extrapolation) give about 3-6 s for the file. Thermal and local discipline apply: the file is a single test file and the soak runs on the lab.

**Seed policy:**
- Four fixed seeds committed in the test (deterministic CI).
- `LAGRANGE_SQL_ORACLE_SEEDS=random:<n>` for exploratory runs, printing every seed used.
- Each discovered divergence is minimized and frozen into `golden-divergences.json`, which is permanent and never removed.
- No retries: a failure prints the seed, statement, layout, delivered SQL and both typed results.
- A long soak (`scripts/quest-evidence/coordinator-sqlite-merge-soak.js`, about 10^5 statements) runs on a lab host as evidence, not in `npm test`.

**Red on the candidate.** On `219c27bfe`/`c7d8a10bf` the golden cases fail for review items 1-9, N1-N12 and W-A, W-B, W-C, the last three at both one and two partitions (CONFIRMED by the probes above; W-B-join is CONFIRMED by code reading). `sqlite-differential-oracle-green`, `expression-domain-witnesses-trim-cast-case` and `sql-render-round-trip-fidelity` are therefore measured red at seal. Rev 2 adds two more red receipts:
- `pushdown-soundness-golden-cases`: `LIMIT -1` and `LIMIT -1 OFFSET 2` return `[]` and `Sum( amount )` is misnamed (`p3`, CONFIRMED);
- `declared-ddl-reference-family`: NUMERIC is mapped to REAL (PLAUSIBLE until measured at seal).

`order-dependent-aggregates-exact` is also red. CONFIRMED on `c7d8a10bf` with `design/vetcheck/f13-candidate.mjs`:

| Case | SQLite | Candidate |
| --- | --- | --- |
| `[1e16, 1.0 \| −1e16]` | `s=1, t=1, a=0.333…` | `s=0, t=1e16, a=0` |
| SUM `[MAX \| MAX]` | integer overflow error | `1.8e19` |
| SUM `[MIN \| MAX, MAX]` | succeeds | participant failure |
| SUM `[MAX \| 1, −1]` | integer overflow error | succeeds |
| AVG `[MAX \| MAX]` | `9.22e18` | `9.22e18` (agrees; a guard) |

The F12 DISTINCT+LIMIT cases are guards, not reproducers: the candidate answers them correctly today, and an unsound pushdown would break them. The lead reported W-A to W-C against `4b0c8ec1d`; the seal receipt must be produced on the actual base candidate at seal time. During the work the test file is expected to be red. Each WP records its oracle-family counts in its attempt, and the per-family divergence count must decrease monotonically. The Quest lands once, when the file is green.

---

## 5. Staged implementation plan

Each work package (WP) is one attempt cycle with its own independent verifier (`note --verification … --verifier subagent:<id>`) and change-proof run. A WP is finished when:
- all pre-existing selected tests are green;
- its own oracle families are green;
- it has deleted what it replaced.

The WPs' file sets are disjoint. Where two WPs need the same file, the later one runs serially behind the earlier.

### 5.1 Revision 2 plan (supersedes the revision-1 table in 5.2)

Review #7 showed that the revision-1 interims were not green:
- WP1 would have put BigInt into live JS evaluators (`groupKeyOf` uses `JSON.stringify`);
- WP3 would have deleted `evaluateExpression` while `nestedLoopJoin` still used it until WP4;
- WP2's `collate` nodes would have been treated as `true` by the HAVING evaluator.

Restructure:
- the read-contract switch moves into WP3, and the old WP3 and WP4 merge;
- every remaining interim is a **typed refusal with a recorded bound**, never a second implementation (constraint `every-stage-green`).

| WP | Content | Owns (writes) | Depends | Parallel with |
| --- | --- | --- | --- | --- |
| **WP0 Oracle and receipt** | test file, generator, normalizer, golden set: W-A, W-B, W-B-join and W-C at one and several partitions; F11 declared DDL; F12 pushdown soundness; F13 order-dependent aggregates; grammar parity. Reference built in canonical layout; answers framed through the real `sendRaw`/`JSON.stringify` path. Plus receipt and soak scripts. Seal (`solve.js start`) against the red receipt. Rev 3 adds:
- the full and canonical references (the oracle computes canonical positions itself);
- secondary indexes, the non-IPK table `w` and the composite-key table `y`;
- post-split layouts;
- the F12 and F13 additions;
- interim-refusal witnesses for I1a-I1e and I2.

Starts now | `test/query/sql-semantics-differential-oracle.test.js`, `test/query/sql-semantics-oracle/**`, `scripts/quest-evidence/coordinator-sqlite-merge-*.js` | none | WP1, WP2 |
| **WP1 Codec library and hop census** (no production switch) | `sql-value-codec.js`: TypedRowSet and TypedParams, a strict decoder, byte accounting, the input-typing table (D3); property tests (layer B). Census of every value-carrying hop: request, answer, raft proposal, split mirror, transaction replay, statement-outcome table, CDC images; plus the 13 consumers of engine results. Design record for command format v2 and its fence | `src/query/sql-value-codec.js` (new), `test/query/sql-value-codec.test.js` (new), quest evidence | none | WP0, WP2 |
| **WP2 Front-end fidelity and schema authority** (rev 3: gate items 5 and 6 closed) | literal class field (JS-visible `value` unchanged); `collate` nodes with the **interim typed refusals I1a-I1e** (table below); `LIMIT ?` and `OFFSET ?` parsed (partition pushdown only for INTEGER-class values, WP3); the FROM-less clause refusal (bound: WP3); one renderer with column names preserved; diagnostic renderer deleted; catalog `collation`; shared DDL renderer owner with full and column-only projections; non-BINARY key-column refusal; **the "explicit COLLATE in a key predicate disables pruning" rule** (rev 3, so no pruning interim exists). Rev 3: **D13 is deferred**, and declared types keep `normalizeDataType`'s recorded mapping | `src/query/sql-parser*.js`, `src/query/query-executor-sql-command-rendering.js`, `src/query/distributed/distributed-query-planner{,-expression-renderer}.js`, `src/query/table-creation-service-schema-derivation.js` (collation only), `src/partition/partition-service-table-bootstrap.js` → `src/query/sql-table-definition.js` (new), `src/query/sql-query-engine-select-execution.js` (FROM-less refusal), `src/query/partition-resolver-key-conditions.js` (pruning rule), and the refusal sites in `query-executor-join-execution.js`, `distributed-write-constraint-helpers.js` and `src/live-query/live-query-{service,group-helpers,manager}.js`. Rev 4 (G6) adds `src/query/distributed/distributed-select-fanout-plan.js` as the I1a refusal site for GROUP BY terms and aggregate arguments; WP3 later rewrites this file, serially after WP2. The pruning rule in `partition-resolver-key-conditions.js` covers `=`, ranges, IN and BETWEEN with COLLATE on either side | WP0 layer A | WP1 |
| **WP3 The atomic switch** (old WP3 + WP4 + WP1's decode switch) | see the list below this table | everything in old WP3 and WP4 below, plus `partition-service-remote-query-methods.js` (answers), `partition-service-write-metrics-base.js`, `query-result-budget.js`, `query-executor-partition-{request-builders,delivery}.js`, `src/query/distributed/coordinator-merge-{session,process}.js` (new), `src/index-management/global-index-lifecycle-coordinator.js`, `src/runtime/sql-query-loop-runtime-module.js` (`sqlLiteral`) | WP1, WP2 | WP-D design review only (code is serial: shared `partition-service-remote-query-methods.js`) |
| **WP4 Write keys by SQLite** (old WP5) | key expression evaluation and affinity probe in the session; batch uniqueness by a table UNIQUE constraint. **Deletes** `extractCoordinatorKeyValue` and the JSON deduplication | `src/query/distributed/distributed-write-constraint-helpers.js`, `src/query/distributed/distributed-write-coordinator.js` | WP3 | WP-D |
| **WP-D Durable command format v2 and fence** (D14; rev 3: gate item 3 closed; **rev 4: §2.6 "Durable hops and command format v2" supersedes this summary**: new command types, live handshake capability check, an explicit request format field, follower and control-plane compaction, and a witness that also covers position-free `format_version = 1` rows) | TypedParams/TypedRowSet cells in every durable hop from the WP1 census. A propose-time v2-capability gate over all voters and learners; a membership and leadership bar on old builds after F; a committed format-epoch fence F with a forced snapshot and compaction; a positional v1/v2 decoder whose post-F v1 branch is an unreachable invariant assertion; per-record versions or a migration-at-F for stores without a log position; re-encoding (D3 input typing) or a typed retryable refusal for post-F old-format requests and mirror resends; next-release v1 deletion gated on the first-retained-index witness (§2.6). **Removes interim I4** | `src/raft/raft-rs-proposal-codec.js` and its callers, the partition write-apply, split-mirror, transaction-replay and statement-outcome owners (exact set from the WP1 census) | WP1, WP3 | WP4 |
| **WP7 Live-query predicate (D8)** | per-group prepared predicate in a session over codec-typed CDC row images. **Deletes** the `live-query-service.js` evaluator, `live-query-sql-renderer.js` and its fallback branches, and migrates tests | `src/live-query/**`, `test/live-query/*`, `src/cdc` row-image producer (D2) | WP3, WP-D | none |
| **WP6 Guard, docs, proof closure** | static census guard with the committed classified inventory; coupled pair `coordinator-sqlite-merge`; shard classes regenerated; baselines tightened; `architecture/query-runtime.md:166-179` rewritten; ratchet witness flipped; Scenario A measurement; final receipt | as in 5.2 | all | none |

**WP3 content:**
- **Merge session.** `CoordinatorMergeSession` with main tables, both page bounds, `temp_store` FILE plus `cache_size`, canonical-layout rowids, adaptive caps, column naming, engine identity, and `MERGE_INPUT_MAX_ROWS` in the budget owner after `9905a06e2`.
- **Merge child-process pool** for COORDINATOR_EVALUATED, with SIGKILL and respawn.
- **Plan table.** The four exclusive kinds and the soundness table.
- **Read contract switch, all at once:**
  - the partition encodes TypedRowSet (`safeIntegers(true)`, `.raw()`, `.columns()`);
  - the coordinator decodes and binds;
  - read request params become TypedParams;
  - presentation moves to the QueryExecutor result boundary.
  - Rev 4 (C3, C9) additions:
    - presentation is applied at **every exit**: `executeSelect`/`executeQuery`, the `executeOnPartition(s)` consumers (migration, call-cell batch, CDC owner-RPC read, split routing, index DDL), the join-backfill raw QUERY (which also decodes) and the 11 partition-direct readers;
    - a migration backfill witness over INTEGER ids;
    - a per-row encode-and-measure entry point;
    - the facade adopts D3 (D15).
- **Join path.** Moves to COORDINATOR_EVALUATED, with one table per reference and the determinism classifier gating pushdown. Pushed conjuncts are removed for order-independent plans; for order-dependent plans the original text is kept (rev 4, G2).
- **Admission.** The coordinator statement passes statement admission.
- **FROM-less SELECT.** Evaluated in the session.
- **GSI post-processing.** Rev 4 (C4): deleted, since it has no production caller.
- **Partition LIMIT.** Rendered as SQL (rev 4, G7).
- **Classification.** The order-independence allowlist (rev 4, G3 and G4).
- **Interims removed:** WP2's COLLATE and FROM-less refusals, and the BigInt-literal refusal.
- **Deleted:**
  - all coordinator JS evaluators: `query-executor-select-aggregation.js` evaluators, `partial-aggregate-combiner.js`, `sql-scalar-functions.js`, `streaming-aggregator.js`;
  - `residual-predicate-evaluator.js`, the JS joins, `LEGACY_WHERE` and residual preparation;
  - the fan-out evaluator tables, the HAVING affinity pre-fetch, the dead helpers and fields;
  - the pinning tests (1.3I).
- **Internal parallelism.** Six sub-writers (rev 5 added 3f) on disjoint files feed one integration and one verification:
  - 3a: session and process pool;
  - 3b: planner and plan table;
  - 3c: join path;
  - 3d: read contract and presentation;
  - 3e: deletions and test migration.
  - **3f (rev 5, owner decision; rev 6: the carry-normalized lo partial and the `GUARDED_PARTIAL` plan kind): the guarded exact integer partial.** It covers the partition partial expressions, the coordinator guard and combine SQL, the `GUARD_HELD`/`GUARD_FAILED` named outcome, and phase-2 re-execution as COORDINATOR_EVALUATED. It reports `QUERY_MERGE_PARTIAL_OVERFLOW` above 2^31 rows per group. It writes within 3b's planner files (`distributed-select-fanout-plan.js`, the merge-SQL rewrite) and 3a's session, coordinated by the WP3 integrator; it is not separately landed. Proof: oracle F14 and receipt `guarded-exact-integer-partial`.
- **Formation independence (rev 5).** No merge step reads or waits on the formation latch. F10 runs every plan kind under a held latch.

**Recorded interims (each a typed refusal or an untouched pre-existing path, with its bound):**

| Interim | Introduced | Removed by |
| --- | --- | --- |
| I1a: COLLATE in coordinator-evaluated positions (HAVING, multi-partition ORDER BY, select-list expressions of a multi-partition statement, residual JOIN predicates) is refused (`UNSUPPORTED_SQL_FEATURE`). **Rev 4 (G6):** also COLLATE in **GROUP BY terms** of a multi-partition statement (today they reach the JS combiner's `JSON.stringify` grouping) and in **aggregate arguments** (`MIN(x COLLATE NOCASE)`, `COUNT(DISTINCT x COLLATE NOCASE)`, any aggregate). The refusal is decided in the plan builder, `distributed-select-fanout-plan.js` | WP2 | WP3 |
| I1b (rev 3): COLLATE in a JOIN `ON` condition, which the JS hash join and nested loop evaluate, is refused | WP2 | WP3 |
| I1c (rev 3): COLLATE in a write-key expression (`extractCoordinatorKeyValue`) is refused | WP2 | WP4 |
| I1d (rev 3): COLLATE in a live-query predicate (`compilePredicate`) is refused | WP2 | WP7 |
| I1e (rev 3): COLLATE reaching the `live-query-sql-renderer` fallback (`live-query-group-helpers.js:199-204`, `live-query-manager.js:105-110`) is refused | WP2 | WP7 |
| (rev 3, no interim) key pruning with an explicit non-BINARY COLLATE: WP2 lands the planner rule "COLLATE disables pruning" directly, so a COLLATE predicate never prunes | none | none |
| I2: ORDER BY, LIMIT, OFFSET, GROUP BY, HAVING and DISTINCT on FROM-less SELECT are refused | WP2 | WP3 |
| I3: BigInt-range literals refused (pre-existing behaviour, kept) | none | WP3 |
| I4 (rev 3, re-keyed): the params of **every statement that enters a durable hop** keep today's representation. That covers writes, every statement in a transaction session (reads included, since session statements are staged and replayed) and split-mirror traffic. Non-durable reads use TypedParams. The pre-existing durable path is untouched, so this adds no new evaluator. Recorded because `one-typed-wire-encoding` holds only after WP-D | WP3 | WP-D |
| I5: the live-query JS predicate and renderer are still present (pre-existing), classified "pending, bound WP7" in the census inventory | none | WP7 |

Critical path: (WP0 ∥ WP1 ∥ WP2) → WP3 → (WP4 ∥ WP-D) → WP7 → WP6.

Each WP's verification records:
- the full pre-existing selected suite, green;
- its own oracle families, green;
- the remaining families' divergence counts, monotonically non-increasing;
- the interim table.

### 5.2 Revision 1 table (superseded by 5.1; kept for history)

| WP | Content | Owns (writes) | Depends | Parallel with |
| --- | --- | --- | --- | --- |
| **WP0 Oracle and receipt** | test file, generator, normalizer, golden set (including W-A, W-B, W-B-join, W-C at one and several partitions), receipt and soak scripts; seal (`solve.js start`) against the red receipt | `test/query/sql-semantics-differential-oracle.test.js`, `test/query/sql-semantics-oracle/**`, `scripts/quest-evidence/coordinator-sqlite-merge-*.js` | none | WP1, WP2 |
| **WP1 Typed codec (stage 1)** | `sql-value-codec.js`; partition read `safeIntegers(true)` + `.raw()` + `.columns()` → TypedRowSet; typed params encode and decode; byte accounting on encoded cells; one client presentation owner (D3); then (with D2 authority) strict transport serialization after a payload census | `src/query/sql-value-codec.js` (new), `src/partition/partition-service-remote-query-methods.js`, `src/partition/partition-service-write-metrics-base.js`, `src/query/query-result-budget.js`, `src/query/query-executor-partition-request-builders.js`, `src/query/query-executor-partition-delivery.js`, `src/query/application-database-result.js`, `src/runtime/pgwire-result-mapper.js`, `src/transport/message-router-delivery-{encoding,behaviors}.js` | WP0 harness for family B | WP2 |
| **WP2 Front-end fidelity and schema authority** | typed literal nodes; `collate` nodes; one renderer emitting both; delete the diagnostic renderer; catalog `collation`; shared DDL renderer used by partitions; refuse non-BINARY collation on partition keys | `src/query/sql-parser*.js`, `src/query/query-executor-sql-command-rendering.js`, `src/query/distributed/distributed-query-planner{,-expression-renderer}.js`, `src/query/table-creation-service-schema-derivation.js`, `src/partition/partition-service-table-bootstrap.js` → `src/query/sql-table-definition.js` (new) | WP0 layer A | WP1 |
| **WP3 Merge session and plan table** | `CoordinatorMergeSession` (lifecycle, pragmas, bounds, concurrency, engine identity); plan kinds `SINGLE_PARTITION`, `FRAGMENT_MERGE`, `PARTIAL_AGGREGATE`; the merge-SQL rewrite; `MERGE_INPUT_MAX_ROWS` in the budget owner. **Deletes** `query-executor-select-aggregation.js` evaluators, `partial-aggregate-combiner.js`, `sql-scalar-functions.js`, `streaming-aggregator.js` and the dead helpers, the fan-out evaluator tables, the HAVING affinity pre-fetch, and the pinning tests (1.3I) | `src/query/distributed/coordinator-merge-session.js` (new), `src/query/distributed/distributed-select-fanout-plan.js`, `src/query/distributed/distributed-merge-engine.js`, `src/query/query-executor-base.js`, `src/query/query-executor-select-aggregation.js` (deleted), `src/query/distributed/partial-aggregate-combiner.js` (deleted), `src/query/sql-scalar-functions.js` (deleted), `src/query/streaming-aggregator.js` (deleted), `src/query/distributed/parallel-query-coordinator.js` (dead fields), `src/wasm-service/query-budget-constants.js` (after `9905a06e2` lands) | WP1, WP2 | none (critical path) |
| **WP4 Joins to COORDINATOR_EVALUATED** | fragments per table, semi-filter soundness condition, original statement on the coordinator; set ops, CTEs, derived tables and window functions through the same kind. **Deletes** `residual-predicate-evaluator.js`, the JS joins, `LEGACY_WHERE` and residual preparation | `src/query/query-executor-join-execution.js`, `src/query/distributed/join-pushdown-plan.js`, `src/query/distributed/residual-predicate-evaluator.js` (deleted) | WP3 | WP5 |
| **WP5 Write keys by SQLite** | key expression evaluation and affinity probe in the session; batch uniqueness by temp-table UNIQUE. **Deletes** `extractCoordinatorKeyValue` and the JSON dedupe | `src/query/distributed/distributed-write-constraint-helpers.js`, `src/query/distributed/distributed-write-coordinator.js` | WP3 (session), WP1 | WP4 |
| **WP6 Guard, docs, proof closure** | static census guard (`scripts/checks/check-coordinator-sql-evaluation-census.js` with a committed classified inventory; a new or unclassified evaluator signature fails); coupled pair `coordinator-sqlite-merge` replaces `coordinator-scalar-semantics`; regenerate shard classes; tighten baselines; rewrite `architecture/query-runtime.md:166-179`; flip the ratchet witness; Scenario A shape measurement; final receipt | `scripts/checks/**`, `test/shards/**`, `architecture/query-runtime.md`, `test/integration/public-consumer-contract-ratchet.integration.test.js`, baselines (D2) | WP3-WP5 (WP7 if D8 includes it) | none |
| **WP7 Live-query predicate (D8)** | per-group prepared predicate in a session over codec-typed CDC row images. **Deletes** the `live-query-service.js` evaluator and migrates its tests | `src/live-query/live-query-service.js`, `src/live-query/live-query-group{,-helpers}.js`, `test/live-query/*` | WP1, WP3; a CDC row-image census | WP4, WP5 |

Revision-1 critical path (superseded): WP0 → (WP1 ∥ WP2) → WP3 → (WP4 ∥ WP5 ∥ WP7) → WP6.

Rev 2: the typed codec is still stage 1 as a *library* (WP1). Its production switch is part of WP3, so no interim exposes BigInt to a surviving JS evaluator. The front-end fidelity work (WP2) runs in parallel because the coordinator SQLite cannot be correct over statements the renderer has already rewritten.

---

## 6. Risks and open decisions

### Risks

| Risk | Assessment | Mitigation |
| --- | --- | --- |
| Materialization cost | +0.3-1 ms per small multi-partition merge; about 80 ms per 100k partial rows (CONFIRMED micro-benchmark). `SINGLE_PARTITION` removes today's JS re-sort entirely | ingestion of each complete answer at canonical positions (rev 3: the revision-1 "ingest on arrival" is stale); LIMIT, DISTINCT and partial pushdowns under their soundness rules; measure in WP6 |
| **Capability regression (rev 3, recorded; rev 5: narrowed by the owner's decision to build the guarded exact integer partial into WP3)**. Integer-class SUM/AVG/TOTAL with Σ\|e\| < 2^62 keep partial aggregation. The residual regression is REAL or mixed-class SUM/AVG/TOTAL, guard-failing inputs, DISTINCT forms and the other order-dependent plans, over budget | Multi-partition SUM/AVG/TOTAL, and every other order-dependent plan (GROUP_CONCAT, MIN/MAX outside the allowlist, non-BINARY group keys, bare columns), now ships raw key-ordered fragments. When those exceed `MERGE_INPUT_MAX_ROWS` or `MEMORY_LIMIT_BYTES`, the result is a **typed refusal** where the candidate returned a value. That value was sometimes wrong (F13 is red on the candidate) but often right | the owner accepts the regression before landing. Follow-up **F-SUM**: a guarded exact integer partial. When all inputs are INTEGER class and Σ over partitions of `TOTAL(abs(x))` < 2^62, no prefix can overflow, so the integer sum is exact and order-independent; otherwise the merge re-plans as COORDINATOR_EVALUATED. It has its own oracle family. A similar guarded follow-up for MIN/MAX and GROUP BY keys outside the allowlist is possible |
| Event-loop blocking (synchronous better-sqlite3 has no interrupt; seed starvation history) | Rev 2. Main-thread kinds block at most about 0.7 ms per 1,000-row ingest chunk plus one bounded sort or group (2.9 ms / 24 ms at 100k, `p1` §14). One large answer's `JSON.parse` is a single block (32 ms at 100k × 4, `p4`). Unbounded COORDINATOR_EVALUATED work (36 s join, `p1` §2) is off the main thread | chunked ingestion; adaptive first-page caps; `MERGE_INPUT_MAX_ROWS`; the merge child-process pool with SIGKILL (D7, D12) |
| Merge child-process pool (rev 2; rev 3 measured by `p6`) | New machinery: spawn (21.7 ms), health, respawn; idle RSS 52.1 MiB per child. IPC re-serializes parsed rows (12.7 ms per 100k, 62.6 ms per 500k; about 180 ms at 64 MiB), so the parent forwards in ≤10k-row chunks. The memory kill is soft (Linux `/proc` only, nothing on the Windows lab host). SEA packaging needs a router subcommand as the child entry. Spill files on tmpfs would count as memory | one owner (`coordinator-merge-process.js`); typed outcomes for kill and respawn; chunked forwarding; parent-side RSS sampling plus `oom_score_adj`; `SQLITE_TMPDIR` on the data disk; sizing formula in §2.8; pool slots count toward node concurrency |
| Comparative benchmark (Scenario A shapes, `tidb-semantic-case-completion-fixture.js:126-494`) | Point and range reads, `ORDER BY order_id [DESC] LIMIT 1`, `GROUP BY order_id ORDER BY order_id`, `COUNT(*)`, and one `COUNT(DISTINCT ol.item_id) … JOIN stock`. New tables start as one full-range partition (PLAUSIBLE, `initial-partition-full-range.property.test.js`), so single-table reads are mostly `SINGLE_PARTITION` (faster: no merge). Rev 2: each partition service holds one table, so the stock-level **JOIN is always `COORDINATOR_EVALUATED`**, even with one partition per table. That is today's equivalent (it always takes the JS join path), now in a merge child process: one extra IPC hop of the fetched fragments plus process scheduling. No Scenario A statement uses SUM or AVG, so moving SUM/AVG/TOTAL to COORDINATOR_EVALUATED does not touch it | receipt `comparative-scenario-a-shapes-unregressed`: semantic gate green plus a latency delta on the lab before and after, reported separately for the stock-level JOIN |
| Presentation change (BigInt or refusal for unsafe integers) | today's silent precision loss becomes visible | D3 default keeps safe integers as numbers |
| SUM/AVG/TOTAL ship raw rows (rev 2; replaces "REAL aggregate tolerance") | analytical SUM, AVG and TOTAL lose partial aggregation in v1, so cost scales with matching rows, bounded by budget | exact by construction under canonical layout; a guarded partial is a later optimization with its own oracle family |
| Durable format change (rev 2) | a raft command format and fence is an owner-boundary change in `src/raft`; mixed-version windows | positional decoder with a committed fence; v1 retired by compaction; WP-D as a child quest if preferred (D14) |
| Transport strictness | rev 2: **out of scope**. The codec keeps rows and params JSON-safe; strictness is a separate unit with its own payload census (`p2`) | separate unit |
| Collation support on existing tables | no recorded collation means BINARY, matching their partition DDL | new tables only; a key-column restriction |
| Rolling upgrade with mixed SQLite builds | merges refused during a mixed window | typed refusal; recorded in operational docs |
| Scope size (systemic) | roughly 8 WPs touching about 30 src files | D9 |

### Open decisions (each with a recommendation)

- **D1 Wire encoding.** Tagged-JSON `TypedRowSet` (recommended) or CBOR/MessagePack. Recommended because it adds no dependency, keeps JSON frames and is exact.
- **D2 Authority for out-of-epic paths (rev 2).** These paths are outside `release-0-3-queryable-core.authorizes`:
  - `src/raft` (WP-D);
  - `src/cdc` (WP7, only if it stays);
  - `src/wasm-service` (budget field);
  - `test/transport` (frame witnesses);
  - the navigability baselines.

  Recommend an explicit scope amendment recorded in the quest log at seal. Transport-wide strictness (`src/transport`, `src/utils`) is **removed** from this Quest and becomes a separate unit.
- **D3 Input typing and integer presentation (rev 2).**
  - **Input.** BigInt → INTEGER, number → REAL (better-sqlite3's rule, CONFIRMED), string → TEXT, Buffer → BLOB, null → NULL; anything else is a typed refusal.
  - **Presentation** happens at the **QueryExecutor result boundary**, applied after a census of the `src` consumers of engine results (the reviewer counts 13): a safe integer becomes a number; an unsafe one becomes the typed refusal `INTEGER_PRECISION_UNREPRESENTABLE`; an opt-in `safeIntegers` returns BigInt everywhere.
  - The alternative, BigInt always, breaks consumers.
  - Rev 4 changes:
    - the TEXT well-formedness refusal (C1) and two refusal codes (C8);
    - booleans → INTEGER 1/0 proposed under D15;
    - the consumer count is 19 live consumers plus the gateway hub (C4), not 13;
    - presentation is applied at **every exit** (C3, §2.6).
- **D15 Facade input contract: DECIDED by the owner on 2026-11-18 (rev 5).** The facade adopts D3: booleans → INTEGER 1/0, BigInt and fractional numbers admitted, `-0` no longer normalized. WP3 updates `architecture/application-database-sessions.md:160-170` and the CHANGELOG. The revision-4 analysis follows for the record.
  **D15 Facade input contract (new, rev 4).** `architecture/application-database-sessions.md:160-170` documents the facade's public bind domain: null, strings, booleans, finite safe numbers with `-0` normalized, and byte arrays; BigInt rejected. Implementation `application-database-input.js:136-155`. One input typing (the owner rule) means the facade adopts D3. Recommendation:
  - (a) D3 maps booleans to INTEGER 1/0, matching SQLite's `TRUE`/`FALSE`. Today the facade's `true` → `1` binds REAL 1.0, so the documented mapping never produced an INTEGER anyway.
  - (b) The facade admits BigInt and fractional numbers and stops normalizing `-0`.
  - (c) WP3 updates the architecture section in the same change.

  The alternative, keeping the facade's narrower *admission* domain (no BigInt, integers only), is acceptable only as an admission restriction layered on D3, with D3's class mapping. It would leave facade callers unable to express INTEGER-class values above 2^53, or any REAL. Because this changes a documented public contract, it needs the owner.
- **D4 COLLATE.** Recommend carrying it end to end (AST, catalog, DDL, merge), with interim I1 until WP3. The alternative is a typed refusal of COLLATE until a follow-up.
- **D5 REAL and integer SUM/AVG/TOTAL (rev 2, changed).** No tolerance. In v1 these run COORDINATOR_EVALUATED over raw rows in canonical layout, which is exact by construction. Revision 1's 1e-12 tolerance and partial combine are withdrawn because of `p1` §3, §4 and §13. A guarded exact partial (an integer no-overflow proof, or a REAL residual as in `p5`) is a later optimization only. Rev 3: the capability regression for over-budget multi-partition SUM/AVG/TOTAL is recorded in the risks table for owner acceptance. The follow-up is named **F-SUM**: all inputs INTEGER class and Σ `TOTAL(abs(x))` < 2^62, otherwise re-plan. **Rev 5: built into this Quest by the owner's decision of 2026-11-18, as WP3 sub-package 3f** (Revision 5 §1, §2.3). The partial carries `c`, a SQLite class check, `total(abs(CAST(e AS REAL)))`, and an exact hi/lo split that never raises; the guard is decided by SQLite. Ordering follows the Revision 3 result contract: canonical scan order = logical partition-key order, with key-ordered fragments.
- **D6 Merge budget (rev 2).** Reuse `MEMORY_LIMIT_BYTES` for pages (main *and* temp) and in-flight answers. Add `MERGE_INPUT_MAX_ROWS` (default 1,000,000) to the one budget owner after `9905a06e2` lands. Per-partition caps are **adaptive**: a first page of `floor(remaining/N)`, then sequential full re-fetch of capped partitions with the remaining budget, so in-flight memory stays ≤ budget. This replaces revision 1's "full remaining budget per partition".
- **D7 Execution placement (rev 2, changed).** FRAGMENT_MERGE and PARTIAL_AGGREGATE run on the main thread with chunked ingestion. COORDINATOR_EVALUATED runs from v1 in a bounded **child-process** pool, killed at the deadline or `CPU_TIME_LIMIT_MS`. The reviewer asked for a terminable worker thread. The evidence shows a worker cannot stop a running statement (`worker-terminate.cjs`), so a process is the minimum that bounds CPU and native memory.
- **D12 Interrupt mechanism (new).** better-sqlite3 11.10 exposes no `interrupt()`, and the bundled SQLite is built with `OMIT_PROGRESS_CALLBACK` and `DEFAULT_MEMSTATUS=0` (CONFIRMED `PRAGMA compile_options`).
  - (a) Child-process kill. **Recommended.**
  - (b) A patched binding exposing `sqlite3_interrupt`. It would also need a SQLite rebuild for heap limits. A fork with a maintenance cost.
  - (c) A worker thread with occupancy bounded only by the query's own work. Rejected under R13.
- **D13 Declared column types (rev 3: deferred out of this Quest).** Revision 2 recommended verbatim declared types. That breaks the partition-key type map (`p7` C5: `null` for `DECIMAL(10,2)`, DATE, TIMESTAMP, BOOLEAN, `VARCHAR(20)` and `UNSIGNED BIG INT`; NUMERIC mapped to REAL although NUMERIC stores integer, real and text values). In this Quest, `normalizeDataType`'s mapping is the recorded Lagrange DDL contract, asserted by F11; this unblocks WP2. The follow-up quest for the partitioning owner covers declared-type fidelity plus partition-key types derived from SQLite affinity (refuse NONE/NUMERIC-affinity keys, or define a mixed-class key order).
- **D14 Durable command format (new).** Recommend running WP-D as a child quest under the same epic: it is an owner-boundary contract in `src/raft` with its own fence proof. This Quest's acceptance then requires the child's receipt (`durable-command-format-fence`). The alternative is to keep it as a WP here under the D2 amendment. Rev 4: the design record is the WP1 census §5, together with the §2.6 rules: new command types, a live handshake capability check, an explicit request format field, and a witness including position-free rows. The census §5.10 open points (v2 type naming, whether every node or only replicas must advertise, follower and control-plane compaction, how the vote filter reads the capability) are for the WP-D review. On the second point, the recommendation is every node, because coordinators send write requests.
- **D8 Live-query predicate.** Recommend including it as WP7, since the architecture already forbids the second predicate semantics, gated on a CDC row-image typing census. The alternative is a separate quest under `generic-live-query-data-plane`, in which case the census guard records it as an owned exception.
- **D9 One quest or several.** Recommend this single acceptance quest with WP attempts and one landing. If the integration owner wants intermediate landings, split WP1 (codec) and WP2 (front end) into child quests with their own receipts, keeping this quest's oracle as the acceptance. Rev 2: WP-D is recommended as a child quest regardless (D14).
- **D10 Partition-key collation.** Recommend BINARY only, refused at CREATE TABLE.
- **D11 FROM-less SELECT (rev 2, changed: in scope).** It silently drops ORDER BY and LIMIT today (`sql-query-engine-select-execution.js:742-745` renders columns only). WP2 refuses those clauses with a typed error (interim I2). WP3 evaluates the full statement in the merge session after statement admission. This removes the partition round trip and the dropped clauses. **Rev 3 correction:** statement admission today refuses `changes()`, `last_insert_rowid()` and `total_changes()` only on writes, so revision 2's claim that admission covers them was false. A **coordinator-path rule** at the admission owner refuses these connection-state functions on every coordinator path: FROM-less SELECT, COORDINATOR_EVALUATED statements and merge SQL. F12 witnesses it.

### Findings routed to other owners (R17, not in scope)

- Cross-partition UNIQUE check-then-act race: `distributed-write-constraint-helpers.js:184-204`.
- GSI `isRowMatchingPk` strict equality: `global-index-read-router.js:298-300`.
- System-table replica union ignores ORDER BY/LIMIT across row sets: `cdc-integration-service-authoritative-read-flow.js:213-237`.
- PG wire DataRow `String(v)` for BLOB and REAL: `pgwire-message-builders.js:186-205`.
- `TYPE_NAME_MAP` as a third type classifier: `partition-boundary-representation.js:28-50`.
- Parser gaps: `SUM(DISTINCT x)`, `1e3`, big integer and hex literals, `NULLS FIRST/LAST`.
- `StreamingAggregator` silent drop (R12). It is deleted by WP3, but the silent-loss class needs a search elsewhere.
- (rev 2) **Transport-wide serialization strictness**, a separate unit for the transport owner. It needs a payload census first: `remoteQueryAnswer`'s `undefined` fields, `Date`, `toJSON` instances, `Error`, and the Buffer rehydration at `debug-metadata-service-value-helpers.js:62-71` (`p2`).
- (rev 2) **better-sqlite3 build limits** for the platform owner: no `interrupt()`, `OMIT_PROGRESS_CALLBACK`, `DEFAULT_MEMSTATUS=0` (heap limits unenforced). These bound what any in-process SQLite work can promise (D12).
- (rev 2) Invalid UTF-8 TEXT is replaced by U+FFFD at every better-sqlite3 read (`p1` §8). This is a binding limitation to document in the supported-contract docs.
- (rev 4, from the WP1 census §6, CONFIRMED by mechanism there) **Live value defects on the write path**, routed to their owners. WP-D fixes the first three; the rest belong to their named owners.
  - **±Infinity and NaN params write NULL on every replica, with no error**, because the raft proposal JSON turns them into `null` (`raft-rs-proposal-codec.js:33-45`).
  - A **Buffer param becomes `{type:'Buffer',data}` in the raft log**, and its bind failure is consumed as `STATEMENT_FAILED`.
  - The **split-mirror live path and restart replay deliver different value forms** for the same delta (`partition-split-routing.js:133-147` vs `partition-mirror-replay-cursor.js:131-150`).
  - The **GSI backfill cursor resumes an INTEGER key as TEXT** (`global-index-backfill-coordinator.js:33-60,343`). Owner: GSI.
  - The **admin WebSocket drops a whole result** when a value cannot be stringified (logged SEND_FAILED; the client gets nothing) (`admin-websocket-message-dispatch-methods.js:429-450`). Owner: admin.
  - **The engine never returns `lastInsertRowid`.** `remoteQueryAnswer` and the result builder drop it (`partition-service-remote-query-methods.js:143-165`, `query-executor-partition-request-builders.js:150-169`). Owner: the query result owner. WP3's presentation decides whether it is a contract.
