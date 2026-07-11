# Solve report: service-parallel-reduce-runtime-protocol

**Goal:** The generic SQL query-loop runtime supports exact cross-replica top-N reduction through stable leased slots, disjoint shard SQL, fresh bounded atomic partial snapshots, and an atomic coordinator result snapshot; failed runtime starts never project ACTIVE, and deterministic tests exercise replacement takeover and stale-release fencing through real SQLite.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json

**Attempts:** 1

## Links
- parent quest: service-data-affinity-parallel-reduce-demo-live
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 7
- Change bytes: 55254
- Owner areas: src/runtime, test/runtime
- Categories: runtime, test
- Split plan:
  - src/runtime: 4 file(s)
  - test/runtime: 3 file(s)
- Signals: none

## Frontiers
- **service-parallel-reduce-runtime-protocol-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **service-parallel-reduce-runtime-protocol-main**: Three consecutive current-HEAD runs of the shared deterministic affinity scenario passed all four guard files and 202 assertions. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json]
- **service-parallel-reduce-runtime-protocol-main**: Independent verifier approved the complete single-zone parallel-reduce vertical slice, including this bounded owner package, after reproducing the 202-assertion guard and adversarially checking identity, leases, snapshots, chronology, attribution, lifecycle failure, and report semantics. [subagent:/root/affinity_parallel_reduce_verify]
- **service-parallel-reduce-runtime-protocol-main**: Post-attempt independent verifier approval applies to the exact unchanged runtime/test package: stable CAS leases, strict snapshots, exact merge, lifecycle failure projection, real-SQL takeover, and stale-release fencing passed the 202-assertion scenario. [subagent:/root/affinity_parallel_reduce_verify]
- **service-parallel-reduce-runtime-protocol-main**: Ingested evidence from service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T17:29:54.730Z | service-parallel-reduce-runtime-protocol-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-parallel-reduce-runtime-protocol/attempt-1.diff.json |
