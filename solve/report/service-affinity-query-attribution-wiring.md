# Solve report: service-affinity-query-attribution-wiring

**Goal:** The SQL engine exposes normal-session internal execution for parallel-reduce coordination without issuing-service attribution, while workload SQL remains service-attributed; the affinity guard scenario registers every adjacent lifecycle, node, and real-SQL proof.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json

**Attempts:** 1

## Links
- parent quest: service-data-affinity-parallel-reduce-demo-live
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 2
- Change bytes: 3038
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/query
- Categories: other, runtime
- Split plan:
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - src/query: 1 file(s)
- Signals: none

## Frontiers
- **service-affinity-query-attribution-wiring-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **service-affinity-query-attribution-wiring-main**: Three consecutive current-HEAD runs of the shared deterministic affinity scenario passed all four guard files and 202 assertions. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json]
- **service-affinity-query-attribution-wiring-main**: Independent verifier approved the complete single-zone parallel-reduce vertical slice, including this bounded owner package, after reproducing the 202-assertion guard and adversarially checking identity, leases, snapshots, chronology, attribution, lifecycle failure, and report semantics. [subagent:/root/affinity_parallel_reduce_verify]
- **service-affinity-query-attribution-wiring-main**: Post-attempt verifier approval applies to the exact query/scenario package: workload SQL remains attributed, coordination SQL is un-attributed without bypassing normal sessions, and all four guard files execute. [subagent:/root/affinity_parallel_reduce_verify]
- **service-affinity-query-attribution-wiring-main**: Ingested evidence from service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T17:30:31.084Z | service-affinity-query-attribution-wiring-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-affinity-query-attribution-wiring/attempt-1.diff |
