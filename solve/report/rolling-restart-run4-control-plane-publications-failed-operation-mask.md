# Solve report: rolling-restart-run4-control-plane-publications-failed-operation-mask

**Goal:** Run2-shaped control_plane_publications-p1 failed operation-owner evidence can no longer be masked as spread_satisfied_in_flight while membership-publication writes need that partition; focused deterministic proof shows the snapshot requires follow-up or an honest blocker without claiming parent Wilson closure.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/rolling-restart-run4-control-plane-publications-failed-operation-mask.json

**Attempts:** 1

## Links
- roadmap row: RM-0.1-fs-rolling-restart
- spec: membership-lifecycle-placement-hard-cutover
- parent quest: rolling-restart-run4-drain-residual
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: rolling-restart-run4-control-plane-publications-failed-operation-mask-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for rolling-restart-run4-control-plane-publications-failed-operation-mask-main
- No longer current: failed operation fallback demotes specific blockers; source change lacks subagent verification; unverified source patch; failed-operation fallback demotes coordination mismatch

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 2
- Owner areas: src/control-plane, test/control-plane
- Categories: runtime, test
- Split plan:
  - src/control-plane: 1 file(s)
  - test/control-plane: 1 file(s)
- Signals: none

## Frontiers
- **rolling-restart-run4-control-plane-publications-failed-operation-mask-main** [solved] rung 1, attempts 1, metric ? -> 0

## Findings
- **rolling-restart-run4-control-plane-publications-failed-operation-mask-main**: Subagent review confirmed the failed-operation fallback only replaces spread_satisfied_in_flight and preserves stronger blocker states such as out-of-cohort coordination mismatch. (rules out: failed operation fallback demotes specific blockers; source change lacks subagent verification) [subagent:019f1982-ae27-7cb1-a343-c1294b554291]
- **rolling-restart-run4-control-plane-publications-failed-operation-mask-main**: Post-attempt subagent review remains applicable: the committed source diff only changes the spread_satisfied_in_flight fallback and the out-of-cohort fixture proves specific blocker precedence is preserved. (rules out: unverified source patch; failed-operation fallback demotes coordination mismatch) [subagent:019f1982-ae27-7cb1-a343-c1294b554291]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-30T17:27:01.906Z | rolling-restart-run4-control-plane-publications-failed-operation-mask-main | observe | ? -> 0 | flat | no_evidence |  | diff:solve/changes/rolling-restart-run4-control-plane-publications-failed-operation-mask/control-plane-publications-failed-operation-mask.diff |
