# Solve report: service-affinity-demo-report-evidence

**Goal:** The service/data-affinity example is a five-node single-zone any-versus-same_group A/B that reports production-weighted locality, explicit current slot owners, partial/result freshness and bounds, exact top-10 correctness, and centralized rows versus bounded merge candidates without a multi-zone dependency.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json

**Attempts:** 1

## Links
- parent quest: service-data-affinity-parallel-reduce-demo-live
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 3
- Change bytes: 40135
- Owner areas: examples
- Categories: other
- Split plan:
  - examples: 3 file(s)
- Signals: none

## Frontiers
- **service-affinity-demo-report-evidence-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **service-affinity-demo-report-evidence-main**: Three consecutive current-HEAD runs of the shared deterministic affinity scenario passed all four guard files and 202 assertions. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-21-00-853Z.report.json]
- **service-affinity-demo-report-evidence-main**: Independent verifier approved the complete single-zone parallel-reduce vertical slice, including this bounded owner package, after reproducing the 202-assertion guard and adversarially checking identity, leases, snapshots, chronology, attribution, lifecycle failure, and report semantics. [subagent:/root/affinity_parallel_reduce_verify]
- **service-affinity-demo-report-evidence-main**: Post-attempt verifier approval applies to the exact example/report package: both phases emit live owners, timestamps, boundedness, current-identity, correctness, and weighted-optimum evidence without multi-zone dependence. [subagent:/root/affinity_parallel_reduce_verify]
- **service-affinity-demo-report-evidence-main**: Ingested evidence from service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-data-affinity-parallel-reduce-demo-2026-07-11T17-37-54-287Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T17:30:46.696Z | service-affinity-demo-report-evidence-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-affinity-demo-report-evidence/attempt-1.diff.json |
