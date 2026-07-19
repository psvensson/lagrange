# Solve report: solver-next-checkpoint-projection-closure

**Goal:** After an exact-approved source attempt has been committed by checkpoint, an open Quest's typed next action advances to its pending step, recorded gate, or current blocker instead of requesting an empty repeat checkpoint, while a new exact-approved uncheckpointed attempt still requires checkpoint.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-next-checkpoint-projection-closure.json

**Attempts:** 1

## Links
- spec: docs/steering/workflow-guidelines/solver-quests.md
- parent quest: solver-workflow-draft-receipt-signal-quality

## Scope Pressure
- Changed files: 5
- Change bytes: 11311
- Owner areas: scripts/solve, solve, test/solve
- Categories: workflow
- Action: land or separate 3 owner areas: scripts/solve, solve, test/solve
- Split plan:
  - scripts/solve: 2 file(s)
  - solve: 2 file(s)
  - test/solve: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **solver-next-checkpoint-projection-closure-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **solver-next-checkpoint-projection-closure-main**: Independent verification approved the exact checkpoint-projection attempt: new approved attempts require checkpoint; committed attempts advance; pending, gate, rejection replacement, canonical supersession, tamper, dirty-path, and terminal aggregate behavior remain fail-closed. [subagent:verify_checkpoint_projection_patch]
- **solver-next-checkpoint-projection-closure-main**: Independent aggregate verification approved the current Solver source delta across next-action projection, checkpoint verification, and regression coverage; six focused files pass 306 assertions and lint remains green. [subagent:verify_checkpoint_projection_patch]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T10:48:17.832Z | solver-next-checkpoint-projection-closure-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-next-checkpoint-projection-closure/attempt-1.diff |
