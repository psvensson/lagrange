# Solve report: service-installation-reconciler

**Goal:** Under one production write authority, every Phase-1 OCI or WASM install and upgrade intent deterministically records one non-retryable activation_unsupported failure and settles recorded_not_running, while removal of an installation that never activated settles removed; startup and periodic authoritative reconciliation recover partial work without service-definition, instance, endpoint, or runtime-driver mutation.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-installation-reconciler/service-installation-reconciler-2026-07-14T14-36-30-640Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 10
- Change bytes: 88884
- Owner areas: scripts/checks, src/bootstrap, src/service, test/bootstrap, test/service
- Categories: other, runtime, test
- Action: land or separate 5 owner areas: scripts/checks, src/bootstrap, src/service, test/bootstrap, test/service
- Split plan:
  - src/bootstrap: 6 file(s)
  - scripts/checks: 1 file(s)
  - src/service: 1 file(s)
  - test/bootstrap: 1 file(s)
  - test/service: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **service-installation-reconciler-main** [solved] rung 1, attempts 2, metric 2 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-installation-reconciler-main**: Ingested evidence from service-installation-reconciler-2026-07-14T14-13-46-674Z.report.json. Metric: unknown -> 2. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-installation-reconciler/service-installation-reconciler-2026-07-14T14-13-46-674Z.report.json]
- **service-installation-reconciler-main**: Ingested evidence from service-installation-reconciler-2026-07-14T14-13-46-674Z.report.json. Metric: 2 -> 2. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-installation-reconciler/service-installation-reconciler-2026-07-14T14-13-46-674Z.report.json]
- **service-installation-reconciler-main**: Ingested evidence from service-installation-reconciler-2026-07-14T14-19-55-757Z.report.json. Metric: 2 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-installation-reconciler/service-installation-reconciler-2026-07-14T14-19-55-757Z.report.json]
- **service-installation-reconciler-main**: Ingested evidence from service-installation-reconciler-2026-07-14T14-19-55-757Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-installation-reconciler/service-installation-reconciler-2026-07-14T14-19-55-757Z.report.json]
- **service-installation-reconciler-main**: Independent verification rejected this exact attempt: active zero-runtime, per-installation single-flight, seed/join cleanup, never-activated removal, literal-owner, and explicit timer-state guards were incomplete [subagent:verify_s4_reconciler]
- **service-installation-reconciler-main**: Ingested evidence from service-installation-reconciler-2026-07-14T14-36-30-640Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-installation-reconciler/service-installation-reconciler-2026-07-14T14-36-30-640Z.report.json]
- **service-installation-reconciler-main**: Ingested evidence from service-installation-reconciler-2026-07-14T14-36-30-640Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-installation-reconciler/service-installation-reconciler-2026-07-14T14-36-30-640Z.report.json]
- **service-installation-reconciler-main**: Independent verification approved the same-base replacement attempt and identical aggregate after every rejected mutation turned red [subagent:phase1_s5b_preflight]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T14:21:00.047Z | service-installation-reconciler-main | observe | 2 -> 0 | progress | solved |  | diff:solve/changes/service-installation-reconciler/attempt-1.diff |
| 2026-07-14T14:37:20.128Z | service-installation-reconciler-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/service-installation-reconciler/attempt-2.diff |
