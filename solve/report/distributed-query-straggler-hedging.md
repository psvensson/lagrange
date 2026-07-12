# Solve report: distributed-query-straggler-hedging

**Goal:** A slow-but-alive replica no longer stalls a distributed SELECT fan-out until chunk timeout in the wired production path: straggler hedging works with partitionQueryExecutor present (speculative retry against an alternative replica, first result wins, no duplicate rows), and guard tests prove a hedged fan-out completes despite one delayed replica.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/distributed-query-straggler-hedging-2026-07-12T16-22-00-288Z.report.json

**Attempts:** 1

## Scope Pressure
- Changed files: 9
- Change bytes: 51508
- Owner areas: scripts/run-straggler-hedging-scenarios.js, src/query, test/query
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-straggler-hedging-scenarios.js, src/query, test/query
- Split plan:
  - src/query: 7 file(s)
  - scripts/run-straggler-hedging-scenarios.js: 1 file(s)
  - test/query: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **distributed-query-straggler-hedging-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **distributed-query-straggler-hedging-main**: Subagent verifier approved after two adversarial rounds (final verdict APPROVE): round-1 defect (losing primary completion double-counted fan-out totalRows/totalBytes, overwrote winner metrics, and could spuriously trip the result-buffer limit — proven with S8/S8b repros) fixed via first-completion-wins in QueryExecutionMetrics.addPartitionMetrics preserving failure-to-success upgrades; first-result-wins, read-only gating, exclusion integrity, timer hygiene, and no-hedge-storm-under-jitter (0 hedges at 5-30ms and 40-90ms, exactly 1 for a real straggler) all verified with 12 deterministic repros [subagent:a533c03d69ec35806]
- **distributed-query-straggler-hedging-main**: Verifier advisories recorded as follow-ups, none blocking: leader-redirect bypasses hedge address exclusion and delivery observer (a redirected hedge can land on the stalled replica; rows stay exactly-once via partition-keyed settlement); hedge cleanup abort is a no-op so in-flight hedges outlive cancel/timeout (safely swallowed); no global hedge cap and hedges bypass activeConnections accounting (worst case 2x deliveries per read fan-out); all-failed fast partitions provide no completion evidence so the slow one never hedges

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-12T16:22:00.344Z | distributed-query-straggler-hedging-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/distributed-query-straggler-hedging/attempt-1.diff |
