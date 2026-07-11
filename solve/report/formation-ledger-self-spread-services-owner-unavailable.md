# Solve report: formation-ledger-self-spread-services-owner-unavailable

**Goal:** During cold five-node formation, a count-neutral REPLACE that spreads a quorum-concentrated replica_operations partition is admitted when the authoritative services owner is temporarily unavailable but actual cache rows contain the named live source replica, authoritative operation visibility remains usable, and the target node is vacant. The exception applies only to operation-ledger recovery REPLACE: generic topology changes still fail closed, a missing source still fails closed, and an occupied target still blocks. Deterministic topology-guard and quorum-spread-first guards pass three consecutive times; no timeout, concurrency budget, or ledger interlock is weakened.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-34-48-831Z.report.json

**Attempts:** 1

## Links
- parent quest: formation-ledger-quorum-concentrated-replace-churn-60s
- plan: solve/changes/formation-ledger-quorum-concentrated-replace-churn-60s/attempt-1.md

## Scope Pressure
- Changed files: 4
- Change bytes: 11706
- Owner areas: scripts/run-formation-ledger-quorum-spread-first-scenarios.js, src/rebalancer, test/rebalancer
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-formation-ledger-quorum-spread-first-scenarios.js, src/rebalancer, test/rebalancer
- Split plan:
  - src/rebalancer: 2 file(s)
  - scripts/run-formation-ledger-quorum-spread-first-scenarios.js: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **formation-ledger-self-spread-services-owner-unavailable-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **formation-ledger-self-spread-services-owner-unavailable-main**: Independent verifier approved the owner-unavailable recovery mechanism, including the later source-specific safety bounds. [subagent:/root/affinity_parallel_reduce_verify]
- **formation-ledger-self-spread-services-owner-unavailable-main**: Ingested evidence from formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-46-57-292Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-46-57-292Z.report.json]
- **formation-ledger-self-spread-services-owner-unavailable-main**: Ingested evidence from formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-46-57-292Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-46-57-292Z.report.json]
- **formation-ledger-self-spread-services-owner-unavailable-main**: The owner-unavailable formation path and bounded recovery controls reproduce green on committed HEAD. [test-output/reports/formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-46-57-292Z.report.json]
- **formation-ledger-self-spread-services-owner-unavailable-main**: Ingested evidence from formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-53-33-268Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-53-33-268Z.report.json]
- **formation-ledger-self-spread-services-owner-unavailable-main**: Ingested evidence from formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-53-33-268Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-ledger-self-spread-services-owner-unavailable-2026-07-11T19-53-33-268Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T19:34:48.875Z | formation-ledger-self-spread-services-owner-unavailable-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/formation-ledger-self-spread-services-owner-unavailable/attempt-1.diff |
