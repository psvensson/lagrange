# Solve report: movielens-pre-schema-priority-spread-admission-authority-measured

**Goal:** The production MovieLens pre-schema admission consumes the authoritative priority-partition numeric spread summary as mandatory data, cannot accumulate or admit its unchanged stability window while any priority spread gap or evidence blindness remains open, and admits only after the published summary is satisfied with zero total spread gap.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-pre-schema-priority-spread-admission-authority
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-pre-schema-priority-spread-admission-authority-measured-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: PASS
- Latest evidence: test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-06-21-593Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-pre-schema-priority-spread-admission-authority-measured-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 9
- Change bytes: 16668
- Owner areas: examples, models, scripts/model-tlc.js, scripts/run-movielens-pre-schema-priority-spread-admission-authority-scenarios.js, test/runtime
- Categories: other, test
- Action: land or separate 5 owner areas: examples, models, scripts/model-tlc.js, scripts/run-movielens-pre-schema-priority-spread-admission-authority-scenarios.js, test/runtime
- Split plan:
  - models: 5 file(s)
  - examples: 1 file(s)
  - scripts/model-tlc.js: 1 file(s)
  - scripts/run-movielens-pre-schema-priority-spread-admission-authority-scenarios.js: 1 file(s)
  - test/runtime: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **movielens-pre-schema-priority-spread-admission-authority-measured-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **movielens-pre-schema-priority-spread-admission-authority-measured-main**: Ingested evidence from movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-06-21-593Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-06-21-593Z.report.json]
- **movielens-pre-schema-priority-spread-admission-authority-measured-main**: Ingested evidence from movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-06-21-593Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-06-21-593Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T09:06:35.768Z | movielens-pre-schema-priority-spread-admission-authority-measured-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/movielens-pre-schema-priority-spread-admission-authority-measured/attempt-1.diff |
