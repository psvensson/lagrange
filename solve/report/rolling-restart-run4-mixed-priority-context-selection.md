# Solve report: rolling-restart-run4-mixed-priority-context-selection

**Goal:** Run15-style mixed priority-recovery operation context selection chooses the still-open dispatch-pending row for owner progress when a terminal REMOVED sibling has newer terminal evidence, without broad ACTIVE discounts or parent statistical closure.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-mixed-priority-context-selection.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-mixed-priority-context-selection-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-mixed-priority-context-selection-main
- No longer current: terminal REMOVED sibling redrive; broad ACTIVE discount; helper extraction that bypasses row age fallback; terminal REMOVED sibling redrive; broad ACTIVE discount; target-progress helper regression

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: src/control-plane, test/control-plane
- Categories: runtime, test
- Split plan:
  - test/control-plane: 3 file(s)
  - src/control-plane: 2 file(s)
- Signals: none

## Frontiers
- **rolling-restart-run4-mixed-priority-context-selection-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **rolling-restart-run4-mixed-priority-context-selection-main**: Subagent verifier confirmed mixed terminal-sibling context selection keeps the open dispatch-pending row actionable and confirmed the helper-extraction age fallback is restored after catching the regression. (rules out: terminal REMOVED sibling redrive; broad ACTIVE discount; helper extraction that bypasses row age fallback) [subagent:019f183a-7d83-7153-93cf-33919cadea7f]
- **rolling-restart-run4-mixed-priority-context-selection-main**: Post-attempt verifier re-check found no blockers: the mixed terminal-sibling regression still selects the open dispatch-pending row, and target-progress age falls back to row age when elapsed age is unavailable. (rules out: terminal REMOVED sibling redrive; broad ACTIVE discount; target-progress helper regression) [subagent:019f183a-7d83-7153-93cf-33919cadea7f]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T11:29:16.579Z | rolling-restart-run4-mixed-priority-context-selection-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/rolling-restart-run4-mixed-priority-context-selection/mixed-priority-context-selection.diff |
