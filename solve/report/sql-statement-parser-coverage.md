# Solve report: sql-statement-parser-coverage

**Goal:** Every SQL statement variant the write path emits (plain INSERT, INSERT OR REPLACE, INSERT OR IGNORE — the variant set that grew with replica-operation-insert-retry-idempotency) is pinned against every SQL-text parser seam in one coverage matrix guard (test/partition/sql-statement-parser-coverage-matrix.test.js): parameterized extraction (partition-cdc-parameterized-sql extractParamInsertData; partition-sql-parser extractDataFromParameterizedSQL), literal-values extraction (extractInsertDataFromSQL), CDC operation classification (partition-cdc-generator determineOperation — OR IGNORE documented as INSERT: collision re-emits the durable fetched row and subscriber apply is HLC-guarded upsert), table-name extraction (cdc-sql-builder, cdc-routed-mutation-readiness), and sqlite-store operation prefix patterns — so introducing a statement variant (or parser seam) without covering the cross-product fails statically instead of emitting '?'-placeholder garbage rows in a live cluster (affinity-demo run-18 witness, 3712 errors).

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/sql-statement-parser-coverage-2026-07-04T13-09-09-574Z.report.json

**Attempts:** 1

## Links
- parent quest: replica-operation-insert-retry-idempotency

## Current Blocker
- Frontier: sql-statement-parser-coverage-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for sql-statement-parser-coverage-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: scripts/run-sql-parser-coverage-scenarios.js, test/partition
- Categories: other, test
- Split plan:
  - scripts/run-sql-parser-coverage-scenarios.js: 1 file(s)
  - test/partition: 1 file(s)
- Signals: none

## Frontiers
- **sql-statement-parser-coverage-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
_(none recorded)_

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-04T13:09:23.597Z | sql-statement-parser-coverage-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/sql-statement-parser-coverage/fix.diff |
