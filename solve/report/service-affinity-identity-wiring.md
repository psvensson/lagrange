# Solve report: service-affinity-identity-wiring

**Goal:** Placed runtime-service replica descriptors preserve their canonical base-service identity so lifecycle query executors attribute workload access to the service across replacement generations, with adjacent node-handler coverage.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json

**Attempts:** 1

## Links
- parent quest: service-data-affinity-parallel-reduce-demo-live
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 2
- Change bytes: 1443
- Owner areas: src/node, test/node
- Categories: runtime
- Split plan:
  - src/node: 1 file(s)
  - test/node: 1 file(s)
- Signals: none

## Frontiers
- **service-affinity-identity-wiring-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **service-affinity-identity-wiring-main**: Three consecutive current-HEAD runs of the shared deterministic affinity scenario passed all four guard files and 202 assertions. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json]
- **service-affinity-identity-wiring-main**: Independent verifier approved the complete single-zone parallel-reduce vertical slice, including this bounded owner package, after reproducing the 202-assertion guard and adversarially checking identity, leases, snapshots, chronology, attribution, lifecycle failure, and report semantics. [subagent:/root/affinity_parallel_reduce_verify]
- **service-affinity-identity-wiring-main**: Post-attempt verifier approval applies to the exact canonical-identity descriptor package; the unchanged 202-assertion scenario joins placed generation identities to base-service attribution. [subagent:/root/affinity_parallel_reduce_verify]
- **service-affinity-identity-wiring-main**: Ingested evidence from service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T17:30:15.275Z | service-affinity-identity-wiring-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-affinity-identity-wiring/attempt-1.diff |
