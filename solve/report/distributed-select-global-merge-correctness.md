# Solve report: distributed-select-global-merge-correctness

**Goal:** Distributed user-table SELECTs return globally correct results for aggregates (COUNT/SUM/AVG/MIN/MAX including DISTINCT and aliases), GROUP BY/HAVING, and LIMIT/OFFSET across any partition count: the fan-out SQL emits combinable partials (AVG as SUM+COUNT pair; LIMIT count+offset OFFSET 0) under deterministic aliases, the merge engine combines partials and applies OFFSET exactly once globally, and the guard suite proves correctness against real per-partition SQLite execution of the delivered SQL instead of a raw-row mock router.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/distributed-select-global-merge-correctness-2026-07-12T14-06-37-245Z.report.json

**Attempts:** 1

## Scope Pressure
- Changed files: 8
- Change bytes: 59170
- Owner areas: scripts/run-distributed-select-merge-scenarios.js, src/query, test/query
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-distributed-select-merge-scenarios.js, src/query, test/query
- Split plan:
  - src/query: 4 file(s)
  - test/query: 3 file(s)
  - scripts/run-distributed-select-merge-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **distributed-select-global-merge-correctness-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **distributed-select-global-merge-correctness-main**: Subagent verifier approved source changes against Quest intent, system guidelines, and doctrine after three adversarial rounds: round-1 defects (nested-aggregate expressions returning one partition's partial; SELECT * with aggregates hard-failing) and round-2 defects (literal-gate violation; operator-gap silent NULLs; integer-division affinity) all fixed and re-verified against a same-SQL single-DB SQLite oracle; guard 45/45, query dir 136/136, literal audit 0 new, complexity ratchet OK [subagent:ada5fedf225a880b9]
- **distributed-select-global-merge-correctness-main**: Known limitations outside the sealed scope, all legacy-equivalent: aggregate expressions using operators beyond arithmetic/comparison (AND/OR, string concat, IS NULL, NOT) fall back to legacy RAW_ROWS behavior by design; COUNT(x) and COUNT(DISTINCT x) in one query collide on havingKey under HAVING (canonicalAggregateName ignores distinct, pre-existing); ORDER BY on a non-selected aggregate stays arbitrary (applyOrderBy is column-ref-only, pre-existing)
- **distributed-select-global-merge-correctness-main**: Subagent verifier approved the final source diff (attempt-2, identical content to verified attempt-1 artifact) against Quest intent, system guidelines, and doctrine after three adversarial rounds with a same-SQL single-DB SQLite oracle; final verdict APPROVE with zero open defects [subagent:ada5fedf225a880b9]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-12T14:06:37.293Z | distributed-select-global-merge-correctness-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/distributed-select-global-merge-correctness/attempt-2.diff |
