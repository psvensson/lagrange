# Solve report: service-portability-claims-contract

**Goal:** The public distributed-SQL WASM example and service documentation identify the current JavaScript artifact as lifecycle scaffolding rather than compiled WebAssembly, reserve installable wasm_component and oci_container claims for their real activation paths, reject external native_js manifests, and the service-portability-claims-contract scenario fails on any regression of those boundaries.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-portability-claims-contract/service-portability-claims-contract-2026-07-14T07-09-47-347Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r1--truthful-capability-contract
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 5
- Change bytes: 7536
- Owner areas: architecture, package.json, scripts/check-service-portability-claims.js, scripts/run-service-portability-claims-contract-scenarios.js, test/scripts
- Categories: docs, other, test, workflow
- Action: land or separate 5 owner areas: architecture, package.json, scripts/check-service-portability-claims.js, scripts/run-service-portability-claims-contract-scenarios.js, test/scripts
- Split plan:
  - architecture: 1 file(s)
  - package.json: 1 file(s)
  - scripts/check-service-portability-claims.js: 1 file(s)
  - scripts/run-service-portability-claims-contract-scenarios.js: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **service-portability-claims-contract-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **service-portability-claims-contract-main**: The first candidate patch was rejected before attempt recording at 15 files, 10 owner areas, and 35,746 bytes. The sealed capability-grammar result remains valid, but implementation must split into a public claims/evidence surface child and a static-gate wiring child; the parent will measure their integrated scenario after both land. [solve/changes/service-portability-claims-contract/attempt-1.diff]
- **service-portability-claims-contract-main**: Ingested evidence from service-portability-claims-contract-2026-07-14T07-08-56-905Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-contract/service-portability-claims-contract-2026-07-14T07-08-56-905Z.report.json]
- **service-portability-claims-contract-main**: Ingested evidence from service-portability-claims-contract-2026-07-14T07-08-56-905Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-contract/service-portability-claims-contract-2026-07-14T07-08-56-905Z.report.json]
- **service-portability-claims-contract-main**: Model contract suite passed after the runtime lifecycle status-table correction; the edit changes documentation of implementation state and introduces no owner or transition change. [test-output/reports/active-gate-model-route.model.report.json]
- **service-portability-claims-contract-main**: independent verification passed [subagent:verify_portability_plan]
- **service-portability-claims-contract-main**: Ingested evidence from service-portability-claims-contract-2026-07-14T07-10-43-956Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-contract/service-portability-claims-contract-2026-07-14T07-10-43-956Z.report.json]
- **service-portability-claims-contract-main**: Ingested evidence from service-portability-claims-contract-2026-07-14T07-10-43-956Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-contract/service-portability-claims-contract-2026-07-14T07-10-43-956Z.report.json]
- **service-portability-claims-contract-main**: independent verification passed [subagent:verify_portability_plan]
- **service-portability-claims-contract-main**: Ingested evidence from service-portability-claims-contract-2026-07-14T07-13-04-755Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-contract/service-portability-claims-contract-2026-07-14T07-13-04-755Z.report.json]
- **service-portability-claims-contract-main**: Ingested evidence from service-portability-claims-contract-2026-07-14T07-13-04-755Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-portability-claims-contract/service-portability-claims-contract-2026-07-14T07-13-04-755Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T07:09:59.508Z | service-portability-claims-contract-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/service-portability-claims-contract/attempt-2.diff |
