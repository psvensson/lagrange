# Solve report: movielens-priority-spread-gap-coverage-authority

**Goal:** Priority-recovery publication closure certifies a partition only when its existing numeric spread gap is covered by distinct eligible operation targets; one operation cannot close a gap larger than one, gap-one optimistic progress and operation safety remain intact, and a focused model rejects publication satisfaction with uncovered spread.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-priority-spread-gap-coverage-authority-2026-07-16T08-35-33-843Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-replace-bootstrap-cohort-authority
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 11
- Change bytes: 21127
- Owner areas: models, scripts/model-tlc.js, scripts/run-movielens-priority-spread-gap-coverage-authority-scenarios.js, src/control-plane, test/control-plane
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 5 owner areas: models, scripts/model-tlc.js, scripts/run-movielens-priority-spread-gap-coverage-authority-scenarios.js, src/control-plane, test/control-plane
- Split plan:
  - models: 4 file(s)
  - test/control-plane: 3 file(s)
  - src/control-plane: 2 file(s)
  - scripts/model-tlc.js: 1 file(s)
  - scripts/run-movielens-priority-spread-gap-coverage-authority-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **movielens-priority-spread-gap-coverage-authority-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **movielens-priority-spread-gap-coverage-authority-main**: On current HEAD 719020ce, the real priority-recovery decision-to-publication closure seam collapses canonical spreadGap=2 to satisfied when only one distinct eligible operation target is operational: the directed production-owner test fails six assertions, publishes a satisfied closure, and hides the uncovered follow-up unit. The changed-live control-plane publication log independently oscillates between all-six satisfied and all-six blocked while the final services authority shows five of six priority partitions still at only two distinct nodes. [test/control-plane/priority-recovery-snapshot-terminal-placement-spread-closure-test-cases.js]
- **movielens-priority-spread-gap-coverage-authority-main**: Ingested evidence from priority-spread-coverage-tlc-count-aware.model.report.json. Metric: unknown -> null. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/priority-spread-coverage-tlc-count-aware.model.report.json]
- **movielens-priority-spread-gap-coverage-authority-main**: The focused PrioritySpreadCoverage TLA+ composition now models numeric structural demand, distinct eligible operation targets, publication certification, and the follow-up obligation. TLC proves both invariants with count-aware closure and exhibits the Boolean-collapse counterexample when one target certifies an uncovered gap of two. [test-output/reports/priority-spread-coverage-tlc-count-aware.model.report.json]
- **movielens-priority-spread-gap-coverage-authority-main**: Ingested evidence from movielens-priority-spread-gap-coverage-authority-2026-07-16T08-31-37-192Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-priority-spread-gap-coverage-authority-2026-07-16T08-31-37-192Z.report.json]
- **movielens-priority-spread-gap-coverage-authority-main**: Ingested evidence from movielens-priority-spread-gap-coverage-authority-2026-07-16T08-31-37-192Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-priority-spread-gap-coverage-authority-2026-07-16T08-31-37-192Z.report.json]
- **movielens-priority-spread-gap-coverage-authority-main**: Ingested evidence from movielens-priority-spread-gap-coverage-authority-2026-07-16T08-33-30-741Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-priority-spread-gap-coverage-authority-2026-07-16T08-33-30-741Z.report.json]
- **movielens-priority-spread-gap-coverage-authority-main**: Ingested evidence from movielens-priority-spread-gap-coverage-authority-2026-07-16T08-33-30-741Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-priority-spread-gap-coverage-authority-2026-07-16T08-33-30-741Z.report.json]
- **movielens-priority-spread-gap-coverage-authority-main**: Ingested evidence from movielens-priority-spread-gap-coverage-authority-2026-07-16T08-35-10-487Z.report.json. Metric: 0 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-priority-spread-gap-coverage-authority-2026-07-16T08-35-10-487Z.report.json]
- **movielens-priority-spread-gap-coverage-authority-main**: Ingested evidence from movielens-priority-spread-gap-coverage-authority-2026-07-16T08-35-10-487Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-priority-spread-gap-coverage-authority-2026-07-16T08-35-10-487Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T08:35:33.904Z | movielens-priority-spread-gap-coverage-authority-main | observe | 1 -> 0 | progress | unknown |  | diff:solve/changes/movielens-priority-spread-gap-coverage-authority/attempt-1.diff |
