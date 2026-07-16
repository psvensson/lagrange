# Solve report: movielens-observation-watermark-churn-consolidation

**Goal:** The consolidated data-owned authoritative-observation watermark (distinct per-table observation time and cause, gateway-minted complete-table receipts, fail-closed publication) together with causally-explained divergence tolerance lands as one bounded committed source change: reconcileAuthoritativeCacheRows skips and excuses only rows the cache's own causal order proves newer than the authoritative read, so the continuously heartbeat-mutated nodes table publishes complete-table observation evidence under live churn while silently dropped writes, genuinely stale caches, and incomplete reads remain fail-closed; the deterministic dt6 composition proves red-on-revert, the TLA model's ExactEqualityReconcileGate mutant violates eventual schema admission while the fixed spec converges, and the unchanged five-node MovieLens live scenario no longer blocks schema admission in the authoritative-observation seam.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-authoritative-observation-watermark
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Current Blocker
- Frontier: movielens-observation-watermark-churn-consolidation-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for movielens-observation-watermark-churn-consolidation-main

## Continuation
- Status: allowed
- Next action: continue supervised step for movielens-observation-watermark-churn-consolidation-main
- Blocker: none

## Scope Pressure
- Changed files: 21
- Change bytes: 125524
- Owner areas: models, scripts/model-tlc.js, src/admin, src/cache, src/control-plane, test/convergence
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (21 files)
- Action: land or separate 6 owner areas: models, scripts/model-tlc.js, src/admin, src/cache, src/control-plane, test/convergence
- Split plan:
  - models: 6 file(s)
  - src/admin: 5 file(s)
  - src/control-plane: 5 file(s)
  - src/cache: 3 file(s)
  - scripts/model-tlc.js: 1 file(s)
  - test/convergence: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **movielens-observation-watermark-churn-consolidation-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **movielens-observation-watermark-churn-consolidation-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T22:14:49.749Z | movielens-observation-watermark-churn-consolidation-main | observe | 1 -> 1 | flat | no_evidence |  | diff:solve/changes/movielens-observation-watermark-churn-consolidation/attempt-1.diff |
