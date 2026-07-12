# Solve report: cross-partition-join-pushdown

**Goal:** Cross-partition JOIN execution pushes the join table's own WHERE sub-predicates, the required column projection, and a join-key filter into the per-partition join-table SQL instead of fetching SELECT * with no filter; the cosmetic BROADCAST/REPARTITION strategy split is either realized as genuinely different execution or collapsed to one honest strategy; guard tests prove reduced join-table row transfer and unchanged join results against real per-partition SQL execution.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/cross-partition-join-pushdown-2026-07-12T15-18-23-537Z.report.json

**Attempts:** 1

## Scope Pressure
- Changed files: 9
- Change bytes: 73607
- Owner areas: scripts/run-cross-partition-join-pushdown-scenarios.js, src/query, test/query
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-cross-partition-join-pushdown-scenarios.js, src/query, test/query
- Split plan:
  - src/query: 6 file(s)
  - test/query: 2 file(s)
  - scripts/run-cross-partition-join-pushdown-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **cross-partition-join-pushdown-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **cross-partition-join-pushdown-main**: Subagent verifier approved after two adversarial rounds (final verdict APPROVE): round-1 blocking defect (residual WHERE evaluated with JS null semantics, keeping rows SQLite filters) fixed via a dedicated SQL three-valued-logic residual evaluator, verified value-correct on the original repros plus 14 fresh NULL edges against a single-DB oracle; IN-with-subquery misclassification fixed to legacy fallback; pushdown proven by delivered-SQL assertions and row-transfer reduction [subagent:a4ad4d19fdac5fc5d]
- **cross-partition-join-pushdown-main**: Pre-existing defects surfaced but out of scope, recorded for follow-up: (P1) sql-parser-expression-methods.js:269-271 converts IN-list column refs to NULL literals via convertValue, so 'x IN (col)' silently becomes 'x IN (NULL)'; (P2) :301-310 collapses 'IS <value>' to IS NULL, dropping the operand; also pre-existing: DISTINCT-over-join dedupes on full fetched row, HAVING aggregate recompute broken on join path, join rows carry all fetched columns; empty-left INNER skip intentionally no longer contacts join-table partitions (their failures no longer surface on such queries)

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-12T15:18:33.305Z | cross-partition-join-pushdown-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/cross-partition-join-pushdown/attempt-1.diff |
