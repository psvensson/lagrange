# Solve report: service-portability-claims-surface-final

**Goal:** The public capability matrix, documentation, JavaScript-envelope rehearsal, and distributed examples-catalog harness use one truthful capability grammar; both the claims attacks and real examples scenario pass, while restoring the retired wasmCompiled fixture makes the service-portability-claims-surface-final scenario fail.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T07-02-36-310Z.report.json

**Attempts:** 4

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r1--truthful-capability-contract
- parent quest: service-portability-claims-surface-v2
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 15
- Change bytes: 147196
- Owner areas: README.md, docs, examples, scripts/checks, test/distributed/harness, test/scripts
- Categories: docs, other, runtime, test
- Action: split by owner area before the next attempt (15 files)
- Action: land or separate 6 owner areas: README.md, docs, examples, scripts/checks, test/distributed/harness, test/scripts
- Split plan:
  - examples: 5 file(s)
  - docs: 4 file(s)
  - scripts/checks: 3 file(s)
  - README.md: 1 file(s)
  - test/distributed/harness: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **service-portability-claims-surface-final-main** [solved] rung 3, attempts 4, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-portability-claims-surface-final-main**: Independent verification rejected the exact atomic replacement: it fixed the catalog fixture but left present-tense genuine-WASM claims in README.md, omitted docs/README.md and docs/dockerhub-overview.md, accepted semantic paraphrases, did not bind mutations to a valid changed baseline, and lacked actual envelope packaging evidence. [subagent:verify_portability_plan]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T06-53-42-923Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T06-53-42-923Z.report.json]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T06-53-42-923Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T06-53-42-923Z.report.json]
- **service-portability-claims-surface-final-main**: attempt 2 cannot supersede the rejected predecessor because it omits one rejected source path [subagent:verify_portability_plan]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T06-59-04-907Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T06-59-04-907Z.report.json]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T06-59-04-907Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T06-59-04-907Z.report.json]
- **service-portability-claims-surface-final-main**: independent verification passed [subagent:verify_portability_plan]
- **service-portability-claims-surface-final-main**: attempt 3 is not a checkpointable exact receipt because it omits canonical full Git object IDs [subagent:verify_portability_plan]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T07-02-36-310Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T07-02-36-310Z.report.json]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T07-02-36-310Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T07-02-36-310Z.report.json]
- **service-portability-claims-surface-final-main**: independent verification passed [subagent:verify_portability_plan]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T07-05-42-304Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T07-05-42-304Z.report.json]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T07-05-42-304Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T07-05-42-304Z.report.json]
- **service-portability-claims-surface-final-main**: independent verification passed [subagent:verify_portability_plan]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T07-07-29-287Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T07-07-29-287Z.report.json]
- **service-portability-claims-surface-final-main**: Ingested evidence from service-portability-claims-surface-final-2026-07-14T07-07-29-287Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-surface-final/service-portability-claims-surface-final-2026-07-14T07-07-29-287Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T06:50:48.864Z | service-portability-claims-surface-final-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/service-portability-claims-surface-final/attempt-1.diff |
| 2026-07-14T06:56:43.583Z | service-portability-claims-surface-final-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/service-portability-claims-surface-final/attempt-2.diff |
| 2026-07-14T07:01:58.339Z | service-portability-claims-surface-final-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/service-portability-claims-surface-final/attempt-3.diff |
| 2026-07-14T07:05:13.297Z | service-portability-claims-surface-final-main | widen-scope | 0 -> 0 | flat | solved |  | diff:solve/changes/service-portability-claims-surface-final/attempt-4.diff |
