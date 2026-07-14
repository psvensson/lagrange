# Solve report: service-lifecycle-pgwire-sql-transport

**Goal:** Authenticated PG-wire classifies the exact parameterized service lifecycle SQL family before execution, requires action-specific authorization, defensively carries server-derived identity into SQLQueryEngine dispatch, and returns typed command-owner outcomes without direct catalog or runtime-state ownership.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-lifecycle-sql-control-surface/service-lifecycle-sql-control-surface-2026-07-14T12-36-19-983Z.report.json

**Attempts:** 3

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- parent quest: service-lifecycle-sql-control-surface
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 17
- Change bytes: 210009
- Owner areas: architecture, scripts/checks, src/query, src/runtime, test/query, test/runtime
- Categories: docs, other, runtime, test
- Action: split by owner area before the next attempt (17 files)
- Action: land or separate 6 owner areas: architecture, scripts/checks, src/query, src/runtime, test/query, test/runtime
- Split plan:
  - src/query: 8 file(s)
  - src/runtime: 3 file(s)
  - architecture: 2 file(s)
  - test/query: 2 file(s)
  - scripts/checks: 1 file(s)
  - test/runtime: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **service-lifecycle-pgwire-sql-transport-main** [solved] rung 3, attempts 3, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-lifecycle-pgwire-sql-transport-main**: The sealed lifecycle transport surface reproduces on current HEAD: all five focused guard files pass through the committed command/catalog composition, including action authorization, immutable context, production policy, and durable owner dispatch. [test-output/reports/service-lifecycle-sql-control-surface/service-lifecycle-sql-control-surface-2026-07-14T12-21-26-594Z.report.json]
- **service-lifecycle-pgwire-sql-transport-main**: Leading block or line comments hid lifecycle intent from pre-execution classification, so a generic-query-only session could reach SqlCore before the exact grammar rejected the statement. (rules out: Do not classify lifecycle authorization from the raw statement start without consuming leading SQL whitespace and comments.) [subagent:verify_s0_transport_decision]
- **service-lifecycle-pgwire-sql-transport-main**: PostgreSQL nested block comments outlived the regex trivia prefix, so nested-comment-prefixed lifecycle SQL still classified ordinary and reached SqlCore under generic-only authorization. (rules out: Do not parse PostgreSQL comment trivia with a first-terminator regular expression; nested block comments require depth-aware scanning.) [subagent:verify_s0_transport_decision]
- **service-lifecycle-pgwire-sql-transport-main**: Independent reconstruction approved the full superseding transport patch: all 17 postimages match, nested/adjacent/CRLF/incomplete comment cases are correct, three scenario runs pass, and static/cycle/size checks are green apart from unchanged inherited complexity. [subagent:verify_s0_transport_decision]
- **service-lifecycle-pgwire-sql-transport-main**: Independent aggregate verification approved the canonical source-only delta at 6562a9dd: the exact superseding postimages reconstruct cleanly, comment classification is depth-aware, and the previously demonstrated authorization, context, and owner-dispatch engagement seams are unchanged. [subagent:verify_s0_transport_decision]
- **service-lifecycle-pgwire-sql-transport-main**: Ingested evidence from service-lifecycle-sql-control-surface-2026-07-14T12-36-19-983Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-lifecycle-sql-control-surface/service-lifecycle-sql-control-surface-2026-07-14T12-36-19-983Z.report.json]

## Theories
- **theory-20260714-postgresql-nested-block-comments-require-depth** [supported] frontier, frontier service-lifecycle-pgwire-sql-transport-main, layer protocol, mechanism PostgreSQL nested block comments require depth-aware leading-trivia scanning before lifecycle prefix classification., modelGate npm run model:contracts

## Selected Theories
- **service-lifecycle-pgwire-sql-transport-main**: theory-20260714-postgresql-nested-block-comments-require-depth

## Theory Results
- **theory-20260714-postgresql-nested-block-comments-require-depth**: falsified (scenario=done, theory=falsified, movement=no_evidence) [test-output/reports/service-lifecycle-sql-control-surface/service-lifecycle-sql-control-surface-2026-07-14T12-36-19-983Z.report.json]
- **theory-20260714-postgresql-nested-block-comments-require-depth**: supported (scenario=passed, theory=confirmed, movement=resolved) [test-output/reports/service-lifecycle-sql-control-surface/service-lifecycle-sql-control-surface-2026-07-14T12-36-19-983Z.report.json]
- **theory-20260714-postgresql-nested-block-comments-require-depth**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/service-lifecycle-sql-control-surface/service-lifecycle-sql-control-surface-2026-07-14T12-36-19-983Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T12:21:42.789Z | service-lifecycle-pgwire-sql-transport-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-lifecycle-pgwire-sql-transport/attempt-1.diff |
| 2026-07-14T12:31:27.793Z | service-lifecycle-pgwire-sql-transport-main | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-lifecycle-pgwire-sql-transport/attempt-2.diff |
| 2026-07-14T12:36:20.042Z | service-lifecycle-pgwire-sql-transport-main | widen-scope | 0 -> 0 | flat | no_evidence | theory-20260714-postgresql-nested-block-comments-require-depth | diff:solve/changes/service-lifecycle-pgwire-sql-transport/attempt-3.diff |
