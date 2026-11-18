---
audience: evidence
recorded: 2026-11-18
---

# Coordinator SQL semantics review (2026-11-17, composed candidate 219c27bfe)

Independent reviewer. A differential harness (`buildCluster` setup copied from `distributed-select-global-merge-correctness.test.js`, with a real QueryExecutor, fan-out and SQLite partitions) plus a fuzzer compared the coordinator against better-sqlite3's SQLite 3.49.2, which is the engine Lagrange uses (`partition-transaction-determinism-constants.js:79`). Scripts: `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/e2e.mjs`, `e2e-run1.mjs` … `e2e-run6.mjs`, `fuzz1.mjs` … `fuzz4.mjs`. Running with `W=<dir>/base` uses the base export.

All items below are CONFIRMED.

1. **NULL ordering.** Distributed ORDER BY puts NULLs last on ASC; SQLite puts them first (`src/query/query-executor-select-aggregation.js:251-256`). As a result, `ORDER BY x LIMIT 1` returns different rows depending on the partition count.
2. **Collation.** The binary comparator (`:262`) ignores column collation (COLLATE NOCASE) and ignores explicit `ORDER BY x COLLATE NOCASE`.
3. **Mixed types.** The comparator does not follow SQLite's storage-class order and is not a total order: number vs text falls back to JS coercion, and BLOB vs BLOB compares through string coercion. A storage-class comparator already exists in `residual-predicate-evaluator.js:244-275`, so there are now two comparators.
4. **ROUND.** `sqlRound` (`src/query/sql-scalar-functions.js:149`, `toFixed`) is not SQLite's rounding: 686 mismatches per 1.2M random cases. Example: `ROUND(0.9365,3)` gives 0.937 in SQLite and 0.936 on the coordinator.
5. **UTF-16 string order.** String comparisons elsewhere still use UTF-16 code-unit order: global MIN/MAX (`partial-aggregate-combiner.js:85-95, 152-155`; `query-executor-select-aggregation.js:227, 230`) and HAVING comparisons (`residual-predicate-evaluator.js:274`).
6. **REAL arguments.** LENGTH/SUBSTR over REAL results are wrong, because storage class is lost (`LENGTH(AVG(x))`).
7. **Three hand-written scalar evaluators:** `partial-aggregate-combiner.js:407-452`, `query-executor-select-aggregation.js:588-620`, and write keys in `distributed-write-constraint-helpers.js:88-108`. They disagree with each other and with SQLite:
   - NULLIF, CASE and CAST differ between the evaluators.
   - `UPPER('é')`, `UPPER('ß')`, `TRIM('\tx\t')` and `ABS('abc')` differ from SQLite.
   - Unknown functions return NULL.
8. **Transport loses types.** Remote delivery uses `JSON.stringify` (`message-router-delivery-behaviors.js:266`) and `JSON.parse` with no reviver (`message-router-inbound-dispatch.js:72`). A Buffer becomes `{type:'Buffer',data:[…]}`; BigInt cannot be serialized; REAL 2.0 and INTEGER 2 become indistinguishable.
9. **ORDER BY over aggregates.** `ORDER BY SUM(x)` / `ORDER BY MAX(x)` are silently not applied on the partial-aggregate path (`applyOrderBy` :713 keys on `clause.expression?.column`). Ordering by an alias works.

**Clean:** SUBSTR/LENGTH over non-REAL inputs (65k typed cases with zero mismatches), ROUND on non-tie inputs, and budget conflict detection.

**Owner decision (2026-11-17):** the coordinator evaluates the final projection, HAVING, ORDER BY and LIMIT with an in-memory SQLite over typed partial rows, so the same engine as the partitions does the work (Citus's approach with PostgreSQL). All JavaScript SQL evaluators and comparators are deleted, and the transport preserves storage classes. This overrides the detached session's earlier exclusion of a "coordinator SQLite connection".
