# Solve report: movielens-pre-schema-quiescence-live

**Goal:** One production five-node MovieLens milestone uses the authoritative control snapshot to admit pre-schema DDL only after control-plane quiescence, then reaches stable policy-bearing ratings CREATE, ratings-specific preload admission, loads 100000 rows, converges ratings-only splitting, and emits the successful three-way report; deterministic guards prove formation before pre-schema admission before CREATE before load admission before load and fail closed under snapshot pressure.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 5

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
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json
- Selected theory: theory-20260715-idempotent-schema-admin-timeout-retry-owner
- Next move: continue supervised step for movielens-pre-schema-quiescence-live-main

## Continuation
- Status: blocked-theory
- Next action: record system theory before the next movielens-pre-schema-quiescence-live-main attempt using npm run model:contracts as model discriminator
- Blocker: system theory required for movielens-pre-schema-quiescence-live-main

## Scope Pressure
- Changed files: 9
- Change bytes: 35974
- Owner areas: examples, scripts/examples, test/runtime
- Categories: other, test
- Action: land or separate 3 owner areas: examples, scripts/examples, test/runtime
- Split plan:
  - examples: 4 file(s)
  - test/runtime: 4 file(s)
  - scripts/examples: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-pre-schema-quiescence-live-main** [open] rung 3, attempts 5, metric 1 -> 1

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

## Theories
- **theory-20260715-schema-admission-required-fields-optional-discount** [falsified] frontier, frontier movielens-pre-schema-quiescence-live-main, layer observation, mechanism The shared admission parser must distinguish required authoritative snapshot fields from an optional client-side in-flight discount; otherwise missing required evidence can fail open, while requiring the non-produced discount makes every production snapshot unavailable., owner MovieLens shared control-snapshot admission parser, boundary authoritative snapshot envelope to quiescence classification, modelGate npm run model:contracts
- **theory-20260715-idempotent-schema-admin-timeout-retry-owner** [supported] frontier, frontier movielens-pre-schema-quiescence-live-main, layer ownership, mechanism The existing ratings schema retry owner cannot distinguish an ambiguous admin response deadline from a terminal CREATE failure, so its documented fresh-session idempotent replay contract exits after one timed-out request., owner ratings schema retry owner, boundary admin response deadline to idempotent CREATE replay, modelGate npm run model:contracts

## Selected Theories
- **movielens-pre-schema-quiescence-live-main**: theory-20260715-idempotent-schema-admin-timeout-retry-owner

## Theory Results
- **theory-20260715-schema-admission-required-fields-optional-discount**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-12-20-802Z.report.json]
- **theory-20260715-schema-admission-required-fields-optional-discount**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]
- **theory-20260715-idempotent-schema-admin-timeout-retry-owner**: supported (scenario=failed, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]
- **theory-20260715-idempotent-schema-admin-timeout-retry-owner**: supported (scenario=failed, theory=supported, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T22:25:02.705Z | movielens-pre-schema-quiescence-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-1.diff |
| 2026-07-15T22:31:44.079Z | movielens-pre-schema-quiescence-live-main | local-fix | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-2.diff |
| 2026-07-15T22:35:46.276Z | movielens-pre-schema-quiescence-live-main | widen-scope | 1 -> 1 | flat | no_previous | theory-20260715-schema-admission-required-fields-optional-discount | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-3.diff |
| 2026-07-15T22:52:09.558Z | movielens-pre-schema-quiescence-live-main | widen-scope | 1 -> 1 | flat | same | theory-20260715-idempotent-schema-admin-timeout-retry-owner | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-4.diff |
| 2026-07-15T22:59:36.637Z | movielens-pre-schema-quiescence-live-main | widen-scope | 1 -> 1 | flat | same | theory-20260715-idempotent-schema-admin-timeout-retry-owner | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-5.diff |
