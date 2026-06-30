# Solve report: rolling-restart-run4-operation-drain-owner-progress-token

**Goal:** Run3-shaped post-rebalance no-progress detection treats operation_workflow_owner workflow-step progress on effective in-flight replica operations as convergence progress while still ignoring leader-only churn; focused deterministic token evidence is green, and parent rolling-restart Wilson/statistical closure remains outside this child Quest.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-operation-drain-owner-progress-token.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-operation-drain-owner-progress-token-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-operation-drain-owner-progress-token-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: solve, test/distributed/harness
- Categories: runtime, workflow
- Action: separate runtime changes from quest workflow changes
- Split plan:
  - solve: 3 file(s)
  - test/distributed/harness: 2 file(s)
- Signal: mixed-runtime-and-workflow severity=high
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **rolling-restart-run4-operation-drain-owner-progress-token-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **rolling-restart-run4-operation-drain-owner-progress-token-main**: Subagent verifier 019f195e-8bd7-7fa0-90f8-fd2c6d5d5158 found no blockers after the updated diff removed updatedAt from the operation-progress token; timestamp-only retry churn no longer resets the no-progress token, and stale, additional-discount, and partial-coverage rows remain excluded. [subagent:019f195e-8bd7-7fa0-90f8-fd2c6d5d5158]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T16:41:33.888Z | rolling-restart-run4-operation-drain-owner-progress-token-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/rolling-restart-run4-operation-drain-owner-progress-token/operation-progress-token.diff |
