# Solve report: movielens-formation-alive-peer-keepalive-liveness

**Goal:** A MessageRouter connection that misses keepalive PONGs but has fresh parsed inbound traffic from the same peer remains connected, while a genuinely silent half-open peer is still severed and redialed; with that invariant active, the production five-node MovieLens milestone reaches authoritative pre-schema quiescence, durable ratings CREATE, ratings preload, 100000 loaded rows, ratings-only split convergence, and a successful three-way report without weakening the full evaluation-window admission gate.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 3

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
- Movement: same blocker remains: unknown
- Latest evidence: test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T01-02-20-938Z.report.json
- Selected theory: theory-20260716-ping-timeout-classifies-historical-fresh-inbound (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-formation-alive-peer-keepalive-liveness-main

## Continuation
- Status: blocked-theory
- Next action: record system theory before the next movielens-formation-alive-peer-keepalive-liveness-main attempt using npm run model:contracts as model discriminator
- Blocker: system theory required for movielens-formation-alive-peer-keepalive-liveness-main
- Blocker: frontier theory required for movielens-formation-alive-peer-keepalive-liveness-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 6
- Change bytes: 13485
- Owner areas: src/constants, src/transport, test/transport
- Categories: runtime, test
- Action: land or separate 3 owner areas: src/constants, src/transport, test/transport
- Split plan:
  - src/transport: 3 file(s)
  - test/transport: 2 file(s)
  - src/constants: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-formation-alive-peer-keepalive-liveness-main** [open] rung 3, attempts 3, metric 1 -> 1

## Findings
- **movielens-formation-alive-peer-keepalive-liveness-main**: inherited from movielens-pre-schema-quiescence-live: inherited from movielens-ratings-scoped-split-policy-live: At checkpoint 4bd85509 the five-node membership-active barrier returned, but the seed log stopped at 22:11:29.475Z while priority-recovery replacement planning was still active. The sole ratings CREATE request began at 22:11:35.775Z, left no admin/schema/ratings record in any node log, and timed out after 45 seconds; peer logs concurrently recorded control-plane pressure and internal query timeouts. waitForActiveNodes therefore proves membership cardinality, not a safe DDL/load-admission boundary. The existing production preload admission owner must establish quiescence before policy-bearing ratings CREATE, whose typed stable confirmation then gates load; do not add a second retry owner or rerun unchanged. (rules out: Treating membership-active cardinality as control-plane quiescence; merely widening the admin timeout; adding a local CREATE retry loop.) [data/examples/service-data-affinity-demo-archive/wave4-live-create-admin-timeout-2026-07-15T22-12-20-802Z.tar.gz]
- **movielens-formation-alive-peer-keepalive-liveness-main**: inherited from movielens-pre-schema-quiescence-live: additionalInFlightDiscountCount is not emitted by the authoritative admin control-snapshot producer. Treating its absence as zero is conservative: it cannot reduce observed in-flight work; only a present valid nonnegative value may discount. Requiring the absent field would reject every production snapshot. (rules out: Making additionalInFlightDiscountCount a required authoritative wire field without first adding a production owner.) [src/admin/admin-control-snapshot-local-build-base.js]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Independent verifier APPROVED exact attempt sha256:f7acb36ec9b8e232fd95b32b21fb2f628b4ea6e6995b194a4bd55a65e3e9846b on pinned base 9a73dba03cc73a6d8fb5b4536a51fb13ffbb6367. The canonical four-path full-index diff is byte-identical; pinned-base regression is red because fresh inbound still permits terminate, current focused guard and real socket redial suites are green, full message-router suite is 422/422, immutable live archive timing binds the change to the contradictory keepalive owner, silent/stale peers retain bounded sever/redial, and exact-file lint plus scoped complexity, size, literal, decision, and runtime-grammar audits pass. [subagent:verify_keepalive_attempt1]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T00-23-40-324Z.report.json]
- **movielens-formation-alive-peer-keepalive-liveness-main**: After checkpoint 2bb8b458, one authorized production npm run demo:movielens run passed the PostgreSQL baseline and five-node formation but timed out before schema admission with a real replica_operations_in_flight=1 blocker. The immutable failure report sha256 is 88a458cfe4467f1280102e50860cff291729e2521aae6f5f3f2376437eee8015; the exact 166 MB node-state archive sha256 is b217ff24a96ccfa5919cf0e20c8e441f6ef3fc47e77e52980a0f76d08f3b72ca. Ports and containers were clean after bounded teardown. This distinct post-fix witness forbids an unchanged rerun and requires deterministic archive analysis.
- **movielens-formation-alive-peer-keepalive-liveness-main**: On checkpoint 2bb8b458/HEAD, the sealed keepalive-teardown symptom does not reproduce: the live archive contains no keepalive-timeout sever for the seed peer before teardown. The overall milestone still fails on a distinct contradictory liveness consumer: replace-op-691efb46c505c2053b80785456cab438 reaches ACTIVE after target replica replace-replica-4d14ce36c1987fea240703b442fe5727 becomes voter-ready/active, but replace-removal safety repeatedly reports source seed 3df85469-970f-4afc-b38f-634ed9f6d388 uncontactable at 00:22:24.579Z and later. At the same boundary, node 4 MessageRouter connection 64f9122c-b6ed-4e59-a95c-3f8470366503 records fresh parsed inbound from that same seed (lastInboundAgoMs 1812 at 00:22:24.064Z, 2310 at 00:22:24.562Z, then repeatedly through teardown). The operation ledger is durably ACTIVE on four replica copies and the bounded run times out with one in-flight operation. Thus the original fix is effective, while the same owner-boundary contract must also govern remove-safety ping timeout classification.
- **movielens-formation-alive-peer-keepalive-liveness-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T23-55-31-481Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-55-31-481Z.report.json]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Independent verifier rejected exact attempt 2: a ping started on a connected peer with fresh inbound can resolve true after that same connection becomes DISCONNECTED because timeout classification does not revalidate the captured current connection. Attempt 3 must bind fresh evidence to the exact still-current connected socket. [subagent:verify_ping_liveness_attempt2]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Fresh independent verifier APPROVED exact attempt 3 sha256:7fb6560e48391421b058091d6023c7462adeb679d16a2554d2047dde410e17ac on pinned base 0d3920e118714656dd60eb9c5e9adb12ef623dc0. The canonical five-path full-index artifact is byte-identical and validly supersedes rejected attempt 2. Pinned-base fresh-inbound regression is right-reason red; current focused 26/26, full MessageRouter 585/585, and remove-safety 225/225 pass. Disconnect, connection replacement, WebSocket replacement, stale/absent/window-zero/disconnected-start attacks remain false, exact PONG remains true, immutable live evidence binds the owner, and lint/scoped/static/model checks pass. [subagent:verify_ping_liveness_attempt3]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-16T01-02-20-938Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T01-02-20-938Z.report.json]
- **movielens-formation-alive-peer-keepalive-liveness-main**: Ingested evidence from movielens-three-way-affinity-demo-live-2026-07-16T01-02-20-938Z.report.json. Metric: 1 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T01-02-20-938Z.report.json]
- **movielens-formation-alive-peer-keepalive-liveness-main**: After checkpoint 48257c25, one authorized changed production npm run demo:movielens run passed the PostgreSQL baseline and five-node formation. The prior remove-safety uncontactable-peer symptom did not surface in the runner, but schema admission timed out on a distinct control_plane_pressure owner symptom: an admin snapshot request itself timed out. Report sha256 is 9cad6f502f0c50e330c689a0ca183b9ef3421ac09ee5c7aa69476f8cca0baa9f; immutable 180 MB node-state archive sha256 is 9b7d05b90a2ed53763f0e26c8cbb54eed026061328456cc6c34d862f6ce837e0. Ports/processes were clean after teardown and the only container remained the pre-existing Forgejo runner. This forbids an unchanged rerun and requires deterministic archive analysis. [data/examples/service-data-affinity-demo-archive/wave4-live-ping-timeout-owner-2026-07-16T01-02-20-938Z.tar.gz]

## Theories
- **theory-20260716-ping-timeout-classifies-historical-fresh-inbound** [falsified] frontier, frontier movielens-formation-alive-peer-keepalive-liveness-main, layer ownership, mechanism ping timeout classifies historical fresh inbound without revalidating that the connection which initiated the ping remains the current connected socket, so remove-safety can accept a peer disconnected during the wait, modelGate npm run model:contracts

## Selected Theories
- **movielens-formation-alive-peer-keepalive-liveness-main**: theory-20260716-ping-timeout-classifies-historical-fresh-inbound

## Theory Results
- **theory-20260716-ping-timeout-classifies-historical-fresh-inbound**: falsified (scenario=failed, theory=falsified, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-55-31-481Z.report.json]
- **theory-20260716-ping-timeout-classifies-historical-fresh-inbound**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-three-way-affinity-demo-live-2026-07-16T01-02-20-938Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T00:12:44.023Z | movielens-formation-alive-peer-keepalive-liveness-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-formation-alive-peer-keepalive-liveness/attempt-1.diff |
| 2026-07-16T00:39:41.804Z | movielens-formation-alive-peer-keepalive-liveness-main | local-fix | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-formation-alive-peer-keepalive-liveness/attempt-2.diff |
| 2026-07-16T00:49:08.860Z | movielens-formation-alive-peer-keepalive-liveness-main | widen-scope | 1 -> 1 | flat | no_previous | theory-20260716-ping-timeout-classifies-historical-fresh-inbound | diff:solve/changes/movielens-formation-alive-peer-keepalive-liveness/attempt-3.diff |
