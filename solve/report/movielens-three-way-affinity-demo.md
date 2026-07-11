# Solve report: movielens-three-way-affinity-demo

**Goal:** One newcomer-facing MovieLens example replaces the callback and affinity-toggle demos with a single command and report comparing the same confidence-adjusted ranking through PostgreSQL grouped SQL, Lagrange distributed grouped SQL, and an always-data-affine replicated Lagrange service. Placement affinity engages whenever fresh service access evidence exists independently of read_locality; the service learns and reports its data-optimal placement without a public disable switch. All three paths emit identical ranked results, comparable steady-state transfer/latency metrics, explicit caveats, and the obsolete callback demo and orchestration are removed after their reusable dataset, loader, PostgreSQL, and cluster helpers move under the surviving example.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- parent quest: service-data-affinity-parallel-reduce-demo-live
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-three-way-affinity-demo-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for movielens-three-way-affinity-demo-main

## Continuation
- Status: blocked-theory
- Next action: record and select frontier theory for movielens-three-way-affinity-demo-main with npm run model:contracts as discriminator
- Blocker: frontier theory required for movielens-three-way-affinity-demo-main

## Scope Pressure
- Changed files: 6
- Change bytes: 71396
- Owner areas: examples, src/rebalancer, src/runtime, test/rebalancer
- Categories: other, runtime
- Action: land or separate 4 owner areas: examples, src/rebalancer, src/runtime, test/rebalancer
- Split plan:
  - examples: 3 file(s)
  - src/rebalancer: 1 file(s)
  - src/runtime: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-three-way-affinity-demo-main** [open] rung 2, attempts 2, metric 1 -> 1

## Findings
- **movielens-three-way-affinity-demo-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-11T19-31-44-570Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-11T19-31-44-570Z.report.json]
- **movielens-three-way-affinity-demo-main**: Independent verifier approved always-on affinity, shared confidence-adjusted ranking with movie-id tie-breaking, and unified demo wiring; live success remains unproven. [subagent:/root/affinity_parallel_reduce_verify]
- **movielens-three-way-affinity-demo-main**: The sealed live completion symptom still reproduces on HEAD: the second operation-ledger spread is not planned, so the three-way live proof remains incomplete. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-11T19-31-44-570Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T19:38:52.670Z | movielens-three-way-affinity-demo-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-three-way-affinity-demo/attempt-1.diff |
| 2026-07-11T19:47:29.603Z | movielens-three-way-affinity-demo-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-three-way-affinity-demo/attempt-2.diff |
