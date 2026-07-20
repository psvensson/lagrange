# Solve report: formation-background-release-owner-closure

**Goal:** The unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on one fresh run, and the production background priority-spread handoff remains closed across transitive and invalid readiness-owner rebinds until at least the existing 60000ms admission interval plus 10000ms observation handoff, while priority partitions remain exempt.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-priority-spread-authoritative-publication-closure
- plan: solve/epics/topology-convergence-hardening.md

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
- **formation-background-release-owner-closure-main** [parked {exhausted}] rung 1, attempts 1, metric 1 -> 1 — Verified release-owner fence cannot close the live priority-0 gate; the residual is a background-vs-schema competing-clock defect owned by the O3 serial planner, and further release-owner edits are residual-chasing barred by the formation-complexity-consolidation stopping rule

## Findings
- **formation-background-release-owner-closure-main**: inherited from formation-priority-spread-authoritative-publication-closure: The final priority operation work terminalizes before the clean placement observation, but the seed continues to report status_syncing for sql_transaction_participants and sql_transactions until 01:35:17.557Z and first enters stabilizing at 01:35:18.146Z. Projecting terminal operations into admission observation could recover only the post-terminal visibility lag and cannot supply the roughly 39,186ms still missing from the sealed 60,000ms window; the safe lever is to execute the unavoidable priority placement work before public all-ACTIVE visibility. (rules out: post-terminal observation projection as the sole budget-closing mechanism) [data/examples/service-data-affinity-demo/node-0.log]
- **formation-background-release-owner-closure-main**: The parent symptom reproduces on the successor's HEAD baseline: after priority topology reached zero spread gap and no missing leaders, the ordinary 60000ms background release clock created four nonpriority REPLACEs before the stricter schema-admission candidate could be observed mature. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json]
- **formation-background-release-owner-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T01-55-19-235Z.report.json]
- **formation-background-release-owner-closure-main**: The successor's aggregate four-source package is GREEN, RED on isolated revert, and GREEN after restore. Because the new tracker is absent at HEAD the tool warns that import existence contributes to the red; exact independent attacks remain the union, timer, invalid-owner, and priority-exemption semantic authority. [dt:solve/changes/dt-prove/unified-rebalancer.test.js-2026-07-18T02-44-33-258Z.json]
- **formation-background-release-owner-closure-main**: Independent verification approves the exact successor artifact: transitive A-to-B/C-to-B aliasing, alias-wide release/rearm, valid object/function owner transfer, missing and primitive owner retention, priority exemption, and actual 70000/10000/1000ms timer application all pass; the five-path delta is exact and protected evidence is unchanged. [subagent:formation_barrier_verifier]
- **formation-background-release-owner-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T02-52-56-530Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T02-52-56-530Z.report.json]
- **formation-background-release-owner-closure-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-18T02-52-56-530Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T02-52-56-530Z.report.json]
- **formation-background-release-owner-closure-main**: Fresh live evidence confirms the successor mechanism's target movement: schema admission reached quiescent with stableElapsedMs=63659, zero total/priority spread gap, zero missing leaders, zero in-flight operations, and all 100000 ratings loaded and spread. The remaining FAIL moved downstream to service schema provisioning: an already completed schema-job ADD was later recreated and rejected because authoritative operation confirmation was missing. (rules out: Do not reopen the formation competing-clock or weaken the now-green schema gate; diagnose duplicate schema-operation confirmation ownership downstream.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-18T02-52-56-530Z.report.json]

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
