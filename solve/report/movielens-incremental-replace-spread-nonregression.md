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
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for movielens-incremental-replace-spread-nonregression-main

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
