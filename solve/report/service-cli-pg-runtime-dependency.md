# Solve report: service-cli-pg-runtime-dependency

**Goal:** The package manifest and lockfile declare pg as a production dependency required by the shipped lagrange service lifecycle CLI, while preserving every existing binary, script, dependency version, and package contract.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-42-13-609Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 9
- Change bytes: 24596
- Owner areas: architecture, package-lock.json, package.json, scripts/checks, solve, test/packaging
- Categories: docs, other, test, workflow
- Action: land or separate 6 owner areas: architecture, package-lock.json, package.json, scripts/checks, solve, test/packaging
- Split plan:
  - solve: 3 file(s)
  - scripts/checks: 2 file(s)
  - architecture: 1 file(s)
  - package-lock.json: 1 file(s)
  - package.json: 1 file(s)
  - test/packaging: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **service-cli-pg-runtime-dependency-main** [solved] rung 1, attempts 2, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-cli-pg-runtime-dependency-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-37-00-063Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-37-00-063Z.report.json]
- **service-cli-pg-runtime-dependency-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-37-00-063Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-37-00-063Z.report.json]
- **service-cli-pg-runtime-dependency-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-39-22-768Z.report.json. Metric: 1 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-39-22-768Z.report.json]
- **service-cli-pg-runtime-dependency-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-39-22-768Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-39-22-768Z.report.json]
- **service-cli-pg-runtime-dependency-main**: attempt artifact included five unrelated staged paths and omitted both required untracked package proof paths [subagent:phase1_s5a_preflight]
- **service-cli-pg-runtime-dependency-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-42-13-609Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-42-13-609Z.report.json]
- **service-cli-pg-runtime-dependency-main**: Ingested evidence from service-init-scaffold-2026-07-14T15-42-13-609Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T15-42-13-609Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T15:39:33.406Z | service-cli-pg-runtime-dependency-main | observe | 1 -> 0 | progress | solved |  | diff:solve/changes/service-cli-pg-runtime-dependency/attempt-1.diff |
| 2026-07-14T15:42:22.190Z | service-cli-pg-runtime-dependency-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/service-cli-pg-runtime-dependency/attempt-2.diff |
