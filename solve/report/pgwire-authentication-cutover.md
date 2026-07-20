# Solve report: pgwire-authentication-cutover

**Goal:** PG wire password mode performs a real PostgreSQL credential exchange before session creation, correct credentials reach SQL through the production runtime listener, wrong or missing credentials fail closed, password mode refuses a missing credential verifier, and explicit trust mode remains loopback-only.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-52-15-638Z.report.json

**Attempts:** 5

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r2--existing-application-portability
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 14
- Change bytes: 39994
- Owner areas: architecture, scripts/checks, src/runtime, test/runtime
- Categories: docs, other, runtime, test
- Action: split by owner area before the next attempt (14 files)
- Action: land or separate 4 owner areas: architecture, scripts/checks, src/runtime, test/runtime
- Split plan:
  - src/runtime: 9 file(s)
  - test/runtime: 3 file(s)
  - architecture: 1 file(s)
  - scripts/checks: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **pgwire-authentication-cutover-main** [solved] rung 4, attempts 5, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-16-54-905Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-16-54-905Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-16-54-905Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-16-54-905Z.report.json]
- **pgwire-authentication-cutover-main**: attempt 1 has a tuple-comparison timing oracle, leaks a late-authenticated session after disconnect, and permits credential-bearing runtime_config fields [subagent:verify_portability_plan]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-33-23-125Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-33-23-125Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-33-23-125Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-33-23-125Z.report.json]
- **pgwire-authentication-cutover-main**: Independent verification passed for the exact replacement attempt. [subagent:verify_portability-plan]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-38-14-279Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-38-14-279Z.report.json]
- **pgwire-authentication-cutover-main**: Attempt 3 implementation passed, but its submitted receipt had one trailing blank line and did not equal the canonical live delta. [subagent:verify_portability_plan]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-39-26-351Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-39-26-351Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-39-26-351Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-39-26-351Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-41-48-710Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-41-48-710Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-41-48-710Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-41-48-710Z.report.json]
- **pgwire-authentication-cutover-main**: Independent verification passed for the exact canonical replacement attempt. [subagent:verify_portability_plan]
- **pgwire-authentication-cutover-main**: The approved attempt was superseded after the scoped literal-owner gate found eight new violations; the later full replacement preserves its behavior and owns those literals. [subagent:verify_portability_plan]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-42-52-210Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-42-52-210Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-42-52-210Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-42-52-210Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-47-45-343Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-47-45-343Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-47-45-343Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-47-45-343Z.report.json]
- **pgwire-authentication-cutover-main**: Independent verification passed for the causally later exact canonical replacement. [subagent:verify_portability_plan]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-49-59-273Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-49-59-273Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-49-59-273Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-49-59-273Z.report.json]
- **pgwire-authentication-cutover-main**: The sealed authentication scenario passes on checkpoint HEAD ef926dcb; correct credentials reach SQL and all credential/TLS-boundary negatives remain green. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-49-59-273Z.report.json]
- **pgwire-authentication-cutover-main**: Live validation: the real pg client authenticated through createRuntimeStartupWiring, ServiceRuntimeLifecycle, and the bound production PG listener; SELECT 42 returned while wrong user/password/database produced no SqlRequest. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-49-59-273Z.report.json]
- **pgwire-authentication-cutover-main**: Independent terminal aggregate verification passed. [subagent:verify_portability_plan]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-52-15-638Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-52-15-638Z.report.json]
- **pgwire-authentication-cutover-main**: Ingested evidence from pgwire-authentication-cutover-2026-07-14T07-52-15-638Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-52-15-638Z.report.json]

## Theories
- **theory-20260714-append-only-replacement-order** [active] system, mechanism append_only_replacement_order, owner solver_verification_contract, modelGate npm run model:contracts
- **theory-20260714-canonical-receipt-mismatch** [supported] frontier, frontier pgwire-authentication-cutover-main, layer observation, mechanism canonical_receipt_mismatch, owner solver_change_receipt, boundary source_attempt_verification, modelGate npm run model:contracts

## Selected Theories
- **pgwire-authentication-cutover-main**: theory-20260714-canonical-receipt-mismatch

## Theory Results
- **theory-20260714-canonical-receipt-mismatch**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-39-26-351Z.report.json]
- **theory-20260714-canonical-receipt-mismatch**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-41-48-710Z.report.json]
- **theory-20260714-canonical-receipt-mismatch**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-41-48-710Z.report.json]
- **theory-20260714-canonical-receipt-mismatch**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-42-52-210Z.report.json]
- **theory-20260714-canonical-receipt-mismatch**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-47-45-343Z.report.json]
- **theory-20260714-canonical-receipt-mismatch**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-47-45-343Z.report.json]
- **theory-20260714-canonical-receipt-mismatch**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-49-59-273Z.report.json]
- **theory-20260714-canonical-receipt-mismatch**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-52-15-638Z.report.json]
- **theory-20260714-canonical-receipt-mismatch**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/pgwire-authentication-cutover/pgwire-authentication-cutover-2026-07-14T07-52-15-638Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T07:24:02.914Z | pgwire-authentication-cutover-main | observe | 1 -> 0 | progress | no_previous |  | diff:solve/changes/pgwire-authentication-cutover/attempt-1.diff |
| 2026-07-14T07:33:48.274Z | pgwire-authentication-cutover-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/pgwire-authentication-cutover/attempt-2.diff |
| 2026-07-14T07:38:14.285Z | pgwire-authentication-cutover-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/pgwire-authentication-cutover/attempt-3.diff |
| 2026-07-14T07:41:48.715Z | pgwire-authentication-cutover-main | widen-scope | 0 -> 0 | flat | solved | theory-20260714-canonical-receipt-mismatch | diff:solve/changes/pgwire-authentication-cutover/attempt-4.diff |
| 2026-07-14T07:47:45.349Z | pgwire-authentication-cutover-main | model | 0 -> 0 | flat | solved | theory-20260714-canonical-receipt-mismatch | diff:solve/changes/pgwire-authentication-cutover/attempt-5.diff |
