# Solve report: rolling-restart-run4-target-sync-reentry

**Goal:** Run15-shaped REPLACE operations in TARGET_SYNC/SYNCING with an active_operational non-terminal target re-enter observed operation progress deterministically, so operation_drain_open/no_over_target_open has a local rebalancer-owner closure path before any new stat gate.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-target-sync-reentry.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-target-sync-reentry-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-target-sync-reentry-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signals: none

## Frontiers
- **rolling-restart-run4-target-sync-reentry-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **rolling-restart-run4-target-sync-reentry-main**: SUBAGENT VERIFIED source change for TARGET_SYNC active-operational reentry. Leibniz 019f16de-e7cd-7170-a72c-4fc4270bbe16 reported NO BLOCKERS: the new predicate is narrow to TARGET_SYNC + event-driven WORKFLOW_PROGRESS + WAIT_FOR_OPERATION_PROGRESS + active_operational visibility; arbitrary non-terminal waits still hit NOT_TARGET_PROGRESS/TARGET_NOT_TERMINAL; dispatch-pending/source-removal paths and the remote-owner-unavailable guard are preserved; the new test covers REPLACE/SYNCING/local-target/non_terminal and asserts reconcileObservedProgressOperation is invoked. [subagent:019f16de-e7cd-7170-a72c-4fc4270bbe16; solve/changes/rolling-restart-run4-target-sync-reentry/target-sync-reentry.diff]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T04:51:56.784Z | rolling-restart-run4-target-sync-reentry-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/rolling-restart-run4-target-sync-reentry/target-sync-reentry.diff |
