# Solve report: solver-terminal-integrity-cutover-fail-closed-fix

**Goal:** Terminal integrity uses one fail-closed predicate for audit and emission, treats malformed v2 violations as unresolved corruption, rejects accepted attempts whose changeRef content identity cannot be sealed, and blocks closure when any sealed accepted changeRef has changed.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-terminal-integrity-cutover-fail-closed-fix.json

**Attempts:** 1

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W1
- parent quest: solver-terminal-integrity-cutover-verifier-fix
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Scope Pressure
- Changed files: 19
- Owner areas: scripts/solve, solve, test/solve
- Categories: workflow
- Action: split by owner area before the next attempt (19 files)
- Action: land or separate 3 owner areas: scripts/solve, solve, test/solve
- Split plan:
  - scripts/solve: 10 file(s)
  - solve: 5 file(s)
  - test/solve: 4 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **solver-terminal-integrity-cutover-fail-closed-fix-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **solver-terminal-integrity-cutover-fail-closed-fix-main**: Independent final-diff verifier approved W1 terminal integrity after reproducing SOLVED and EXHAUSTED attacks for unresolved, malformed, missing-evidence, missing-changeRef, and tampered-artifact histories; focused regression 403 assertions passed [subagent:/root/w1_solver_integrity_verify]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10T13:32:19.076Z | solver-terminal-integrity-cutover-fail-closed-fix-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-terminal-integrity-cutover-fail-closed-fix/attempt-1.diff |
