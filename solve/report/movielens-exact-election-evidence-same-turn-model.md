# Solve report: movielens-exact-election-evidence-same-turn-model

**Goal:** A focused cross-layer TLA+ model proves that an exact completed target-election acknowledgment is recorded and routed in the same owner turn through canonical remove safety before retry expiry can retarget it, while a delayed-continuation mutant violates exact-evidence terminality and a continuation-authorizes-removal mutant violates the safety-owner/interlock invariant.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-exact-election-evidence-same-turn-model-2026-07-16T11-31-17-749Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-exact-election-evidence-same-turn-owner
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 8
- Change bytes: 19079
- Owner areas: models, scripts/model-tlc.js, scripts/run-movielens-exact-election-evidence-same-turn-model-scenarios.js, test/scripts
- Categories: other, test
- Action: land or separate 4 owner areas: models, scripts/model-tlc.js, scripts/run-movielens-exact-election-evidence-same-turn-model-scenarios.js, test/scripts
- Split plan:
  - models: 5 file(s)
  - scripts/model-tlc.js: 1 file(s)
  - scripts/run-movielens-exact-election-evidence-same-turn-model-scenarios.js: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-exact-election-evidence-same-turn-model-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **movielens-exact-election-evidence-same-turn-model-main**: Ingested evidence from movielens-exact-election-evidence-same-turn-model-2026-07-16T11-31-17-749Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-exact-election-evidence-same-turn-model-2026-07-16T11-31-17-749Z.report.json]
- **movielens-exact-election-evidence-same-turn-model-main**: Ingested evidence from movielens-exact-election-evidence-same-turn-model-2026-07-16T11-31-17-749Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-exact-election-evidence-same-turn-model-2026-07-16T11-31-17-749Z.report.json]
- **movielens-exact-election-evidence-same-turn-model-main**: On runtime checkpoint 9b69f538, fresh TLC reproduces both sealed forbidden shapes in their mutants while the fixed exact-evidence same-turn composition passes; the model Quest remains necessary as cross-layer proof rather than as a second runtime intervention. [test-output/reports/movielens-exact-election-evidence-same-turn-model-2026-07-16T11-31-17-749Z.report.json]
- **movielens-exact-election-evidence-same-turn-model-main**: Ingested evidence from movielens-exact-election-evidence-same-turn-model-2026-07-16T11-34-56-816Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-exact-election-evidence-same-turn-model-2026-07-16T11-34-56-816Z.report.json]
- **movielens-exact-election-evidence-same-turn-model-main**: Ingested evidence from movielens-exact-election-evidence-same-turn-model-2026-07-16T11-34-56-816Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-exact-election-evidence-same-turn-model-2026-07-16T11-34-56-816Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T11:32:24.096Z | movielens-exact-election-evidence-same-turn-model-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/movielens-exact-election-evidence-same-turn-model/attempt-1.diff |
