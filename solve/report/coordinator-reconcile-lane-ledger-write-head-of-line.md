# Solve report: coordinator-reconcile-lane-ledger-write-head-of-line

**Goal:** The rebalance coordinator's reconciliation/tick lane never head-of-line-blocks on a single slow ledger write: in run-22 one replica_operations INSERT riding a 30s raft-commit timeout froze the owning coordinator's reconciliation lane for 2m33s (reconciliation ran 7x, then never again until the wedged write resolved), so a target replica that was already voter-ready never received its owner-side SYNCING->ACTIVE reconcile and every other owned operation stopped advancing. The fix bounds the lane's exposure to any single ledger mutation (bounded write budget inside the lane, or hand the blocking write to a parallel persistence path) so reconciliation keeps serving other operations while one write is slow — without weakening single-flight per-operation ordering or raising timeouts. Proven by a deterministic in-process test that freezes one ledger write and asserts sibling operations still reconcile (red on the current head), then by the standard suites.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-36-05-453Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Scope Pressure
- Changed files: 6
- Change bytes: 20334
- Owner areas: scripts/run-coordinator-reconcile-lane-ledger-write-head-of-line-scenarios.js, src/rebalancer, test/rebalancer
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-coordinator-reconcile-lane-ledger-write-head-of-line-scenarios.js, src/rebalancer, test/rebalancer
- Split plan:
  - test/rebalancer: 3 file(s)
  - src/rebalancer: 2 file(s)
  - scripts/run-coordinator-reconcile-lane-ledger-write-head-of-line-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **coordinator-reconcile-lane-ledger-write-head-of-line-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Ingested evidence from coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-26-06-603Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-26-06-603Z.report.json]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Ingested evidence from coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-26-06-603Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-26-06-603Z.report.json]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Ingested evidence from coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-35-55-919Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-35-55-919Z.report.json]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Ingested evidence from coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-36-00-666Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-36-00-666Z.report.json]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Ingested evidence from coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-36-05-453Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-36-05-453Z.report.json]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Ingested evidence from coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-36-05-453Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-36-05-453Z.report.json]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Independent exact verification passed: the six-path patch keys transition serialization by stable operation identity, preserves same-operation ordering, isolates identity-less fallback lanes, uses compare-before-delete cleanup, propagates errors without poisoning successors, passes the 7-assertion exact scenario and an 11-assertion adversarial queue proof. [subagent:wave4_coordinator_hol_verify]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Independent aggregate verification passed: the canonical aggregate equals the exact six-path fingerprint; all five bounded owner/caller suites pass 485/485 assertions, with fallback isolation, cleanup-race, and rejection-recovery behavior independently exercised. [subagent:wave4_coordinator_hol_verify]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Ingested evidence from coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-40-58-669Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-40-58-669Z.report.json]
- **coordinator-reconcile-lane-ledger-write-head-of-line-main**: Ingested evidence from coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-40-58-669Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/coordinator-reconcile-lane-ledger-write-head-of-line-2026-07-15T15-40-58-669Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T15:37:17.907Z | coordinator-reconcile-lane-ledger-write-head-of-line-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/coordinator-reconcile-lane-ledger-write-head-of-line/attempt-1.diff |
