# Solve report: movielens-pre-schema-priority-spread-admission-authority-measured

**Goal:** The production MovieLens pre-schema admission consumes the authoritative priority-partition numeric spread summary as mandatory data, cannot accumulate or admit its unchanged stability window while any priority spread gap or evidence blindness remains open, and admits only after the published summary is satisfied with zero total spread gap.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-09-12-058Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-pre-schema-priority-spread-admission-authority
- plan: solve/epics/service-data-affinity-placement.md

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
- **movielens-pre-schema-priority-spread-admission-authority-measured-main**: Post-attempt TLC model evidence proves count-aware publication plus schema admission requires the published covered-spread summary; all fixed invariants hold. [test-output/reports/priority-spread-coverage-tlc-count-aware.model.report.json]
- **movielens-pre-schema-priority-spread-admission-authority-measured-main**: Post-attempt TLC counterexample evidence exhibits the cross-layer schema-admission bypass and violates SchemaAdmissionRequiresCoveredSpread as expected. [test-output/reports/priority-spread-schema-admission-bypass.model.report.json]
- **movielens-pre-schema-priority-spread-admission-authority-measured-main**: Independent verifier approved the exact 9-file attempt: single published numeric spread owner, fail-closed gap/blindness admission, unchanged live policy, fixed and counterexample TLC outcomes, and no forbidden shortcuts. [subagent:verify_pre_schema_spread]
- **movielens-pre-schema-priority-spread-admission-authority-measured-main**: Ingested evidence from movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-09-12-058Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-09-12-058Z.report.json]
- **movielens-pre-schema-priority-spread-admission-authority-measured-main**: Ingested evidence from movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-09-12-058Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-pre-schema-priority-spread-admission-authority-2026-07-16T09-09-12-058Z.report.json]
- **movielens-pre-schema-priority-spread-admission-authority-measured-main**: Independent verifier recomputed and approved the exact terminal aggregate; implementation files match the approved attempt and the later checkpoint changed only the generated Quest report. [subagent:verify_pre_schema_spread]

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
