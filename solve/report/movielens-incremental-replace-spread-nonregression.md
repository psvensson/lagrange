# Solve report: movielens-incremental-replace-spread-nonregression

**Goal:** Priority remove safety uses the existing authoritative voter-ready row sets to enforce per-REPLACE quorum and distinct-node spread non-regression instead of final-target satisfaction: serialized intermediate replacements may preserve two-node spread while the published target is three, but spread regression and voter-floor loss remain blocked; the unchanged interlock and membership/leadership safeguards hold, and the production five-node MovieLens milestone completes successfully.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-three-way-affinity-demo
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Current Blocker
- Frontier: movielens-incremental-replace-spread-nonregression-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: narrowed: FAIL -> FAIL
- Latest evidence: test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-incremental-replace-spread-nonregression-main
- No longer current: FAIL

## Continuation
- Status: blocked-theory
- Next action: record and select frontier theory for movielens-incremental-replace-spread-nonregression-main with npm run model:contracts as discriminator
- Blocker: frontier theory required for movielens-incremental-replace-spread-nonregression-main

## Scope Pressure
- Changed files: 14
- Change bytes: 31706
- Owner areas: models, scripts/analyze-replace-safety-blocks.js, scripts/model-tlc.js, scripts/run-movielens-incremental-replace-spread-nonregression-scenarios.js, src/rebalancer, test/rebalancer
- Categories: other, runtime
- Action: split by owner area before the next attempt (14 files)
- Action: land or separate 6 owner areas: models, scripts/analyze-replace-safety-blocks.js, scripts/model-tlc.js, scripts/run-movielens-incremental-replace-spread-nonregression-scenarios.js, src/rebalancer, test/rebalancer
- Split plan:
  - models: 6 file(s)
  - src/rebalancer: 3 file(s)
  - test/rebalancer: 2 file(s)
  - scripts/analyze-replace-safety-blocks.js: 1 file(s)
  - scripts/model-tlc.js: 1 file(s)
  - scripts/run-movielens-incremental-replace-spread-nonregression-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **movielens-incremental-replace-spread-nonregression-main** [open] rung 2, attempts 2, metric 1 -> 1

## Findings
- **movielens-incremental-replace-spread-nonregression-main**: DT red-on-revert proven for test/rebalancer/priority-remove-safety-spread-nonregression.test.js [dt:solve/changes/dt-prove/priority-remove-safety-spread-nonregression.test.js-2026-07-16T09-37-10-486Z.json]
- **movielens-incremental-replace-spread-nonregression-main**: Three consecutive deterministic guard runs pass the centralized projection and production owner adapter: authoritative 2-to-2 spread below target 3 is SAFE, 2-to-1 is DEFER, and missing current-row evidence retains the final-target fail-closed floor. [test-output/reports/movielens-incremental-replace-spread-nonregression-2026-07-16T09-36-23-637Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: Focused TLC composition proves serialized non-regressing replacements preserve safety and reach the published target. [test-output/reports/incremental-replace-spread-nonregression.model.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: TLC exhibits the live 2-of-3 ownership gap when every intermediate source removal is required to satisfy the final target: OpenGapRetainsSerializedProgressOwner is violated. [test-output/reports/incremental-replace-spread-final-target-deadlock.model.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: TLC rejects a blanket relaxation: a spread-reducing removal violates SpreadNeverRegresses. [test-output/reports/incremental-replace-spread-regression.model.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: After the final diagnostic correction, three consecutive deterministic guard runs pass: centralized and production-owner paths preserve 2-to-2 below target 3, block 2-to-1 against the local floor 2, and fail closed without current-row evidence. [test-output/reports/movielens-incremental-replace-spread-nonregression-2026-07-16T09-42-01-306Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: DT red-on-revert is rebound to the final exact source set, including the shared diagnostic owner: fix green, revert red, restore green. [dt:solve/changes/dt-prove/priority-remove-safety-spread-nonregression.test.js-2026-07-16T09-42-13-489Z.json]
- **movielens-incremental-replace-spread-nonregression-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T09-19-33-749Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T09-19-33-749Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: Independent verifier rejected attempt 1: analyzer markdown still hardcodes spread_floor as below 2/3 after producer semantics changed to a protected per-operation floor. [subagent:verify_incremental_replace_attempt1]
- **movielens-incremental-replace-spread-nonregression-main**: Replacement-attempt guard passes 42 assertions: centralized projection and production owner preserve 2-to-2, block 2-to-1, fail closed without current evidence, and operator analyzer prose exposes the protected per-operation floor without hardcoded 2/3. [test-output/reports/movielens-incremental-replace-spread-nonregression-2026-07-16T09-53-41-778Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: Independent verification passed for the replacement attempt: one centralized data-driven owner, local spread-floor diagnostics and analyzer tail agree, safety/interlock contracts are unchanged, and fixed/mutant TLC outcomes hold. [subagent:verify_incremental_replace_attempt1]
- **movielens-incremental-replace-spread-nonregression-main**: Final replacement-attempt bytes are red-on-revert proven across the runtime remove-safety owner and operator analyzer tail: fix green, revert red, restore green. [dt:solve/changes/dt-prove/priority-remove-safety-spread-nonregression.test.js-2026-07-16T09-55-32-531Z.json]
- **movielens-incremental-replace-spread-nonregression-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: Changed live run at bd2e32d5 did not re-emit the former projected-spread 2/3 blocker in its terminal report; schema admission held safely for the full unchanged budget, then failed because the control snapshot lane became stale_usable at cache_stale_watermark. Current failed run is preserved immutably for underlying-log discrimination; no unchanged rerun is allowed. [data/examples/service-data-affinity-demo-archive/wave4-live-incremental-replace-spread-nonregression-2026-07-16T10-00-24-317Z.tar.gz]
- **movielens-incremental-replace-spread-nonregression-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: The sealed live symptom still reproduces on checkpoint HEAD bd2e32d5: the changed run reached final priority spread gap 0, but completed too late for the unchanged 60000ms stability window and terminally reported stale_usable/cache_stale_watermark. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: Changed-live discriminator: the per-operation spread non-regression fix engaged and removed the prior final-target blocker. The first serialized REPLACE terminalized, a second was created immediately, its replacement became voter-ready and active, and the operation eventually reached REMOVED at 10:00:09.371 with totalSpreadGap=0; only about 15 seconds remained before the immutable 10:00:24 report, so the 60000ms stability window could not complete. The dominant intermediate delay was replacement leader ownership visibility: four remove-safety deferrals were all replacement_leader_pending after directed target-election actions completed. This rules out the spread policy as the remaining Wave-4 blocker and re-confirms the data/evidence boundary isolated in formation-ledger-self-move-blocks-cluster-ops. [data/examples/service-data-affinity-demo-archive/wave4-live-incremental-replace-spread-nonregression-2026-07-16T10-00-24-317Z.tar.gz]
- **movielens-incremental-replace-spread-nonregression-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: Changed live run 2026-07-16T11:41Z eliminated the prior exact-election blocker but exposed a later generic operation-ledger lifecycle gap: after operation_ledger_quorum_concentrated opened, five replacement operations were created concurrently and remained without workflow dispatch until the control snapshot failed stale_replica_operations_in_flight. Immutable archive data/examples/service-data-affinity-demo-archive/wave4-live-exact-election-same-turn-2026-07-16T11-45-37-305Z.tar.gz sha256 65b98a3f92c3216a7f782b09acc7ff1e0eb060408facc31bec307b7a9f03c3e5; report sha256 bd79ff4228a9a15214631966b3d38cd909e7e404cbf87adc708960385e24c4fe.
- **movielens-incremental-replace-spread-nonregression-main**: Correction after immutable full-log inspection: the five post-hold operations did dispatch between 11:44:48 and 11:44:57 and all created target replicas by 11:45:20. The earlier no-dispatch summary was based on creator-side lines only. The stronger root is premature self-move serialization release: dependent creation began 11:44:43 while replica_operations self-move b0b... remained nonterminal until 11:44:51, then every dependent workflow-step write failed against replica_operations. Treat the preceding no-dispatch wording as superseded.
- **movielens-incremental-replace-spread-nonregression-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **movielens-incremental-replace-spread-nonregression-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T09:44:59.172Z | movielens-incremental-replace-spread-nonregression-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-incremental-replace-spread-nonregression/attempt-1.diff |
| 2026-07-16T09:54:04.509Z | movielens-incremental-replace-spread-nonregression-main | local-fix | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-incremental-replace-spread-nonregression/attempt-2.diff |
