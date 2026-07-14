# Solve report: pgwire-tls-policy-cutover

**Goal:** PG wire owns one disable/prefer/require TLS policy: real PostgreSQL clients can authenticate and query through the production listener with a verified server certificate, require mode rejects plaintext downgrade before SQL, invalid certificate trust fails, and TLS key material remains outside runtime_config.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-02-36-588Z.report.json

**Attempts:** 3

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r2--existing-application-portability
- plan: solve/specs/service-portability-ladder/tasks.md

## Current Blocker
- Frontier: pgwire-tls-policy-cutover-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: solved: PASS -> PASS
- Latest evidence: test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-26-26-663Z.report.json
- Selected theory: theory-20260714-inherited-oversized-protocol-owner
- Next move: continue supervised step for pgwire-tls-policy-cutover-main
- No longer current: PASS

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 16
- Change bytes: 135666
- Owner areas: architecture, scripts/checks, src/runtime, test/fixtures, test/runtime
- Categories: docs, other, runtime, test
- Action: split by owner area before the next attempt (16 files)
- Action: land or separate 5 owner areas: architecture, scripts/checks, src/runtime, test/fixtures, test/runtime
- Split plan:
  - src/runtime: 8 file(s)
  - test/fixtures: 3 file(s)
  - test/runtime: 3 file(s)
  - architecture: 1 file(s)
  - scripts/checks: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **pgwire-tls-policy-cutover-main** [solved] rung 3, attempts 3, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T07-55-17-389Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T07-55-17-389Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T07-55-17-389Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T07-55-17-389Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-01-25-558Z.report.json. Metric: 1 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-01-25-558Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-01-25-558Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-01-25-558Z.report.json]
- **pgwire-tls-policy-cutover-main**: Exact attempt permits plaintext buffer stuffing after SSLRequest to be consumed after TLS activation, and increases the oversized-test ratchet from 21 to 22. [subagent:verify_tls_cutover]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-13-39-975Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-13-39-975Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-13-39-975Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-13-39-975Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-14-15-832Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-14-15-832Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-14-15-832Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-14-15-832Z.report.json]
- **pgwire-tls-policy-cutover-main**: The buffer-stuffing and test-size findings are fixed, but the replacement leaves the touched inherited pgwire protocol handler above the 800-line source threshold. [subagent:verify_tls_cutover]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-20-42-786Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-20-42-786Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-20-42-786Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-20-42-786Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-21-35-642Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-21-35-642Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-21-35-642Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-21-35-642Z.report.json]
- **pgwire-tls-policy-cutover-main**: Independent verification passed for the exact full replacement. [subagent:verify_tls_cutover]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-25-07-195Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-25-07-195Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-25-07-195Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-25-07-195Z.report.json]
- **pgwire-tls-policy-cutover-main**: The sealed TLS policy scenario passes on checkpoint HEAD c1dcf82e; verified TLS queries succeed while plaintext downgrade, malformed SSL negotiation, and bad-CA attempts are rejected before SQL. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-25-07-195Z.report.json]
- **pgwire-tls-policy-cutover-main**: Live validation: the real pg client completed a CA-verified TLS query through createRuntimeStartupWiring, ServiceRuntimeLifecycle, and the bound production PG listener; plaintext in require mode and a wrong CA produced no SqlRequest. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-25-07-195Z.report.json]
- **pgwire-tls-policy-cutover-main**: Independent terminal aggregate verification passed. [subagent:verify_tls_cutover]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-26-26-663Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-26-26-663Z.report.json]
- **pgwire-tls-policy-cutover-main**: Ingested evidence from pgwire-tls-policy-cutover-2026-07-14T08-26-26-663Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-26-26-663Z.report.json]

## Theories
- **theory-20260714-inherited-oversized-protocol-owner** [supported] frontier, frontier pgwire-tls-policy-cutover-main, layer ownership, mechanism inherited_oversized_protocol_owner, owner pgwire_protocol_handler, boundary extended_query_dispatch, modelGate npm run model:contracts

## Selected Theories
- **pgwire-tls-policy-cutover-main**: theory-20260714-inherited-oversized-protocol-owner

## Theory Results
- **theory-20260714-inherited-oversized-protocol-owner**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-21-35-642Z.report.json]
- **theory-20260714-inherited-oversized-protocol-owner**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-21-35-642Z.report.json]
- **theory-20260714-inherited-oversized-protocol-owner**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-25-07-195Z.report.json]
- **theory-20260714-inherited-oversized-protocol-owner**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-tls-policy-cutover/pgwire-tls-policy-cutover-2026-07-14T08-26-26-663Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T08:02:52.569Z | pgwire-tls-policy-cutover-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/pgwire-tls-policy-cutover/attempt-2.diff |
| 2026-07-14T08:14:15.839Z | pgwire-tls-policy-cutover-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/pgwire-tls-policy-cutover/attempt-3.diff |
| 2026-07-14T08:21:35.649Z | pgwire-tls-policy-cutover-main | widen-scope | 0 -> 0 | flat | solved | theory-20260714-inherited-oversized-protocol-owner | diff:solve/changes/pgwire-tls-policy-cutover/attempt-4.diff |
