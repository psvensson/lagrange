# Solve report: movielens-pre-schema-priority-spread-admission-authority

**Goal:** The production MovieLens pre-schema admission consumes the authoritative priority-partition numeric spread summary as mandatory data, cannot accumulate or admit its unchanged stability window while any priority spread gap or evidence blindness remains open, and admits only after the published summary is satisfied with zero total spread gap.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 0

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-priority-spread-gap-coverage-authority
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: movielens-pre-schema-priority-spread-admission-authority-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: FAIL
- Latest evidence: test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T08-58-07-295Z.report.json
- Selected theory: none
- Next move: continue supervised step for movielens-pre-schema-priority-spread-admission-authority-main

## Continuation
- Status: blocked-unrecorded-evidence
- Next action: continue supervised step for movielens-pre-schema-priority-spread-admission-authority-main
- Blocker: fresh frontier evidence is not recorded; run node scripts/solve.js ingest-evidence --id movielens-pre-schema-priority-spread-admission-authority --frontier movielens-pre-schema-priority-spread-admission-authority-main --evidence test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-00-52-594Z.report.json

## Scope Pressure
- Changed files: 0
- Change bytes: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **movielens-pre-schema-priority-spread-admission-authority-main** [open] rung 0, attempts 0, metric ? -> 1

## Findings
- **movielens-pre-schema-priority-spread-admission-authority-main**: Ingested evidence from movielens-pre-schema-priority-spread-admission-authority-2026-07-16T08-58-07-295Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T08-58-07-295Z.report.json]
- **movielens-pre-schema-priority-spread-admission-authority-main**: On unchanged product HEAD 71428943, the exact admin-snapshot-to-schema-admission seam fails: a published totalSpreadGap=2 contributes a quiet confirmation and admits after two observations instead of resetting; absent priorityPartitionSummary also admits. The red guard report records 0/1 files green and preserves the numeric gap witness. [test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T08-58-07-295Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
