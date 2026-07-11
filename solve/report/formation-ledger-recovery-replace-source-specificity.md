# Solve report: formation-ledger-recovery-replace-source-specificity

**Goal:** The services-owner-unavailable operation-ledger recovery exception admits only an active or removing voter on the actionable concentrated partition's hottest node, while non-hot sources and non-REPLACE operations fail closed.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 0 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- parent quest: formation-ledger-self-spread-services-owner-unavailable

## Scope Pressure
- Changed files: 2
- Change bytes: 11123
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **formation-ledger-recovery-replace-source-specificity-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **formation-ledger-recovery-replace-source-specificity-main**: Ingested evidence from formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-42-34-739Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-42-34-739Z.report.json]
- **formation-ledger-recovery-replace-source-specificity-main**: Independent verifier approved the bounded recovery exception and its fail-closed controls after focused and scenario verification. [subagent:/root/affinity_parallel_reduce_verify]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T19:44:17.891Z | formation-ledger-recovery-replace-source-specificity-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/formation-ledger-recovery-replace-source-specificity/attempt-1.diff |
