# Solve report: dockerized-pg-client-compatibility-example

**Goal:** One immutable Docker image for an ordinary Node HTTP application uses the real pg pool unchanged against PostgreSQL and the production Lagrange PG listener: both return the same deterministic parameterized transaction result, the Lagrange connection authenticates from a separate container with verified TLS, and only connection, credential, TLS, and Lagrange metadata configuration differ.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-53-41-597Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r2--existing-application-portability
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 13
- Change bytes: 102102
- Owner areas: architecture, examples, scripts/checks, test/examples
- Categories: docs, other, test
- Action: split by owner area before the next attempt (13 files)
- Action: land or separate 4 owner areas: architecture, examples, scripts/checks, test/examples
- Split plan:
  - examples: 10 file(s)
  - architecture: 1 file(s)
  - scripts/checks: 1 file(s)
  - test/examples: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **dockerized-pg-client-compatibility-example-main** [solved] rung 1, attempts 2, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-30-26-671Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-30-26-671Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-30-26-671Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-30-26-671Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-44-12-269Z.report.json. Metric: 1 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-44-12-269Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-44-12-269Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-44-12-269Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: The exact replacement passes behavior and integrity checks, but application containers can leak if launch succeeds and inspection, port discovery, or health readiness fails before the stage cleanup finally is installed. [subagent:verify_tls_cutover]
- **dockerized-pg-client-compatibility-example-main**: Independent verification passed for the failure-safe exact replacement. [subagent:verify_tls_cutover]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-52-11-974Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-52-11-974Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-52-11-974Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-52-11-974Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-55-05-251Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-55-05-251Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-55-05-251Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-55-05-251Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: The sealed unchanged-image database portability scenario passes on checkpoint HEAD 313a6ff9, including the injected post-create teardown failure and the full PostgreSQL/Lagrange comparison. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-55-05-251Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Live validation: one inspected Node/pg image ID, entrypoint, and command ran in separate Docker containers against stock PostgreSQL and the production Lagrange runtime listener; both returned identical ordered rows, verified TLS/password succeeded, wrong password and wrong CA produced no SqlRequest, injected post-create failure cleaned every resource, and no containers, networks, or example images remained. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-55-05-251Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Independent terminal aggregate verification passed. [subagent:verify_tls_cutover]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-57-01-628Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-57-01-628Z.report.json]
- **dockerized-pg-client-compatibility-example-main**: Ingested evidence from dockerized-pg-client-compatibility-example-2026-07-14T08-57-01-628Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/dockerized-pg-client-compatibility-example/dockerized-pg-client-compatibility-example-2026-07-14T08-57-01-628Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T08:47:43.434Z | dockerized-pg-client-compatibility-example-main | observe | 1 -> 0 | progress | solved |  | diff:solve/changes/dockerized-pg-client-compatibility-example/attempt-1.diff |
| 2026-07-14T08:54:23.969Z | dockerized-pg-client-compatibility-example-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/dockerized-pg-client-compatibility-example/attempt-2.diff |
