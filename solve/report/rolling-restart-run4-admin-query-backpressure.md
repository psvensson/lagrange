# Solve report: rolling-restart-run4-admin-query-backpressure

**Goal:** Rolling-restart final acknowledged-write/admin observation no longer collapses an otherwise owner-green post-restart state into unowned nodeSlotUnavailable: deterministic retained-artifact and local Admin API pressure fixtures route persistent participant-failure readback to typed admin/query backpressure or evidence-incomplete diagnostics with retry/defer evidence, while clean reads with missing acknowledged IDs still fail as acknowledged-write loss and publication, priority, and readiness support remain satisfied.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-admin-query-backpressure.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-admin-query-backpressure-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-admin-query-backpressure-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 3
- Owner areas: test/distributed/harness
- Categories: runtime
- Split plan:
  - test/distributed/harness: 3 file(s)
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **rolling-restart-run4-admin-query-backpressure-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **rolling-restart-run4-admin-query-backpressure-main**: Subagent verifier approved the diagnostic fallback direction and identified a measured-entry scope risk; source was narrowed so retained nodeSlotUnavailable is dropped only when playback load metrics fill absent scenario loadMetrics, with a guard test for measured entries. [subagent:019f174c-1ade-7512-b513-69741cf76371]
- **rolling-restart-run4-admin-query-backpressure-main**: Post-attempt subagent verification handoff: verifier 019f174c-1ade-7512-b513-69741cf76371 inspected the source diff, confirmed diagnostic-only fallback scope, and the final patch includes the measured-entry guard test for the risk it raised. [subagent:019f174c-1ade-7512-b513-69741cf76371]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T06:59:54.443Z | rolling-restart-run4-admin-query-backpressure-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/rolling-restart-run4-admin-query-backpressure/playback-load-metrics-fallback.diff |
