# Solve report: movielens-local-leader-row-visibility-model

**Goal:** The focused local-leader-row model passes with preserved causal versions and pre-submit ownership rechecks, while missing-seed, stale-publish-after-demotion, and local-timestamp-bump mutants each produce their declared counterexample.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-local-leader-row-visibility
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Current Blocker
- Frontier: movielens-local-leader-row-visibility-model-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: solved: PASS -> PASS
- Latest evidence: test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-local-leader-row-visibility-model-main
- No longer current: PASS

## Continuation
- Status: allowed
- Next action: continue supervised step for movielens-local-leader-row-visibility-model-main
- Blocker: none

## Scope Pressure
- Changed files: 10
- Change bytes: 23782
- Owner areas: models, scripts/model-tlc.js, scripts/run-movielens-local-leader-row-visibility-model-scenarios.js, test/scripts
- Categories: other, test
- Action: land or separate 4 owner areas: models, scripts/model-tlc.js, scripts/run-movielens-local-leader-row-visibility-model-scenarios.js, test/scripts
- Split plan:
  - models: 7 file(s)
  - scripts/model-tlc.js: 1 file(s)
  - scripts/run-movielens-local-leader-row-visibility-model-scenarios.js: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-local-leader-row-visibility-model-main** [open] rung 1, attempts 1, metric 0 -> 0

## Findings
- **movielens-local-leader-row-visibility-model-main**: Ingested evidence from local-leader-row-visibility-fixed.model.report.json. Metric: unknown -> null. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/local-leader-row-visibility-fixed.model.report.json]
- **movielens-local-leader-row-visibility-model-main**: Ingested evidence from movielens-local-leader-row-visibility-model-2026-07-16T11-06-44-503Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-06-44-503Z.report.json]
- **movielens-local-leader-row-visibility-model-main**: On current HEAD aead52ac the fixed focused model passes, while missing seed, missing pre-submit fence, locally minted timestamp, and discarded demotion-replay provenance each reproduce the declared counterexample. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-06-44-503Z.report.json]
- **movielens-local-leader-row-visibility-model-main**: Ingested evidence from movielens-local-leader-row-visibility-model-2026-07-16T11-06-44-503Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-06-44-503Z.report.json]
- **movielens-local-leader-row-visibility-model-main**: Ingested evidence from movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json]
- **movielens-local-leader-row-visibility-model-main**: Ingested evidence from movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T11:08:12.344Z | movielens-local-leader-row-visibility-model-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/movielens-local-leader-row-visibility-model/attempt-1.diff |
