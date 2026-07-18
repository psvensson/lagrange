# Solve report: formation-background-release-owner-closure

**Goal:** The unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on one fresh run, and the production background priority-spread handoff remains closed across transitive and invalid readiness-owner rebinds until at least the existing 60000ms admission interval plus 10000ms observation handoff, while priority partitions remain exempt.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-priority-spread-authoritative-publication-closure
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-background-release-owner-closure-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-background-release-owner-closure-main
- No longer current: post-terminal observation projection as the sole budget-closing mechanism

## Continuation
- Status: allowed
- Next action: continue supervised step for formation-background-release-owner-closure-main
- Blocker: none

## Scope Pressure
- Changed files: 5
- Change bytes: 26438
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 4 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **formation-background-release-owner-closure-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **formation-background-release-owner-closure-main**: inherited from formation-priority-spread-authoritative-publication-closure: The final priority operation work terminalizes before the clean placement observation, but the seed continues to report status_syncing for sql_transaction_participants and sql_transactions until 01:35:17.557Z and first enters stabilizing at 01:35:18.146Z. Projecting terminal operations into admission observation could recover only the post-terminal visibility lag and cannot supply the roughly 39,186ms still missing from the sealed 60,000ms window; the safe lever is to execute the unavoidable priority placement work before public all-ACTIVE visibility. (rules out: post-terminal observation projection as the sole budget-closing mechanism) [data/examples/service-data-affinity-demo/node-0.log]
- **formation-background-release-owner-closure-main**: The parent symptom reproduces on the successor's HEAD baseline: after priority topology reached zero spread gap and no missing leaders, the ordinary 60000ms background release clock created four nonpriority REPLACEs before the stricter schema-admission candidate could be observed mature. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json]
- **formation-background-release-owner-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-18T02:43:46.685Z | formation-background-release-owner-closure-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/formation-background-release-owner-closure/attempt-1.diff |
