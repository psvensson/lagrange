# Solve report: formation-ledger-quorum-concentrated-replace-churn-60s

**Goal:** On cold five-node formation, the second replica_operations-p1 quorum-spread REPLACE is not permanently rejected as replica_inventory_unusable merely because two successful sequential authoritative reads take more than one second and provide no source observation timestamps. The topology inventory preserves fail-closed behavior for unavailable sources, source mutation, explicit observation skew, and identity conflicts, but never fabricates cross-source skew from local read-start/read-end times. Proven first by a deterministic guard that advances the injected clock during successful owner reads and is red on reverting the provenance fix, composed with the existing quorum-spread-first guard showing that the admitted cure clears operation_ledger_quorum_concentrated before dependent work proceeds; scenario-harness passes three consecutive times. No timeout or concurrency budget is raised, no target row substitutes for actual placement, and the ledger interlock is not weakened. Live MovieLens schema creation after formation is validation, not discovery.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/formation-ledger-quorum-concentrated-replace-churn-60s-2026-07-11T18-40-22-627Z.report.json

**Attempts:** 1

## Links
- parent quest: formation-promoted-voter-not-voter-ready-routable-60s
- plan: solve/changes/formation-promoted-voter-not-voter-ready-routable-60s/rung2-symptom-not-reproducing-on-head.md

## Scope Pressure
- Changed files: 2
- Change bytes: 3679
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **formation-ledger-quorum-concentrated-replace-churn-60s-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **formation-ledger-quorum-concentrated-replace-churn-60s-main**: Independent verifier approved the current topology-guard correction and deterministic formation coverage. [subagent:/root/affinity_parallel_reduce_verify]
- **formation-ledger-quorum-concentrated-replace-churn-60s-main**: Ingested evidence from formation-ledger-quorum-concentrated-replace-churn-60s-2026-07-11T18-56-32-025Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-ledger-quorum-concentrated-replace-churn-60s-2026-07-11T18-56-32-025Z.report.json]
- **formation-ledger-quorum-concentrated-replace-churn-60s-main**: Ingested evidence from formation-ledger-quorum-concentrated-replace-churn-60s-2026-07-11T18-56-32-025Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-ledger-quorum-concentrated-replace-churn-60s-2026-07-11T18-56-32-025Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T18:40:22.671Z | formation-ledger-quorum-concentrated-replace-churn-60s-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/formation-ledger-quorum-concentrated-replace-churn-60s/attempt-1.diff |
