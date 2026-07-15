# Solve report: movielens-pre-schema-quiescence-live

**Goal:** One production five-node MovieLens milestone uses the authoritative control snapshot to admit pre-schema DDL only after control-plane quiescence, then reaches stable policy-bearing ratings CREATE, ratings-specific preload admission, loads 100000 rows, converges ratings-only splitting, and emits the successful three-way report; deterministic guards prove formation before pre-schema admission before CREATE before load admission before load and fail closed under snapshot pressure.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 8

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-ratings-scoped-split-policy-live
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-pre-schema-quiescence-live-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: same blocker remains: FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json
- Selected theory: theory-20260715-sampled-quiescence-window
- Next move: continue supervised step for movielens-pre-schema-quiescence-live-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 10
- Change bytes: 51619
- Owner areas: examples, scripts/examples, test/admin, test/runtime
- Categories: other, test
- Action: land or separate 4 owner areas: examples, scripts/examples, test/admin, test/runtime
- Split plan:
  - examples: 4 file(s)
  - test/runtime: 4 file(s)
  - scripts/examples: 1 file(s)
  - test/admin: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-pre-schema-quiescence-live-main** [parked {exhausted}] rung 5, attempts 8, metric 1 -> 1 — ladder exhausted without metric movement

## Findings
- **movielens-pre-schema-quiescence-live-main**: inherited from movielens-ratings-scoped-split-policy-live: At checkpoint 4bd85509 the five-node membership-active barrier returned, but the seed log stopped at 22:11:29.475Z while priority-recovery replacement planning was still active. The sole ratings CREATE request began at 22:11:35.775Z, left no admin/schema/ratings record in any node log, and timed out after 45 seconds; peer logs concurrently recorded control-plane pressure and internal query timeouts. waitForActiveNodes therefore proves membership cardinality, not a safe DDL/load-admission boundary. The existing production preload admission owner must establish quiescence before policy-bearing ratings CREATE, whose typed stable confirmation then gates load; do not add a second retry owner or rerun unchanged. (rules out: Treating membership-active cardinality as control-plane quiescence; merely widening the admin timeout; adding a local CREATE retry loop.) [data/examples/service-data-affinity-demo-archive/wave4-live-create-admin-timeout-2026-07-15T22-12-20-802Z.tar.gz]
- **movielens-pre-schema-quiescence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T22-12-20-802Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-12-20-802Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T22-12-20-802Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-12-20-802Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: Exact attempt sha256:5c39cd3b431618fe98e9d82c8c04e6fe56ce2779d291fe47e9bbff1e43e1c1f8 is rejected: two fresh snapshots missing replicaOperations are normalized to zero work and admitted as quiescent. Admission-required snapshot fields and counts must fail closed as observation_unavailable, with a deterministic incomplete-snapshot regression. [subagent:verify_schema_admission_attempt1]
- **movielens-pre-schema-quiescence-live-main**: Exact attempt sha256:bf353a3f98861ce4b328b7d050a43213bb03acd9976557b0a88a8ebfc9b818e2 is rejected pending explicit treatment of missing additionalInFlightDiscountCount. Repository inspection shows no authoritative control-snapshot producer for that client-derived optional discount, so absence must be documented and tested as conservative zero rather than made a required wire field; malformed present values still fail closed. [subagent:verify_schema_admission_attempt1]
- **movielens-pre-schema-quiescence-live-main**: additionalInFlightDiscountCount is not emitted by the authoritative admin control-snapshot producer. Treating its absence as zero is conservative: it cannot reduce observed in-flight work; only a present valid nonnegative value may discount. Requiring the absent field would reject every production snapshot. (rules out: Making additionalInFlightDiscountCount a required authoritative wire field without first adding a production owner.) [src/admin/admin-control-snapshot-local-build-base.js]
- **movielens-pre-schema-quiescence-live-main**: Independent verification passed for exact attempt sha256:54240e788bde7a45b2fb04442bf9d81c57ffdddbf89eb2c467637254f50e2e95: canonical delta is exact; required snapshot fields fail closed; absent optional discount conservatively preserves in-flight work; two fresh quiet confirmations reset correctly; one outer budget, snapshot-only pre-schema SQL, strict formation-to-load order, honest phase evidence, audits, and literal no-growth all pass. [subagent:verify_schema_admission_attempt1]
- **movielens-pre-schema-quiescence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: At source 66721ed0 the live gate admitted after two fresh quiet snapshots, but the idempotent ratings CREATE request examples-1784155368834-bf275d18-93f9-4917-bb61-e3d9a295153e timed out at the 30s admin client boundary. Immutable logs later recorded the same CREATE executing during teardown and failing with Workflow transition rejected: ownership lease expired. The 60s schema retry owner propagated this ambiguous timeout because generic admin response timeouts are not classified as retryable. Report sha256=8d59001e53586a2853cb587deed90ee027be6c3f1ca37b1c90d64ffd61f799c4; comparison sha256=4957c9cb3cd957644bffa1beaeb95d27cb4149375b7625c945469529d167555c; archive sha256=497ccc25129e9203ef37a227b57c29a9233fcd8574ae389c98670776ae762634. [data/examples/service-data-affinity-demo-archive/wave4-live-pre-schema-quiescence-2026-07-15T22-43-29-340Z.tar.gz]
- **movielens-pre-schema-quiescence-live-main**: Independent verification rejected exact attempt sha256:7e76b475ba42ed0d31d3d98e0b1d088dd7f10215350fd35b3bd0c8e7ffee78d0: a fixed 15-second session could start at the exhausted 60-second deadline and run to 75 seconds, and the regression injected an exported timeout helper instead of exercising the real AdminWsClient timer and late-response seam. The cumulative replacement must cap every session by canonical remaining time, create no session at exhaustion, and prove real late responses cannot resurrect expired work. [subagent:verify_schema_timeout_retry_attempt4]
- **movielens-pre-schema-quiescence-live-main**: Independent verification passed exact cumulative attempt sha256:09ae08d43c4e529e0509b2dd9d5b879bb7fb08293e79092757a81cd3ec71f34d: full-index three-file delta is exact; adversarial clock ends at 60000ms with no client at exhaustion and every attempt capped by remaining budget; a real local WebSocket timer produces typed ADMIN_RESPONSE_TIMEOUT and a deliberately late result cannot resurrect the request; the old code is red through that seam; the existing retry owner remains sole, idempotent CREATE-only, fresh-session and confirmation-reset behavior holds, hard validation remains terminal, and focused/model/lint/audit checks pass. [subagent:verify_schema_timeout_retry_attempt4]
- **movielens-pre-schema-quiescence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T23-09-54-219Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-09-54-219Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T23-09-54-219Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-09-54-219Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: The single changed-live run at source 288cd00a formed five nodes but failed closed before ratings DDL: the 180-second pre-schema gate obtained zero stable confirmations because its final authoritative observation was rejected as stale_usable/cache_stale_watermark. The Lagrange report sha256 is e535d8330d727f6159d0f69a8f3909ad6794c2e899227cb4d5a0a49b081f1dc7, comparison report sha256 is a04963ffecd1bac1601653a5cb47d5d6a0be6378d92f5bb5343b509916d70934, and immutable log archive sha256 is 729b4a545774aa3e1e22671a99fa309d606a515e4cdd671f8a2558c2cdb6e73f. This falsifies the selected admin-timeout theory for the current boundary; no unchanged live rerun is permitted. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-09-54-219Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: Independent verification passed exact attempt sha256:b8ebbf0e9d75c7757c5407bb8b909b2d7ae8770dfc43c2559539522d00b040d1: full-index delta is byte-identical and limited to three files; stale_usable alone traverses the existing forced snapshot SQL on the same target and only the remaining outer budget; stale, failed, missing, timeout, and repair failure cannot confirm or reach load; two fresh post-repair confirmations remain required; the real Admin owner repairs stale heartbeat rows and returns fresh; base code is red because it never emits the forced query; focused tests, ESLint, models, scoped audits, and diff checks pass. Repository-wide literal and decision-boundary failures are confined to unrelated pre-existing files. [subagent:verify_snapshot_forced_repair_attempt6]
- **movielens-pre-schema-quiescence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json]
- **movielens-pre-schema-quiescence-live-main**: At approved source 04c32b68 the canonical forced-repair transition cleared cache_stale_watermark and admitted schema after two fresh quiescent snapshots. Ratings CREATE attempt 1 then hit the typed admin response deadline and retried correctly, but the fresh session received Workflow transition rejected: ownership lease expired while logs show periodic priority-recovery planning and schema_operations replacement work beginning during the CREATE interval. Report sha256=537d2f1f828ccde9362d54809b60692f9ff9e6e230fe24418c057805e077efdb; comparison sha256=1a1ea946bc9222134a7bb567701fd58602e454501a17a29b99fa1062d9a611dd; immutable archive sha256=05b3cfd7bf214920d8bcb982ffd4e1002e81080b53c73a3dacc8d7a202e0634e. This confirms the pre-recorded falsifier: two point snapshots can precede the scheduled partition-evaluation cycle, so the next deterministic attempt must require one full 60000ms evaluation interval of uninterrupted quiescence; no retry changes or unchanged live rerun. [data/examples/service-data-affinity-demo-archive/wave4-live-schema-lease-expired-2026-07-15T23-30-35-492Z.tar.gz]
- **movielens-pre-schema-quiescence-live-main**: Independent verification rejected exact attempt: the stability-window timing behavior passes, but waitForAffinityDemoSchemaAdmission introduces a new complexity-ratchet violation and encodes inactive/reset lifecycle state with null contrary to ARCH-0014; replace it with an explicit stability-window state owner and extracted transition helper. [subagent:verify_snapshot_forced_repair_attempt6]

## Theories
- **theory-20260715-the-local-control-snapshot-owner-correctly** [active] system, mechanism The local control-snapshot owner correctly marks stale cache evidence pending, but the demo consumer never traverses the owner's existing forced authoritative repair command, so polling cannot refresh the evidence it requires., owner control_plane_snapshot_owner, modelGate npm run model:contracts
- **theory-20260715-schema-admission-required-fields-optional-discount** [falsified] frontier, frontier movielens-pre-schema-quiescence-live-main, layer observation, mechanism The shared admission parser must distinguish required authoritative snapshot fields from an optional client-side in-flight discount; otherwise missing required evidence can fail open, while requiring the non-produced discount makes every production snapshot unavailable., owner MovieLens shared control-snapshot admission parser, boundary authoritative snapshot envelope to quiescence classification, modelGate npm run model:contracts
- **theory-20260715-idempotent-schema-admin-timeout-retry-owner** [falsified] frontier, frontier movielens-pre-schema-quiescence-live-main, layer ownership, mechanism The existing ratings schema retry owner cannot distinguish an ambiguous admin response deadline from a terminal CREATE failure, so its documented fresh-session idempotent replay contract exits after one timed-out request., owner ratings schema retry owner, boundary admin response deadline to idempotent CREATE replay, modelGate npm run model:contracts
- **theory-20260715-control-plane-snapshot-owner** [supported] frontier, frontier movielens-pre-schema-quiescence-live-main, layer ownership, mechanism control_plane_snapshot_owner, owner control_plane_snapshot_owner, boundary snapshot_freshness, modelGate npm run model:contracts
- **theory-20260715-sampled-quiescence-window** [supported] frontier, frontier movielens-pre-schema-quiescence-live-main, layer scheduling, mechanism sampled_quiescence_window, owner pre_schema_admission_gate, boundary partition_evaluation_cycle_to_schema_lease, modelGate npm run model:contracts

## Selected Theories
- **movielens-pre-schema-quiescence-live-main**: theory-20260715-sampled-quiescence-window

## Theory Results
- **theory-20260715-schema-admission-required-fields-optional-discount**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-12-20-802Z.report.json]
- **theory-20260715-schema-admission-required-fields-optional-discount**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]
- **theory-20260715-idempotent-schema-admin-timeout-retry-owner**: supported (scenario=failed, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]
- **theory-20260715-idempotent-schema-admin-timeout-retry-owner**: supported (scenario=failed, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]
- **theory-20260715-idempotent-schema-admin-timeout-retry-owner**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-09-54-219Z.report.json]
- **theory-20260715-control-plane-snapshot-owner**: supported (scenario=failed, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-09-54-219Z.report.json]
- **theory-20260715-control-plane-snapshot-owner**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json]
- **theory-20260715-control-plane-snapshot-owner**: supported (scenario=failed, theory=supported, movement=moved_boundary) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json]
- **theory-20260715-sampled-quiescence-window**: supported (scenario=failed, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json]
- **theory-20260715-sampled-quiescence-window**: supported (scenario=failed, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T23-30-35-492Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T22:25:02.705Z | movielens-pre-schema-quiescence-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-1.diff |
| 2026-07-15T22:31:44.079Z | movielens-pre-schema-quiescence-live-main | local-fix | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-2.diff |
| 2026-07-15T22:35:46.276Z | movielens-pre-schema-quiescence-live-main | widen-scope | 1 -> 1 | flat | no_previous | theory-20260715-schema-admission-required-fields-optional-discount | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-3.diff |
| 2026-07-15T22:52:09.558Z | movielens-pre-schema-quiescence-live-main | widen-scope | 1 -> 1 | flat | same | theory-20260715-idempotent-schema-admin-timeout-retry-owner | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-4.diff |
| 2026-07-15T22:59:36.637Z | movielens-pre-schema-quiescence-live-main | widen-scope | 1 -> 1 | flat | same | theory-20260715-idempotent-schema-admin-timeout-retry-owner | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-5.diff |
| 2026-07-15T23:18:01.798Z | movielens-pre-schema-quiescence-live-main | model | 1 -> 1 | flat | same | theory-20260715-control-plane-snapshot-owner | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-6.diff |
| 2026-07-15T23:38:58.166Z | movielens-pre-schema-quiescence-live-main | model | 1 -> 1 | flat | same | theory-20260715-sampled-quiescence-window | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-7.diff |
| 2026-07-15T23:47:11.957Z | movielens-pre-schema-quiescence-live-main | change-approach | 1 -> 1 | flat | same | theory-20260715-sampled-quiescence-window | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-8.diff |
