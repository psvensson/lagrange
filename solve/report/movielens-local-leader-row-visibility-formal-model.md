# Solve report: movielens-local-leader-row-visibility-formal-model

**Goal:** A fresh integrity Quest supersedes the history-bearing local-leader-row-visibility-model Quest: the focused local-leader-row model passes with preserved causal versions and pre-submit ownership rechecks, while missing-seed, stale-publish-after-demotion, local-timestamp-bump, and demoted-durable-replay mutants each produce their declared counterexample.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-local-leader-row-visibility
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

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
- **movielens-local-leader-row-visibility-formal-model-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **movielens-local-leader-row-visibility-formal-model-main**: Ingested evidence from movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json]
- **movielens-local-leader-row-visibility-formal-model-main**: Ingested evidence from movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-11-03-991Z.report.json]
- **movielens-local-leader-row-visibility-formal-model-main**: Independent verification passed for this exact unchanged source fingerprint: fixed TLC, all four intended mutants, the scenario adapter's fresh-report binding, full model contracts, runtime binding tests, lint, diff integrity, and the focused non-exhaustive coverage disclaimer were all checked. [subagent:verify_local_leader_model_attempt1]
- **movielens-local-leader-row-visibility-formal-model-main**: Fresh focused TLA+ evidence: the fixed local-leader row composition satisfies immediate local evidence, demotion safety, successor precedence, and convergence-or-ownership-change; missing seed, stale post-demotion publish, local timestamp minting, and demoted durable replay each violate their declared property. This is intentionally not exhaustive cross-layer coverage. [models/local-leader-row-visibility/LocalLeaderRowVisibility.tla]
- **movielens-local-leader-row-visibility-formal-model-main**: Independent post-checkpoint aggregate verification passed: commit 36128cf6 contains the exact approved 14-path package; the 10-path source/model/test delta and committed attempt artifact both hash to the aggregate fingerprint; fixed TLC, four intended mutants, 130 runtime-binding assertions, full model contracts, harness freshness, and recovery/replay semantics all passed. [subagent:verify_local_leader_model_attempt1]
- **movielens-local-leader-row-visibility-formal-model-main**: Ingested evidence from movielens-local-leader-row-visibility-model-2026-07-16T11-18-24-002Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-18-24-002Z.report.json]
- **movielens-local-leader-row-visibility-formal-model-main**: Ingested evidence from movielens-local-leader-row-visibility-model-2026-07-16T11-18-24-002Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-local-leader-row-visibility-model-2026-07-16T11-18-24-002Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T11:16:42.513Z | movielens-local-leader-row-visibility-formal-model-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/movielens-local-leader-row-visibility-formal-model/attempt-1.diff |
