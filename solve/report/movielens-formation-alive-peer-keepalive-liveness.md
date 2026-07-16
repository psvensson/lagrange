# Solve report: movielens-formation-alive-peer-keepalive-liveness

**Goal:** A MessageRouter connection that misses keepalive PONGs but has fresh parsed inbound traffic from the same peer remains connected, while a genuinely silent half-open peer is still severed and redialed; with that invariant active, the production five-node MovieLens milestone reaches authoritative pre-schema quiescence, durable ratings CREATE, ratings preload, 100000 loaded rows, ratings-only split convergence, and a successful three-way report without weakening the full evaluation-window admission gate.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-pre-schema-quiescence-live
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-formation-alive-peer-keepalive-liveness-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: unknown
- Latest evidence: test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-formation-alive-peer-keepalive-liveness-main

## Continuation
- Status: allowed
- Next action: continue supervised step for movielens-formation-alive-peer-keepalive-liveness-main
- Blocker: none

## Scope Pressure
- Changed files: 4
- Change bytes: 5058
- Owner areas: src/constants, src/transport, test/transport
- Categories: runtime, test
- Action: land or separate 3 owner areas: src/constants, src/transport, test/transport
- Split plan:
  - test/transport: 2 file(s)
  - src/constants: 1 file(s)
  - src/transport: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-formation-alive-peer-keepalive-liveness-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **movielens-formation-alive-peer-keepalive-liveness-main**: inherited from movielens-pre-schema-quiescence-live: inherited from movielens-ratings-scoped-split-policy-live: At checkpoint 4bd85509 the five-node membership-active barrier returned, but the seed log stopped at 22:11:29.475Z while priority-recovery replacement planning was still active. The sole ratings CREATE request began at 22:11:35.775Z, left no admin/schema/ratings record in any node log, and timed out after 45 seconds; peer logs concurrently recorded control-plane pressure and internal query timeouts. waitForActiveNodes therefore proves membership cardinality, not a safe DDL/load-admission boundary. The existing production preload admission owner must establish quiescence before policy-bearing ratings CREATE, whose typed stable confirmation then gates load; do not add a second retry owner or rerun unchanged. (rules out: Treating membership-active cardinality as control-plane quiescence; merely widening the admin timeout; adding a local CREATE retry loop.) [data/examples/service-data-affinity-demo-archive/wave4-live-create-admin-timeout-2026-07-15T22-12-20-802Z.tar.gz]
- **movielens-formation-alive-peer-keepalive-liveness-main**: inherited from movielens-pre-schema-quiescence-live: additionalInFlightDiscountCount is not emitted by the authoritative admin control-snapshot producer. Treating its absence as zero is conservative: it cannot reduce observed in-flight work; only a present valid nonnegative value may discount. Requiring the absent field would reject every production snapshot. (rules out: Making additionalInFlightDiscountCount a required authoritative wire field without first adding a production owner.) [src/admin/admin-control-snapshot-local-build-base.js]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Independent verifier APPROVED exact attempt sha256:f7acb36ec9b8e232fd95b32b21fb2f628b4ea6e6995b194a4bd55a65e3e9846b on pinned base 9a73dba03cc73a6d8fb5b4536a51fb13ffbb6367. The canonical four-path full-index diff is byte-identical; pinned-base regression is red because fresh inbound still permits terminate, current focused guard and real socket redial suites are green, full message-router suite is 422/422, immutable live archive timing binds the change to the contradictory keepalive owner, silent/stale peers retain bounded sever/redial, and exact-file lint plus scoped complexity, size, literal, decision, and runtime-grammar audits pass. [subagent:verify_keepalive_attempt1]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T00:12:44.023Z | movielens-formation-alive-peer-keepalive-liveness-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-formation-alive-peer-keepalive-liveness/attempt-1.diff |
