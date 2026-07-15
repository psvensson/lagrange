# Solve report: seed-join-gate-authoritative-refresh

**Goal:** The seed's leader-readiness join gate no longer rejects joiners from a stale leader-metadata view while fresher authoritative evidence exists: on a leader-metadata miss it performs a bounded authoritative re-read of the missing partitions' rows via the already-held authoritativeControlPlaneView (the refreshAuthoritativeRoutingOverlay pattern) before returning LEADER_METADATA_INCOMPLETE. Proven by deterministic red-on-revert tests: a stale-cache/fresh-authoritative scenario admits the joiner after refresh, a genuinely-leaderless scenario still rejects, and no authoritative reads occur on the hit path or the high-frequency probe path.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/seed-join-gate-authoritative-refresh-2026-07-15T11-20-37-719Z.report.json

**Attempts:** 2

## Links
- parent quest: movielens-affinity-placement-demo

## Scope Pressure
- Changed files: 6
- Change bytes: 21176
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/bootstrap, test/bootstrap
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-placement-affinity-scenarios.js, src/bootstrap, test/bootstrap
- Split plan:
  - src/bootstrap: 4 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - test/bootstrap: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **seed-join-gate-authoritative-refresh-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **seed-join-gate-authoritative-refresh-main**: Ingested evidence from seed-join-gate-authoritative-refresh-2026-07-15T11-09-57-302Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/seed-join-gate-authoritative-refresh-2026-07-15T11-09-57-302Z.report.json]
- **seed-join-gate-authoritative-refresh-main**: Ingested evidence from seed-join-gate-authoritative-refresh-2026-07-15T11-11-29-798Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/seed-join-gate-authoritative-refresh-2026-07-15T11-11-29-798Z.report.json]
- **seed-join-gate-authoritative-refresh-main**: Ingested evidence from seed-join-gate-authoritative-refresh-2026-07-15T11-11-29-798Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/seed-join-gate-authoritative-refresh-2026-07-15T11-11-29-798Z.report.json]
- **seed-join-gate-authoritative-refresh-main**: Independent verification rejected this exact attempt: the new authoritative refresh method exceeded the strict cyclomatic complexity threshold (13 > 12) [subagent:seed-join-authoritative-refresh-verifier]
- **seed-join-gate-authoritative-refresh-main**: Ingested evidence from seed-join-gate-authoritative-refresh-2026-07-15T11-18-05-764Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/seed-join-gate-authoritative-refresh-2026-07-15T11-18-05-764Z.report.json]
- **seed-join-gate-authoritative-refresh-main**: Ingested evidence from seed-join-gate-authoritative-refresh-2026-07-15T11-18-05-764Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/seed-join-gate-authoritative-refresh-2026-07-15T11-18-05-764Z.report.json]
- **seed-join-gate-authoritative-refresh-main**: Independent verification passed for the replacement exact attempt [subagent:seed-join-authoritative-refresh-verifier]
- **seed-join-gate-authoritative-refresh-main**: Ingested evidence from seed-join-gate-authoritative-refresh-2026-07-15T11-22-27-494Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/seed-join-gate-authoritative-refresh-2026-07-15T11-22-27-494Z.report.json]
- **seed-join-gate-authoritative-refresh-main**: Ingested evidence from seed-join-gate-authoritative-refresh-2026-07-15T11-22-27-494Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/seed-join-gate-authoritative-refresh-2026-07-15T11-22-27-494Z.report.json]
- **seed-join-gate-authoritative-refresh-main**: Independent terminal aggregate verification passed [subagent:seed-join-authoritative-refresh-verifier]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T11:11:52.725Z | seed-join-gate-authoritative-refresh-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/seed-join-gate-authoritative-refresh/attempt-2.diff |
| 2026-07-15T11:20:43.740Z | seed-join-gate-authoritative-refresh-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/seed-join-gate-authoritative-refresh/attempt-3.diff |
