# Solve report: movielens-pre-schema-quiescence-live

**Goal:** One production five-node MovieLens milestone uses the authoritative control snapshot to admit pre-schema DDL only after control-plane quiescence, then reaches stable policy-bearing ratings CREATE, ratings-specific preload admission, loads 100000 rows, converges ratings-only splitting, and emits the successful three-way report; deterministic guards prove formation before pre-schema admission before CREATE before load admission before load and fail closed under snapshot pressure.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 3

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
- Selected theory: theory-20260715-schema-admission-required-fields-optional-discount (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for movielens-pre-schema-quiescence-live-main

## Continuation
- Status: blocked-theory
- Next action: record and select frontier theory for movielens-pre-schema-quiescence-live-main with npm run model:contracts as discriminator
- Blocker: frontier theory required for movielens-pre-schema-quiescence-live-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 6
- Change bytes: 24037
- Owner areas: examples, test/runtime
- Categories: other, test
- Split plan:
  - examples: 3 file(s)
  - test/runtime: 3 file(s)
- Signals: none

## Frontiers
- **movielens-pre-schema-quiescence-live-main** [open] rung 2, attempts 3, metric 1 -> 1

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

## Theories
- **theory-20260715-schema-admission-required-fields-optional-discount** [falsified] frontier, frontier movielens-pre-schema-quiescence-live-main, layer observation, mechanism The shared admission parser must distinguish required authoritative snapshot fields from an optional client-side in-flight discount; otherwise missing required evidence can fail open, while requiring the non-produced discount makes every production snapshot unavailable., owner MovieLens shared control-snapshot admission parser, boundary authoritative snapshot envelope to quiescence classification, modelGate npm run model:contracts

## Selected Theories
- **movielens-pre-schema-quiescence-live-main**: theory-20260715-schema-admission-required-fields-optional-discount

## Theory Results
- **theory-20260715-schema-admission-required-fields-optional-discount**: supported (scenario=failed, theory=supported, movement=no_previous) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-12-20-802Z.report.json]
- **theory-20260715-schema-admission-required-fields-optional-discount**: falsified (scenario=failed, theory=falsified, movement=same) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T22-43-29-340Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T22:25:02.705Z | movielens-pre-schema-quiescence-live-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-1.diff |
| 2026-07-15T22:31:44.079Z | movielens-pre-schema-quiescence-live-main | local-fix | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-2.diff |
| 2026-07-15T22:35:46.276Z | movielens-pre-schema-quiescence-live-main | widen-scope | 1 -> 1 | flat | no_previous | theory-20260715-schema-admission-required-fields-optional-discount | diff:solve/changes/movielens-pre-schema-quiescence-live/attempt-3.diff |
